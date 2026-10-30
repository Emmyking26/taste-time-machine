import { ensureQlooConfigured, getQlooErrorMessage } from "@/lib/qloo";
import { buildFeedbackContext, scoreCandidate } from "./evaluation";
import { MARGARET_PROFILE_ID, getProfileStore, type ProfileStore } from "./profile";
import { getDefaultGateway, QlooGateway } from "./qloo-gateway";
import { reconstructCulturalWorld } from "./reconstruct";
import { composeSession, type EvaluatedCandidate } from "./session";
import { topSignals } from "./signals";
import { mergeAuditIntoProfile } from "./state";
import { AgentTools } from "./tools";
import type {
  AgentCandidate,
  GeneratedEvidence,
  GeneratedSessionResult,
  ItemType,
  PersonProfile,
  SessionAdaptation,
} from "./types";

export interface GenerateSessionOptions {
  durationMinutes?: number;
  store?: ProfileStore;
  gateway?: QlooGateway;
  now?: () => Date;
}

function mergeCandidates(candidates: AgentCandidate[]): AgentCandidate[] {
  const byKey = new Map<string, AgentCandidate>();
  for (const candidate of candidates) {
    const key = candidate.entityId ?? `${candidate.type}:${candidate.title.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    if (candidate.provenance === "caregiver" && existing.provenance !== "caregiver") {
      byKey.set(key, candidate);
    } else if ((candidate.affinity ?? -1) > (existing.affinity ?? -1)) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

function buildAdaptation(
  profile: PersonProfile,
  feedback: ReturnType<typeof buildFeedbackContext>,
): SessionAdaptation {
  const titlesById = new Map<string, string>();
  for (const session of profile.sessionHistory) {
    for (const item of session.items) {
      if (item.entityId && !titlesById.has(item.entityId)) titlesById.set(item.entityId, item.title);
    }
  }
  const replayed = [...feedback.replayPenalty.keys()]
    .map((entityId) => titlesById.get(entityId) ?? entityId)
    .filter(Boolean);
  const feedbackApplied = profile.preferencesLearned.length > 0;
  const summary = feedbackApplied
    ? `Prior caregiver observations were applied. Liked signals: ${feedback.likedSignals.join(", ") || "none"}. Avoided signals: ${feedback.avoidedSignals.join(", ") || "none"}. Down-ranked replay: ${replayed.join(", ") || "none"}. The agent explores adjacent signals rather than replaying a liked item.`
    : "No caregiver feedback yet. This is a baseline exploration of the caregiver-known anchors and the Qloo signals they expose.";

  return {
    feedbackApplied,
    likedSignals: feedback.likedSignals,
    avoidedSignals: feedback.avoidedSignals,
    replayedItemsAvoided: replayed,
    summary,
  };
}

function buildEvidence(
  profile: PersonProfile,
  session: GeneratedSessionResult["session"],
  evaluated: EvaluatedCandidate[],
  newAudit: NonNullable<PersonProfile["qlooAudit"]>,
): GeneratedEvidence {
  const selectedIds = new Set(session.items.map((item) => item.entityId).filter(Boolean));
  const selectedCandidates = evaluated.filter(
    (item) => selectedIds.has(item.candidate.entityId) || session.items.some((sessionItem) => sessionItem.title === item.candidate.title),
  );

  const qlooEvidence: unknown[] = [
    ...topSignals(profile.discoveredSignals, 30).map((signal) => ({
      kind: "signal",
      name: signal.name,
      id: signal.id,
      namespace: signal.namespace,
      sourceEntity: signal.sourceEntity,
      affinity: signal.affinity,
      popularity: signal.popularity,
      sourceKind: signal.metadata?.sourceKind,
    })),
    ...selectedCandidates.map(({ candidate, evaluation }) => ({
      kind: "candidate",
      candidateId: candidate.id,
      title: candidate.title,
      entityId: candidate.entityId,
      type: candidate.type,
      year: candidate.year,
      affinity: candidate.affinity,
      popularity: candidate.popularity,
      signalNames: candidate.signalNames,
      historicalStatus: candidate.historicalStatus,
      score: evaluation.score,
      auditId: candidate.auditId,
    })),
    ...newAudit.map((entry) => ({
      kind: "audit",
      id: entry.id,
      tool: entry.tool,
      request: entry.request,
      createdAt: entry.createdAt,
      note: "Raw response retained in the profile audit log.",
    })),
  ];

  return {
    caregiverKnown: [
      { field: "name", value: profile.name },
      { field: "birthYear", value: profile.birthYear },
      { field: "hometown", value: profile.hometown },
      { field: "formativePeriod", value: profile.formativePeriod },
      { field: "rememberedInterests", value: profile.caregiverKnown.rememberedInterests },
    ],
    qlooEvidence,
    agentHypotheses: session.items
      .filter((item) => item.provenance === "agent")
      .map((item) => ({
        sessionItemId: item.id,
        text: item.title,
        basedOn: item.signalNames,
        note: "Agent-generated prompt or interpretation; not a verified fact.",
      })),
  };
}

function buildReasoningSummary(
  profile: PersonProfile,
  session: GeneratedSessionResult["session"],
  adaptation: SessionAdaptation,
): string {
  const byType = (type: ItemType) => session.items.find((item) => item.type === type);
  const music = byType("music");
  const visual = session.items.find((item) => item.type === "film" || item.type === "tv");
  const sensory = byType("food");
  const parts = [
    `Planned a ${session.durationMinutes}-minute session using the caregiver-known ${profile.formativePeriod.startYear}–${profile.formativePeriod.endYear} formative window and ${profile.hometown.city} context.`,
    music ? `Music: “${music.title}” [${music.provenance}].` : "No music item was available.",
    visual ? `Visual media: “${visual.title}” [${visual.provenance}]${visual.year ? ` (${visual.year})` : ""}.` : "No visual-media item was available.",
    sensory ? `Sensory cue: “${sensory.title}” [${sensory.provenance}].` : "No sensory cue was available.",
    `Conversation: ${session.items.filter((item) => item.type === "conversation").length} open prompt(s).`,
    adaptation.summary,
    "Music uses Qloo era tags because artist release years are unavailable; films and TV use Qloo's documented release-year filter. No item is claimed to trigger a memory.",
  ];
  return parts.join(" ");
}

function baseLimitations(profile: PersonProfile): string[] {
  const limitations = [
    "Qloo affinity is an aggregate taste association, not proof that this person liked an item or remembers it.",
    "Caregiver feedback is a caregiver observation, not a clinical measurement, diagnosis, or memory test.",
    "Qloo exposes no release year or release-year filter for artists; historical music is an era-tag signal, not a verified date.",
    "Qloo has no urn:entity:food type; food/sensory cues are either place-level Qloo evidence or caregiver-known memories.",
    "No session item is guaranteed to trigger a memory. The caregiver may stop at any time.",
    "Phase 2 stores profiles in memory, so state resets when the server process restarts.",
    "Agent hypotheses are generated by deterministic scoring and prompt templates; no external LLM is used in this implementation.",
  ];
  if (profile.preferencesLearned.some((preference) => preference.reaction === "agitated")) {
    limitations.push(
      "A previous observation of agitation is recorded. Related items are excluded; the caregiver should stop or skip them rather than repeat exposure.",
    );
  }
  return limitations;
}

export async function generateSession(
  profileId: string = MARGARET_PROFILE_ID,
  options: GenerateSessionOptions = {},
): Promise<GeneratedSessionResult> {
  ensureQlooConfigured();
  const store = options.store ?? getProfileStore();
  const profile = store.getOrThrow(profileId);
  const gateway = options.gateway ?? getDefaultGateway();
  const tools = new AgentTools(gateway);
  const now = options.now ?? (() => new Date());
  const limitations: string[] = [];
  const auditStart = gateway.auditCount();

  const reconstruction = await reconstructCulturalWorld(profileId, {
    store,
    gateway,
    tools,
    profile,
    persist: false,
    now,
  });
  limitations.push(...reconstruction.limitations);

  const categories: ItemType[] = ["music", "film", "tv", "food"];
  const results = await Promise.all(
    categories.map(async (category) => {
      try {
        return await tools.findHistoricalCandidates({ signals: profile.discoveredSignals, profileContext: profile, category });
      } catch (error) {
        limitations.push(`Candidate generation failed for ${category}: ${getQlooErrorMessage(error)}`);
        return { category, candidates: [], limitations: [], auditIds: [] };
      }
    }),
  );
  for (const result of results) limitations.push(...result.limitations);

  const candidates = mergeCandidates(results.flatMap((result) => result.candidates));
  const feedback = buildFeedbackContext(profile);
  const evaluated: EvaluatedCandidate[] = candidates.map((candidate) => ({
    candidate,
    evaluation: scoreCandidate(candidate, profile, feedback),
  }));

  const session = composeSession({
    profile,
    evaluations: evaluated,
    durationMinutes: options.durationMinutes,
    now: now().toISOString(),
  });

  const adaptation = buildAdaptation(profile, feedback);
  session.adaptation = adaptation;
  const newAudit = gateway.getAudit().slice(auditStart);
  mergeAuditIntoProfile(profile, newAudit);
  profile.sessionHistory.push(session);
  profile.updatedAt = now().toISOString();
  store.save(profile);

  const selectedWarnings = evaluated
    .filter((item) => session.items.some((sessionItem) => sessionItem.title === item.candidate.title))
    .flatMap((item) => item.evaluation.warnings);
  limitations.push(...selectedWarnings);

  return {
    session,
    evidence: buildEvidence(profile, session, evaluated, newAudit),
    reasoningSummary: buildReasoningSummary(profile, session, adaptation),
    limitations: [...new Set([...limitations, ...baseLimitations(profile)])],
    adaptation,
  };
}
