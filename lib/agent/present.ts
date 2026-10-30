import { decadeFromTagName } from "./signals";
import type {
  CaregiverReaction,
  CulturalSignal,
  GeneratedSessionResult,
  ItemType,
  PersonProfile,
  Provenance,
  Session,
  SessionItem,
} from "./types";
import type { ReconstructionStep } from "./reconstruct";

export type PublicSignalGroup = "music" | "culture" | "places";

export interface PublicSignal {
  name: string;
  group: PublicSignalGroup;
  origin: "remembered" | "connected";
  whyLabel: string;
  whyBody: string;
}

export interface PublicPerson {
  id: string;
  name: string;
  firstName: string;
  birthYear: number;
  hometown: string;
  state?: string;
  period: { startYear: number; endYear: number };
  memories: string[];
}

export interface PublicWorld {
  person: PublicPerson;
  steps: ReconstructionStep[];
  signals: PublicSignal[];
  constellation: PublicSignal[];
}

export interface PublicSessionItem {
  id: string;
  type: ItemType;
  categoryLabel: string;
  exploreLabel: string;
  title: string;
  year?: number;
  eraHint?: string;
  provenance: Provenance;
  whyLabel: string;
  whyBody: string;
}

export interface PublicSession {
  id: string;
  profileId: string;
  durationMinutes: number;
  items: PublicSessionItem[];
  adaptationSummary: string;
  feedbackApplied: boolean;
  likedSignals: string[];
  avoidedSignals: string[];
  replayedItemsAvoided: string[];
}

