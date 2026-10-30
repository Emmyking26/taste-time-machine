import { NextResponse } from "next/server";
import { createPersonProfile, getProfileStore, presentPerson } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateBody {
  name?: unknown;
  birthYear?: unknown;
  hometown?: unknown;
  state?: unknown;
  memories?: unknown;
}

function readString(value: unknown, label: string, max = 80): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${label} is too long.`);
  return trimmed;
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  try {
    const name = readString(body.name, "Name");
    const hometown = readString(body.hometown, "Hometown");
    const state = typeof body.state === "string" && body.state.trim() ? body.state.trim() : undefined;
    const birthYear = typeof body.birthYear === "number" ? body.birthYear : Number(body.birthYear);
    if (!Number.isInteger(birthYear) || birthYear < 1890 || birthYear > 2015) {
      throw new Error("Birth year should be a whole number between 1890 and 2015.");
    }
    const memories = Array.isArray(body.memories)
      ? body.memories.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : [];
    if (memories.length < 3 || memories.length > 5) {
      throw new Error("Please share three to five memories.");
    }
    if (memories.some((memory) => memory.length > 120)) {
      throw new Error("Each memory should be a short phrase.");
    }

    const profile = createPersonProfile({ name, birthYear, hometown, state, memories });
    getProfileStore().save(profile);
    return NextResponse.json({ person: presentPerson(profile) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The memory profile could not be created." },
      { status: 400 },
    );
  }
}
