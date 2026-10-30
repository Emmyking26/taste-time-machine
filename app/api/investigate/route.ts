import { NextResponse } from "next/server";
import {
  createLocalFallbackInvestigation,
  investigateMemory,
  type InvestigationInput,
  type InvestigationResult,
} from "@/lib/investigation";
import { LLM_BASE_URL, LLM_MODEL } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReconstructedWorld = InvestigationResult["culturalInvestigation"]["reconstructedWorld"];

function validBody(body: unknown): InvestigationInput {
  if (!body || typeof body !== "object") throw new Error("A JSON body is required.");
  const record = body as Record<string, unknown>;
  if (typeof record.transcript !== "string" || record.transcript.trim().length < 3) {
    throw new Error("A memory fragment is required.");
  }
  if (record.transcript.length > 5000) throw new Error("That memory fragment is a little long. Try the part you almost remember most.");
  return {
    transcript: record.transcript.trim(),
    previousClues: Array.isArray(record.previousClues) ? record.previousClues as InvestigationInput["previousClues"] : undefined,
    rejectedCandidates: Array.isArray(record.rejectedCandidates) ? record.rejectedCandidates.filter((item): item is string => typeof item === "string").slice(0, 20) : undefined,
    confirmedCandidateId: typeof record.confirmedCandidateId === "string" ? record.confirmedCandidateId : undefined,
    confirmedEntity: typeof record.confirmedEntity === "string" ? record.confirmedEntity.trim().slice(0, 160) : undefined,
    confirmedEntityId: typeof record.confirmedEntityId === "string" ? record.confirmedEntityId.slice(0, 200) : undefined,
    confirmedEntityType: typeof record.confirmedEntityType === "string" ? record.confirmedEntityType.slice(0, 80) : undefined,
    clarificationCount: typeof record.clarificationCount === "number" ? Math.max(0, Math.min(1, Math.floor(record.clarificationCount))) : 0,
    exploreWorld: record.exploreWorld === true,
    person: record.person && typeof record.person === "object" ? record.person as InvestigationInput["person"] : undefined,
  };
}

function mergeWorldRows<T>(primary: T[], backup: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const row of [...primary, ...backup]) {
    const id = key(row).trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push(row);
    if (rows.length >= 3) break;
  }
  return rows;
}

function mergeWorld(primary: ReconstructedWorld, backup: ReconstructedWorld): ReconstructedWorld {
  return {
    music: mergeWorldRows(primary.music, backup.music, (item) => item.title),
    film: mergeWorldRows(primary.film, backup.film, (item) => item.title),
    venues: mergeWorldRows(primary.venues, backup.venues, (item) => item.name),
  };
}

/** Fill sparse tabs without converting local suggestions into claimed Qloo evidence. */
function finalizeResult(result: InvestigationResult, fallback: InvestigationResult): InvestigationResult {
  return {
    ...result,
    culturalInvestigation: {
      ...result.culturalInvestigation,
      hypothesis: {
        ...result.culturalInvestigation.hypothesis,
        confidenceScore: result.culturalInvestigation.hypothesis.confidenceScore,
        qlooResolved: result.culturalInvestigation.hypothesis.qlooResolved && result.provenance.qlooCalls > 0,
      },
      reconstructedWorld: mergeWorld(
        result.culturalInvestigation.reconstructedWorld,
        fallback.culturalInvestigation.reconstructedWorld,
      ),
    },
    directAnswer: result.directAnswer?.title ? result.directAnswer : fallback.directAnswer,
    culturalConnections: result.culturalConnections.length
      ? result.culturalConnections
      : fallback.culturalConnections,
  };
}

function respond(result: InvestigationResult) {
  return NextResponse.json({
    ...result,
    leadDiscovery: { entity: result.candidates[0], title: result.directAnswer.title ?? result.candidates[0]?.title ?? result.extraction.leadEntity },
    spokenNarrative: result.directAnswer.detailedExplanation || result.spokenResponse,
    domains: result.culturalInvestigation.reconstructedWorld,
  }, { status: 200 });
}

export async function POST(request: Request) {
  let input: InvestigationInput | null = null;
  try {
    input = validBody(await request.json());
    const fallback = createLocalFallbackInvestigation(input);
    let result: InvestigationResult;
    try {
      console.log("[LLM] Calling model:", LLM_MODEL, "at", LLM_BASE_URL);
      result = await investigateMemory(input);
    } catch (err) {
      const error = err as { status?: number; message?: string; response?: { data?: unknown } };
      console.error("[LLM ERROR] FAILED TO CALL LLM:", error.status, error.message, error.response?.data || error);
      result = fallback;
    }
    return respond(finalizeResult(result, fallback));
  } catch (err) {
    const error = err as { status?: number; message?: string; response?: { data?: unknown } };
    console.error("[LLM ERROR] FAILED TO CALL LLM:", error.status, error.message, error.response?.data || error);
    const fallback = input ? createLocalFallbackInvestigation(input) : null;
    return fallback
      ? respond(finalizeResult(fallback, fallback))
      : NextResponse.json({ error: "A memory fragment is required." }, { status: 400 });
  }
}
