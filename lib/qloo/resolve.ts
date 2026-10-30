import type {
  CandidateAssessment,
  NameMatchType,
  QlooEntity,
  QlooEntityType,
  QlooTag,
  ResolutionState,
  TagResolution,
} from "./types";

const LEADING_ARTICLE = /^(the|a|an)\s+/;

export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function stripLeadingArticle(normalized: string): string {
  return normalized.replace(LEADING_ARTICLE, "").trim();
}

export function entityTypes(entity: QlooEntity): string[] {
  const types: string[] = [];
  if (Array.isArray(entity.types)) types.push(...entity.types);
  else if (typeof entity.types === "string") types.push(entity.types);
  if (typeof entity.type === "string") types.push(entity.type);
  else if (Array.isArray(entity.type)) types.push(...(entity.type as string[]));
  if (typeof entity.subtype === "string") types.push(entity.subtype);
  return [...new Set(types.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

export function isTypeCompatible(types: string[], expectedTypes: QlooEntityType[]): boolean {
  if (expectedTypes.length === 0) return true;
  return types.some((type) => expectedTypes.includes(type as QlooEntityType));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export function compareNames(query: string, candidate: string): { match: NameMatchType; score: number } {
  const normalizedQuery = normalizeName(query);
  const normalizedCandidate = normalizeName(candidate);
  if (!normalizedQuery || !normalizedCandidate) return { match: "none", score: 0 };

  if (normalizedQuery === normalizedCandidate) return { match: "exact", score: 1 };

  const queryCore = stripLeadingArticle(normalizedQuery);
  const candidateCore = stripLeadingArticle(normalizedCandidate);
  if (queryCore === candidateCore) return { match: "exact_ignoring_article", score: 0.98 };

  const queryTokens = queryCore.split(" ").filter(Boolean);
  const candidateTokens = candidateCore.split(" ").filter(Boolean);
  const candidateTokenSet = new Set(candidateTokens);
  const allQueryTokensPresent = queryTokens.every((token) => candidateTokenSet.has(token));

  if (allQueryTokensPresent && candidateTokens.length > queryTokens.length) {
    // "Motown" vs "Motown Magic": related, but NOT the same entity.
    // Capped below the auto-selection threshold so supersets are never chosen blindly.
    const coverage = queryTokens.length / candidateTokens.length;
    return { match: "token_subset", score: 0.55 + 0.3 * coverage };
  }

  const similarity = 1 - levenshtein(queryCore, candidateCore) / Math.max(queryCore.length, candidateCore.length);
  if (similarity >= 0.86) return { match: "fuzzy", score: similarity };
  return { match: "none", score: similarity * 0.5 };
}

const AUTO_SELECT_FUZZY_THRESHOLD = 0.9;
const AUTO_SELECT_FUZZY_MARGIN = 0.05;
const RELATED_THRESHOLD = 0.45;

export interface ResolveAnchorResult {
  selected: QlooEntity | null;
  state: ResolutionState;
  confidence: number;
  matchType: NameMatchType | "none";
  assessments: CandidateAssessment[];
  notes: string[];
  error?: string;
}

export function resolveAnchor(
  caregiverInput: string,
  candidates: QlooEntity[],
  expectedTypes: QlooEntityType[],
): ResolveAnchorResult {
  const notes: string[] = [];
  const assessments: CandidateAssessment[] = candidates.map((candidate) => {
    const comparison = compareNames(caregiverInput, candidate.name);
    const candidateTypes = entityTypes(candidate);
    const typeCompatible = isTypeCompatible(candidateTypes, expectedTypes);
    const popularity = typeof candidate.popularity === "number" ? candidate.popularity : null;
    const confidence = Math.round(comparison.score * 1000) / 1000;

    let reason: string;
    if (!typeCompatible) {
      reason = `Name match ${comparison.match} (${comparison.score.toFixed(3)}), but type ${candidateTypes.join(", ") || "unknown"} is not compatible with ${expectedTypes.join(", ")}.`;
    } else if (comparison.match === "exact" || comparison.match === "exact_ignoring_article") {
      reason = `Exact-compatible name match (${comparison.match}, ${comparison.score.toFixed(3)}).`;
    } else if (comparison.match === "token_subset") {
      reason = "Query name is only a token subset of a longer candidate name; treated as a different entity.";
    } else if (comparison.match === "fuzzy") {
      reason = `Fuzzy name similarity ${comparison.score.toFixed(3)}; requires margin and threshold checks.`;
    } else {
      reason = "No meaningful name match.";
    }

    return {
      entityId: candidate.entity_id,
      name: candidate.name,
      normalizedName: normalizeName(candidate.name),
      candidateTypes,
      nameMatch: comparison.match,
      nameScore: confidence,
      typeCompatible,
      popularity,
      confidence,
      eligible: typeCompatible && comparison.match !== "none",
      reason,
    };
  });

  const eligible = assessments
    .filter((assessment) => assessment.eligible)
    .sort((a, b) => b.nameScore - a.nameScore || (b.popularity ?? 0) - (a.popularity ?? 0));

  const exactEligible = eligible.filter(
    (assessment) => assessment.nameMatch === "exact" || assessment.nameMatch === "exact_ignoring_article",
  );

  if (exactEligible.length === 1) {
    const winner = exactEligible[0];
    const selected = candidates.find((candidate) => candidate.entity_id === winner.entityId) ?? null;
    notes.push(
      `Selected the ${winner.nameMatch === "exact" ? "exact" : "exact (ignoring leading article)"} name match. ${assessments.length - 1} other candidate(s) preserved but not selected.`,
    );
    return {
      selected,
      state: "resolved",
      confidence: winner.confidence,
      matchType: winner.nameMatch,
      assessments,
      notes,
    };
  }

  if (exactEligible.length > 1) {
    notes.push(
      `Multiple compatible exact-name matches (${exactEligible.map((item) => `${item.name} [${item.entityId}]`).join("; ")}). Disambiguation required.`,
    );
    return {
      selected: null,
      state: "ambiguous",
      confidence: exactEligible[0].confidence,
      matchType: exactEligible[0].nameMatch,
      assessments,
      notes,
      error: `Qloo returned ${exactEligible.length} compatible exact-name matches for “${caregiverInput}”. Not selecting blindly; caregiver disambiguation is required.`,
    };
  }

  const best = eligible[0];
  const second = eligible[1];
  if (
    best &&
    best.nameMatch === "fuzzy" &&
    best.nameScore >= AUTO_SELECT_FUZZY_THRESHOLD &&
    (!second || best.nameScore - second.nameScore >= AUTO_SELECT_FUZZY_MARGIN)
  ) {
    const selected = candidates.find((candidate) => candidate.entity_id === best.entityId) ?? null;
    notes.push(`Selected a unique high-confidence fuzzy name match at ${best.nameScore.toFixed(3)}.`);
    return {
      selected,
      state: "resolved",
      confidence: Math.round(best.nameScore * 0.9 * 1000) / 1000,
      matchType: "fuzzy",
      assessments,
      notes,
    };
  }

  const incompatibleExact = assessments.filter(
    (assessment) =>
      !assessment.typeCompatible &&
      (assessment.nameMatch === "exact" || assessment.nameMatch === "exact_ignoring_article"),
  );

  if (incompatibleExact.length > 0) {
    notes.push(
      `Exact name match exists, but with incompatible type(s): ${incompatibleExact.map((item) => `${item.name} [${item.candidateTypes.join(", ")}]`).join("; ")}.`,
    );
  }

  const related = eligible.filter((assessment) => assessment.nameScore >= RELATED_THRESHOLD);
  if (related.length > 0) {
    notes.push(
      `Related candidates were returned but not selected because no unique exact/high-confidence match exists: ${related.map((item) => `${item.name} (${item.nameScore.toFixed(3)})`).join("; ")}.`,
    );
    return {
      selected: null,
      state: "ambiguous",
      confidence: related[0].nameScore,
      matchType: related[0].nameMatch,
      assessments,
      notes,
      error: `Qloo returned ${related.length} related candidate(s) for “${caregiverInput}”, but none was an exact or high-confidence compatible match. Not selecting blindly.`,
    };
  }

  if (incompatibleExact.length > 0) {
    return {
      selected: null,
      state: "ambiguous",
      confidence: incompatibleExact[0].confidence,
      matchType: incompatibleExact[0].nameMatch,
      assessments,
      notes,
      error: `Qloo returned an exact name match for “${caregiverInput}”, but not in a compatible type. Not selecting blindly.`,
    };
  }

  return {
    selected: null,
    state: "unresolved",
    confidence: 0,
    matchType: "none",
    assessments,
    notes,
    error: `Qloo returned no compatible candidate for “${caregiverInput}”.`,
  };
}

export function tagIdOf(tag: QlooTag): string {
  const value = tag.id ?? tag.tag_id ?? tag.tag_value ?? tag.value;
  return typeof value === "string" ? value : "";
}

export function tagTypeOf(tag: QlooTag): string | null {
  const value = tag.type ?? tag.subtype;
  return typeof value === "string" ? value : null;
}

export function resolveTagCandidates(query: string, candidates: QlooTag[]): Omit<TagResolution, "request" | "response"> {
  const notes: string[] = [];
  const normalizedQuery = normalizeName(query);
  const exact = candidates.filter((candidate) => {
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const normalized = normalizeName(name);
    return normalized === normalizedQuery || stripLeadingArticle(normalized) === stripLeadingArticle(normalizedQuery);
  });

  const exactCandidateIds = exact.map(tagIdOf).filter(Boolean);

  if (exact.length > 0) {
    const sorted = [...exact].sort((a, b) => {
      const aPopularity = typeof a.popularity === "number" ? a.popularity : 0;
      const bPopularity = typeof b.popularity === "number" ? b.popularity : 0;
      return bPopularity - aPopularity;
    });
    if (sorted.length > 1) {
      notes.push(
        `${sorted.length} exact tag-name matches exist across tag namespaces; selected the most popular (${tagIdOf(sorted[0])}). Alternatives: ${sorted
          .slice(1)
          .map((tag) => tagIdOf(tag))
          .join(", ")}.`,
      );
    } else {
      notes.push(`Exact Qloo tag-name match: ${tagIdOf(sorted[0])}.`);
    }
    return {
      query,
      candidates,
      selected: sorted[0],
      state: "resolved",
      confidence: sorted.length === 1 ? 1 : 0.9,
      exactCandidateIds,
      notes,
    };
  }

  if (candidates.length > 0) {
    notes.push(
      `Qloo tag search returned ${candidates.length} related tag(s), but no exact tag-name match. Not selecting blindly.`,
    );
    return {
      query,
      candidates,
      selected: null,
      state: "ambiguous",
      confidence: 0,
      exactCandidateIds,
      notes,
    };
  }

  return {
    query,
    candidates,
    selected: null,
    state: "unresolved",
    confidence: 0,
    exactCandidateIds,
    notes: ["Qloo tag search returned no candidates."],
  };
}
