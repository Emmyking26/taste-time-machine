export type QlooEntityType =
  | "urn:entity:artist"
  | "urn:entity:movie"
  | "urn:entity:tv_show"
  | "urn:entity:place"
  | "urn:entity:brand"
  | "urn:entity:book"
  | "urn:entity:destination"
  | "urn:entity:person"
  | "urn:entity:podcast"
  | "urn:entity:videogame";

export type QlooJson = Record<string, unknown>;

export interface QlooTag {
  /** Tag search returns `id`; entity metadata returns `tag_id`. */
  id?: string;
  tag_id?: string;
  name?: string;
  /** Tag search returns `type`; entity metadata returns `type`. */
  type?: string;
  subtype?: string;
  tag_value?: string;
  value?: string;
  types?: string[];
  parents?: Array<{ type?: string; [key: string]: unknown }>;
  properties?: QlooJson;
  popularity?: number;
  query?: QlooJson;
  [key: string]: unknown;
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  /**
   * `/search` returns `types: ["urn:entity:artist"]`.
   * `/v2/insights` returns `types: ["urn:entity"]` plus `subtype: "urn:entity:artist"`.
   */
  types?: string[];
  type?: string;
  subtype?: string;
  properties?: QlooJson;
  tags?: QlooTag[];
  external?: QlooJson;
  popularity?: number | null;
  disambiguation?: string;
  query?: QlooJson;
  [key: string]: unknown;
}

export interface QlooEntityCollection {
  entities?: QlooEntity[];
  tags?: QlooTag[];
  [key: string]: unknown;
}

/**
 * `/search` and `/entities` return `{ results: QlooEntity[] }`.
 * We also accept `{ results: { entities: [...] } }` defensively.
 */
export interface QlooSearchResponse {
  success?: boolean;
  results?: QlooEntity[] | QlooEntityCollection;
  query?: QlooJson;
  duration?: number;
  [key: string]: unknown;
}

export interface QlooEntitiesResponse extends QlooSearchResponse {}

export interface QlooInsightsResponse {
  success?: boolean;
  results?: QlooEntityCollection;
  query?: QlooJson;
  duration?: number;
  errors?: unknown;
  warnings?: unknown;
  [key: string]: unknown;
}

export interface QlooTagSearchResponse {
  success?: boolean;
  results?: { tags?: QlooTag[]; [key: string]: unknown } | QlooTag[];
  query?: QlooJson;
  duration?: number;
  errors?: unknown;
  [key: string]: unknown;
}

export interface QlooTagInsightsResponse {
  success?: boolean;
  results?: { tags?: QlooTag[]; [key: string]: unknown };
  query?: QlooJson;
  duration?: number;
  errors?: unknown;
  [key: string]: unknown;
}

export interface SearchEntityInput {
  query: string;
  types?: QlooEntityType[];
  take?: number;
  timeoutMs?: number;
}

export interface RecommendationInput {
  filterType: QlooEntityType;
  anchorEntityIds?: string[];
  anchorTagIds?: string[];
  /** Documented `filter.location.query`; resolves a named locality, not free text. */
  locationQuery?: string;
  /** Documented `filter.location.radius`. Set 0 to stay inside the locality boundary. */
  locationRadiusMeters?: number;
  releaseYear?: { start: number; end: number };
  publicationYear?: { start: number; end: number };
  releaseCountry?: string[];
  /** Documented `filter.tags`; values must come from Qloo (`/v2/tags` or entity metadata). */
  filterTags?: string[];
  take?: number;
  explainability?: boolean;
  /** Per-request transport timeout; omitted from Qloo query parameters. */
  timeoutMs?: number;
}

export interface TagInsightsInput {
  anchorEntityIds?: string[];
  anchorTagIds?: string[];
  /** Documented `signal.location.query` for tag taste analysis. */
  locationQuery?: string;
  parentTypes?: QlooEntityType[];
  tagTypes?: string[];
  take?: number;
  /** Per-request transport timeout; omitted from Qloo query parameters. */
  timeoutMs?: number;
}

export interface QlooRequestRecord {
  method: "GET";
  path: string;
  query: Record<string, string | number | boolean | string[]>;
}

export type NameMatchType =
  | "exact"
  | "exact_ignoring_article"
  | "token_subset"
  | "fuzzy"
  | "none";

export type ResolutionState = "resolved" | "ambiguous" | "unresolved";

export interface CandidateAssessment {
  entityId: string;
  name: string;
  normalizedName: string;
  candidateTypes: string[];
  nameMatch: NameMatchType;
  nameScore: number;
  typeCompatible: boolean;
  popularity: number | null;
  confidence: number;
  eligible: boolean;
  reason: string;
}

export interface TagResolution {
  query: string;
  request: QlooRequestRecord;
  response: QlooTagSearchResponse | null;
  candidates: QlooTag[];
  selected: QlooTag | null;
  state: ResolutionState;
  confidence: number;
  exactCandidateIds: string[];
  notes: string[];
}

