import type {
  AgentCandidate,
  CandidateEvaluation,
  CaregiverReaction,
  CulturalSignal,
  ItemType,
  LearnedPreference,
  PersonProfile,
} from "./types";

export interface FeedbackContext {
  positiveSignals: Map<string, number>;
  negativeSignals: Map<string, number>;
  replayPenalty: Map<string, number>;
  suppressedEntities: Set<string>;
  suppressedSignals: Set<string>;
  likedSignals: string[];
  avoidedSignals: string[];
  notes: string[];
  shouldStop: boolean;
}

export function reactionTone(reaction: CaregiverReaction): number {
  switch (reaction) {
    case "lit_up":
      return 1;
    case "engaged":
      return 0.7;
    case "calm":
      return 0.4;
    case "no_response":
      return -0.25;
    case "agitated":
      return -1;
    default:
      return 0;
  }
}

export function reactionStrength(reaction: CaregiverReaction): number {
  switch (reaction) {
    case "lit_up":
      return 0.8;
    case "engaged":
      return 0.6;
    case "calm":
      return 0.4;
    case "no_response":
      return 0.3;
    case "agitated":
      return 0.8;
    default:
      return 0;
  }
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

function bump(map: Map<string, number>, signal: string, amount: number): void {
  const mapKey = key(signal);
  map.set(mapKey, (map.get(mapKey) ?? 0) + amount);
}

function preferenceSignals(preference: LearnedPreference): string[] {
  const values = [preference.signal, ...(preference.adjacentSignals ?? [])].filter(Boolean);
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Convert caregiver observations into score adjustments.
 * A lit_up observation boosts adjacent signals and penalizes replaying the exact item.
 * An agitated observation suppresses the item and its related signals.
 */
export function buildFeedbackContext(profile: PersonProfile): FeedbackContext {
  const positiveSignals = new Map<string, number>();
  const negativeSignals = new Map<string, number>();
  const replayPenalty = new Map<string, number>();
  const suppressedEntities = new Set<string>();
  const suppressedSignals = new Set<string>();
  const notes: string[] = [];
  let shouldStop = false;

  for (const preference of profile.preferencesLearned) {
    const tone = preference.tone;
    if (tone === 0 || preference.reaction === "unknown") continue;
    const strength = Math.max(0.1, Math.min(1, preference.strength));
    const isEntity = preference.kind === "entity";
    const signals = preferenceSignals(preference);

    if (tone > 0) {
      if (isEntity) {
        if (preference.entityId) {
          const current = replayPenalty.get(preference.entityId) ?? 0;
          replayPenalty.set(preference.entityId, Math.max(current, strength * 0.35));
          notes.push(`Prior observation: “${preference.signal}” was ${preference.reaction}. Replaying it was down-ranked in favour of adjacent signals.`);
        }
        for (const signal of signals) bump(positiveSignals, signal, strength * 0.45);
      } else {
        bump(positiveSignals, preference.signal, strength * tone);
      }
      continue;
    }

    if (isEntity) {
      if (preference.entityId) {
        if (preference.reaction === "agitated") {
          suppressedEntities.add(preference.entityId);
          notes.push(`Prior observation: agitation after “${preference.signal}”. The item is excluded from the next session.`);
        } else {
          const current = replayPenalty.get(preference.entityId) ?? 0;
          replayPenalty.set(preference.entityId, Math.max(current, strength * 0.2));
        }
      }
      for (const signal of signals) {
        if (preference.reaction === "agitated") suppressedSignals.add(key(signal));
        bump(negativeSignals, signal, strength * 0.7);
      }
    } else {
      if (preference.reaction === "agitated") suppressedSignals.add(key(preference.signal));
      bump(negativeSignals, preference.signal, strength * Math.abs(tone));
    }

    if (preference.reaction === "agitated") shouldStop = true;
  }

  const likedSignals = [...positiveSignals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([signal]) => signal);
  const avoidedSignals = [...new Set([...suppressedSignals, ...[...negativeSignals.keys()]])].slice(0, 5);

  return {
    positiveSignals,
    negativeSignals,
    replayPenalty,
    suppressedEntities,
    suppressedSignals,
    likedSignals,
    avoidedSignals,
    notes: [...new Set(notes)],
    shouldStop,
  };
}

function candidateSignalKeys(candidate: AgentCandidate): string[] {
  return [...new Set(candidate.signalNames.map(key).filter(Boolean))];
}

export function isCandidateSuppressed(
  candidate: AgentCandidate,
  profile: PersonProfile,
  feedback: FeedbackContext = buildFeedbackContext(profile),
): boolean {
  if (candidate.entityId && feedback.suppressedEntities.has(candidate.entityId)) return true;
  return candidateSignalKeys(candidate).some((signal) => feedback.suppressedSignals.has(signal));
}

function historicalFit(candidate: AgentCandidate, profile: PersonProfile, warnings: string[]): number {
  if (candidate.type === "conversation") return 1;
  if (candidate.year !== undefined) {
    const inside = candidate.year >= profile.formativePeriod.startYear && candidate.year <= profile.formativePeriod.endYear;
    if (!inside) warnings.push(`Release year ${candidate.year} is outside the ${profile.formativePeriod.startYear}–${profile.formativePeriod.endYear} window.`);
    return inside ? 1 : 0.1;
  }
  if (candidate.historicalStatus === "era_tag") {
    warnings.push("No artist release year is available; era membership is a Qloo tag, not a verified date.");
    return 0.95;
  }
  if (candidate.type === "food") {
    warnings.push("Qloo has no historical date filter for places; this is a present-day place cue.");
    return 0.35;
  }
  warnings.push("No date metadata was available for this item.");
  return 0.5;
}

function geographicFit(candidate: AgentCandidate): number {
  const context = (candidate.geographicContext ?? "").toLowerCase();
  const signals = candidate.signalNames.map(key);
  if (candidate.type === "food") return context.includes("detroit") ? 1 : 0.5;
  if (candidate.type === "film" || candidate.type === "tv") {
    if (!context) return 0.5;
    return context.includes("united states") ? 1 : 0.6;
  }
  if (candidate.type === "music") {
    if (signals.some((signal) => signal.includes("motown") || signal.includes("detroit"))) return 0.9;
    return 0.5;
  }
  return 0.5;
}

function anchorSignalKeys(profile: PersonProfile): Set<string> {
  const ids = new Set(profile.anchors.map((anchor) => anchor.entityId).filter((id): id is string => Boolean(id)));
  const names = new Set<string>();
  for (const signal of profile.discoveredSignals) {
    if (signal.sourceEntity && ids.has(signal.sourceEntity)) names.add(key(signal.name));
  }
  return names;
}

function caregiverRelevance(candidate: AgentCandidate, profile: PersonProfile): number {
  if (candidate.entityId && profile.anchors.some((anchor) => anchor.entityId === candidate.entityId)) return 1;
  const title = key(candidate.title);
  const known = [
    ...profile.caregiverKnown.rememberedInterests,
    ...(profile.caregiverKnown.rememberedMusic ?? []),
    ...(profile.caregiverKnown.rememberedMovies ?? []),
    ...(profile.caregiverKnown.rememberedTvShows ?? []),
    ...(profile.caregiverKnown.rememberedFoods ?? []),
    ...(profile.caregiverKnown.rememberedPlaces ?? []),
  ].map(key);
  if (known.some((value) => value === title || value.includes(title) || title.includes(value))) return 1;
  const anchorSignals = anchorSignalKeys(profile);
  if (candidate.signalNames.some((signal) => anchorSignals.has(key(signal)))) return 0.75;
  return 0.35;
}

function novelty(candidate: AgentCandidate, profile: PersonProfile): number {
  const title = key(candidate.title);
  const occurrences = profile.sessionHistory
    .flatMap((session) => session.items)
    .filter((item) => (candidate.entityId && item.entityId === candidate.entityId) || key(item.title) === title).length;
  return Math.max(0.4, 1 - occurrences * 0.3);
}

function scoreFeedback(candidate: AgentCandidate, feedback: FeedbackContext): {
  adjustment: number;
  matched: string[];
  replay: number;
} {
  const signals = candidateSignalKeys(candidate);
  const positives = signals.map((signal) => feedback.positiveSignals.get(signal) ?? 0).filter((value) => value > 0);
  const negatives = signals.map((signal) => feedback.negativeSignals.get(signal) ?? 0).filter((value) => value > 0);
  const positive = positives.length > 0 ? Math.min(0.25, (positives.reduce((sum, value) => sum + value, 0) / positives.length) * 0.35) : 0;
  const negative = negatives.length > 0 ? Math.min(0.7, (negatives.reduce((sum, value) => sum + value, 0) / negatives.length) * 0.8) : 0;
  const replay = candidate.entityId ? feedback.replayPenalty.get(candidate.entityId) ?? 0 : 0;
  return {
    adjustment: positive - negative - replay,
    matched: signals.filter((signal) => feedback.positiveSignals.has(signal) || feedback.negativeSignals.has(signal)),
    replay,
  };
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function scoreCandidate(
  candidate: AgentCandidate,
  profile: PersonProfile,
  feedback: FeedbackContext = buildFeedbackContext(profile),
): CandidateEvaluation {
  const warnings: string[] = [];
  const reasons: string[] = [];
  const suppressed = isCandidateSuppressed(candidate, profile, feedback);

  if (suppressed) {
    const suppressedBy = [
      ...(candidate.entityId && feedback.suppressedEntities.has(candidate.entityId) ? [candidate.title] : []),
      ...candidateSignalKeys(candidate).filter((signal) => feedback.suppressedSignals.has(signal)),
    ];
    return {
      candidateId: candidate.id,
      category: candidate.type,
      eligible: false,
      suppressed: true,
      score: 0,
      components: {
        affinity: candidate.affinity ?? 0,
        historicalFit: 0,
        geographicFit: 0,
        caregiverRelevance: 0,
        caregiverAnchorBonus: 0,
        novelty: 0,
        categoryFit: 0,
        feedback: -1,
      },
      reasons: [
        `Excluded because a prior caregiver observation of agitation is associated with ${suppressedBy.join(", ") || "this item"}.`,
      ],
      warnings: ["Do not re-expose this item or closely related cues in the next session."],
      provenance: candidate.provenance,
      matchedSignals: suppressedBy,
      suppressedBy,
    };
  }

  const affinity = candidate.affinity !== undefined ? clamp(candidate.affinity) : 0.35;
  const historical = historicalFit(candidate, profile, warnings);
  const geographic = geographicFit(candidate);
  const caregiver = caregiverRelevance(candidate, profile);
  const caregiverAnchorBonus = candidate.provenance === "caregiver" ? 0.22 : 0;
  const novel = novelty(candidate, profile);
  const categoryFit = 1;
  const feedbackScore = scoreFeedback(candidate, feedback);

  const base =
    0.35 * affinity +
    0.2 * historical +
    0.1 * geographic +
    0.15 * caregiver +
    caregiverAnchorBonus +
    0.1 * novel +
    0.1 * categoryFit;
  const score = clamp(base + feedbackScore.adjustment);

  if (candidate.affinity !== undefined) reasons.push(`Qloo affinity ${candidate.affinity.toFixed(3)}.`);
  if (candidate.year !== undefined) {
    const inside = candidate.year >= profile.formativePeriod.startYear && candidate.year <= profile.formativePeriod.endYear;
    reasons.push(`${inside ? "Released inside" : "Released outside"} the ${profile.formativePeriod.startYear}–${profile.formativePeriod.endYear} window (${candidate.year}).`);
  } else if (candidate.historicalStatus === "era_tag") {
    reasons.push("Qloo era tag places this in the target cultural period; no exact release year is available.");
  } else if (candidate.type === "food") {
    reasons.push("Qloo place evidence with a Detroit constraint; no historical date filter exists.");
  }
  if (candidate.provenance === "caregiver") {
    reasons.push("Caregiver explicitly listed this item; a familiarity bonus keeps a known anchor eligible for the opening slot.");
  }
  if (feedbackScore.adjustment !== 0) {
    reasons.push(`Caregiver-feedback adjustment ${feedbackScore.adjustment >= 0 ? "+" : ""}${feedbackScore.adjustment.toFixed(2)}.`);
  }

  return {
    candidateId: candidate.id,
    category: candidate.type,
    eligible: score >= 0.4,
    suppressed: false,
    score,
    components: {
      affinity,
      historicalFit: historical,
      geographicFit: geographic,
      caregiverRelevance: caregiver,
      caregiverAnchorBonus,
      novelty: novel,
      categoryFit,
      feedback: feedbackScore.adjustment,
    },
    reasons,
    warnings,
    provenance: candidate.provenance,
    matchedSignals: feedbackScore.matched,
  };
}

export function signalsForFeedback(signals: CulturalSignal[], entityId: string): string[] {
  return [...new Set(signals.filter((signal) => signal.sourceEntity === entityId).map((signal) => signal.name))];
}

export function categoryLabel(type: ItemType): string {
  switch (type) {
    case "music":
      return "music";
    case "film":
      return "film";
    case "tv":
      return "TV";
    case "food":
      return "food / sensory cue";
    default:
      return "conversation";
  }
}