export interface PublicObservation {
  sessionItemId: string;
  title: string;
  reaction: CaregiverReaction;
  reactionLabel: string;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function reactionLabel(reaction: CaregiverReaction): string {
  switch (reaction) {
    case "lit_up":
      return "Lit up";
    case "calm":
      return "Calm";
    case "engaged":
      return "Engaged";
    case "no_response":
      return "No clear response";
    case "agitated":
      return "Became agitated";
    default:
      return "Not sure";
  }
}

export function whyForProvenance(provenance: Provenance): { label: string; body: string } {
  if (provenance === "caregiver") {
    return {
      label: "You remembered",
      body: "This was one of the memories you gave us directly.",
    };
  }
  if (provenance === "agent") {
    return {
      label: "Suggested by the agent",
      body: "This is a gentle prompt based on what you shared and the cultural connections we found. It is an invitation to talk, not a test.",
    };
  }
  return {
    label: "Found through cultural connections",
    body: "This appeared because it is connected to cultural signals discovered from the interests you provided.",
  };
}

function publicCategory(type: ItemType): { categoryLabel: string; exploreLabel: string } {
  switch (type) {
    case "music":
      return { categoryLabel: "Music", exploreLabel: "Music" };
    case "film":
    case "tv":
      return { categoryLabel: type === "tv" ? "Something to watch" : "Something to watch", exploreLabel: "Something to watch" };
    case "food":
      return { categoryLabel: "A cultural cue", exploreLabel: "A cultural/place cue" };
    default:
      return { categoryLabel: "Conversation", exploreLabel: "Conversation" };
  }
}

const MUSIC_NAMES =
  /\b(motown|soul|r&b|rnb|oldies|funk|gospel|jazz|blues|pop|rock|girl group|doo-wop|rhythm)\b/i;

function groupSignal(signal: CulturalSignal, hometown: string): PublicSignalGroup {
  const haystack = `${signal.namespace ?? ""} ${signal.type ?? ""} ${signal.id ?? ""}`.toLowerCase();
  const name = signal.name.toLowerCase();
  if (
    haystack.includes("place") ||
    haystack.includes("location") ||
    name.includes(hometown.toLowerCase()) ||
    /\b(corktown|downtown|neighborhood)\b/i.test(signal.name)
  ) {
    return "places";
  }
  if (decadeFromTagName(signal.name)) return "culture";
  if (haystack.includes("genre") || haystack.includes("music") || MUSIC_NAMES.test(signal.name)) {
    if (/^\d{2}s$/.test(name) || /19\d0s/.test(name)) return "culture";
    return "music";
  }
  return "culture";
}

function publicSignalFromName(
  name: string,
  group: PublicSignalGroup,
  origin: PublicSignal["origin"],
): PublicSignal {
  const why =
    origin === "remembered"
      ? whyForProvenance("caregiver")
      : whyForProvenance("qloo");
  return { name, group, origin, whyLabel: why.label, whyBody: why.body };
}

const GENERIC_SIGNAL_NAMES = new Set(
  [
    "record label",
    "iconic",
    "charming",
    "elegant",
    "harmonious",
    "polished",
    "glamorous",
    "classic",
    "timeless",
    "catchy",
    "melodic",
    "smooth",
    "expressive",
    "dedicated",
    "loyal",
    "passionate",
    "energetic",
    "upbeat",
    "production",
    "theatrical",
    "vocals",
    "piano",
    "guitar",
    "drums",
    "orchestra",
    "devoted",
    "love",
    "heartbreak",
  ].map((name) => name.toLowerCase()),
);

function presentableSignals(profile: PersonProfile): PublicSignal[] {
  const hometown = profile.hometown.city;
  const items: PublicSignal[] = [];
  const seen = new Set<string>();
  const add = (signal: PublicSignal) => {
    const key = `${signal.group}:${signal.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(signal);
  };

  for (const anchor of profile.anchors) {
    if (anchor.state !== "resolved") continue;
    const name = anchor.name ?? anchor.text;
    const type = anchor.entityType ?? "";
    if (type.includes("place")) add(publicSignalFromName(name, "places", "remembered"));
    else if (type.includes("movie") || type.includes("tv")) add(publicSignalFromName(name, "culture", "remembered"));
    else add(publicSignalFromName(name, "music", "remembered"));
    if (anchor.tagName) add(publicSignalFromName(anchor.tagName, "music", "connected"));
  }

  const ranked = [...profile.discoveredSignals].sort(
    (a, b) => (b.affinity ?? 0) - (a.affinity ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0),
  );
  for (const signal of ranked) {
    if (GENERIC_SIGNAL_NAMES.has(signal.name.toLowerCase())) continue;
    add(publicSignalFromName(signal.name, groupSignal(signal, hometown), "connected"));
  }

  add(publicSignalFromName(hometown, "places", "remembered"));
  return items;
}

export function presentPerson(profile: PersonProfile): PublicPerson {
  return {
    id: profile.id,
    name: profile.name,
    firstName: firstName(profile.name),
    birthYear: profile.birthYear,
    hometown: profile.hometown.city,
    ...(profile.hometown.state ? { state: profile.hometown.state } : {}),
    period: profile.formativePeriod,
    memories: profile.caregiverKnown.rememberedInterests,
  };
}

export function presentWorld(profile: PersonProfile, steps: ReconstructionStep[]): PublicWorld {
  const signals = presentableSignals(profile);
  const constellation = signals.slice(0, 16);
  return {
    person: presentPerson(profile),
    steps,
    signals,
    constellation,
  };
}

function eraHintFor(item: SessionItem, profile: PersonProfile): string | undefined {
  if (item.year) {
    const decade = Math.floor(item.year / 10) * 10;
    return `${decade}s`;
  }
  if (item.type === "music") {
    return `${Math.floor(profile.formativePeriod.startYear / 10) * 10}s`;
  }
  return undefined;
}

function presentItem(item: SessionItem, profile: PersonProfile): PublicSessionItem {
  const why = whyForProvenance(item.provenance);
  const labels = publicCategory(item.type);
  return {
    id: item.id,
    type: item.type,
    categoryLabel: labels.categoryLabel,
    exploreLabel: labels.exploreLabel,
    title: item.title,
    ...(item.year !== undefined ? { year: item.year } : {}),
    ...(eraHintFor(item, profile) ? { eraHint: eraHintFor(item, profile) } : {}),
    provenance: item.provenance,
    whyLabel: why.label,
    whyBody: why.body,
  };
}

function softenAdaptation(summary: string): string {
  return summary
    .replace(/\bQloo\b/g, "cultural")
    .replace(/\bentity IDs?\b/gi, "items")
    .replace(/\baffinity\b/gi, "connection");
}

export function presentSession(profile: PersonProfile, session: Session): PublicSession {
  return {
    id: session.id,
    profileId: profile.id,
    durationMinutes: session.durationMinutes,
    items: session.items.map((item) => presentItem(item, profile)),
    adaptationSummary: softenAdaptation(session.adaptation?.summary ?? ""),
    feedbackApplied: session.adaptation?.feedbackApplied ?? false,
    likedSignals: session.adaptation?.likedSignals ?? [],
    avoidedSignals: session.adaptation?.avoidedSignals ?? [],
    replayedItemsAvoided: session.adaptation?.replayedItemsAvoided ?? [],
  };
}

export function presentGeneratedSession(result: GeneratedSessionResult, profile: PersonProfile): PublicSession {
  return presentSession(profile, result.session);
}

export function presentObservations(
  session: PublicSession,
  feedback: Array<{ sessionItemId: string; reaction: CaregiverReaction }>,
): PublicObservation[] {
  return feedback
    .map((entry) => {
      const item = session.items.find((sessionItem) => sessionItem.id === entry.sessionItemId);
      if (!item) return null;
      return {
        sessionItemId: entry.sessionItemId,
        title: item.title,
        reaction: entry.reaction,
        reactionLabel: reactionLabel(entry.reaction),
      };
    })
    .filter((entry): entry is PublicObservation => entry !== null);
}
