import { createQlooClient, ensureQlooConfigured, entitiesFromResponse, getQlooErrorMessage, tagsFromResponse } from "./client";
import { resolveAnchor, resolveTagCandidates, tagIdOf, tagTypeOf } from "./resolve";
import type {
  AnchorResolution,
  CandidateAssessment,
  CategorySummary,
  CulturalSignal,
  CulturalSignalGroup,
  DiscoveredConnection,
  HistoricalFilterReport,
  QlooEntity,
  QlooEntityType,
  QlooEntitiesResponse,
  QlooInsightsResponse,
  QlooRecommendationResult,
  QlooRequestRecord,
  QlooTag,
  QlooSearchResponse,
  QlooTagInsightsResponse,
  QlooTagSearchResponse,
  RecommendedEntity,
  TagResolution,
  TasteProfile,
} from "./types";

export const MARGARET_TEST_PROFILE = {
  name: "Margaret Johnson",
  birthYear: 1948,
  hometown: "Detroit, Michigan",
  formativePeriod: { start: 1963, end: 1973 },
  rememberedInterests: ["The Supremes", "Motown", "classic Hollywood movies", "Sunday family dinners"],
} as const;

const HISTORICAL_WINDOW = MARGARET_TEST_PROFILE.formativePeriod;
const DETROIT_QUERY = "Detroit, Michigan";

interface AnchorPlan {
  label: string;
  intendedType: string;
  expectedTypes: QlooEntityType[];
  take: number;
}

const ANCHOR_PLANS: AnchorPlan[] = [
  {
    label: "The Supremes",
    intendedType: "music artist",
    expectedTypes: ["urn:entity:artist"],
    take: 10,
  },
  {
    label: "Motown",
    intendedType: "record label / cultural brand (not an artist)",
    expectedTypes: ["urn:entity:brand", "urn:entity:artist"],
    take: 10,
  },
];

/**
 * Real Qloo request that proves the resolver does not force an ambiguous cultural concept
 * into `urn:entity:artist`. "Motown" is not an artist name in Qloo's artist index.
 */
const AMBIGUITY_PROBES: AnchorPlan[] = [
  {
    label: "Motown",
    intendedType: "artist-only ambiguity probe",
    expectedTypes: ["urn:entity:artist"],
    take: 10,
  },
];

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return [value];
  return [];
}

function getReleaseYear(entity: QlooEntity): number | null {
  return readNumber(entity.properties?.release_year);
}

function getPublicationYear(entity: QlooEntity): number | null {
  return readNumber(entity.properties?.publication_year);
}

function getAffinity(entity: QlooEntity): number | null {
  return readNumber(entity.query?.affinity);
}

function getExplainability(entity: QlooEntity): unknown {
  return entity.query?.explainability ?? null;
}

function getShortDescription(entity: QlooEntity): string | null {
  const value = entity.properties?.short_description ?? entity.properties?.description;
  return typeof value === "string" ? value : null;
}

function getGenres(entity: QlooEntity): string[] {
  return readStringArray(entity.properties?.genres ?? entity.properties?.genre);
}

function toCulturalSignal(tag: QlooTag, source: CulturalSignal["source"]): CulturalSignal {
  return {
    tagId: tagIdOf(tag),
    name: typeof tag.name === "string" ? tag.name.trim() : "(unnamed tag)",
    type: tagTypeOf(tag),
    subtype: typeof tag.subtype === "string" ? tag.subtype : null,
    appliesTo: readStringArray(tag.types),
    popularity: readNumber(tag.popularity),
    affinity: readNumber(tag.query?.affinity),
    source,
    raw: tag,
  };
}

function groupSignals(signals: CulturalSignal[]): Record<string, CulturalSignal[]> {
  const groups: Record<string, CulturalSignal[]> = {};
  for (const signal of signals) {
    const key = signal.subtype ?? signal.type ?? "unknown";
    (groups[key] ??= []).push(signal);
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
  }
  return groups;
}

