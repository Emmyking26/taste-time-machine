import type { CaregiverReaction } from "@/lib/agent";
import type { PublicSession, PublicWorld } from "@/lib/agent/present";

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string; detail?: string };
  if (!response.ok) {
    throw new Error(data.error || data.detail || "Something went wrong.");
  }
  return data;
}

export async function createProfile(input: {
  name: string;
  birthYear: number;
  hometown: string;
  state: string;
  memories: string[];
}): Promise<{ id: string; firstName: string; name: string }> {
  const data = await readJson<{ person: { id: string; firstName: string; name: string } }>(
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return data.person;
}

export async function reconstructWorld(profileId: string): Promise<PublicWorld> {
  const data = await readJson<{ world: PublicWorld }>(
    await fetch(`/api/profile/${encodeURIComponent(profileId)}/reconstruct`, { method: "POST" }),
  );
  return data.world;
}

export async function generatePublicSession(profileId: string): Promise<PublicSession> {
  const data = await readJson<{ presentation: PublicSession }>(
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, durationMinutes: 20 }),
    }),
  );
  return data.presentation;
}

export async function sendFeedback(
  profileId: string,
  sessionId: string,
  sessionItemId: string,
  reaction: CaregiverReaction,
): Promise<{ shouldStop: boolean; guidance: string }> {
  const data = await readJson<{ safety: { shouldStop: boolean; guidance: string } }>(
    await fetch(`/api/session/${encodeURIComponent(sessionId)}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        feedback: [{ sessionItemId, reaction }],
      }),
    }),
  );
  return data.safety;
}
