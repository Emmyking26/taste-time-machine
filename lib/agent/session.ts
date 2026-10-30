import { categoryLabel } from "./evaluation";
import { createSessionId, createSessionItemId } from "./profile";
import type {
  AgentCandidate,
  CandidateEvaluation,
  PersonProfile,
  Session,
  SessionItem,
} from "./types";

export interface EvaluatedCandidate {
  candidate: AgentCandidate;
  evaluation: CandidateEvaluation;
}

export interface ComposeSessionInput {
  profile: PersonProfile;
  evaluations: EvaluatedCandidate[];
  durationMinutes?: number;
  now?: string;
}

function reasonFor(candidate: AgentCandidate, evaluation: CandidateEvaluation): string {
  const evidence = evaluation.reasons.slice(0, 4).join(" ");
  if (candidate.provenance === "caregiver") {
    return `Caregiver-known: ${candidate.reasonSeed} ${evidence} This is a starting point, not a memory test.`.trim();
  }
  if (candidate.provenance === "agent") {
    return `Agent hypothesis: ${candidate.reasonSeed} ${evidence} This is a proposed cue, not a fact about the person.`.trim();
  }
  return `Qloo evidence: ${candidate.reasonSeed} ${evidence} Worth trying because it is culturally adjacent to caregiver-known interests; this is not a guarantee that it will trigger a memory.`.trim();
}

function toSessionItem(candidate: AgentCandidate, evaluation: CandidateEvaluation, durationMinutes: number): SessionItem {
  return {
    id: createSessionItemId(),
    type: candidate.type,
    title: candidate.title,
    ...(candidate.entityId ? { entityId: candidate.entityId } : {}),
    ...(candidate.year !== undefined ? { year: candidate.year } : {}),
    reason: reasonFor(candidate, evaluation),
    provenance: candidate.provenance,
    confidence: Math.round(evaluation.score * 1000) / 1000,
    durationMinutes,
    ...(candidate.entityType ? { entityType: candidate.entityType } : {}),
    signalNames: candidate.signalNames,
    historicalStatus: candidate.historicalStatus,
    ...(candidate.auditId ? { evidenceIds: [candidate.auditId] } : {}),
  };
}

function fallbackSensoryCue(profile: PersonProfile): { title: string; detail: string } | null {
  const specific = profile.caregiverKnown.rememberedFoods?.find((food) => food.trim().length > 0);
  if (specific) return { title: specific, detail: "Caregiver mentioned this food." };
  const interest = profile.caregiverKnown.rememberedInterests.find((value) =>
    /dinner|supper|lunch|breakfast|food|meal|cooking|baking|recipe|coffee|tea|kitchen/i.test(value),
  );
  return interest ? { title: interest, detail: "Caregiver mentioned this mealtime memory." } : null;
}

function caregiverPrompt(profile: PersonProfile): { title: string; reason: string } {
  const cue = fallbackSensoryCue(profile);
  if (cue) {
    const label = cue.title.replace(/\b(dinners|meals|suppers|lunches|breakfasts)\b/i, (match) => match.slice(0, -1));
    return {
      title: `What was a typical ${label} like in your home?`,
      reason:
        "Agent hypothesis: an open-ended prompt based on a caregiver-known mealtime memory. It is not a memory test, and the caregiver can skip it.",
    };
  }
  return {
    title: `What part of ${profile.hometown.city} feels most familiar to you?`,
    reason:
      "Agent hypothesis: an open-ended prompt based on the caregiver-known hometown. It is not a memory test.",
  };
}

function qlooPrompt(profile: PersonProfile, selected: EvaluatedCandidate[]): { title: string; reason: string; signalNames: string[] } {
  const signal = selected
    .flatMap((item) => item.candidate.signalNames)
    .find((name) => !/record label|iconic|charming|elegant/i.test(name));
  const decade = `${Math.floor(profile.formativePeriod.startYear / 10) * 10}s`;
  if (signal) {
    return {
      title: `What comes to mind when you think about ${signal} and ${profile.hometown.city} in the ${decade}?`,
      reason: `Agent hypothesis: follows the Qloo signal “${signal}”. It is an invitation to talk, not a memory test or a claim about what the person remembers.`,
      signalNames: [signal],
    };
  }
  return {
    title: `What comes to mind when you think about ${profile.hometown.city} in the ${decade}?`,
    reason:
      "Agent hypothesis: a geographic and era prompt drawn from caregiver-known context, not from a verified personal memory.",
    signalNames: [],
  };
}

