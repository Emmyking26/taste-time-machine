import { NextResponse } from "next/server";
import {
  MARGARET_PROFILE_ID,
  ProfileNotFoundError,
  recordFeedback,
  type CaregiverReaction,
  type FeedbackInput,
} from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REACTIONS = new Set<CaregiverReaction>(["lit_up", "calm", "engaged", "no_response", "agitated", "unknown"]);

interface FeedbackBody {
  profileId?: unknown;
  feedback?: unknown;
  [key: string]: unknown;
}

function readFeedback(value: unknown): FeedbackInput[] {
  const values = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  const feedback: FeedbackInput[] = [];
  for (const item of values) {
    if (!item || typeof item !== "object") throw new Error("Each feedback entry must be an object.");
    const record = item as Record<string, unknown>;
    if (typeof record.sessionItemId !== "string" || !record.sessionItemId) {
      throw new Error("Each feedback entry needs a sessionItemId.");
    }
    if (typeof record.reaction !== "string" || !REACTIONS.has(record.reaction as CaregiverReaction)) {
      throw new Error("reaction must be one of lit_up, calm, engaged, no_response, agitated, unknown.");
    }
    feedback.push({
      sessionItemId: record.sessionItemId,
      reaction: record.reaction as CaregiverReaction,
      ...(typeof record.note === "string" && record.note.trim() ? { note: record.note.trim() } : {}),
    });
  }
  if (feedback.length === 0) throw new Error("At least one caregiver observation is required.");
  return feedback;
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const profileId =
    typeof body.profileId === "string" && body.profileId.trim().length > 0 ? body.profileId.trim() : MARGARET_PROFILE_ID;

  try {
    const feedback = readFeedback(body.feedback);
    const result = recordFeedback(profileId, sessionId, feedback);
    return NextResponse.json(
      {
        safety: result.safety,
        learned: result.learnedPreferences.map((preference) => ({
          name: preference.signal,
          reaction: preference.reaction,
        })),
        nextStep: "POST /api/session with the same profileId to generate the next adaptive session.",
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "Caregiver feedback could not be recorded.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
