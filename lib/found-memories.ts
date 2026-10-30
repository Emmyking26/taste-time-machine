import type { InvestigationCandidate, InvestigationResult } from "@/lib/investigation";

export const FOUND_MEMORIES_KEY = "taste_found_memories";
const LEGACY_FOUND_MEMORIES_KEY = "taste-time-machine-found";

export interface SavedMemory {
  id: string;
  title: string;
  subtitle: string;
  query: string;
  date: string;
  category: string;
  affinityScore?: number;
  culturalConnections?: InvestigationResult["culturalConnections"];
  snapshot?: InvestigationResult;
}

function sortNewestFirst(memories: SavedMemory[]): SavedMemory[] {
  return memories.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function safeTitle(title: string | null | undefined, query: string, subtitle: string): string {
  const cleaned = title?.trim();
  if (cleaned && !/^unknown$/i.test(cleaned)) return cleaned;
  return query.trim() || subtitle.trim() || "Cultural memory";
}

function saveList(memories: SavedMemory[]): SavedMemory[] {
  const sorted = sortNewestFirst(memories);
  window.localStorage.setItem(FOUND_MEMORIES_KEY, JSON.stringify(sorted));
  return sorted;
}

export function readFoundMemories(): SavedMemory[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(FOUND_MEMORIES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        return sortNewestFirst(parsed.filter((item): item is SavedMemory => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string" && typeof item.query === "string" && typeof item.date === "string")));
      }
    }

    const legacy = window.localStorage.getItem(LEGACY_FOUND_MEMORIES_KEY);
    if (!legacy) return [];
    const parsedLegacy = JSON.parse(legacy) as Array<InvestigationCandidate>;
    const migrated = parsedLegacy.filter((item) => item && typeof item.title === "string").map((item) => {
      const query = safeTitle(item.title, "", "");
      return {
        id: `legacy-${item.entityId || Date.now()}`,
        title: safeTitle(item.title, query, ""),
        subtitle: "Previously saved cultural discovery",
        query,
        date: new Date().toISOString(),
        category: item.type === "tv" ? "Television" : item.type === "film" ? "Cinema" : item.type === "music" ? "Music" : item.type === "food" ? "Dining" : "Culture",
      };
    });
    return saveList(migrated);
  } catch {
    return [];
  }
}

export function createSavedMemory(result: InvestigationResult, queryText: string, titleOverride?: string): SavedMemory {
  const query = queryText.trim() || result.extraction.cleanedTranscript.trim();
  const subtitle = result.directAnswer.subtitle?.trim() || result.candidates[0]?.explanation || "Recovered cultural memory";
  const proposedTitle = titleOverride || result.directAnswer.title || result.candidates[0]?.title;
  const title = safeTitle(proposedTitle, query, subtitle);
  const category = result.memoryType === "tv"
    ? "Television"
    : result.memoryType === "film"
      ? "Cinema"
      : result.memoryType === "music"
        ? "Music"
        : result.memoryType === "food"
          ? "Dining"
          : result.memoryType === "place"
            ? "Places"
            : result.culturalInvestigation.primaryDomain === "screen"
              ? "Television"
              : "Culture";
  const snapshot = titleOverride
    ? {
        ...result,
        directAnswer: { ...result.directAnswer, title },
        confirmedEntity: title,
        investigationStatus: "confirmed" as const,
        followUpQuestion: null,
        spokenResponse: `Memory Recovered: ${title}`,
      }
    : result;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    subtitle,
    query,
    date: new Date().toISOString(),
    category,
    ...(result.directAnswer.tasteAffinityScore > 0 ? { affinityScore: result.directAnswer.tasteAffinityScore } : {}),
    culturalConnections: result.culturalConnections,
    snapshot,
  };
}

export function saveFoundMemory(memory: SavedMemory): SavedMemory[] {
  if (typeof window === "undefined") return [];
  try {
    const current = readFoundMemories();
    const sameQuery = memory.query.trim().toLowerCase();
    const existing = current.find((item) => item.query.trim().toLowerCase() === sameQuery);
    const nextMemory = { ...memory, id: existing?.id ?? memory.id, date: new Date().toISOString() };
    return saveList([nextMemory, ...current.filter((item) => item.id !== existing?.id && item.id !== memory.id)]);
  } catch {
    return readFoundMemories();
  }
}

export function clearFoundMemories(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FOUND_MEMORIES_KEY);
    window.localStorage.removeItem(LEGACY_FOUND_MEMORIES_KEY);
  } catch {
    // Local history is optional to the investigation flow.
  }
}

export function formatMemoryDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const saved = new Date(timestamp);
  const now = new Date();
  if (Math.abs(now.getTime() - timestamp) < 60_000) return "Just now";
  if (saved.toDateString() === now.toDateString()) return "Today";
  return saved.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
