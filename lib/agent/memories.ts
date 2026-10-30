import type { QlooEntityType } from "@/lib/qloo";
import type { PersonProfile } from "./types";

export interface ClassifiedMemories {
  rememberedInterests: string[];
  rememberedMusic: string[];
  rememberedMovies: string[];
  rememberedTvShows: string[];
  rememberedFoods: string[];
  rememberedPlaces: string[];
}

export interface AnchorInput {
  text: string;
  preferredTypes: QlooEntityType[];
}

const MUSIC =
  /\b(music|song|songs|singer|band|motown|jazz|blues|soul|funk|gospel|beatles|supremes|records?|radio|album|orchestra|choir|oldies)\b/i;
const FILM = /\b(movie|movies|film|films|hollywood|westerns?|cinema|picture shows?)\b/i;
const TV = /\b(\btv\b|television|sitcom)\b/i;
const FOOD =
  /\b(dinner|dinners|supper|lunch|breakfast|food|meal|meals|cooking|baking|recipe|coffee|tea|kitchen)\b/i;
const PLACE = /\b(park|church|neighborhood|downtown|hometown|street|detroit)\b/i;

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function classifyMemories(memories: string[]): ClassifiedMemories {
  const rememberedInterests = unique(memories);
  const rememberedMusic: string[] = [];
  const rememberedMovies: string[] = [];
  const rememberedTvShows: string[] = [];
  const rememberedFoods: string[] = [];
  const rememberedPlaces: string[] = [];

  for (const memory of rememberedInterests) {
    if (FOOD.test(memory)) rememberedFoods.push(memory);
    else if (FILM.test(memory)) rememberedMovies.push(memory);
    else if (TV.test(memory)) rememberedTvShows.push(memory);
    else if (PLACE.test(memory)) rememberedPlaces.push(memory);
    else if (MUSIC.test(memory)) rememberedMusic.push(memory);
  }

  return {
    rememberedInterests,
    rememberedMusic,
    rememberedMovies,
    rememberedTvShows,
    rememberedFoods,
    rememberedPlaces,
  };
}

export function formativePeriodFor(birthYear: number): { startYear: number; endYear: number } {
  return { startYear: birthYear + 15, endYear: birthYear + 25 };
}

export function collectAnchorInputs(profile: PersonProfile): AnchorInput[] {
  const inputs: AnchorInput[] = [];
  const seen = new Set<string>();

  const push = (text: string, preferredTypes: QlooEntityType[]) => {
    const key = text.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    inputs.push({ text: text.trim(), preferredTypes });
  };

  for (const text of profile.caregiverKnown.rememberedMusic ?? []) {
    push(text, ["urn:entity:artist", "urn:entity:brand"]);
  }
  for (const text of profile.caregiverKnown.rememberedMovies ?? []) {
    push(text, ["urn:entity:movie"]);
  }
  for (const text of profile.caregiverKnown.rememberedTvShows ?? []) {
    push(text, ["urn:entity:tv_show"]);
  }
  for (const text of profile.caregiverKnown.rememberedPlaces ?? []) {
    push(text, ["urn:entity:place"]);
  }
  for (const text of profile.caregiverKnown.rememberedInterests) {
    if (FOOD.test(text)) continue;
    push(text, ["urn:entity:artist", "urn:entity:brand", "urn:entity:movie", "urn:entity:tv_show"]);
  }

  return inputs;
}