function makeSignalGroup(
  anchor: AnchorResolution,
  request: QlooRequestRecord,
  response: QlooTagInsightsResponse | null,
  limitations: string[],
): CulturalSignalGroup {
  const selected = anchor.selected;
  const rawTags = tagsFromResponse(response);
  const signals = rawTags.map((tag) => toCulturalSignal(tag, "Qloo tag insight for resolved anchor"));
  if (rawTags.length === 0) {
    limitations.push(`Qloo tag insight returned no tags for ${anchor.caregiverInput}.`);
  }
  return {
    anchorName: selected?.name ?? anchor.caregiverInput,
    anchorEntityId: selected?.entity_id ?? "",
    request,
    response,
    signals,
    bySubtype: groupSignals(signals),
    limitations,
  };
}

function buildTagResolution(
  query: string,
  request: QlooRequestRecord,
  response: QlooTagSearchResponse | null,
): TagResolution {
  return {
    ...resolveTagCandidates(query, tagsFromResponse(response)),
    request,
    response,
  };
}

function buildHistoricalFilter(
  filterType: QlooEntityType,
  requested: { start: number; end: number } | null,
  field: HistoricalFilterReport["field"],
  appliedByQloo: boolean,
  entities: RecommendedEntity[],
  note: string,
): HistoricalFilterReport {
  if (!requested) {
    return {
      requested: null,
      documentedForType: false,
      appliedByQloo: false,
      field,
      resultsWithinPeriod: 0,
      resultsOutsidePeriod: 0,
      resultsWithUnknownYear: 0,
      note,
    };
  }

  const years = entities.map((entity) => (field === "publication_year" ? entity.publicationYear : entity.releaseYear));
  const within = years.filter((year) => year !== null && year >= requested.start && year <= requested.end).length;
  const outside = years.filter((year) => year !== null && (year < requested.start || year > requested.end)).length;
  const unknown = years.filter((year) => year === null).length;

  return {
    requested,
    documentedForType: filterType === "urn:entity:movie" || filterType === "urn:entity:tv_show" || filterType === "urn:entity:book",
    appliedByQloo,
    field,
    resultsWithinPeriod: within,
    resultsOutsidePeriod: outside,
    resultsWithUnknownYear: unknown,
    note,
  };
}

function toRecommendedEntity(
  category: string,
  entity: QlooEntity,
  requested: { start: number; end: number } | null,
  field: HistoricalFilterReport["field"],
): RecommendedEntity {
  const releaseYear = getReleaseYear(entity);
  const publicationYear = getPublicationYear(entity);
  const comparisonYear = field === "publication_year" ? publicationYear : releaseYear;

  let historicalStatus: RecommendedEntity["historicalStatus"];
  if (field === "era_tag") {
    historicalStatus = "era_tag_only";
  } else if (!requested) {
    historicalStatus = "not_requested";
  } else if (comparisonYear === null) {
    historicalStatus = "unknown";
  } else if (comparisonYear >= requested.start && comparisonYear <= requested.end) {
    historicalStatus = "inside_period";
  } else {
    historicalStatus = "outside_period";
  }

  return {
    ...entity,
    category,
    source: "DISCOVERED THROUGH QLOO",
    historicalStatus,
    releaseYear,
    publicationYear,
    affinity: getAffinity(entity),
    qlooExplainability: getExplainability(entity),
  };
}

function buildConnections(
  category: string,
  entities: QlooEntity[],
  anchorIds: string[],
): DiscoveredConnection[] {
  return entities.map((entity) => {
    const explainability = getExplainability(entity);
    return {
      recommendationEntityId: entity.entity_id,
      recommendationName: entity.name,
      category,
      requestedAnchorIds: anchorIds,
      qlooExplainability: explainability,
      qlooQueryMetadata: entity.query ?? null,
      affinity: getAffinity(entity),
      explanationAvailable: explainability !== null,
    };
  });
}

function aggregateExplainability(response: QlooInsightsResponse | null): unknown {
  return response?.query?.explainability ?? null;
}

function dedupeEntities(entities: RecommendedEntity[]): RecommendedEntity[] {
  const seen = new Set<string>();
  const result: RecommendedEntity[] = [];
  for (const entity of entities) {
    if (seen.has(entity.entity_id)) continue;
    seen.add(entity.entity_id);
    result.push(entity);
  }
  return result;
}