export interface AnchorResolution {
  caregiverInput: string;
  provenance: "KNOWN BY CAREGIVER";
  intendedType: string;
  expectedTypes: QlooEntityType[];
  searchRequest: QlooRequestRecord;
  searchResponse: QlooSearchResponse | null;
  /** Every raw candidate returned by Qloo, untouched. */
  candidates: QlooEntity[];
  candidateAssessments: CandidateAssessment[];
  selected: QlooEntity | null;
  resolutionSucceeded: boolean;
  state: ResolutionState;
  confidence: number;
  matchType: NameMatchType | "tag_exact" | "none";
  selectedTypes: string[];
  tagResolution: TagResolution | null;
  tags: QlooTag[];
  detailsRequest?: QlooRequestRecord;
  detailsResponse?: QlooEntitiesResponse | null;
  details?: QlooEntity | null;
  error?: string;
  notes: string[];
}

export interface CulturalSignal {
  tagId: string;
  name: string;
  type: string | null;
  subtype: string | null;
  appliesTo: string[];
  popularity: number | null;
  affinity: number | null;
  source: "Qloo tag insight for resolved anchor" | "Qloo entity metadata";
  raw: QlooTag;
}

export interface CulturalSignalGroup {
  anchorName: string;
  anchorEntityId: string;
  request: QlooRequestRecord;
  response: QlooTagInsightsResponse | null;
  signals: CulturalSignal[];
  bySubtype: Record<string, CulturalSignal[]>;
  limitations: string[];
}

export interface HistoricalFilterReport {
  requested: { start: number; end: number } | null;
  /** Whether Qloo documents a date-range filter for this filter.type. */
  documentedForType: boolean;
  /** Whether this request actually sent a date filter that Qloo honors. */
  appliedByQloo: boolean;
  field: "release_year" | "publication_year" | "era_tag" | "none";
  resultsWithinPeriod: number;
  resultsOutsidePeriod: number;
  resultsWithUnknownYear: number;
  note: string;
}

export interface RecommendedEntity extends QlooEntity {
  category: string;
  source: "DISCOVERED THROUGH QLOO";
  historicalStatus:
    | "inside_period"
    | "outside_period"
    | "unknown"
    | "not_requested"
    | "era_tag_only";
  releaseYear: number | null;
  publicationYear: number | null;
  affinity: number | null;
  qlooExplainability?: unknown;
}

export interface QlooRecommendationResult {
  category: string;
  filterType: QlooEntityType;
  intent: string;
  qlooRequest: QlooRequestRecord;
  qlooResponse: QlooInsightsResponse | null;
  entities: RecommendedEntity[];
  aggregateExplainability: unknown;
  perEntityExplainabilityCount: number;
  historicalFilter: HistoricalFilterReport;
  limitations: string[];
}

export interface DiscoveredConnection {
  recommendationEntityId: string;
  recommendationName: string;
  category: string;
  requestedAnchorIds: string[];
  qlooExplainability: unknown;
  qlooQueryMetadata: QlooJson | null;
  affinity: number | null;
  explanationAvailable: boolean;
}

export interface CategorySummary {
  category: string;
  filterType: QlooEntityType;
  usefulData: boolean;
  resultCount: number;
  qlooRequest: QlooRequestRecord;
  historicalFilterSupport: string;
  limitations: string[];
}

export interface Provenance {
  knownByCaregiver: {
    fields: Record<string, unknown>;
    note: string;
  };
  discoveredThroughQloo: {
    anchorEntityIds: string[];
    tagSignalCount: number;
    recommendationCount: number;
    note: string;
  };
  agentHypotheses: {
    count: 0;
    note: string;
  };
}

export interface TasteProfile {
  person: {
    birthYear: number;
    hometown: string;
    formativePeriod: { start: number; end: number };
  };
  caregiverKnown: {
    name: string;
    rememberedInterests: string[];
  };
  provenance: Provenance;
  anchors: AnchorResolution[];
  /** Real Qloo requests that prove ambiguous caregiver input is not force-resolved. */
  resolutionProbes: AnchorResolution[];
  culturalSignals: CulturalSignalGroup[];
  detroitCulturalSignals: CulturalSignalGroup | null;
  discoveredConnections: DiscoveredConnection[];
  recommendedEntities: RecommendedEntity[];
  historicalResults: RecommendedEntity[];
  recommendationsByCategory: QlooRecommendationResult[];
  supportedCategories: CategorySummary[];
  confidenceNotes: string[];
  limitations: string[];
  rawQloo: {
    anchorSearches: Array<QlooSearchResponse | null>;
    anchorDetails: QlooEntitiesResponse[];
    tagSearches: QlooTagSearchResponse[];
    tagInsights: QlooTagInsightsResponse[];
    recommendationResponses: Array<{
      category: string;
      response: QlooInsightsResponse | null;
    }>;
  };
}
