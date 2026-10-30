import { NextResponse } from "next/server";
import { ProfileNotFoundError, presentWorld, reconstructCulturalWorld } from "@/lib/agent";
import { getQlooErrorMessage } from "@/lib/qloo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await context.params;
  try {
    const result = await reconstructCulturalWorld(profileId, { persist: true });
    return NextResponse.json({
      world: presentWorld(result.profile, result.steps),
      limitations: result.limitations,
    });
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "We could not reconstruct their cultural world just now.",
        detail: getQlooErrorMessage(error),
      },
      { status: 502 },
    );
  }
}