export function composeSession(input: ComposeSessionInput): Session {
  const { profile, evaluations, durationMinutes = 20, now = new Date().toISOString() } = input;
  const eligible = evaluations.filter((item) => item.evaluation.eligible && !item.evaluation.suppressed);
  const best = (types: AgentCandidate["type"][]): EvaluatedCandidate | undefined =>
    eligible
      .filter((item) => types.includes(item.candidate.type))
      .sort((a, b) => b.evaluation.score - a.evaluation.score)[0];

  const music = best(["music"]);
  const visual = best(["film", "tv"]);
  const sensory = best(["food"]);
  const fallback = sensory ? null : fallbackSensoryCue(profile);
  const selected = [music, visual, sensory].filter((item): item is EvaluatedCandidate => Boolean(item));

  const target = Math.max(10, Math.min(40, Math.round(durationMinutes)));
  const baseWeights = {
    music: music ? 5 : 0,
    visual: visual ? 7 : 0,
    food: sensory ? 3 : 0,
    conversation: 5,
  };
  const baseSum = Object.values(baseWeights).reduce((sum, value) => sum + value, 0) || 1;
  const scale = target / baseSum;
  const musicMinutes = music ? Math.max(2, Math.round(baseWeights.music * scale)) : 0;
  const visualMinutes = visual ? Math.max(2, Math.round(baseWeights.visual * scale)) : 0;
  const foodMinutes = sensory ? Math.max(2, Math.round(baseWeights.food * scale)) : 0;
  const conversationMinutes = Math.max(4, target - musicMinutes - visualMinutes - foodMinutes);
  const promptOneMinutes = Math.ceil(conversationMinutes / 2);
  const promptTwoMinutes = Math.max(1, conversationMinutes - promptOneMinutes);

  const items: SessionItem[] = [];
  if (music) items.push(toSessionItem(music.candidate, music.evaluation, musicMinutes));
  if (visual) items.push(toSessionItem(visual.candidate, visual.evaluation, visualMinutes));
  if (sensory) {
    items.push(toSessionItem(sensory.candidate, sensory.evaluation, foodMinutes));
  } else if (fallback) {
    items.push({
      id: createSessionItemId(),
      type: "food",
      title: `${fallback.title} (sensory cue)`,
      reason: `Caregiver-known: ${fallback.detail} No Qloo food entity or food-tagged place was available, so this is a caregiver cue rather than a Qloo claim.`,
      provenance: "caregiver",
      confidence: 0.7,
      durationMinutes: foodMinutes || 3,
      signalNames: [],
      historicalStatus: "not_date_verifiable",
    });
  }

  const promptOne = caregiverPrompt(profile);
  const promptTwo = qlooPrompt(profile, selected);
  items.push({
    id: createSessionItemId(),
    type: "conversation",
    title: promptOne.title,
    reason: promptOne.reason,
    provenance: "agent",
    confidence: 0.5,
    durationMinutes: promptOneMinutes,
    signalNames: [],
    historicalStatus: "inside_period",
  });
  items.push({
    id: createSessionItemId(),
    type: "conversation",
    title: promptTwo.title,
    reason: promptTwo.reason,
    provenance: "agent",
    confidence: 0.5,
    durationMinutes: promptTwoMinutes,
    signalNames: promptTwo.signalNames,
    historicalStatus: "inside_period",
  });

  const actualDuration = items.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
  const safetyNotes = [
    "The caregiver can stop the session at any time.",
    "This is a reminiscence companion, not a memory test, diagnosis, treatment, or clinical therapy.",
  ];
  if (profile.preferencesLearned.some((preference) => preference.reaction === "agitated")) {
    safetyNotes.push(
      "A previous caregiver observation of agitation is recorded. Items related to that observation are excluded; do not re-expose them.",
    );
  }

  return {
    id: createSessionId(),
    createdAt: now,
    durationMinutes: actualDuration,
    status: "planned",
    items,
    caregiverFeedback: [],
    safetyNotes,
  };
}

export function describeSession(session: Session): string {
  return session.items
    .map((item) => `${categoryLabel(item.type)}: ${item.title} [${item.provenance}]`)
    .join("; ");
}
