import { randomUUID } from "node:crypto";
import { classifyMemories, formativePeriodFor } from "./memories";
import type { PersonProfile } from "./types";

export const MARGARET_PROFILE_ID = "margaret-johnson";

export interface CreatePersonInput {
  name: string;
  birthYear: number;
  hometown: string;
  state?: string;
  memories: string[];
  country?: string;
}

function slugFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "person";
}

export function createPersonProfile(input: CreatePersonInput, now = new Date().toISOString()): PersonProfile {
  const name = input.name.trim();
  const city = input.hometown.trim();
  const state = input.state?.trim();
  const classified = classifyMemories(input.memories);
  return {
    id: `${slugFromName(name)}-${randomUUID().slice(0, 8)}`,
    name,
    birthYear: input.birthYear,
    hometown: {
      city,
      ...(state ? { state } : {}),
      country: input.country?.trim() || "United States",
    },
    formativePeriod: formativePeriodFor(input.birthYear),
    caregiverKnown: {
      rememberedInterests: classified.rememberedInterests,
      ...(classified.rememberedMusic.length > 0 ? { rememberedMusic: classified.rememberedMusic } : {}),
      ...(classified.rememberedMovies.length > 0 ? { rememberedMovies: classified.rememberedMovies } : {}),
      ...(classified.rememberedTvShows.length > 0 ? { rememberedTvShows: classified.rememberedTvShows } : {}),
      ...(classified.rememberedFoods.length > 0 ? { rememberedFoods: classified.rememberedFoods } : {}),
      ...(classified.rememberedPlaces.length > 0 ? { rememberedPlaces: classified.rememberedPlaces } : {}),
    },
    anchors: [],
    discoveredSignals: [],
    sessionHistory: [],
    preferencesLearned: [],
    createdAt: now,
    updatedAt: now,
    qlooAudit: [],
  };
}

export function createMargaretProfile(now = new Date().toISOString()): PersonProfile {
  return {
    id: MARGARET_PROFILE_ID,
    name: "Margaret Johnson",
    birthYear: 1948,
    hometown: {
      city: "Detroit",
      state: "Michigan",
      country: "United States",
    },
    formativePeriod: {
      startYear: 1963,
      endYear: 1973,
    },
    caregiverKnown: {
      rememberedInterests: ["The Supremes", "Motown", "classic Hollywood movies", "Sunday family dinners"],
      rememberedMusic: ["The Supremes", "Motown"],
      notes:
        "Fictional Phase 2 test profile. All caregiver-known fields are supplied test data; they are not inferred by Qloo.",
    },
    anchors: [],
    discoveredSignals: [],
    sessionHistory: [],
    preferencesLearned: [],
    createdAt: now,
    updatedAt: now,
    qlooAudit: [],
  };
}

export class ProfileNotFoundError extends Error {
  constructor(profileId: string) {
    super(`Profile “${profileId}” was not found.`);
    this.name = "ProfileNotFoundError";
  }
}

/**
 * Phase 2 deliberately uses a small in-memory store. It keeps the agent loop
 * runnable without a database and can be replaced behind the same interface.
 */
export class ProfileStore {
  private readonly profiles = new Map<string, PersonProfile>();

  constructor(initialProfiles: PersonProfile[] = [createMargaretProfile()]) {
    for (const profile of initialProfiles) {
      this.profiles.set(profile.id, structuredClone(profile));
    }
  }

  get(profileId: string): PersonProfile | undefined {
    const profile = this.profiles.get(profileId);
    return profile ? structuredClone(profile) : undefined;
  }

  getOrThrow(profileId: string): PersonProfile {
    const profile = this.get(profileId);
    if (!profile) throw new ProfileNotFoundError(profileId);
    return profile;
  }

  list(): PersonProfile[] {
    return [...this.profiles.values()].map((profile) => structuredClone(profile));
  }

  save(profile: PersonProfile): PersonProfile {
    const saved = structuredClone(profile);
    this.profiles.set(saved.id, saved);
    return structuredClone(saved);
  }

  has(profileId: string): boolean {
    return this.profiles.has(profileId);
  }
}

let defaultStore: ProfileStore | null = null;

export function getProfileStore(): ProfileStore {
  defaultStore ??= new ProfileStore();
  return defaultStore;
}

export function resetProfileStoreForTests(): ProfileStore {
  defaultStore = new ProfileStore();
  return defaultStore;
}

export function createSessionId(): string {
  return `session-${randomUUID()}`;
}

export function createSessionItemId(): string {
  return `item-${randomUUID()}`;
}

export function createAnchorId(): string {
  return `anchor-${randomUUID()}`;
}
