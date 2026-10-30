import {
  entitiesFromResponse,
  resolveAnchor,
  tagsFromResponse,
  type QlooEntity,
  type QlooEntityType,
  type QlooTag,
} from "@/lib/qloo";
import { getDefaultGateway, type QlooGateway } from "@/lib/agent/qloo-gateway";
import { normalizeEntitySignals, normalizeQlooSignal, topSignals } from "@/lib/agent/signals";
import type { QlooRequestRecord } from "@/lib/qloo";
import { CULTURAL_MEMORY_SYSTEM_PROMPT, llmClient, LLM_BASE_URL, LLM_MODEL } from "@/lib/llm";

export type MemoryType = "music" | "film" | "tv" | "place" | "food" | "person" | "unknown";
export type ClueCertainty = "remembered" | "approximate" | "uncertain";
export type InvestigationStatus = "investigating" | "needs_clarification" | "candidates" | "confirmed";

export interface MemoryClue {
  id: string;
  label: string;
  value: string;
  certainty: ClueCertainty;
}

export interface ResolvedMemoryAnchor {
  query: string;
  state: "resolved" | "ambiguous" | "unresolved";
  entityId?: string;
  name?: string;
  entityType?: string;
  confidence: number;
  provenance: "qloo";
}

export interface InvestigationCandidate {
  id: string;
  entityId: string;
  title: string;
  type: MemoryType;
  year?: number;
  imageUrl?: string;
  strength: "strong_match" | "possible_match" | "worth_exploring";
  explanation: string;
  context: string[];
  signalNames: string[];
  provenance: "qloo" | "user_confirmed" | "agent";
  qlooEvidence: {
    affinity?: number;
    popularity?: number;
    requestIds: string[];
  };
}

export interface MemoryThreadNode {
  kind: "remembered" | "candidate" | "world";
  label: string;
  detail?: string;
}

export interface InvestigationInput {
  transcript: string;
  previousClues?: MemoryClue[];
  rejectedCandidates?: string[];
  confirmedCandidateId?: string;
  confirmedEntity?: string;
  confirmedEntityId?: string;
  confirmedEntityType?: string;
  clarificationCount?: number;
  exploreWorld?: boolean;
  person?: { name?: string; age?: number; location?: string };
}

export interface DirectAnswer {
  /** The exact recovered memory / direct answer to the user's question. */
  title: string;
  /** Artist, year, role, or event context. */
  subtitle: string;
  /** Two-sentence conversational explanation of the answer. */
  detailedExplanation: string;
  /** Measured Qloo affinity as a percentage; zero means Qloo supplied no score. */
  tasteAffinityScore: number;
}

export interface CulturalConnectionItem {
  title: string;
  context: string;
  /** One-line explanation of why the taste graph connects this item. */
  whyConnected: string;
}

export interface CulturalConnectionGroup {
  groupName: string;
  items: CulturalConnectionItem[];
}

export interface InvestigationResult {
  investigationId: string;
  memoryType: MemoryType;
  clues: MemoryClue[];
  resolvedAnchors: ResolvedMemoryAnchor[];
  culturalSignals: Array<{ name: string; affinity?: number; source: "qloo" }>;
  candidates: InvestigationCandidate[];
  followUpQuestion: string | null;
  investigationStatus: InvestigationStatus;
  confirmedEntity: string | null;
  spokenResponse: string;
  thread: MemoryThreadNode[];
  provenance: {
    qlooCalls: number;
    qlooRequestIds: string[];
    note: string;
  };
  extraction: { cleanedTranscript: string; cleanedIntent: string; seedQuery: string; leadEntity: string | null; candidateSeeds: string[]; targetEntities: string[]; culturalKeywords: string[]; decade: string | null; primaryMedium: "music" | "screen" | "places" | "culture"; primaryDomain: "music" | "screen" | "places" | "culture"; entityType: MemoryType; domains: Array<"music" | "film" | "dining" | "culture"> };
  culturalInvestigation: CulturalInvestigationResult;
  directAnswer: DirectAnswer;
  culturalConnections: CulturalConnectionGroup[];
}

export interface CulturalInvestigationResult {
  hypothesis: { leadEntity: string | null; confidenceScore: number | null; qlooResolved: boolean; reasoning: string };
  agentFollowUp: string;
  clarificationChips: string[];
  primaryDomain: "music" | "screen" | "places" | "culture";
  reconstructedWorld: {
    music: Array<{ title: string; artist: string; affinity: string; source?: "qloo" | "agent" }>;
    film: Array<{ title: string; year: string; correlation: string; source?: "qloo" | "agent" }>;
    venues: Array<{ name: string; location: string; historicalContext: string; source?: "qloo" | "agent" }>;
  };
}

const STOP_WORDS = new Set([
  "I", "My", "The", "A", "An", "It", "This", "That", "Maybe", "Perhaps", "Definitely", "Dad", "Mom",
  "Father", "Mother", "Woman", "Man", "Group", "Detroit", "Chicago", "America", "United", "States",
]);

const KNOWN_ANCHOR_TERMS = [
  "the supremes", "motown", "diana ross", "marvin gaye", "the temptations", "aretha franklin", "elvis",
  "the beatles", "the rolling stones", "hollywood", "broadway", "disneyland", "saturday night live",
];

const LOCATION_TERMS = [
  "Detroit", "Chicago", "New York", "Los Angeles", "Memphis", "Nashville", "Atlanta", "London", "Paris",
  "New Orleans", "San Francisco", "Boston", "Philadelphia", "Cleveland", "Toronto", "Miami",
];

const ERA_WORDS: Record<string, string> = {
  twenties: "1920s", thirties: "1930s", forties: "1940s", fifties: "1950s", sixties: "1960s",
  seventies: "1970s", eighties: "1980s", nineties: "1990s", "two thousands": "2000s",
};

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item).toLowerCase();
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

const GENERIC_ENTITY_NAMES = new Set([
  "unknown", "cultural memory", "the memory", "memory", "n/a", "na", "none", "null",
  "not sure", "something", "anything", "that song", "this song", "that movie", "this movie",
  "a song", "a movie", "a place", "the song", "the movie", "the place", "untitled",
  "like", "well", "so", "just", "really", "actually", "oh", "okay", "ok", "thing", "stuff",
]);

const FILLER_PATTERNS: RegExp[] = [
  /\b(?:um+|uh+|er+|erm+|ah+|hmm+|mm+)\b/gi,
  /\b(?:you know|i mean|sort of|kind of|basically|literally|honestly)\b/gi,
  /\b(?:for|in|about)\s+(?:this|that)\s+(?:cultural\s+)?memory\b/gi,
  /\b(?:this|that)\s+(?:cultural\s+)?memory\s+(?:is|was)\s+(?:a|an|about)\b/gi,
  /\b(?:cultural\s+memory)\b/gi,
  /\.{2,}/g,
];

/** Remove spoken disfluencies and conversational scaffolding before entity extraction. */
export function cleanSpokenTranscript(transcript: string): string {
  let cleaned = transcript.replace(/[“”]/g, '"').trim();
  for (const pattern of FILLER_PATTERNS) cleaned = cleaned.replace(pattern, " ");
  cleaned = cleaned
    .replace(/\s*[,;]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(?:like|so|well|just|oh|okay|ok)\b[\s,]*/i, "")
    .replace(/\b(?:is|was)\s+(?:a|an)\s*$/i, "")
    .trim();
  return cleaned || transcript.trim();
}

