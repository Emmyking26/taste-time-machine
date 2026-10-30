import { NextResponse } from "next/server";
import {
  generateSession,
  getProfileStore,
  MARGARET_PROFILE_ID,
  presentGeneratedSession,
  ProfileNotFoundError,
} from "@/lib/agent";
import { getQlooErrorMessage } from "@/lib/qloo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GenerateBody {
  profileId?: unknown;
  durationMinutes?: unknown;
}

export async function POST(request: Request) {
  let body: GenerateBody = {};
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    // An empty body is valid and uses the default Margaret profile.
  }

  const profileId =
    typeof body.profileId === "string" && body.profileId.trim().length > 0 ? body.profileId.trim() : MARGARET_PROFILE_ID;
  const duration =
    typeof body.durationMinutes === "number" && Number.isFinite(body.durationMinutes)
      ? Math.max(10, Math.min(40, Math.round(body.durationMinutes)))
      : undefined;

  try {
    const result = await generateSession(profileId, { durationMinutes: duration });
    const profile = getProfileStore().getOrThrow(profileId);
    return NextResponse.json(
      {
        ...result,
        presentation: presentGeneratedSession(result, profile),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "The reminiscence session could not be generated.",
        detail: getQlooErrorMessage(error),
      },
      { status: 502 },
    );
  }
}
