import type {
  QlooEntitiesResponse,
  QlooEntity,
  QlooInsightsResponse,
  QlooJson,
  QlooRequestRecord,
  QlooSearchResponse,
  QlooTag,
  QlooTagInsightsResponse,
  QlooTagSearchResponse,
  RecommendationInput,
  SearchEntityInput,
  TagInsightsInput,
} from "./types";

const DEFAULT_BASE_URL = "https://hackathon.api.qloo.com";
const DEFAULT_TIMEOUT_MS = 6_000;

export class QlooApiError extends Error {
  readonly status: number;
  readonly responseBody: unknown;
  readonly retryAfter: string | null;

  constructor(message: string, status: number, responseBody: unknown, retryAfter: string | null) {
    super(message);
    this.name = "QlooApiError";
    this.status = status;
    this.responseBody = responseBody;
    this.retryAfter = retryAfter;
  }
}

type QueryValue = string | number | boolean | string[] | undefined;

export interface QlooClient {
  searchEntity(input: SearchEntityInput): Promise<{ request: QlooRequestRecord; response: QlooSearchResponse }>;
  getEntityDetails(entityIds: string[]): Promise<{ request: QlooRequestRecord; response: QlooEntitiesResponse }>;
  getRecommendations(
    input: RecommendationInput,
  ): Promise<{ request: QlooRequestRecord; response: QlooInsightsResponse }>;
  getTagInsights(
    input: TagInsightsInput,
  ): Promise<{ request: QlooRequestRecord; response: QlooTagInsightsResponse }>;
  searchTags(query: string, take?: number, timeoutMs?: number): Promise<{ request: QlooRequestRecord; response: QlooTagSearchResponse }>;
}

/**
 * `/search` and `/entities` return `results` as a top-level array.
 * `/v2/insights` returns `results.entities`. Normalize both without discarding raw data.
 */
export function entitiesFromResponse(
  response: QlooSearchResponse | QlooInsightsResponse | null | undefined,
): QlooEntity[] {
  const results = response?.results;
  if (Array.isArray(results)) return results;
  if (results && Array.isArray(results.entities)) return results.entities;
  return [];
}

export function tagsFromResponse(
  response: QlooTagSearchResponse | QlooTagInsightsResponse | null | undefined,
): QlooTag[] {
  const results = response?.results;
  if (Array.isArray(results)) return results;
  if (results && Array.isArray(results.tags)) return results.tags;
  return [];
}

function readTimeout(): number {
  const value = Number(process.env.QLOO_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.max(DEFAULT_TIMEOUT_MS, value) : DEFAULT_TIMEOUT_MS;
}

function requireApiKey(): string {
  const key = process.env.QLOO_API_KEY?.trim();
  if (!key) {
    throw new Error("QLOO_API_KEY is not configured. Add it to a server-side .env file before running the experiment.");
  }
  return key;
}

export function ensureQlooConfigured(): void {
  requireApiKey();
}

function buildQuery(values: Record<string, QueryValue>): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, item);
    } else {
      searchParams.set(key, String(value));
    }
  }
  return searchParams;
}

function requestRecord(path: string, values: Record<string, QueryValue>): QlooRequestRecord {
  const query: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query[key] = value;
  }
  return { method: "GET", path, query };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { rawText: text };
  }
}