function eraTagFromName(name: string): { start: number; end: number; label: string } | null {
  const normalized = name.toLowerCase().replace(/[’']/g, "").trim();
  const match = normalized.match(/(?:^|\s)(?:19)?(\d{2})s(?:\s|$)/);
  if (!match) return null;
  const decade = Number(match[1]);
  if (!Number.isFinite(decade)) return null;
  const start = 1900 + decade;
  const end = start + 9;
  if (start <= HISTORICAL_WINDOW.end && end >= HISTORICAL_WINDOW.start) {
    return { start, end, label: `${start}s` };
  }
  return null;
}

interface HistoricalEraSignal {
  tagId: string;
  name: string;
  start: number;
  end: number;
  label: string;
  source: CulturalSignal["source"];
  affinity: number | null;
}

/**
 * Pick era tags used to emulate a historical music filter.
 *
 * Qloo returns decade tags in two different vocabularies: the tag-insight endpoint returns
 * taste tags such as `60s` / `'70s`, while entity metadata carries curated tags such as
 * `1960s` or `urn:tag:genre:60s`. We prefer the tag-insight vocabulary because those tags
 * have measured affinity and actually return entities when sent as `filter.tags`. Entity
 * metadata is only a fallback when tag insight produced no era signal at all.
 *
 * Signals are deduplicated per decade (highest affinity wins) so a run is never issued
 * twice for the same decade under two different tags.
 */
function deriveEraSignals(anchor: AnchorResolution, group: CulturalSignalGroup | null): HistoricalEraSignal[] {
  const insightSignals = group?.signals ?? [];
  const metadataSignals = anchor.tags.map((tag) => toCulturalSignal(tag, "Qloo entity metadata"));
  const hasInsightEra = insightSignals.some((signal) => eraTagFromName(signal.name) !== null);
  const sourceSignals = hasInsightEra ? insightSignals : metadataSignals;

  const byLabel = new Map<string, HistoricalEraSignal>();
  for (const signal of sourceSignals) {
    const era = eraTagFromName(signal.name);
    if (!era || !signal.tagId) continue;

    const existing = byLabel.get(era.label);
    if (existing && (existing.affinity ?? -1) >= (signal.affinity ?? -1)) continue;

    byLabel.set(era.label, {
      tagId: signal.tagId,
      name: signal.name,
      start: era.start,
      end: era.end,
      label: era.label,
      source: signal.source,
      affinity: signal.affinity,
    });
  }

  return [...byLabel.values()].sort((a, b) => a.start - b.start);
}

interface RecommendationRunInput {
  category: string;
  filterType: QlooEntityType;
  intent: string;
  anchorIds: string[];
  requested: { start: number; end: number } | null;
  field: HistoricalFilterReport["field"];
  note: string;
  releaseYear?: { start: number; end: number };
  publicationYear?: { start: number; end: number };
  releaseCountry?: string[];
  filterTags?: string[];
  locationQuery?: string;
  locationRadiusMeters?: number;
}

async function runRecommendation(
  client: ReturnType<typeof createQlooClient>,
  input: RecommendationRunInput,
): Promise<{ result: QlooRecommendationResult; entities: QlooEntity[]; response: QlooInsightsResponse | null }> {
  const limitations: string[] = [];
  let request: QlooRequestRecord;
  let response: QlooInsightsResponse | null = null;
  let entities: QlooEntity[] = [];

  try {
    const apiResult = await client.getRecommendations({
      filterType: input.filterType,
      anchorEntityIds: input.anchorIds,
      releaseYear: input.releaseYear,
      publicationYear: input.publicationYear,
      releaseCountry: input.releaseCountry,
      filterTags: input.filterTags,
      locationQuery: input.locationQuery,
      locationRadiusMeters: input.locationRadiusMeters,
      take: 10,
      explainability: true,
    });
    request = apiResult.request;
    response = apiResult.response;
    entities = entitiesFromResponse(response);
  } catch (error) {
    const message = getQlooErrorMessage(error);
    limitations.push(message);
    request = {
      method: "GET",
      path: "/v2/insights",
      query: {
        "filter.type": input.filterType,
        "signal.interests.entities": input.anchorIds.join(","),
        "feature.explainability": true,
        take: 10,
      },
    };
  }

  if (entities.length === 0 && limitations.length === 0) {
    limitations.push("Qloo returned no entities for this category, anchor, and filter combination.");
  }

  const recommended = entities.map((entity) => toRecommendedEntity(input.category, entity, input.requested, input.field));
  const perEntityExplainabilityCount = recommended.filter((entity) => entity.qlooExplainability !== null).length;

  if (entities.length > 0 && perEntityExplainabilityCount === 0) {
    limitations.push("Qloo returned entities without per-entity explainability metadata.");
  }
  if (entities.length > 0 && perEntityExplainabilityCount < entities.length) {
    limitations.push(`${entities.length - perEntityExplainabilityCount} of ${entities.length} entities lacked per-entity explainability.`);
  }
  if (input.releaseCountry) {
    const countries = entities.map((entity) => readStringArray(entity.properties?.release_country));
    const mismatched = countries.filter((value) => value.length > 0 && !value.some((item) => input.releaseCountry?.includes(item))).length;
    if (mismatched > 0) {
      limitations.push(`${mismatched} result(s) did not report the requested release country; metadata was preserved rather than rewritten.`);
    }
  }

  const historicalFilter = buildHistoricalFilter(
    input.filterType,
    input.requested,
    input.field,
    Boolean(input.releaseYear || input.publicationYear || input.filterTags),
    recommended,
    input.note,
  );

  return {
    result: {
      category: input.category,
      filterType: input.filterType,
      intent: input.intent,
      qlooRequest: request,
      qlooResponse: response,
      entities: recommended,
      aggregateExplainability: aggregateExplainability(response),
      perEntityExplainabilityCount,
      historicalFilter,
      limitations,
    },
    entities,
    response,
  };
}

async function resolveOneAnchor(
  client: ReturnType<typeof createQlooClient>,
  plan: AnchorPlan,
): Promise<AnchorResolution> {
  let searchRequest: QlooRequestRecord = {
    method: "GET",
    path: "/search",
    query: { query: plan.label, types: plan.expectedTypes, take: plan.take },
  };
  let searchResponse: QlooSearchResponse | null = null;
  let candidates: QlooEntity[] = [];

  try {
    const search = await client.searchEntity({ query: plan.label, types: plan.expectedTypes, take: plan.take });
    searchRequest = search.request;
    searchResponse = search.response;
    candidates = entitiesFromResponse(search.response);
  } catch (error) {
    const message = getQlooErrorMessage(error);
    return {
      caregiverInput: plan.label,
      provenance: "KNOWN BY CAREGIVER",
      intendedType: plan.intendedType,
      expectedTypes: plan.expectedTypes,
      searchRequest,
      searchResponse: null,
      candidates: [],
      candidateAssessments: [],
      selected: null,
      resolutionSucceeded: false,
      state: "unresolved",
      confidence: 0,
      matchType: "none",
      selectedTypes: [],
      tagResolution: null,
      tags: [],
      error: message,
      notes: [`Anchor search failed: ${message}`],
    };
  }

  const resolution = resolveAnchor(plan.label, candidates, plan.expectedTypes);

  let tagResolution: TagResolution | null = null;
  try {
    const tagSearch = await client.searchTags(plan.label, 10);
    tagResolution = buildTagResolution(plan.label, tagSearch.request, tagSearch.response);
  } catch (error) {
    const message = getQlooErrorMessage(error);
    tagResolution = {
      query: plan.label,
      request: { method: "GET", path: "/v2/tags", query: { "filter.query": plan.label, take: 10 } },
      response: null,
      candidates: [],
      selected: null,
      state: "unresolved",
      confidence: 0,
      exactCandidateIds: [],
      notes: [`Tag search failed: ${message}`],
    };
  }

  const selected = resolution.selected;
  const notes = [...resolution.notes];
  if (!selected && tagResolution.state === "resolved" && tagResolution.selected) {
    notes.push(
      `Entity not force-resolved. Qloo offers an exact cultural tag: ${tagResolution.selected.name} [${tagIdOf(tagResolution.selected)}]. This is a tag/taste signal, not an artist entity.`,
    );
  }
  if (selected && tagResolution.selected) {
    notes.push(
      `Qloo also offers an exact tag signal: ${tagResolution.selected.name} [${tagIdOf(tagResolution.selected)}].`,
    );
  }

  return {
    caregiverInput: plan.label,
    provenance: "KNOWN BY CAREGIVER",
    intendedType: plan.intendedType,
    expectedTypes: plan.expectedTypes,
    searchRequest,
    searchResponse,
    candidates,
    candidateAssessments: resolution.assessments,
    selected,
    resolutionSucceeded: selected !== null,
    state: resolution.state,
    confidence: resolution.confidence,
    matchType: resolution.matchType,
    selectedTypes: selected
      ? [...new Set([...(Array.isArray(selected.types) ? selected.types : []), selected.subtype ?? ""].filter(Boolean))]
      : [],
    tagResolution,
    tags: [],
    error: resolution.error,
    notes,
  };
}

export async function buildTasteProfile(): Promise<TasteProfile> {
  ensureQlooConfigured();
  const client = createQlooClient();

  const anchors: AnchorResolution[] = [];
  const resolutionProbes: AnchorResolution[] = [];
  const anchorSearches: Array<QlooSearchResponse | null> = [];
  const anchorDetails: QlooEntitiesResponse[] = [];
  const tagSearches: QlooTagSearchResponse[] = [];
  const tagInsights: QlooTagInsightsResponse[] = [];
  const recommendationResponses: Array<{ category: string; response: QlooInsightsResponse | null }> = [];
  const limitations: string[] = [];
  const recommendationResults: QlooRecommendationResult[] = [];
  const culturalSignals: CulturalSignalGroup[] = [];
  const discoveredConnections: DiscoveredConnection[] = [];
  const supportedCategories: CategorySummary[] = [];

  const confidenceNotes: string[] = [
    "KNOWN BY CAREGIVER: Margaret Johnson is a fictional test profile; the remembered-interest strings are caregiver-supplied test data.",
    "DISCOVERED THROUGH QLOO: every entity, tag, affinity, popularity value, and explainability record in this profile comes from a real Qloo response; raw responses are retained under rawQloo.",
    "AGENT HYPOTHESIS: none generated in Phase 1. No LLM was used to invent recommendations or historical facts.",
    "Qloo affinities describe aggregate taste relationships, not proof that Margaret personally liked an entity or remembers it.",
  ];

  for (const plan of ANCHOR_PLANS) {
    const anchor = await resolveOneAnchor(client, plan);
    anchors.push(anchor);
    anchorSearches.push(anchor.searchResponse);
    if (anchor.tagResolution?.response) tagSearches.push(anchor.tagResolution.response);

    if (!anchor.resolutionSucceeded) {
      limitations.push(anchor.error ?? `Anchor resolution failed for ${plan.label}.`);
    }
    limitations.push(...anchor.notes.filter((note) => note.includes("not force-resolved")));
  }

  for (const plan of AMBIGUITY_PROBES) {
    const probe = await resolveOneAnchor(client, plan);
    resolutionProbes.push(probe);
    anchorSearches.push(probe.searchResponse);
    if (probe.tagResolution?.response) tagSearches.push(probe.tagResolution.response);
  }

  const resolvedAnchors = anchors.filter((anchor) => anchor.selected);
  if (resolvedAnchors.length > 0) {
    try {
      const details = await client.getEntityDetails(resolvedAnchors.map((anchor) => anchor.selected!.entity_id));
      anchorDetails.push(details.response);
      const detailsById = new Map(entitiesFromResponse(details.response).map((entity) => [entity.entity_id, entity]));
      for (const anchor of resolvedAnchors) {
        anchor.detailsRequest = details.request;
        anchor.detailsResponse = details.response;
        anchor.details = detailsById.get(anchor.selected!.entity_id) ?? null;
        anchor.tags = anchor.details?.tags ?? anchor.selected?.tags ?? [];
        if (!anchor.details) {
          limitations.push(`Qloo resolved ${anchor.caregiverInput}, but /entities returned no detail record for its ID.`);
        }
      }
    } catch (error) {
      const message = getQlooErrorMessage(error);
      limitations.push(`Anchor detail lookup failed: ${message}`);
      for (const anchor of resolvedAnchors) {
        anchor.detailsResponse = null;
        anchor.details = null;
        anchor.tags = anchor.selected?.tags ?? [];
        anchor.error = [anchor.error, message].filter(Boolean).join(" ");
      }
    }
  }

  // Cultural signals: documented tag taste analysis for each resolved anchor.
  let detroitCulturalSignals: CulturalSignalGroup | null = null;
  for (const anchor of resolvedAnchors) {
    const anchorId = anchor.selected!.entity_id;
    try {
      const insight = await client.getTagInsights({ anchorEntityIds: [anchorId], take: 50 });
      tagInsights.push(insight.response);
      culturalSignals.push(
        makeSignalGroup(anchor, insight.request, insight.response, [
          "Tag affinities are Qloo's tag-level taste estimates for this anchor; they are not caregiver statements.",
        ]),
      );
    } catch (error) {
      const message = getQlooErrorMessage(error);
      limitations.push(`Tag insight failed for ${anchor.caregiverInput}: ${message}`);
      culturalSignals.push(
        makeSignalGroup(
          anchor,
          { method: "GET", path: "/v2/insights", query: { "filter.type": "urn:tag", "signal.interests.entities": anchorId, take: 50 } },
          null,
          [message],
        ),
      );
    }
  }

  const supremesAnchor = anchors.find((anchor) => anchor.caregiverInput === "The Supremes" && anchor.selected);
  const motownAnchor = anchors.find((anchor) => anchor.caregiverInput === "Motown" && anchor.selected);
  const supremesId = supremesAnchor?.selected?.entity_id;
  const motownId = motownAnchor?.selected?.entity_id;

  if (supremesId) {
    try {
      const detroit = await client.getTagInsights({
        anchorEntityIds: [supremesId],
        locationQuery: DETROIT_QUERY,
        take: 20,
      });
      tagInsights.push(detroit.response);
      detroitCulturalSignals = makeSignalGroup(
        supremesAnchor!,
        detroit.request,
        detroit.response,
        [
          "Detroit-localized tag insight uses documented `signal.location.query`; it biases tag affinity toward the named locality.",
        ],
      );
    } catch (error) {
      limitations.push(`Detroit-localized tag insight failed: ${getQlooErrorMessage(error)}`);
    }
  }

  const runAndRecord = async (input: RecommendationRunInput) => {
    const run = await runRecommendation(client, input);
    recommendationResults.push(run.result);
    recommendationResponses.push({ category: input.category, response: run.response });
    limitations.push(...run.result.limitations.map((item) => `${input.category}: ${item}`));
    discoveredConnections.push(...buildConnections(input.category, run.entities, input.anchorIds));
    supportedCategories.push({
      category: input.category,
      filterType: input.filterType,
      usefulData: run.entities.length > 0,
      resultCount: run.entities.length,
      qlooRequest: run.result.qlooRequest,
      historicalFilterSupport: run.result.historicalFilter.documentedForType
        ? `Documented ${run.result.historicalFilter.field} filter`
        : run.result.historicalFilter.field === "era_tag"
          ? "No documented artist year filter; Qloo era tag used"
          : "No documented historical filter for this filter.type",
      limitations: run.result.limitations,
    });
    return run;
  };

  if (supremesId) {
    // Non-historical taste expansion: what Qloo connects to The Supremes.
    await runAndRecord({
      category: "related_artists",
      filterType: "urn:entity:artist",
      intent: "Expand The Supremes into related artists without a fabricated date filter.",
      anchorIds: [supremesId],
      requested: null,
      field: "none",
      note: "No date filter requested. Qloo documents no release_year filter for artists.",
    });

    // Historical music: Qloo has no artist release-year filter. Use era tags actually returned by Qloo.
    const supremesSignals = culturalSignals.find((group) => group.anchorEntityId === supremesId) ?? null;
    const eraSignals = supremesAnchor ? deriveEraSignals(supremesAnchor, supremesSignals) : [];
    if (eraSignals.length === 0) {
      limitations.push(
        "No era tag was present in Qloo's Supremes signals, so no era-tag-filtered historical music run was possible.",
      );
    }

    const eraEntities: RecommendedEntity[] = [];
    for (const era of eraSignals) {
      const run = await runAndRecord({
        category: `historical_music_${era.label}`,
        filterType: "urn:entity:artist",
        intent: `Filter artists with the Qloo era tag "${era.name}" (${era.tagId}) derived from The Supremes.`,
        anchorIds: [supremesId],
        requested: HISTORICAL_WINDOW,
        field: "era_tag",
        note: `Qloo documents no release_year filter for urn:entity:artist. This run sends documented filter.tags=${era.tagId}; the era is a Qloo tag, not a verified artist release year. Era tag came from ${era.source}.`,
        filterTags: [era.tagId],
      });
      eraEntities.push(...run.result.entities);
    }

    if (eraSignals.length > 0) {
      limitations.push(
        "Historical music is narrowed by Qloo era tags, not verified release years: artist entities expose no release_year, so era membership is a cultural signal rather than date proof.",
      );
      recommendationResults.push({
        category: "historical_music_era_merged",
        filterType: "urn:entity:artist",
        intent: "Deduplicated union of all era-tag-filtered artist runs.",
        qlooRequest: { method: "GET", path: "(multiple /v2/insights requests)", query: { "filter.tags": eraSignals.map((era) => era.tagId) } },
        qlooResponse: null,
        entities: dedupeEntities(eraEntities),
        aggregateExplainability: null,
        perEntityExplainabilityCount: dedupeEntities(eraEntities).filter((entity) => entity.qlooExplainability !== null).length,
        historicalFilter: {
          requested: HISTORICAL_WINDOW,
          documentedForType: false,
          appliedByQloo: true,
          field: "era_tag",
          resultsWithinPeriod: 0,
          resultsOutsidePeriod: 0,
          resultsWithUnknownYear: dedupeEntities(eraEntities).length,
          note: "Merged era-tag runs. Artist entities carry no release_year, so Qloo cannot verify an exact release date.",
        },
        limitations: ["Era tags narrow by cultural era, not by exact release year."],
      });
    }

    // Historical movies: documented release_year + release_country filters.
    await runAndRecord({
      category: "historical_movies",
      filterType: "urn:entity:movie",
      intent: "Find movies Qloo associates with The Supremes, released 1963–1973 in the United States.",
      anchorIds: [supremesId],
      requested: HISTORICAL_WINDOW,
      field: "release_year",
      note: "Sent documented filter.release_year.min/max and filter.release_country=United States for urn:entity:movie.",
      releaseYear: HISTORICAL_WINDOW,
      releaseCountry: ["United States"],
    });

    // Historical TV: same documented date filter.
    await runAndRecord({
      category: "historical_tv",
      filterType: "urn:entity:tv_show",
      intent: "Find TV shows Qloo associates with The Supremes, first released 1963–1973 in the United States.",
      anchorIds: [supremesId],
      requested: HISTORICAL_WINDOW,
      field: "release_year",
      note: "Sent documented filter.release_year.min/max and filter.release_country=United States for urn:entity:tv_show.",
      releaseYear: HISTORICAL_WINDOW,
      releaseCountry: ["United States"],
    });

    // Books: documented publication_year filter.
    await runAndRecord({
      category: "historical_books",
      filterType: "urn:entity:book",
      intent: "Find books Qloo associates with The Supremes, first published 1963–1973.",
      anchorIds: [supremesId],
      requested: HISTORICAL_WINDOW,
      field: "publication_year",
      note: "Sent documented filter.publication_year.min/max for urn:entity:book.",
      publicationYear: HISTORICAL_WINDOW,
    });

    // Places: documented locality filter; radius 0 keeps results inside Detroit.
    await runAndRecord({
      category: "detroit_places",
      filterType: "urn:entity:place",
      intent: "Find Detroit places Qloo associates with The Supremes.",
      anchorIds: [supremesId],
      requested: null,
      field: "none",
      note: "Sent documented filter.location.query=Detroit, Michigan and filter.location.radius=0 for urn:entity:place.",
      locationQuery: DETROIT_QUERY,
      locationRadiusMeters: 0,
    });

    // Cross-category brands: no historical filter exists; recorded honestly as non-historical.
    await runAndRecord({
      category: "cross_category_brands",
      filterType: "urn:entity:brand",
      intent: "Show cross-category brand affinity without pretending a historical filter exists.",
      anchorIds: [supremesId],
      requested: null,
      field: "none",
      note: "No documented historical date filter for urn:entity:brand; no date filter was sent.",
    });
  } else {
    limitations.push("The Supremes was not resolved, so no taste expansion or historical recommendation runs were attempted.");
  }

  if (motownId) {
    await runAndRecord({
      category: "motown_brand_related_artists",
      filterType: "urn:entity:artist",
      intent: "Use the exact Qloo Motown brand entity as a separate anchor, without pretending it is an artist.",
      anchorIds: [motownId],
      requested: null,
      field: "none",
      note: "Motown resolved as urn:entity:brand. It is used as a brand taste signal, not an artist entity.",
    });
  }

  const recommendedEntities = recommendationResults.flatMap((result) => result.entities);
  const historicalResults = recommendedEntities.filter((entity) => entity.historicalStatus === "inside_period");

  if (recommendedEntities.some((entity) => entity.historicalStatus === "unknown")) {
    limitations.push(
      "Some movie/TV/book results lacked a release/publication year in Qloo metadata, so they are not counted as verified historical results.",
    );
  }
  if (recommendedEntities.some((entity) => entity.historicalStatus === "outside_period")) {
    limitations.push(
      "Qloo returned at least one dated entity outside the requested year range; it is preserved but excluded from historicalResults.",
    );
  }
  if (discoveredConnections.some((connection) => !connection.explanationAvailable)) {
    limitations.push(
      "Some Qloo recommendations lack per-entity explainability, so no causal arrow is claimed for those records.",
    );
  }

  const tagSignalCount = culturalSignals.reduce((total, group) => total + group.signals.length, 0);

  return {
    person: {
      birthYear: MARGARET_TEST_PROFILE.birthYear,
      hometown: MARGARET_TEST_PROFILE.hometown,
      formativePeriod: MARGARET_TEST_PROFILE.formativePeriod,
    },
    caregiverKnown: {
      name: MARGARET_TEST_PROFILE.name,
      rememberedInterests: [...MARGARET_TEST_PROFILE.rememberedInterests],
    },
    provenance: {
      knownByCaregiver: {
        fields: {
          name: MARGARET_TEST_PROFILE.name,
          birthYear: MARGARET_TEST_PROFILE.birthYear,
          hometown: MARGARET_TEST_PROFILE.hometown,
          formativePeriod: MARGARET_TEST_PROFILE.formativePeriod,
          rememberedInterests: [...MARGARET_TEST_PROFILE.rememberedInterests],
        },
        note: "Supplied by the caregiver/test profile. Not inferred by Qloo.",
      },
      discoveredThroughQloo: {
        anchorEntityIds: resolvedAnchors.map((anchor) => anchor.selected!.entity_id),
        tagSignalCount,
        recommendationCount: recommendedEntities.length,
        note: "All values originate in Qloo responses and retain their raw records.",
      },
      agentHypotheses: {
        count: 0,
        note: "None in Phase 1. No LLM narrative or fabricated historical recommendation is included.",
      },
    },
    anchors,
    resolutionProbes,
    culturalSignals,
    detroitCulturalSignals,
    discoveredConnections,
    recommendedEntities,
    historicalResults,
    recommendationsByCategory: recommendationResults,
    supportedCategories,
    confidenceNotes,
    limitations: [...new Set(limitations)],
    rawQloo: {
      anchorSearches,
      anchorDetails,
      tagSearches,
      tagInsights,
      recommendationResponses,
    },
  };
}

export function typesForEntity(entity: QlooEntity): string[] {
  return [...new Set([...(Array.isArray(entity.types) ? entity.types : []), entity.subtype ?? ""].filter(Boolean))];
}

export function summarizeCandidate(assessment: CandidateAssessment): string {
  return `${assessment.name} [${assessment.entityId}] — ${assessment.reason}`;
}

export function entityDisplayType(entity: QlooEntity): string {
  const types = typesForEntity(entity);
  return types.find((type) => type.startsWith("urn:entity:")) ?? types[0] ?? "unknown";
}
