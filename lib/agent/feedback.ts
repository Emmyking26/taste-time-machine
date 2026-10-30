import { reactionStrength, reactionTone } from "./evaluation";
import { getProfileStore, type ProfileStore } from "./profile";
import type {
  CaregiverFeedback,
  CaregiverReaction,
  FeedbackInput,
  FeedbackResult,
  LearnedPreference,
  PersonProfile,
} from "./types";

const REACTIONS: CaregiverReaction[] = ["lit_up", "calm", "engaged", "no_response", "agitated", "unknown"];

function mergePreference(
  preferences: LearnedPreference[],
  incoming: LearnedPreference,
): LearnedPreference {
  const same = preferences.find((preference) => {
    if ((preference.kind ?? "signal") !== (incoming.kind ?? "signal")) return false;
    if (incoming.kind === "entity") return preference.entityId === incoming.entityId;
    return preference.signal.toLowerCase() === incoming.signal.toLowerCase();
  });

  if (!same) {
    preferences.push(incoming);
    return incoming;
  }

  same.reaction = incoming.reaction;
  same.strength = Math.max(same.strength, incoming.strength);
  same.tone = incoming.tone;
  same.updatedAt = incoming.updatedAt;
  same.sessionId = incoming.sessionId;
  same.sessionItemId = incoming.sessionItemId;
  same.adjacentSignals = incoming.adjacentSignals;
  return same;
}

/**
 * Apply caregiver observations to a profile. Feedback is an observation,
 * not a diagnosis or a clinical measurement.
 */
export function applyCaregiverFeedback(
  profile: PersonProfile,
  sessionId: string,
  feedback: FeedbackInput[],
  now = new Date().toISOString(),
): FeedbackResult {
  const session = profile.sessionHistory.find((item) => item.id === sessionId);
  if (!session) throw new Error(`Session “${sessionId}” was not found in profile “${profile.id}”.`);
  if (feedback.length === 0) throw new Error("At least one caregiver observation is required.");

  const recorded: CaregiverFeedback[] = [];
  const learned: LearnedPreference[] = [];

  for (const input of feedback) {
    if (!REACTIONS.includes(input.reaction)) throw new Error(`Unknown caregiver reaction “${String(input.reaction)}”.`);
    const sessionItem = session.items.find((item) => item.id === input.sessionItemId);
    if (!sessionItem) throw new Error(`Session item “${input.sessionItemId}” was not found in session “${sessionId}”.`);

    const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) : "";
    recorded.push({
      sessionItemId: sessionItem.id,
      reaction: input.reaction,
      ...(note ? { note } : {}),
      createdAt: now,
    });

    const tone = reactionTone(input.reaction);
    if (tone === 0) continue;

    const strength = reactionStrength(input.reaction);
    const adjacentSignals = (sessionItem.signalNames ?? []).slice(0, 5);

    const entityPreference: LearnedPreference = {
      signal: sessionItem.title,
      evidence: "caregiver_feedback",
      reaction: input.reaction,
      strength,
      tone,
      updatedAt: now,
      kind: "entity",
      ...(sessionItem.entityId ? { entityId: sessionItem.entityId } : {}),
      sessionId,
      sessionItemId: sessionItem.id,
      adjacentSignals,
    };
    learned.push(mergePreference(profile.preferencesLearned, entityPreference));

    for (const signal of adjacentSignals) {
      const signalPreference: LearnedPreference = {
        signal,
        evidence: "caregiver_feedback",
        reaction: input.reaction,
        strength,
        tone,
        updatedAt: now,
        kind: "signal",
        ...(sessionItem.entityId ? { entityId: sessionItem.entityId } : {}),
        sessionId,
        sessionItemId: sessionItem.id,
        adjacentSignals,
      };
      learned.push(mergePreference(profile.preferencesLearned, signalPreference));
    }
  }

  session.caregiverFeedback = [...(session.caregiverFeedback ?? []), ...recorded];

  const agitation = recorded.some((item) => item.reaction === "agitated");
  const safety = agitation
    ? {
        shouldStop: true,
        guidance:
          "A caregiver observed agitation. Stop or skip this item and do not re-expose it. Offer a break and a familiar calming cue instead. This observation is not a medical measurement.",
      }
    : {
        shouldStop: false,
        guidance:
          "The caregiver can stop the session at any time. Observations are used only to choose gentler or more engaging cues; they are not a diagnosis or a memory test.",
      };

  profile.updatedAt = now;
  return {
    profile,
    learnedPreferences: learned,
    safety,
  };
}

export function recordFeedback(
  profileId: string,
  sessionId: string,
  feedback: FeedbackInput[],
  options: { store?: ProfileStore; now?: string } = {},
): FeedbackResult {
  const store = options.store ?? getProfileStore();
  const profile = store.getOrThrow(profileId);
  const result = applyCaregiverFeedback(profile, sessionId, feedback, options.now);
  store.save(result.profile);
  return {
    ...result,
    profile: store.getOrThrow(profileId),
  };
}