async function fetchJson<T>(path: string, values: Record<string, QueryValue>, timeoutMs?: number): Promise<{ request: QlooRequestRecord; data: T }> {
  const apiKey = requireApiKey();
  const baseUrl = (process.env.QLOO_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const params = buildQuery(values);
  const request = requestRecord(path, values);
  const url = `${baseUrl}${path}?${params.toString()}`;
  const requestTimeoutMs = timeoutMs ?? readTimeout();
  const maxAttempts = timeoutMs ? 1 : 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    let body: unknown;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(new Error(`Qloo request timed out after ${requestTimeoutMs}ms.`)), requestTimeoutMs);
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        signal: controller.signal,
        cache: "no-store",
      });
      body = await readResponseBody(response);
    } catch (error) {
      if (attempt < maxAttempts) continue;
      throw new Error(`Qloo request failed before receiving a response: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (response.ok) return { request, data: body as T };

    const retryable = response.status === 429 || response.status >=500;
    if (retryable && attempt < maxAttempts) continue;

    throw new QlooApiError(
      `Qloo returned HTTP ${response.status} for ${path}.`,
      response.status,
      body,
      response.headers.get("retry-after"),
    );
  }

  throw new Error("Qloo request failed after bounded retries.");
}

export function supportsReleaseYearFilter(filterType: string): boolean {
  return filterType === "urn:entity:movie" || filterType === "urn:entity:tv_show";
}

export function supportsPublicationYearFilter(filterType: string): boolean {
  return filterType === "urn:entity:book";
}

export function createQlooClient(): QlooClient {
  return {
    async searchEntity(input) {
      const values = {
        query: input.query,
        types: input.types,
        take: input.take ?? 5,
      };
      const result = await fetchJson<QlooSearchResponse>("/search", values, input.timeoutMs);
      return { request: result.request, response: result.data };
    },

    async getEntityDetails(entityIds) {
      const values = { entity_ids: entityIds };
      const result = await fetchJson<QlooEntitiesResponse>("/entities", values);
      return { request: result.request, response: result.data };
    },

    async getRecommendations(input) {
      // Lists use comma-separated documented values (OpenAPI `style: form, explode: false`).
      const values: Record<string, QueryValue> = {
        "filter.type": input.filterType,
        "feature.explainability": input.explainability ?? true,
        take: input.take ?? 10,
      };

      if (input.anchorEntityIds && input.anchorEntityIds.length > 0) {
        values["signal.interests.entities"] = input.anchorEntityIds.join(",");
      }
      if (input.anchorTagIds && input.anchorTagIds.length > 0) {
        values["signal.interests.tags"] = input.anchorTagIds.join(",");
      }
      if (input.filterTags && input.filterTags.length > 0) {
        values["filter.tags"] = input.filterTags.join(",");
      }
      if (input.locationQuery) {
        values["filter.location.query"] = input.locationQuery;
      }
      if (input.locationRadiusMeters !== undefined) {
        values["filter.location.radius"] = input.locationRadiusMeters;
      }
      if (input.releaseCountry && input.releaseCountry.length > 0) {
        values["filter.release_country"] = input.releaseCountry.join(",");
      }

      // These date filters are only documented for specific entity types.
      // Never send an unsupported filter and imply Qloo applied it.
      if (input.releaseYear && supportsReleaseYearFilter(input.filterType)) {
        values["filter.release_year.min"] = input.releaseYear.start;
        values["filter.release_year.max"] = input.releaseYear.end;
      }
      if (input.publicationYear && supportsPublicationYearFilter(input.filterType)) {
        values["filter.publication_year.min"] = input.publicationYear.start;
        values["filter.publication_year.max"] = input.publicationYear.end;
      }

      const result = await fetchJson<QlooInsightsResponse>("/v2/insights", values, input.timeoutMs);
      return { request: result.request, response: result.data };
    },

    async getTagInsights(input) {
      const values: Record<string, QueryValue> = {
        "filter.type": "urn:tag",
        take: input.take ?? 50,
      };

      if (input.anchorEntityIds && input.anchorEntityIds.length > 0) {
        values["signal.interests.entities"] = input.anchorEntityIds.join(",");
      }
      if (input.anchorTagIds && input.anchorTagIds.length > 0) {
        values["signal.interests.tags"] = input.anchorTagIds.join(",");
      }
      if (input.locationQuery) {
        values["signal.location.query"] = input.locationQuery;
      }
      if (input.parentTypes && input.parentTypes.length > 0) {
        values["filter.parents.types"] = input.parentTypes.join(",");
      }
      if (input.tagTypes && input.tagTypes.length > 0) {
        values["filter.tag.types"] = input.tagTypes.join(",");
      }

      const result = await fetchJson<QlooTagInsightsResponse>("/v2/insights", values, input.timeoutMs);
      return { request: result.request, response: result.data };
    },

    async searchTags(query, take = 10, timeoutMs) {
      const values: Record<string, QueryValue> = {
        "filter.query": query,
        take,
      };
      const result = await fetchJson<QlooTagSearchResponse>("/v2/tags", values, timeoutMs);
      return { request: result.request, response: result.data };
    },
  };
}

export function getQlooErrorMessage(error: unknown): string {
  if (error instanceof QlooApiError) {
    const body = error.responseBody as QlooJson | null;
    const detail = body && typeof body === "object" && typeof body.message === "string" ? body.message : undefined;
    const errors =
      body && typeof body === "object" && Array.isArray(body.errors)
        ? body.errors
            .map((item) => (item && typeof item === "object" && typeof item.message === "string" ? item.message : null))
            .filter((item): item is string => Boolean(item))
            .join(" ")
        : "";
    const extra = [detail, errors].filter(Boolean).join(" ");
    return `${error.message}${extra ? ` ${extra}` : ""}${error.retryAfter ? ` Retry-After: ${error.retryAfter}.` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}
