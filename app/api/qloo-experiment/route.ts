import { NextResponse } from "next/server";
import { buildTasteProfile, getQlooErrorMessage } from "@/lib/qloo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await buildTasteProfile();
    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Qloo experiment failed before a complete profile could be built.",
        detail: getQlooErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
