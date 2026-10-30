import { NextResponse } from "next/server";
import { ProfileNotFoundError, getProfileStore, presentPerson, presentWorld } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await context.params;
  try {
    const profile = getProfileStore().getOrThrow(profileId);
    return NextResponse.json({
      person: presentPerson(profile),
      world: presentWorld(profile, []),
    });
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "The profile could not be loaded." }, { status: 500 });
  }
}