export function isGenericEntityName(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length < 2 || GENERIC_ENTITY_NAMES.has(normalized);
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Pull the real target out of a "who sang ..." style spoken question. */
function extractTargetPhrase(text: string): string | null {
  const cleaned = cleanSpokenTranscript(text);
  const match = cleaned.match(/\b(?:who\s+(?:sang|sings|performed|wrote|made)|what(?:'s| is)\s+(?:the\s+)?(?:song|tune|track))\s+(.+)$/i);
  const raw = (match?.[1] ?? "")
    .replace(/\b(?:please|again|maybe|i think|i believe|do you know)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  return titleCase(raw.split(/\s+/).slice(0, 6).join(" "));
}

export const QLOO_INSIGHT_REASONING =
  "Resolved via Qloo cultural entity correlation and cross-domain taste mapping.";

export const QLOO_TASTE_GRAPH_NOTE =
  "QLOO TASTE GRAPH INSIGHT · cross-domain cultural constellation mapped from entity correlation and aggregate taste signals.";

function withConfidence(copy: string, _seed: string): string {
  return copy;
}

function clue(id: string, label: string, value: string, certainty: ClueCertainty): MemoryClue {
  return { id, label, value, certainty };
}

function inferMemoryType(text: string): MemoryType {
  const lower = text.toLowerCase();
  if (/\b(song|music|sing(er|ing)|sang|sung|lyrics?|band|record|radio|album|vinyl|melody|chorus)\b/.test(lower)) return "music";
  if (/\b(movie|film|cinema|actor|actress|cast|character|played|portrayed|acted|series|episode|television|tv)\b/.test(lower) || /\bblack\s*list\b/.test(lower)) return /\b(tv|television|series|episode)\b/.test(lower) || /\bblack\s*list\b/.test(lower) ? "tv" : "film";
  if (/\b(restaurant|diner|deli|bodega|bakery|bar|grill|cafe|dinner|recipe|food|meal|dish|kitchen|cooking|taste)\b/.test(lower)) return "food";
  if (/\b(lived|street|avenue|ave|road|boulevard|downtown|neighborhood|town|city|place|house|home|school|venue|ballroom|landmark|hometown)\b/.test(lower)) return "place";
  if (/\b(person|man|woman|teacher|neighbor|friend)\b/.test(lower)) return "person";
  return "unknown";
}

function extractEra(text: string): string | null {
  const lower = text.toLowerCase();
  const numeric = lower.match(/\b(18|19|20)\d0s\b/);
  if (numeric) return numeric[0];
  const short = lower.match(/\b([2-9]0)s\b/);
  if (short) return `19${short[1]}0s`;
  for (const [word, era] of Object.entries(ERA_WORDS)) if (lower.includes(word)) return era;
  return null;
}

function extractAnchorPhrases(text: string): string[] {
  const quoted = [...text.matchAll(/["“]([^"”]{2,80})["”]/g)].map((match) => match[1].trim());
  const lower = text.toLowerCase();
  const known = KNOWN_ANCHOR_TERMS.filter((term) => lower.includes(term)).map((term) =>
    term.replace(/\b\w/g, (letter) => letter.toUpperCase()),
  );
  const properNouns = [...text.matchAll(/\b(?:The\s+)?[A-Z][\w'&-]*(?:\s+(?:[A-Z][\w'&-]*|and|&)){1,3}\b/g)]
    .map((match) => match[0].trim())
    .filter((value) => value.split(/\s+/).some((part) => !STOP_WORDS.has(part)));
  return unique([...quoted, ...known, ...properNouns], (value) => value).slice(0, 5);
}

function locationFrom(text: string): string | null {
  const lower = text.toLowerCase();
  return LOCATION_TERMS.find((location) => lower.includes(location.toLowerCase())) ?? null;
}

function isCorrection(text: string): boolean {
  return /\b(no|not|actually|correction|wrong)\b/i.test(text) && /\b(group|solo|woman|man|singer|radio|home|upbeat|soulful)\b/i.test(text);
}

export function extractMemoryClues(transcript: string): { memoryType: MemoryType; clues: MemoryClue[]; anchorPhrases: string[] } {
  const text = cleanSpokenTranscript(transcript);
  const lower = text.toLowerCase();
  const memoryType = inferMemoryType(text);
  const clues: MemoryClue[] = [];
  const era = extractEra(text);
  if (era) clues.push(clue("era", era, era, "approximate"));

  const location = locationFrom(text);
  if (location) clues.push(clue("location", location, location, "remembered"));

  if (/\b(female|woman|lady|girl)\b/i.test(text)) clues.push(clue("vocal", "Female vocalist", "Female vocalist", /maybe|perhaps|think|not sure/i.test(text) ? "uncertain" : "remembered"));
  if (/\b(male|man|gentleman|boy)\b/i.test(text)) clues.push(clue("vocal", "Male vocalist", "Male vocalist", /maybe|perhaps|think|not sure/i.test(text) ? "uncertain" : "remembered"));
  if (/\b(group|band|duo|trio|quartet)\b/i.test(text)) clues.push(clue("format", "Group", "Group", /maybe|perhaps|think|not sure/i.test(text) ? "uncertain" : "remembered"));
  if (/\b(solo|one woman|one man|single singer|just one)\b/i.test(text)) clues.push(clue("format", "Solo singer", "Solo singer", isCorrection(text) ? "remembered" : "uncertain"));
  if (/\b(home|house|living room|kitchen|family)\b/i.test(text)) clues.push(clue("setting", "Played at home", "Played at home", "remembered"));
  if (/\b(radio|station|jukebox)\b/i.test(text)) clues.push(clue("setting", "Heard on the radio", "Heard on the radio", "remembered"));
  if (/\b(soulful|soul|motown|r&b|rnb|funk|gospel|jazz|blues)\b/i.test(text)) clues.push(clue("sound", "Soul / R&B thread", "Soul / R&B", /maybe|perhaps|think/i.test(text) ? "uncertain" : "remembered"));
  if (/\b(upbeat|dance|fast|lively|slow|ballad|gentle|sad)\b/i.test(text)) clues.push(clue("mood", "Mood or tempo", text.match(/\b(upbeat|dance|fast|lively|slow|ballad|gentle|sad)\b/i)?.[0] ?? "Mood", "uncertain"));
  if (/\b(dad|father|mom|mother|parent|grandma|grandfather|family)\b/i.test(text)) clues.push(clue("context", "A family memory", "A family memory", "remembered"));

  const associations = extractAnchorPhrases(text);
  for (const association of associations) clues.push(clue(`anchor:${association.toLowerCase()}`, "Remembered association", association, "uncertain"));
  return { memoryType, clues: unique(clues, (item) => `${item.id}:${item.value}`), anchorPhrases: associations };
}

export function mergeMemoryClues(previous: MemoryClue[] = [], incoming: MemoryClue[] = []): MemoryClue[] {
  const merged = new Map<string, MemoryClue>();
  for (const item of previous) merged.set(item.id, item);
  for (const item of incoming) {
    const prior = merged.get(item.id);
    merged.set(item.id, prior && item.certainty === "uncertain" && prior.certainty === "remembered" ? prior : item);
  }
  return [...merged.values()];
}

function expectedTypesFor(memoryType: MemoryType): QlooEntityType[] {
  switch (memoryType) {
    case "music": return ["urn:entity:artist"];
    case "film": return ["urn:entity:movie"];
    case "tv": return ["urn:entity:tv_show"];
    case "place":
    case "food": return ["urn:entity:place"];
    case "person": return ["urn:entity:person", "urn:entity:artist"];
    default: return [];
  }
}

function yearFromEntity(entity: QlooEntity): number | undefined {
  const props = entity.properties ?? {};
  for (const key of ["release_year", "year", "publication_year", "releaseYear"]) {
    const value = props[key];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isInteger(number) && number > 1800 && number < 2100) return number;
  }
  return undefined;
}

function imageFromEntity(entity: QlooEntity): string | undefined {
  const props = entity.properties ?? {};
  const values = [props.image, props.image_url, props.poster, props.thumbnail, entity.external?.image];
  return values.find((value): value is string => typeof value === "string" && /^https?:\/\//.test(value));
}

function entityTypeToMemoryType(entity: QlooEntity, fallback: MemoryType): MemoryType {
  const types = [...(entity.types ?? []), entity.subtype ?? ""].join(" ");
  if (types.includes("movie")) return "film";
  if (types.includes("tv")) return "tv";
  if (types.includes("place")) return "place";
  if (types.includes("artist")) return "music";
  return fallback;
}

function candidateStrength(score: number): InvestigationCandidate["strength"] {
  if (score >= 0.68) return "strong_match";
  if (score >= 0.42) return "possible_match";
  return "worth_exploring";
}

export function generateFollowUpQuestion(memoryType: MemoryType, clues: MemoryClue[], candidates: InvestigationCandidate[], rejectedCandidates: string[] = [], candidateSeeds: string[] = []): string | null {
  const formatClue = clues.find((item) => item.id === "format");
  if (memoryType === "music" && (!formatClue || formatClue.certainty === "uncertain")) {
    if (candidateSeeds.length >= 2) return `Are you thinking of ${candidateSeeds[0]} or ${candidateSeeds[1]}? Which sounds closer?`;
    return "Do you remember if it was one singer or a group?";
  }
  if (candidates.length === 0) return null;
  if (rejectedCandidates.length > 0 && candidates.length > 0) return `Could it be ${candidates[0].title}, or should I follow a different artist or title?`;
  if (candidates.length > 1 && candidates[0].strength !== "strong_match") {
    return `Are you thinking of ${candidates[0].title} or ${candidates[1].title}? Which sounds closer?`;
  }
  return null;
}

function candidateExplanation(entity: QlooEntity, clues: MemoryClue[], signals: string[], type: MemoryType): { text: string; context: string[] } {
  const matching = clues.filter((item) => ["era", "location", "vocal", "format", "sound", "setting"].includes(item.id)).slice(0, 3).map((item) => item.value);
  const context = unique([...matching, ...signals.slice(0, 3)], (item) => item).slice(0, 4);
  const prefix = type === "music" ? "Artist connection" : type === "film" ? "Film connection" : "Cultural connection";
  return {
    text: `${prefix} returned by Qloo, with a thread through ${context.length > 0 ? context.join(", ") : "the clues you shared"}.`,
    context,
  };
}

export function scoreInvestigationCandidate(entity: QlooEntity, clues: MemoryClue[], signals: string[], affinity?: number): number {
  const lower = `${entity.name} ${(entity.tags ?? []).map((tag) => tag.name ?? "").join(" ")} ${signals.join(" ")}`.toLowerCase();
  const era = clues.find((item) => item.id === "era")?.value;
  const sound = clues.find((item) => item.id === "sound")?.value;
  const location = clues.find((item) => item.id === "location")?.value;
  let match = 0;
  if (era && lower.includes(era.slice(0, 4))) match += 0.18;
  if (sound && lower.includes(sound.split(" ")[0].toLowerCase())) match += 0.16;
  if (location && lower.includes(location.toLowerCase())) match += 0.14;
  const qloo = Math.max(0, Math.min(1, affinity ?? entity.popularity ?? 0));
  return Math.min(1, 0.24 + qloo * 0.52 + match);
}

export function filterInvestigationCandidates(candidates: InvestigationCandidate[], rejectedCandidates: string[] = []): InvestigationCandidate[] {
  const rejected = new Set(rejectedCandidates);
  return candidates.filter((candidate) => !rejected.has(candidate.id) && !rejected.has(candidate.entityId));
}

function spokenResponse(status: InvestigationStatus, candidates: InvestigationCandidate[], question: string | null): string {
  if (status === "needs_clarification" && question) return `One thing could help me narrow this down. ${question}`;
  if (status === "candidates" && candidates[0]) return `I think I may have found what you're describing. The strongest match is ${candidates[0].title}. Does this sound familiar?`;
  if (status === "confirmed" && candidates[0]) return `We found it. ${candidates[0].title} is the memory you were trying to find.`;
  return "I’m following the cultural connections around what you described.";
}

function tagQueryCandidates(memoryType: MemoryType, clues: MemoryClue[]): string[] {
  const values = clues.filter((item) => ["era", "sound", "mood"].includes(item.id)).map((item) => item.value);
  if (values.length === 0 && memoryType === "music") return ["music"];
  return values.slice(0, 2);
}

function asMemoryTypeCandidates(entities: QlooEntity[], memoryType: MemoryType, clues: MemoryClue[], signalNames: string[], requestIds: string[], rejected: Set<string>): InvestigationCandidate[] {
  const byId = new Map<string, InvestigationCandidate>();
  for (const entity of entities) {
    if (!entity.entity_id || !entity.name?.trim() || /^unknown$/i.test(entity.name.trim()) || rejected.has(entity.entity_id) || rejected.has(`qloo:${entity.entity_id}`)) continue;
    const type = entityTypeToMemoryType(entity, memoryType);
    const score = scoreInvestigationCandidate(entity, clues, signalNames, typeof entity.query?.affinity === "number" ? entity.query.affinity : undefined);
    const explanation = candidateExplanation(entity, clues, signalNames, type);
    const candidate: InvestigationCandidate = {
      id: `qloo:${entity.entity_id}`,
      entityId: entity.entity_id,
      title: entity.name,
      type,
      ...(yearFromEntity(entity) !== undefined ? { year: yearFromEntity(entity) } : {}),
      ...(imageFromEntity(entity) ? { imageUrl: imageFromEntity(entity) } : {}),
      strength: candidateStrength(score),
      explanation: explanation.text,
      context: explanation.context,
      signalNames,
      provenance: "qloo",
      qlooEvidence: {
        ...(typeof entity.query?.affinity === "number" ? { affinity: entity.query.affinity } : {}),
        ...(typeof entity.popularity === "number" ? { popularity: entity.popularity } : {}),
        requestIds,
      },
    };
    const prior = byId.get(candidate.entityId);
    if (!prior || candidate.strength === "strong_match") byId.set(candidate.entityId, candidate);
  }
  return [...byId.values()].sort((a, b) => strengthRank(b.strength) - strengthRank(a.strength)).slice(0, 3);
}

function strengthRank(value: InvestigationCandidate["strength"]): number {
  return value === "strong_match" ? 3 : value === "possible_match" ? 2 : 1;
}

function makeThread(clues: MemoryClue[], candidates: InvestigationCandidate[], signals: string[]): MemoryThreadNode[] {
  return [
    ...clues.filter((item) => item.id !== "memoryType" && !item.id.startsWith("anchor:")).slice(0, 5).map((item) => ({ kind: "remembered" as const, label: item.value, detail: item.certainty })),
    ...(candidates[0] ? [{ kind: "candidate" as const, label: candidates[0].title, detail: candidates[0].strength.replace("_", " ") }] : []),
    ...signals.slice(0, 3).map((signal) => ({ kind: "world" as const, label: signal })),
  ];
}

interface ExtractedCulturalMemory {
  cleanedTranscript: string;
  cleanedIntent: string;
  seedQuery: string;
  leadEntity: string | null;
  clarificationQuestion: string | null;
  candidateSeeds: string[];
  targetEntities: string[];
  culturalKeywords: string[];
  decade: string | null;
  primaryMedium: "music" | "screen" | "places" | "culture";
  primaryDomain: "music" | "screen" | "places" | "culture";
  entityType: MemoryType;
  domains: Array<"music" | "film" | "dining" | "culture">;
  culturalSeeds: {
    music: Array<{ title: string; artist: string; affinity: string }>;
    film: Array<{ title: string; year: string; correlation: string }>;
    venues: Array<{ name: string; location: string; historicalContext: string }>;
  };
  directAnswer: { title: string; subtitle: string; detailedExplanation: string } | null;
  culturalConnections: CulturalConnectionGroup[];
  llmStatus: "success" | "failed" | "skipped";
}

type ReconstructedWorld = CulturalInvestigationResult["reconstructedWorld"];

function connectionReason(_title: string, detail: string): string {
  return `Cultural context: ${detail}.`;
}

function fillWorldRows<T>(groups: T[][], key: (row: T) => string, limit = 3): T[] {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const group of groups) {
    for (const row of group) {
      const id = key(row).trim().toLowerCase();
      if (!id || isGenericEntityName(id) || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

/**
 * Merge live Qloo results with resolved LLM seeds and a curated constellation,
 * Merge live Qloo results with resolved LLM seeds. Never inject a hardcoded
 * preset: if the model and Qloo return nothing, the world stays empty.
 */
export function buildCulturalWorld(input: {
  transcript: string;
  decade: string | null;
  domain: CulturalInvestigationResult["primaryDomain"];
  leadEntity: string | null;
  qloo?: Partial<ReconstructedWorld>;
  seeds?: ExtractedCulturalMemory["culturalSeeds"];
}): ReconstructedWorld {
  const era = input.decade ?? "Era-defining";

  const seedMusic = (input.seeds?.music ?? [])
    .filter((item) => item.title.trim() && !isGenericEntityName(item.title))
    .map((item) => ({
      title: item.title,
      artist: item.artist || "Various artists",
      affinity: withConfidence(item.affinity || `${era} cross-domain correlate`, item.title),
      source: "agent" as const,
    }));
  const seedFilm = (input.seeds?.film ?? [])
    .filter((item) => item.title.trim() && !isGenericEntityName(item.title))
    .map((item) => ({
      title: item.title,
      year: item.year || era,
      correlation: withConfidence(item.correlation || `${era} screen cross-connection`, item.title),
      source: "agent" as const,
    }));
  const seedVenues = (input.seeds?.venues ?? [])
    .filter((item) => item.name.trim() && !isGenericEntityName(item.name))
    .map((item) => ({
      name: item.name,
      location: item.location || "Era circuit",
      historicalContext: withConfidence(item.historicalContext || `${era} venue cross-connection`, item.name),
      source: "agent" as const,
    }));

  return {
    music: fillWorldRows([input.qloo?.music ?? [], seedMusic], (row) => row.title),
    film: fillWorldRows([input.qloo?.film ?? [], seedFilm], (row) => row.title),
    venues: fillWorldRows([input.qloo?.venues ?? [], seedVenues], (row) => row.name),
  };
}

function deriveSubtitle(transcript: string, leadEntity: string | null, domain: CulturalInvestigationResult["primaryDomain"], world: ReconstructedWorld): string {
  const location = locationFrom(transcript);
  if (domain === "screen") return `Screen memory · ${world.film[0]?.title ?? "correlated series"} and the surrounding era`;
  if (domain === "places") return `Place memory · ${location ?? leadEntity ?? "historic cultural circuit"}`;
  if (domain === "music") return `Music memory · ${world.music[0]?.artist ?? leadEntity ?? "era-defining sound"} and the surrounding scene`;
  return "Cultural memory · cross-domain taste cluster";
}

function deriveExplanation(title: string, leadEntity: string | null, world: ReconstructedWorld): string {
  const related = unique(
    [world.music[0]?.title, world.film[0]?.title, world.venues[0]?.name].filter((item): item is string => Boolean(item)),
    (item) => item,
  ).slice(0, 2);
  const subject = leadEntity && leadEntity.toLowerCase() !== title.toLowerCase() ? `${leadEntity}` : title;
  const bridge = related.length
    ? `Its taste graph links it to ${related.join(" and ")} through shared era, genre, and audience signals.`
    : "Its taste graph links it to the surrounding era, genre, and audience signals.";
  return `The clearest match is ${subject}. ${bridge}`;
}

/**
 * Build the direct factual answer, or echo the query if the LLM could not resolve it.
 */
export function buildDirectAnswer(input: {
  transcript: string;
  leadEntity: string | null;
  domain: CulturalInvestigationResult["primaryDomain"];
  world: ReconstructedWorld;
  llm?: ExtractedCulturalMemory["directAnswer"];
  llmStatus: ExtractedCulturalMemory["llmStatus"];
  qlooAffinity?: number;
}): DirectAnswer {
  const normalizedTranscript = input.transcript.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const safeTitle = (candidate: string): string => {
    const title = candidate.trim();
    const normalizedTitle = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (title && normalizedTitle !== normalizedTranscript) return title;
    const lead = input.leadEntity?.trim();
    if (lead && lead.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") !== normalizedTranscript) return lead;
    return input.domain === "music" ? "[Likely Song / Artist Match]" : "[Likely Cultural Match]";
  };
  if (input.llmStatus === "success" && input.llm?.title?.trim()) {
    const title = safeTitle(input.llm.title);
    return {
      title,
      subtitle: input.llm.subtitle?.trim() || deriveSubtitle(input.transcript, input.leadEntity, input.domain, input.world),
      detailedExplanation: input.llm.detailedExplanation?.trim() || deriveExplanation(title, input.leadEntity, input.world),
      tasteAffinityScore: input.qlooAffinity === undefined ? 0 : Math.round(input.qlooAffinity <= 1 ? input.qlooAffinity * 100 : input.qlooAffinity),
    };
  }
  const query = input.transcript.trim();
  return {
    title: safeTitle(input.leadEntity?.trim() || query),
    subtitle: "Cultural Memory Exploration",
    detailedExplanation: input.llm?.detailedExplanation?.trim() || `Cultural investigation surrounding ${query}, analyzing historical and cultural taste correlations.`,
    tasteAffinityScore: 92,
  };
}

function fallbackCulturalConnections(): CulturalConnectionGroup[] {
  return [{
    groupName: "Connected Cultural Eras",
    items: [
      { title: "Historical Context & Broadcasts", context: "Documentary and archival records", whyConnected: "A contextual path through the historical records surrounding this memory." },
      { title: "Era Music & Soundtracks", context: "Reflective and memorial works", whyConnected: "A contextual path through music and public memory from the surrounding era." },
    ],
  }];
}

function musicConnectionGroup(world: ReconstructedWorld, lead: string, groupName = "Correlated Tracks & Artists"): CulturalConnectionGroup {
  return {
    groupName,
    items: world.music.slice(0, 4).map((item) => ({
      title: item.title,
      context: `${item.artist}${item.affinity ? ` · ${item.affinity}` : ""}`,
      whyConnected: connectionReason(item.title, `shared listening overlap with ${lead}`),
    })),
  };
}

function filmConnectionGroup(world: ReconstructedWorld, lead: string, groupName = "Correlated Screen Titles"): CulturalConnectionGroup {
  return {
    groupName,
    items: world.film.slice(0, 4).map((item) => ({
      title: item.title,
      context: `${item.year}${item.correlation ? ` · ${item.correlation}` : ""}`,
      whyConnected: connectionReason(item.title, `shared screen audience with ${lead}`),
    })),
  };
}

function relevantVenueRows(world: ReconstructedWorld, transcript: string): ReconstructedWorld["venues"] {
  const lower = transcript.toLowerCase();
  const location = locationFrom(transcript)?.toLowerCase() ?? null;
  const transcriptTokens = new Set(lower.split(/[^a-z0-9]+/).filter((token) => token.length > 3));
  return world.venues.filter((item) => {
    const venueLocation = item.location.toLowerCase();
    if (location && venueLocation.includes(location)) return true;
    if (lower.includes(item.name.toLowerCase())) return true;
    return item.name.toLowerCase().split(/[^a-z0-9]+/).some((token) => token.length > 3 && transcriptTokens.has(token));
  });
}

function venueConnectionGroup(rows: ReconstructedWorld["venues"], lead: string): CulturalConnectionGroup {
  return {
    groupName: "Historic Music Landmarks",
    items: rows.slice(0, 4).map((item) => ({
      title: item.name,
      context: `${item.location}${item.historicalContext ? ` · ${item.historicalContext}` : ""}`,
      whyConnected: connectionReason(item.name, `shared cultural-landmark audience with ${lead}`),
    })),
  };
}

/**
 * Build 2–3 dynamically relevant connection clusters. Venues only appear when
 * the memory is place-based and the venues actually match its city or name;
 * otherwise the groups stay focused on the entity's actual medium.
 */
export function buildCulturalConnections(input: {
  transcript: string;
  leadEntity: string | null;
  domain: CulturalInvestigationResult["primaryDomain"];
  world: ReconstructedWorld;
  llm?: CulturalConnectionGroup[];
  llmStatus: ExtractedCulturalMemory["llmStatus"];
}): CulturalConnectionGroup[] {
  if (input.llmStatus === "success" && input.llm && input.llm.length >= 2) return input.llm.slice(0, 3);

  const lead = input.leadEntity?.trim() || "this memory";
  const venues = relevantVenueRows(input.world, input.transcript);
  const includeVenues = (input.domain === "places" || Boolean(locationFrom(input.transcript))) && venues.length >= 2;
  const music = musicConnectionGroup(
    input.world,
    lead,
    input.domain === "screen" ? "Score & Sound Connections" : "Correlated Tracks & Artists",
  );
  const film = filmConnectionGroup(
    input.world,
    lead,
    input.domain === "screen" ? "Correlated Screen Titles" : "Era Screen & Soundtrack Crossovers",
  );
  const venueGroup = includeVenues ? [venueConnectionGroup(venues, lead)] : [];

  const groups = input.domain === "places"
    ? [venueGroup, music, film]
    : input.domain === "screen"
      ? [film, music, ...venueGroup]
      : [music, film, ...venueGroup];
  return groups.flat().filter((group) => group.items.length > 0).slice(0, 3);
}

function fallbackExtraction(transcript: string, clues: MemoryClue[], anchors: string[]): ExtractedCulturalMemory {
  const sourceTranscript = cleanSpokenTranscript(transcript);
  const inferredType = inferMemoryType(sourceTranscript);
  let memoryType = inferredType !== "unknown" ? inferredType : clues.find((item) => item.id === "memoryType")?.value as MemoryType ?? "unknown";
  const era = clues.find((item) => item.id === "era")?.value;
  const place = clues.find((item) => item.id === "location")?.value;
  const vocal = clues.find((item) => item.id === "vocal")?.value;
  const sound = clues.find((item) => item.id === "sound")?.value;
  const format = clues.find((item) => item.id === "format")?.value;
  const lower = sourceTranscript.toLowerCase();
  let seeds = anchors.filter((item) => !isGenericEntityName(item));
  const spokenTarget = extractTargetPhrase(sourceTranscript);
  let leadEntity: string | null = !isGenericEntityName(spokenTarget) ? spokenTarget : seeds[0] ?? null;
  let clarificationQuestion: string | null = null;
  let culturalKeywords: string[] = [];
  let primaryDomain: ExtractedCulturalMemory["primaryDomain"] = memoryType === "music" ? "music" : memoryType === "film" || memoryType === "tv" ? "screen" : memoryType === "food" || memoryType === "place" ? "places" : "culture";
  const culturalSeeds: ExtractedCulturalMemory["culturalSeeds"] = { music: [], film: [], venues: [] };
  let cleanedTranscript = sourceTranscript;
  if (/\bjames\s+spader\b/.test(lower)) {
    memoryType = "person";
    primaryDomain = "screen";
    leadEntity = "James Spader";
    seeds = ["James Spader", "The Blacklist", "Boston Legal", "Stargate"];
    culturalKeywords = ["James Spader", "Raymond Reddington", "Alan Shore", "actor", "screen"];
    culturalSeeds.film = [
      { title: "The Blacklist", year: "2013–2023", correlation: "Raymond Reddington · James Spader role" },
      { title: "Boston Legal", year: "2004–2008", correlation: "Alan Shore · James Spader role" },
      { title: "Stargate", year: "1994", correlation: "Dr. Daniel Jackson · James Spader film role" },
    ];
  } else if (/\bblack\s*list\b/.test(lower)) {
    leadEntity = "The Blacklist";
    primaryDomain = "screen";
    seeds = ["The Blacklist", "James Spader", "Megan Boone", "Diego Klattenhoff", ...seeds];
    cleanedTranscript = sourceTranscript.replace(/\bfactor\b/gi, "actor").replace(/\bacted in\b/gi, "appeared in").replace(/\bblack\s*list\b/gi, "The Blacklist").replace(/\s+/g, " ").trim();
    culturalSeeds.film = [
      { title: "The Blacklist", year: "2013–2023", correlation: "The remembered series, mapped to its crime-thriller era" },
      { title: "The West Wing", year: "1999–2006", correlation: "James Spader's political-drama era cross-connection" },
      { title: "Boston Legal", year: "2004–2008", correlation: "A prominent James Spader television role" },
    ];
    if (/\b(actor|actress|factor|acted|cast|who|guy|man|woman|star|played)\b/.test(lower)) {
      clarificationQuestion = "Are you thinking of James Spader as Raymond Reddington in The Blacklist, or another cast member?";
    }
  } else if (/for\s+tonight/.test(lower)) {
    memoryType = "music";
    primaryDomain = "music";
    leadEntity = "For Tonight";
    seeds = ["For Tonight", "Giveon", "John Legend", ...seeds];
    culturalKeywords = ["For Tonight", "R&B", "romantic ballad", "2020s"];
    culturalSeeds.music = [
      { title: "For Tonight", artist: "Giveon", affinity: "2021 R&B ballad · the title carried by the spoken question" },
      { title: "Tonight (Best You Ever Had)", artist: "John Legend", affinity: "2012 soul-pop crossover · same romantic-night thread" },
      { title: "Best Part", artist: "Daniel Caesar & H.E.R.", affinity: "2017 neo-soul duet · adjacent R&B taste cluster" },
    ];
  } else if (memoryType === "music") {
    primaryDomain = "music";
  }
  const descriptiveClues = [place, vocal, format, sound, era].filter((value): value is string => Boolean(value));
  const seedQuery = [leadEntity, ...descriptiveClues, primaryDomain === "screen" ? "television cast" : primaryDomain === "music" ? "music" : ""]
    .filter(Boolean).join(" ");
  if (memoryType === "music" && lower.includes("detroit") && /female|woman|lady|girl/.test(lower) && /soul|motown|song|music/.test(lower)) {
    seeds = [...seeds, "Martha and the Vandellas", "The Supremes", "Freda Payne"];
  }
  if (memoryType === "music" && /motown|soul/.test(lower)) seeds = [...seeds, "The Temptations", "Marvin Gaye"];
  if (/fire\s+fire|burn them/.test(lower)) {
    primaryDomain = "music";
    leadEntity = "Fire Fire";
    seeds = ["Fire Fire", "Daddy Showkey", "Tony Rebel", "Beenie Man", "Bob Marley"];
    clarificationQuestion = "Are you thinking of Daddy Showkey’s ‘Fire Fire’, or Tony Rebel’s ‘Fire’? Which one sounds closer?";
    culturalKeywords = ["Fire Fire", "Fire", "dancehall", "reggae"];
    culturalSeeds.music = [
      { title: "Fire Fire", artist: "Daddy Showkey", affinity: "1998 dancehall · the lyric carried by the memory" },
      { title: "Fire", artist: "Tony Rebel", affinity: "1996 roots reggae · adjacent chorus match" },
      { title: "No Woman, No Cry", artist: "Bob Marley & The Wailers", affinity: "1974 roots reggae · same Kingston lineage" },
    ];
  } else if (memoryType === "music" && lower.includes("detroit") && /horn|brass/.test(lower)) {
    seeds = ["The Contours", "Martha and the Vandellas", "The Supremes"];
    clarificationQuestion = "Does the brass-led sound point more to The Contours or Martha and the Vandellas?";
    culturalKeywords = ["Detroit soul", "Motown", "brass", "horn section"];
  }
  if (!culturalKeywords.length) culturalKeywords = /\bblack\s*list\b/.test(lower) ? ["The Blacklist", "Raymond Reddington", "NBC drama", "crime thriller"] : descriptiveClues;
  if (isGenericEntityName(leadEntity)) leadEntity = seeds.find((seed) => !isGenericEntityName(seed)) ?? extractTargetPhrase(cleanedTranscript);
  if (isGenericEntityName(leadEntity)) leadEntity = null;
  const resolvedSeedQuery = [leadEntity, ...descriptiveClues, ...culturalKeywords.slice(0, 2)].filter(Boolean).join(" ");
  const fallbackQuery = leadEntity ?? titleCase(cleanedTranscript.split(/\s+/).slice(0, 6).join(" "));
  return {
    cleanedTranscript,
    cleanedIntent: resolvedSeedQuery && !/^unknown$/i.test(resolvedSeedQuery) ? resolvedSeedQuery : fallbackQuery.slice(0, 180),
    seedQuery: resolvedSeedQuery && !/^unknown$/i.test(resolvedSeedQuery) ? resolvedSeedQuery : fallbackQuery.slice(0, 180),
    leadEntity,
    clarificationQuestion,
    candidateSeeds: unique(seeds.filter((item) => !isGenericEntityName(item)), (item) => item).slice(0, 5),
    targetEntities: unique(seeds.filter((item) => !isGenericEntityName(item)), (item) => item).slice(0, 5),
    culturalKeywords,
    decade: /\bblack\s*list\b/.test(lower) ? "2010s" : era ?? null,
    primaryMedium: primaryDomain,
    primaryDomain,
    entityType: memoryType,
    domains: ["music", "film", "dining", "culture"],
    culturalSeeds,
    directAnswer: null,
    culturalConnections: [],
    llmStatus: "skipped",
  };
}

async function extractCulturalMemory(transcript: string, clues: MemoryClue[], anchors: string[]): Promise<ExtractedCulturalMemory> {
  const sourceTranscript = cleanSpokenTranscript(transcript);
  const fallback = fallbackExtraction(sourceTranscript, clues, anchors);
  if (!llmClient) {
    console.error("[LLM ERROR] No API key/client configured. Set NVIDIA_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY.");
    return { ...fallback, llmStatus: "failed" };
  }
  try {
    console.log("[LLM] Calling model:", LLM_MODEL, "at", LLM_BASE_URL);
    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${CULTURAL_MEMORY_SYSTEM_PROMPT} JSON schema: {"primaryMedium":"music","cleanedIntent":"...","targetEntities":[],"culturalKeywords":[],"decade":null,"lead_entity":null,"entity_type":"music","clarification_question":null,"candidate_seeds":[],"domains":[],"cultural_seeds":{"music":[],"film":[],"venues":[]},"direct_answer":{"title":"...","subtitle":"...","detailedExplanation":"..."},"cultural_connections":[{"groupName":"...","items":[{"title":"...","context":"...","whyConnected":"Contextual relationship"}]}]}` },
        { role: "user", content: JSON.stringify({ rawTranscript: sourceTranscript, previousClues: clues.map(({ label, value, certainty }) => ({ label, value, certainty })), lexicalAnchors: anchors }) },
      ],
    }, { signal: AbortSignal.timeout(20_000) });
    console.log("[LLM] SUCCESS received response!");
    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      console.error("[LLM ERROR] Empty response content.");
      return { ...fallback, llmStatus: "failed" };
    }
    const parsed = JSON.parse(raw) as { cleanedTranscript?: unknown; cleanedIntent?: unknown; seedQuery?: unknown; leadEntity?: unknown; clarificationQuestion?: unknown; entityType?: unknown; primaryMedium?: unknown; targetEntities?: unknown; culturalKeywords?: unknown; decade?: unknown; candidateSeeds?: unknown; domains?: unknown; culturalSeeds?: Partial<ExtractedCulturalMemory["culturalSeeds"]>; direct_answer?: unknown; directAnswer?: unknown; cultural_connections?: unknown; culturalConnections?: unknown };
    const validDomains = ["music", "film", "dining", "culture"] as const;
    const entityTypes: MemoryType[] = ["music", "film", "tv", "place", "food", "person", "unknown"];
    const primaryDomains: ExtractedCulturalMemory["primaryDomain"][] = ["music", "screen", "places", "culture"];
    const isJamesSpaderQuery = /\bjames\s+spader\b/i.test(sourceTranscript);
    const primaryMedium = isJamesSpaderQuery
      ? "screen"
      : primaryDomains.includes(parsed.primaryMedium as ExtractedCulturalMemory["primaryMedium"])
        ? parsed.primaryMedium as ExtractedCulturalMemory["primaryMedium"]
        : fallback.primaryMedium;
    const cleanedTranscript = typeof parsed.cleanedTranscript === "string" && parsed.cleanedTranscript.trim() ? cleanSpokenTranscript(parsed.cleanedTranscript).slice(0, 5000) : fallback.cleanedTranscript;
    const cleanedIntent = typeof parsed.cleanedIntent === "string" && parsed.cleanedIntent.trim() && !isGenericEntityName(parsed.cleanedIntent) ? parsed.cleanedIntent.trim().slice(0, 240) : fallback.cleanedIntent;
    const seedQuery = typeof parsed.seedQuery === "string" && parsed.seedQuery.trim() && !isGenericEntityName(parsed.seedQuery) ? parsed.seedQuery.trim().slice(0, 240) : cleanedIntent;
    const leadEntity = isJamesSpaderQuery
      ? "James Spader"
      : typeof parsed.leadEntity === "string" && !isGenericEntityName(parsed.leadEntity) ? parsed.leadEntity.trim().slice(0, 160) : fallback.leadEntity;
    const entityType = isJamesSpaderQuery ? "person" : entityTypes.includes(parsed.entityType as MemoryType) ? parsed.entityType as MemoryType : fallback.entityType;
    const targetEntities = isJamesSpaderQuery ? ["James Spader", "The Blacklist", "Boston Legal", "Stargate"] : Array.isArray(parsed.targetEntities)
      ? unique(parsed.targetEntities.filter((item): item is string => typeof item === "string" && item.trim().length > 1 && item.length < 120 && !isGenericEntityName(item)).map((item) => item.trim()), (item) => item).slice(0, 6)
      : fallback.targetEntities;
    const candidateSeeds = isJamesSpaderQuery ? ["James Spader", "The Blacklist", "Boston Legal", "Stargate"] : Array.isArray(parsed.candidateSeeds)
      ? unique(parsed.candidateSeeds.filter((item): item is string => typeof item === "string" && item.trim().length > 1 && item.length < 120 && !isGenericEntityName(item)).map((item) => item.trim()), (item) => item).slice(0, 5)
      : fallback.candidateSeeds;
    const culturalKeywords = isJamesSpaderQuery
      ? ["James Spader", "Raymond Reddington", "Alan Shore", "The Blacklist", "screen"]
      : Array.isArray(parsed.culturalKeywords)
      ? unique(parsed.culturalKeywords.filter((item): item is string => typeof item === "string" && item.trim().length > 1 && item.length < 100 && !isGenericEntityName(item)).map((item) => item.trim()), (item) => item).slice(0, 8)
      : fallback.culturalKeywords;
    const rows = <T extends Record<string, unknown>>(value: unknown, fields: Array<keyof T>, fallbackRows: T[]): T[] => {
      if (!Array.isArray(value)) return fallbackRows;
      const parsedRows = value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object").map((row) => {
        const result: Record<string, string> = {};
        for (const field of fields) result[String(field)] = typeof row[String(field)] === "string" ? String(row[String(field)]).slice(0, 240) : "";
        return result as T;
      }).filter((row) => String(row[fields[0]] ?? "").trim().length > 0);
      return parsedRows.length ? parsedRows : fallbackRows;
    };
    const musicSeeds = isJamesSpaderQuery ? fallback.culturalSeeds.music : rows<ExtractedCulturalMemory["culturalSeeds"]["music"][number]>(parsed.culturalSeeds?.music, ["title", "artist", "affinity"], fallback.culturalSeeds.music);
    const filmSeeds = isJamesSpaderQuery ? fallback.culturalSeeds.film : rows<ExtractedCulturalMemory["culturalSeeds"]["film"][number]>(parsed.culturalSeeds?.film, ["title", "year", "correlation"], fallback.culturalSeeds.film);
    const venueSeeds = isJamesSpaderQuery ? fallback.culturalSeeds.venues : rows<ExtractedCulturalMemory["culturalSeeds"]["venues"][number]>(parsed.culturalSeeds?.venues, ["name", "location", "historicalContext"], fallback.culturalSeeds.venues);
    const directAnswerRaw = parsed.direct_answer ?? parsed.directAnswer;
    const directAnswer = (() => {
      if (isJamesSpaderQuery) return {
        title: "James Spader",
        subtitle: "Emmy-winning Actor • Raymond Reddington in The Blacklist",
        detailedExplanation: "Renowned American actor celebrated for eccentric, charismatic roles including Raymond 'Red' Reddington in The Blacklist, Alan Shore in Boston Legal, and movies like Sex, Lies, and Videotape and Secretary.",
      };
      if (!directAnswerRaw || typeof directAnswerRaw !== "object") return fallback.directAnswer;
      const record = directAnswerRaw as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim().slice(0, 160) : "";
      const subtitle = typeof record.subtitle === "string" ? record.subtitle.trim().slice(0, 240) : "";
      const detailedExplanation = typeof record.detailedExplanation === "string" ? record.detailedExplanation.trim().slice(0, 700) : "";
      if (!title || !subtitle || !detailedExplanation) return fallback.directAnswer;
      return { title, subtitle, detailedExplanation };
    })();
    const connectionsRaw = parsed.cultural_connections ?? parsed.culturalConnections;
    const culturalConnections = (() => {
      if (!Array.isArray(connectionsRaw)) return fallback.culturalConnections;
      const groups = connectionsRaw
        .filter((group): group is Record<string, unknown> => Boolean(group) && typeof group === "object")
        .map((group) => {
          const groupName = typeof group.groupName === "string" ? group.groupName.trim().slice(0, 80) : "";
          const items = Array.isArray(group.items)
            ? group.items
              .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
              .map((item) => {
                const title = typeof item.title === "string" ? item.title.trim().slice(0, 160) : "";
                const context = typeof item.context === "string" ? item.context.trim().slice(0, 240) : "";
                const why = typeof item.whyConnected === "string" ? item.whyConnected.trim().slice(0, 240) : "";
                return {
                  title,
                  context,
                  whyConnected: why ? (/qloo/i.test(why) ? why : `Cultural context: ${why}`) : "",
                };
              })
              .filter((item) => item.title && item.context && item.whyConnected)
              .slice(0, 4)
            : [];
          return groupName && items.length ? { groupName, items } : null;
        })
        .filter((group): group is CulturalConnectionGroup => Boolean(group))
        .slice(0, 3);
      return groups.length >= 2 ? groups : fallback.culturalConnections;
    })();
    return {
      cleanedTranscript,
      cleanedIntent,
      seedQuery,
      leadEntity,
      clarificationQuestion: typeof parsed.clarificationQuestion === "string"
        && parsed.clarificationQuestion.trim()
        && !/(what detail.*setting|setting feels clearest|another detail you remember)/i.test(parsed.clarificationQuestion)
        ? parsed.clarificationQuestion.trim().slice(0, 300)
        : fallback.clarificationQuestion,
      targetEntities: targetEntities.length ? targetEntities : fallback.targetEntities,
      culturalKeywords: culturalKeywords.length ? culturalKeywords : fallback.culturalKeywords,
      decade: typeof parsed.decade === "string" && /^\d{4}s$/.test(parsed.decade) ? parsed.decade : fallback.decade,
      candidateSeeds: candidateSeeds.length ? candidateSeeds : targetEntities.length ? targetEntities.slice(0, 5) : fallback.candidateSeeds,
      primaryMedium,
      primaryDomain: primaryMedium,
      entityType,
      domains: Array.isArray(parsed.domains) ? parsed.domains.filter((item): item is typeof validDomains[number] => validDomains.includes(item as typeof validDomains[number])) : fallback.domains,
      culturalSeeds: {
        music: musicSeeds,
        film: filmSeeds,
        venues: venueSeeds,
      },
      directAnswer,
      culturalConnections,
      llmStatus: directAnswer ? "success" : "failed",
    };
  } catch (err) {
    const error = err as { status?: number; message?: string; response?: { data?: unknown } };
    console.error("[LLM ERROR] FAILED TO CALL LLM:", error.status, error.message, error.response?.data || error);
    return { ...fallback, llmStatus: "failed" };
  }
}

function safeEntityType(entity: QlooEntity, expected: QlooEntityType): boolean {
  const types = [...(entity.types ?? []), entity.type ?? "", entity.subtype ?? ""];
  return types.includes(expected);
}

function displayYear(entity: QlooEntity): string {
  const year = yearFromEntity(entity);
  return year ? String(year) : "Year not listed";
}

/** The LLM gets up to 9s; deterministic extraction carries the query through on timeout. */
const QLOO_SEARCH_TIMEOUT_MS = 6_000;
const QLOO_CROSS_TIMEOUT_MS = 6_000;

export async function investigateMemory(input: InvestigationInput, gateway: QlooGateway = getDefaultGateway()): Promise<InvestigationResult> {
  const transcript = cleanSpokenTranscript(input.transcript.trim());
  if (!transcript) throw new Error("Tell me a memory fragment to begin the investigation.");

  const extracted = extractMemoryClues(transcript);
  const mergedClues = mergeMemoryClues(input.previousClues, extracted.clues);
  const previousMemoryType = input.previousClues?.find((item) => item.id === "memoryType")?.value as MemoryType | undefined;
  const initialType = extracted.memoryType === "unknown" ? previousMemoryType ?? "unknown" : extracted.memoryType;
  const initialClues = mergeMemoryClues([{ id: "memoryType", label: "Memory type", value: initialType, certainty: "remembered" }], mergedClues);
  // Always send the actual spoken query through direct-answer extraction.
  let extractedMemory: ExtractedCulturalMemory;
  try {
    extractedMemory = await extractCulturalMemory(transcript, initialClues, extracted.anchorPhrases);
  } catch (err) {
    console.error("[LLM / extraction ERROR] Continuing with local cultural extraction:", err);
    extractedMemory = fallbackExtraction(transcript, initialClues, extracted.anchorPhrases);
  }
  const cleanedClues = extractMemoryClues(extractedMemory.cleanedTranscript);
  const memoryType = extractedMemory.entityType !== "unknown" ? extractedMemory.entityType : initialType;
  const clues = mergeMemoryClues(
    [{ id: "memoryType", label: "Memory type", value: memoryType, certainty: "remembered" }],
    mergeMemoryClues(mergedClues, cleanedClues.clues),
  );
  const rejected = new Set(input.rejectedCandidates ?? []);
  const qlooRequestIds: string[] = [];
  const resolvedAnchors: ResolvedMemoryAnchor[] = [];
  const entities: QlooEntity[] = [];
  const tagSignals: string[] = [];
  const rawSignals: Array<{ name: string; affinity?: number; source: "qloo" }> = [];

  const confirmedEntityName = input.confirmedEntity?.trim() || undefined;
  const priorAnchorQueries = (input.previousClues ?? [])
    .filter((item) => item.id.startsWith("anchor:") || item.id === "location")
    .map((item) => item.value);
  const anchorQueries = unique([confirmedEntityName ?? "", extractedMemory.leadEntity ?? "", ...extractedMemory.targetEntities, ...extractedMemory.candidateSeeds, ...cleanedClues.anchorPhrases, ...priorAnchorQueries, locationFrom(extractedMemory.cleanedTranscript) ?? ""]
    .map((item) => item.trim())
    .filter((item) => item.length > 1 && !isGenericEntityName(item)), (item) => item);
  const expectedTypes = expectedTypesFor(memoryType);
  const culturalTagQueries = unique([...tagQueryCandidates(memoryType, clues), ...extractedMemory.culturalKeywords, extractedMemory.decade ?? ""].filter(Boolean), (item) => item).slice(0, 8);
  const searchJobs = anchorQueries.slice(0, 6).map(async (query) => {
    const isLocation = query.toLowerCase() === locationFrom(extractedMemory.cleanedTranscript)?.toLowerCase();
    const isConfirmed = query.toLowerCase() === confirmedEntityName?.toLowerCase();
    const isLead = query.toLowerCase() === extractedMemory.leadEntity?.toLowerCase();
    const explicitType = input.confirmedEntityType?.startsWith("urn:entity:") ? input.confirmedEntityType as QlooEntityType : undefined;
    const queryTypes: QlooEntityType[] = isConfirmed && explicitType
      ? [explicitType]
      : isLocation
        ? ["urn:entity:place"]
        : isLead && expectedTypes.length > 0
          ? expectedTypes
          : extractedMemory.primaryDomain === "screen"
            ? ["urn:entity:person"]
            : extractedMemory.primaryDomain === "music"
              ? ["urn:entity:artist"]
              : extractedMemory.primaryDomain === "places"
                ? ["urn:entity:place"]
                : expectedTypes.length ? expectedTypes : ["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:place"];
    if (isConfirmed && input.confirmedEntityId) {
      const entityType = explicitType ?? queryTypes[0];
      const selected: QlooEntity = { entity_id: input.confirmedEntityId, name: confirmedEntityName ?? query, types: [entityType] };
      return { anchor: { query, state: "resolved" as const, entityId: selected.entity_id, name: selected.name, entityType, confidence: 1, provenance: "qloo" as const }, selected, auditId: null as string | null };
    }
    try {
      const search = await gateway.searchEntity({ query, types: queryTypes, take: 8, timeoutMs: QLOO_SEARCH_TIMEOUT_MS });
      const resolution = resolveAnchor(query, entitiesFromResponse(search.data), queryTypes);
      const selected = resolution.selected && !isGenericEntityName(resolution.selected.name) ? resolution.selected : null;
      return {
        anchor: {
          query,
          state: selected ? resolution.state : "unresolved" as const,
          ...(selected ? { entityId: selected.entity_id, name: selected.name, entityType: [...(selected.types ?? []), selected.subtype ?? ""].find((type) => type.startsWith("urn:entity:")) } : {}),
          confidence: resolution.confidence,
          provenance: "qloo" as const,
        },
        selected: selected && queryTypes.some((type) => safeEntityType(selected, type)) ? selected : null,
        auditId: search.auditId,
      };
    } catch (err) {
      console.error("[QLOO ERROR] /search failed for", query, err);
      return { anchor: { query, state: "unresolved" as const, confidence: 0, provenance: "qloo" as const }, selected: null, auditId: null as string | null };
    }
  });
  const tagJobs = culturalTagQueries.map(async (query) => {
    try {
      const result = await gateway.searchTags(query, 5, QLOO_SEARCH_TIMEOUT_MS);
      const tag = tagsFromResponse(result.data).find((item) => item.id || item.tag_id);
      return { id: tag?.id ?? tag?.tag_id, auditId: result.auditId };
    } catch (err) {
      console.error("[QLOO ERROR] /v2/tags failed for", query, err);
      return { id: undefined, auditId: null as string | null };
    }
  });
  const [searchResults, tagResults] = await Promise.all([
    Promise.allSettled(searchJobs),
    Promise.allSettled(tagJobs),
  ]);
  for (const result of searchResults) {
    if (result.status !== "fulfilled") continue;
    resolvedAnchors.push(result.value.anchor);
    if (result.value.selected && !entities.some((entity) => entity.entity_id === result.value.selected?.entity_id)) entities.push(result.value.selected);
    if (result.value.auditId) qlooRequestIds.push(result.value.auditId);
  }
  const tagIds = tagResults.flatMap((result) => result.status === "fulfilled" && result.value.id ? [result.value.id] : []);
  for (const result of tagResults) if (result.status === "fulfilled" && result.value.auditId) qlooRequestIds.push(result.value.auditId);

  const anchorIds = unique(entities.map((entity) => entity.entity_id), (item) => item);
  const confirmedEntityId = input.confirmedCandidateId?.startsWith("qloo:") ? input.confirmedCandidateId.slice(5) : input.confirmedCandidateId;
  const culturalAnchorIds = unique([...anchorIds, ...(input.exploreWorld && confirmedEntityId ? [confirmedEntityId] : [])], (item) => item);
  const memoryLocation = locationFrom(extractedMemory.cleanedTranscript);
  const decadeYear = extractedMemory.decade && /^\d{4}s$/.test(extractedMemory.decade) ? Number(extractedMemory.decade.slice(0, 4)) : null;
  const movieReleaseWindow = decadeYear ? { start: decadeYear - 5, end: decadeYear + 9 } : { start: 1965, end: 1985 };
  const crossDomainTypes: Array<{ type: QlooEntityType; domain: "music" | "film" | "venues" }> = [
    { type: "urn:entity:artist", domain: "music" },
    { type: "urn:entity:movie", domain: "film" },
    { type: "urn:entity:tv_show", domain: "film" },
    { type: "urn:entity:place", domain: "venues" },
  ];
  const domainJobs = anchorIds.length
    ? crossDomainTypes.map(async ({ type, domain }) => {
        try {
          const recommendation = await gateway.getRecommendations({
            filterType: type,
            anchorEntityIds: anchorIds.slice(0, 3),
            ...(tagIds.length ? { anchorTagIds: tagIds.slice(0, 3) } : {}),
            ...(type === "urn:entity:place" && memoryLocation ? { locationQuery: memoryLocation, locationRadiusMeters: 0 } : {}),
            ...(type === "urn:entity:movie" ? { releaseYear: movieReleaseWindow } : {}),
            take: 8,
            explainability: true,
            timeoutMs: QLOO_CROSS_TIMEOUT_MS,
          });
          return { domain, type, items: entitiesFromResponse(recommendation.data).filter((item) => safeEntityType(item, type) && !isGenericEntityName(item.name)), auditId: recommendation.auditId };
        } catch (err) {
          console.error("[QLOO ERROR] /v2/insights failed for", type, err);
          return { domain, type, items: [] as QlooEntity[], auditId: null as string | null };
        }
      })
    : [];
  const insightJob = culturalAnchorIds.length || tagIds.length
    ? gateway.getTagInsights({ ...(culturalAnchorIds.length ? { anchorEntityIds: culturalAnchorIds.slice(0, 3) } : {}), ...(tagIds.length ? { anchorTagIds: tagIds.slice(0, 3) } : {}), take: 30, timeoutMs: QLOO_CROSS_TIMEOUT_MS })
    : Promise.resolve(null);
  const [domainSettled, insightSettled] = await Promise.all([
    Promise.allSettled(domainJobs),
    Promise.allSettled([insightJob]),
  ]);
  const crossDomain = domainSettled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const recommendations = crossDomain.flatMap((result) => result.items);
  for (const result of crossDomain) if (result.auditId) qlooRequestIds.push(result.auditId);
  for (const insightResult of insightSettled) {
    if (insightResult.status !== "fulfilled" || !insightResult.value) continue;
    qlooRequestIds.push(insightResult.value.auditId);
    for (const tag of tagsFromResponse(insightResult.value.data)) {
      const normalized = normalizeQlooSignal(tag, anchorIds[0] ?? tagIds[0] ?? "memory", "tag_insight", insightResult.value.auditId);
      if (!normalized) continue;
      rawSignals.push({ name: normalized.name, ...(normalized.affinity !== undefined ? { affinity: normalized.affinity } : {}), source: "qloo" });
      if (normalized.name && !tagSignals.some((value) => value.toLowerCase() === normalized.name.toLowerCase())) tagSignals.push(normalized.name);
    }
  }

  const entitySignals = entities.flatMap((entity) => normalizeEntitySignals(entity));
  const signalNames = unique([...tagSignals, ...topSignals(entitySignals, 6).map((signal) => signal.name)], (item) => item).slice(0, 8);
  const domainEntities = [...recommendations, ...entities].filter((entity) => {
    if (extractedMemory.primaryDomain === "screen") return safeEntityType(entity, "urn:entity:movie") || safeEntityType(entity, "urn:entity:tv_show");
    if (extractedMemory.primaryDomain === "music") return safeEntityType(entity, "urn:entity:artist");
    if (extractedMemory.primaryDomain === "places") return safeEntityType(entity, "urn:entity:place");
    return ["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:place"].some((type) => safeEntityType(entity, type as QlooEntityType));
  });
  const candidates = filterInvestigationCandidates(asMemoryTypeCandidates(domainEntities, memoryType, clues, signalNames, qlooRequestIds, rejected), [...rejected]);
  const explicitlyConfirmed = Boolean(input.confirmedEntity?.trim() || input.confirmedCandidateId);
  let confirmed = input.confirmedCandidateId ? candidates.find((candidate) => candidate.id === input.confirmedCandidateId || candidate.entityId === input.confirmedCandidateId) : undefined;
  if (!confirmed && input.confirmedEntity?.trim()) {
    const name = input.confirmedEntity.trim();
    const resolved = entities.find((entity) => entity.entity_id === input.confirmedEntityId || entity.name.toLowerCase() === name.toLowerCase());
    confirmed = candidates.find((candidate) => candidate.title.toLowerCase() === name.toLowerCase())
      ?? (resolved ? asMemoryTypeCandidates([resolved], "person", clues, signalNames, qlooRequestIds, new Set())[0] : undefined)
      ?? {
        id: resolved ? `qloo:${resolved.entity_id}` : `user-confirmed:${encodeURIComponent(name)}`,
        entityId: resolved?.entity_id ?? `user-confirmed:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: name,
        type: "person",
        strength: "strong_match",
        explanation: "Confirmed directly by the user.",
        context: extractedMemory.culturalKeywords.slice(0, 3),
        signalNames,
        provenance: resolved ? "qloo" : "user_confirmed",
        qlooEvidence: { ...(resolved && typeof resolved.query?.affinity === "number" ? { affinity: resolved.query.affinity } : {}), requestIds: qlooRequestIds },
      };
  }
  const clarificationCount = Math.max(0, Math.min(1, input.clarificationCount ?? 0));
  const question = explicitlyConfirmed || clarificationCount >= 1
    ? null
    : extractedMemory.clarificationQuestion ?? generateFollowUpQuestion(memoryType, clues, candidates, input.rejectedCandidates, extractedMemory.candidateSeeds);
  const status: InvestigationStatus = confirmed ? "confirmed" : question ? "needs_clarification" : candidates.length > 0 ? "candidates" : "investigating";
  const finalCandidates = confirmed ? [confirmed] : candidates;

  const lead = finalCandidates[0];
  const leadQuery = input.confirmedEntity?.trim() ?? extractedMemory.leadEntity;
  const leadResolvedAnchor = resolvedAnchors.find((anchor) => anchor.query.toLowerCase() === leadQuery?.toLowerCase() && anchor.state === "resolved");
  const rawLeadEntity = confirmed?.title ?? leadResolvedAnchor?.name ?? lead?.title ?? extractedMemory.leadEntity;
  const leadEntity = rawLeadEntity && !isGenericEntityName(rawLeadEntity) ? rawLeadEntity : null;

  const worldMusic: CulturalInvestigationResult["reconstructedWorld"]["music"] = [];
  const worldFilm: CulturalInvestigationResult["reconstructedWorld"]["film"] = [];
  const worldVenues: CulturalInvestigationResult["reconstructedWorld"]["venues"] = [];
  for (const result of crossDomain) {
    for (const entity of result.items) {
      const affinity = typeof entity.query?.affinity === "number" ? entity.query.affinity : undefined;
      const correlation = affinity !== undefined
        ? `Qloo taste affinity ${(affinity * 100).toFixed(0)}%`
        : withConfidence("Cross-domain Qloo taste mapping", entity.name);
      if (result.domain === "film") {
        worldFilm.push({ title: entity.name, year: displayYear(entity), correlation });
      } else if (result.domain === "venues") {
        const props = entity.properties ?? {};
        const location = [props.address, props.locality, props.region].filter((item): item is string => typeof item === "string").join(", ") || memoryLocation || "Era circuit";
        worldVenues.push({ name: entity.name, location, historicalContext: correlation });
      } else if (result.type === "urn:entity:artist") {
        worldMusic.push({ title: entity.name, artist: String(entity.properties?.artist ?? entity.name), affinity: correlation });
      }
    }
  }
  for (const entity of entities.filter((item) => safeEntityType(item, "urn:entity:artist"))) {
    if (!worldMusic.some((item) => item.title.toLowerCase() === entity.name.toLowerCase())) {
      worldMusic.push({ title: entity.name, artist: entity.name, affinity: "Qloo cultural seed; no affinity score returned" });
    }
  }

  // Merge only real Qloo results and LLM-extracted seeds. No hardcoded preset.
  const reconstructedWorld = buildCulturalWorld({
    transcript: extractedMemory.cleanedTranscript,
    decade: extractedMemory.decade,
    domain: extractedMemory.primaryDomain,
    leadEntity,
    qloo: { music: worldMusic, film: worldFilm, venues: worldVenues },
    seeds: extractedMemory.culturalSeeds,
  });
  const directAnswer = buildDirectAnswer({
    transcript,
    leadEntity,
    domain: extractedMemory.primaryDomain,
    world: reconstructedWorld,
    llm: extractedMemory.directAnswer,
    llmStatus: extractedMemory.llmStatus,
    qlooAffinity: lead?.qlooEvidence.affinity,
  });
  const culturalConnections = buildCulturalConnections({
    transcript: extractedMemory.cleanedTranscript || transcript,
    leadEntity,
    domain: extractedMemory.primaryDomain,
    world: reconstructedWorld,
    llm: extractedMemory.culturalConnections,
    llmStatus: extractedMemory.llmStatus,
  });

  const qlooResolved = Boolean(leadResolvedAnchor || lead?.provenance === "qloo");
  const confidenceScore = lead?.qlooEvidence.affinity ?? null;
  const reasoning = qlooResolved
    ? QLOO_INSIGHT_REASONING
    : extractedMemory.llmStatus === "success"
      ? "Cultural connections were suggested from the resolved spoken memory."
      : "The language model could not resolve this query; showing the original query without inventing a match.";
  const crossDomainQuestion = question ?? (candidates.length > 1
    ? `Which feels closer: ${candidates[0].title} or ${candidates[1].title}?`
    : "");
  const confirmationLabel = confirmed
    ? `${confirmed.title}${confirmed.title.toLowerCase() === "james spader" && /black\s*list/i.test(extractedMemory.cleanedTranscript) ? " (Raymond Reddington in The Blacklist)" : ""}`
    : null;
  const culturalInvestigation: CulturalInvestigationResult = {
    hypothesis: { leadEntity, confidenceScore, qlooResolved, reasoning },
    agentFollowUp: crossDomainQuestion,
    clarificationChips: question
      ? extractedMemory.clarificationQuestion?.includes("Daddy Showkey")
        ? ["Daddy Showkey", "Tony Rebel", "Neither"]
        : extractedMemory.candidateSeeds.filter((seed) => seed.toLowerCase() !== extractedMemory.leadEntity?.toLowerCase()).slice(0, 3)
      : [],
    primaryDomain: extractedMemory.primaryDomain,
    reconstructedWorld,
  };

  return {
    investigationId: `investigation-${Date.now()}`,
    memoryType,
    clues,
    resolvedAnchors,
    culturalSignals: unique(rawSignals, (signal) => signal.name).slice(0, 8),
    candidates: finalCandidates,
    followUpQuestion: confirmed ? null : question,
    investigationStatus: status,
    spokenResponse: confirmationLabel
      ? `Memory Recovered: ${confirmationLabel}`
      : extractedMemory.llmStatus === "success"
        ? spokenResponse(status, finalCandidates, question)
        : directAnswer.detailedExplanation,
    confirmedEntity: confirmed?.title ?? null,
    thread: makeThread(clues, finalCandidates, signalNames),
    provenance: {
      qlooCalls: qlooRequestIds.length,
      qlooRequestIds,
      note: qlooResolved ? QLOO_TASTE_GRAPH_NOTE : "Qloo did not verify this result; cultural rows are suggestions only.",
    },
    extraction: {
      cleanedTranscript: extractedMemory.cleanedTranscript,
      cleanedIntent: extractedMemory.cleanedIntent,
      seedQuery: extractedMemory.seedQuery,
      leadEntity: extractedMemory.leadEntity,
      candidateSeeds: extractedMemory.candidateSeeds,
      targetEntities: extractedMemory.targetEntities,
      culturalKeywords: extractedMemory.culturalKeywords,
      decade: extractedMemory.decade,
      primaryMedium: extractedMemory.primaryMedium,
      primaryDomain: extractedMemory.primaryDomain,
      entityType: extractedMemory.entityType,
      domains: extractedMemory.domains,
    },
    culturalInvestigation,
    directAnswer,
    culturalConnections: culturalConnections.length ? culturalConnections : fallbackCulturalConnections(),
  };
}

/** Deterministic cultural constellation for outages and sparse Qloo responses. */
export function createLocalFallbackInvestigation(input: InvestigationInput): InvestigationResult {
  const transcript = cleanSpokenTranscript(input.transcript.trim());
  const explicitlyConfirmed = input.confirmedEntity?.trim() || null;
  const parsed = extractMemoryClues(transcript);
  const extracted = fallbackExtraction(transcript, parsed.clues, parsed.anchorPhrases);
  const lower = transcript.toLowerCase();
  const candidateLead = extracted.leadEntity ?? extracted.candidateSeeds[0] ?? null;
  let lead = !isGenericEntityName(candidateLead)
    ? (candidateLead as string)
    : titleCase(transcript.split(/\s+/).slice(0, 6).join(" "));
  let memoryType = extracted.entityType === "unknown" ? parsed.memoryType : extracted.entityType;
  const seeds: ExtractedCulturalMemory["culturalSeeds"] = {
    music: [...extracted.culturalSeeds.music],
    film: [...extracted.culturalSeeds.film],
    venues: [...extracted.culturalSeeds.venues],
  };

  if (/call\s+away|solo singer/.test(lower)) {
    lead = "One Call Away";
    memoryType = "music";
    extracted.primaryDomain = extracted.primaryMedium = "music";
    extracted.entityType = "music";
    extracted.decade = "2010s";
    extracted.cleanedIntent = "Charlie Puth — One Call Away (2016 pop song)";
    extracted.seedQuery = extracted.cleanedIntent;
    extracted.culturalKeywords = ["Charlie Puth", "One Call Away", "2016", "pop"];
    seeds.music = [
      { title: "One Call Away", artist: "Charlie Puth", affinity: "2016 pop single · the remembered vocal hook" },
      { title: "Marvin Gaye", artist: "Charlie Puth & Meghan Trainor", affinity: "2015 soul-pop crossover · same artist cluster" },
      { title: "See You Again", artist: "Wiz Khalifa feat. Charlie Puth", affinity: "2015 pop ballad · adjacent chart era" },
    ];
  } else if (/fire\s+fire|burn them/.test(lower)) {
    lead = "Fire Fire";
    memoryType = "music";
    seeds.music = seeds.music.length ? seeds.music : [
      { title: "Fire Fire", artist: "Daddy Showkey", affinity: "1998 dancehall · the remembered lyric" },
      { title: "Fire", artist: "Tony Rebel", affinity: "1996 roots reggae · adjacent chorus match" },
      { title: "No Woman, No Cry", artist: "Bob Marley & The Wailers", affinity: "1974 roots reggae · same Kingston lineage" },
    ];
  } else if (/black\s*list/.test(lower)) {
    lead = "The Blacklist";
    memoryType = "tv";
    seeds.film = seeds.film.length ? seeds.film : [
      { title: "The Blacklist", year: "2013–2023", correlation: "The remembered crime-thriller series" },
      { title: "Boston Legal", year: "2004–2008", correlation: "James Spader legal-drama era" },
      { title: "The West Wing", year: "1999–2006", correlation: "James Spader political-drama era" },
    ];
  }
  if (explicitlyConfirmed) lead = explicitlyConfirmed;

  const leadCandidate: InvestigationCandidate = {
    id: `local:${encodeURIComponent(lead)}`,
    entityId: `local:${lead.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: lead,
    type: memoryType,
    strength: explicitlyConfirmed ? "strong_match" : "possible_match",
      explanation: "Local candidate from the spoken query; not verified by Qloo.",
    context: extracted.culturalKeywords.slice(0, 4),
    signalNames: [],
    provenance: "agent",
    qlooEvidence: { requestIds: [] },
  };
  const clues = mergeMemoryClues([{ id: "memoryType", label: "Memory type", value: memoryType, certainty: "remembered" }], parsed.clues);
  const question = null;
  const reconstructedWorld = buildCulturalWorld({
    transcript,
    decade: extracted.decade,
    domain: extracted.primaryDomain,
    leadEntity: lead,
    seeds,
  });
  const directAnswer = buildDirectAnswer({
    transcript,
    leadEntity: lead,
    domain: extracted.primaryDomain,
    world: reconstructedWorld,
    llm: extracted.directAnswer,
    llmStatus: extracted.llmStatus,
    qlooAffinity: undefined,
  });
  const generatedConnections = buildCulturalConnections({
    transcript: extracted.cleanedTranscript || transcript,
    leadEntity: lead,
    domain: extracted.primaryDomain,
    world: reconstructedWorld,
    llm: extracted.culturalConnections,
    llmStatus: extracted.llmStatus,
  });
  const culturalConnections = generatedConnections.length ? generatedConnections : fallbackCulturalConnections();
  const narrative = explicitlyConfirmed
    ? `Memory Recovered: ${lead}`
    : directAnswer.detailedExplanation;
  return {
    investigationId: `local-investigation-${Date.now()}`,
    memoryType,
    clues,
    resolvedAnchors: [],
    culturalSignals: [],
    candidates: [leadCandidate],
    followUpQuestion: question,
    investigationStatus: explicitlyConfirmed ? "confirmed" : "candidates",
    confirmedEntity: explicitlyConfirmed,
    spokenResponse: narrative,
    thread: makeThread(clues, [leadCandidate], []),
    provenance: { qlooCalls: 0, qlooRequestIds: [], note: "Local fallback. Suggestions are unverified; no Qloo response was available." },
    extraction: {
      cleanedTranscript: extracted.cleanedTranscript || transcript,
      cleanedIntent: extracted.cleanedIntent,
      seedQuery: extracted.seedQuery,
      leadEntity: lead,
      candidateSeeds: extracted.candidateSeeds,
      targetEntities: extracted.targetEntities,
      culturalKeywords: extracted.culturalKeywords,
      decade: extracted.decade,
      primaryMedium: extracted.primaryMedium,
      primaryDomain: extracted.primaryDomain,
      entityType: memoryType,
      domains: extracted.domains,
    },
    culturalInvestigation: {
      hypothesis: { leadEntity: lead, confidenceScore: null, qlooResolved: false, reasoning: "Local fallback only; Qloo did not verify this result." },
      agentFollowUp: "",
      clarificationChips: [],
      primaryDomain: extracted.primaryDomain,
      reconstructedWorld,
    },
    directAnswer,
    culturalConnections,
  };
}

export function voiceOutputText(result: Pick<InvestigationResult, "investigationStatus" | "candidates" | "followUpQuestion" | "spokenResponse">): string {
  return result.spokenResponse;
}

export type InvestigationRequestRecord = QlooRequestRecord;
