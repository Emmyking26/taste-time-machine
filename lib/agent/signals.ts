import { tagIdOf, tagTypeOf } from "@/lib/qloo";
import type { QlooEntity, QlooTag } from "@/lib/qloo";
import type { CulturalSignal } from "./types";

export type SignalSourceKind = "tag_insight" | "detroit_tag_insight" | "entity_metadata";

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

function namespaceOf(id: string | undefined): string | undefined {
  if (!id || !id.startsWith("urn:")) return undefined;
  const parts = id.split(":");
  return parts.length > 1 ? parts.slice(0, -1).join(":") : undefined;
}

/** Normalize one Qloo tag without discarding its original record. */
export function normalizeQlooSignal(
  tag: QlooTag,
  sourceEntity: string,
  sourceKind: SignalSourceKind,
  auditId?: string,
): CulturalSignal | null {
  const name = typeof tag.name === "string" ? tag.name.trim() : "";
  if (!name) return null;

  const id = tagIdOf(tag) || undefined;
  const tagType = tagTypeOf(tag);
  const affinity = readNumber(tag.query?.affinity);
  const popularity = readNumber(tag.popularity);

  return {
    source: "qloo",
    name,
    ...(id ? { id } : {}),
    ...(namespaceOf(id) ? { namespace: namespaceOf(id) } : {}),
    ...(tagType ? { type: tagType } : {}),
    ...(affinity !== null ? { affinity } : {}),
    ...(popularity !== null ? { popularity } : {}),
    sourceEntity,
    metadata: {
      sourceKind,
      raw: tag,
      tagType: tag.type,
      subtype: tag.subtype,
      appliesTo: tag.types,
      ...(auditId ? { auditId } : {}),
    },
  };
}

export function normalizeEntitySignals(entity: QlooEntity, auditId?: string): CulturalSignal[] {
  return (entity.tags ?? [])
    .map((tag) => normalizeQlooSignal(tag, entity.entity_id, "entity_metadata", auditId))
    .filter((signal): signal is CulturalSignal => signal !== null);
}

export function dedupeSignals(signals: CulturalSignal[]): CulturalSignal[] {
  const byKey = new Map<string, CulturalSignal>();
  for (const signal of signals) {
    const sourceKind = typeof signal.metadata?.sourceKind === "string" ? signal.metadata.sourceKind : "unknown";
    const key = `${signal.sourceEntity ?? ""}|${signal.id ?? signal.name.toLowerCase()}|${sourceKind}`;
    const existing = byKey.get(key);
    if (!existing || (signal.affinity ?? -1) > (existing.affinity ?? -1)) byKey.set(key, signal);
  }
  return [...byKey.values()];
}

export function signalsForEntity(signals: CulturalSignal[], entityId: string): CulturalSignal[] {
  return signals.filter((signal) => signal.sourceEntity === entityId);
}

export interface EraSignal {
  tagId: string;
  name: string;
  label: string;
  start: number;
  end: number;
  affinity: number | null;
}

const DECADE_PATTERN = /(?:^|\s)(?:19)?(\d{2})s(?:\s|$)/;

export function decadeFromTagName(name: string): { start: number; end: number; label: string } | null {
  const normalized = name.toLowerCase().replace(/[’']/g, "").trim();
  const match = normalized.match(DECADE_PATTERN);
  if (!match) return null;
  const decade = Number(match[1]);
  if (!Number.isFinite(decade)) return null;
  const start = 1900 + decade;
  return { start, end: start + 9, label: `${start}s` };
}

/**
 * Pick era tags used to emulate a historical music filter.
 * Tag-insight signals (e.g. `60s`) are preferred over entity metadata tags
 * because they carry measured affinity and are usable as `filter.tags`.
 */
export function extractEraSignals(
  signals: CulturalSignal[],
  window?: { startYear: number; endYear: number },
): EraSignal[] {
  const insightSignals = signals.filter((signal) => {
    const kind = signal.metadata?.sourceKind;
    return kind === "tag_insight" || kind === "detroit_tag_insight";
  });
  const metadataSignals = signals.filter((signal) => signal.metadata?.sourceKind === "entity_metadata");
  const hasInsightEra = insightSignals.some((signal) => decadeFromTagName(signal.name) !== null);
  const source = hasInsightEra ? insightSignals : metadataSignals;

  const byLabel = new Map<string, EraSignal>();
  for (const signal of source) {
    const era = decadeFromTagName(signal.name);
    if (!era || !signal.id) continue;
    if (window && (era.end < window.startYear || era.start > window.endYear)) continue;
    const existing = byLabel.get(era.label);
    if (existing && (existing.affinity ?? -1) >= (signal.affinity ?? -1)) continue;
    byLabel.set(era.label, {
      tagId: signal.id,
      name: signal.name,
      label: era.label,
      start: era.start,
      end: era.end,
      affinity: signal.affinity ?? null,
    });
  }

  return [...byLabel.values()].sort((a, b) => a.start - b.start);
}

const MEANINGFUL_NAMESPACES = [
  "genre",
  "style",
  "cultural_relevance",
  "influence",
  "influenced_by",
  "theme",
  "subgenre",
  "keyword",
  "emotional_tone",
];

const GENERIC_NAMES = new Set(
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
  ].map((name) => name.toLowerCase()),
);

function isMeaningful(signal: CulturalSignal): boolean {
  if (GENERIC_NAMES.has(signal.name.toLowerCase())) return false;
  const namespace = signal.namespace ?? "";
  return MEANINGFUL_NAMESPACES.some((part) => namespace.includes(part)) || namespace === "";
}

/**
 * Compact set of signal names used for feedback matching and session reasons.
 * Keeps Qloo's original names, but avoids generic style words dominating.
 */
export function preferenceSignalNames(signals: CulturalSignal[], limit = 5): string[] {
  const meaningful = signals.filter(isMeaningful);
  const pool = meaningful.length >= 2 ? meaningful : signals.filter((signal) => !GENERIC_NAMES.has(signal.name.toLowerCase()));
  const sorted = [...pool].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0));
  const names: string[] = [];
  const seen = new Set<string>();
  for (const signal of sorted) {
    const key = signal.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(signal.name);
    if (names.length >= limit) break;
  }
  return names;
}

export function topSignals(signals: CulturalSignal[], limit = 20): CulturalSignal[] {
  return [...signals]
    .sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, limit);
}
