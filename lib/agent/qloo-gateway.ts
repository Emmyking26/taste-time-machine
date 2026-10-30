import { randomUUID } from "node:crypto";
import { createQlooClient, type QlooClient } from "@/lib/qloo";
import type {
  QlooEntitiesResponse,
  QlooInsightsResponse,
  QlooRequestRecord,
  QlooSearchResponse,
  QlooTagInsightsResponse,
  QlooTagSearchResponse,
  RecommendationInput,
  SearchEntityInput,
  TagInsightsInput,
} from "@/lib/qloo";
import type { QlooAuditEntry } from "./types";

interface CachedCall<T> {
  result: T;
  request: QlooRequestRecord;
  audit: QlooAuditEntry;
}

export interface GatewayResult<T> {
  data: T;
  request: QlooRequestRecord;
  auditId: string;
  cached: boolean;
}

/**
 * Server-only Qloo gateway. Adds an in-process cache and an audit trail.
 * The browser never sees the Qloo client or the API key.
 */
export class QlooGateway {
  private readonly cache = new Map<string, CachedCall<unknown>>();
  private readonly audit: QlooAuditEntry[] = [];

  constructor(
    private readonly client: QlooClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async call<T>(
    tool: string,
    input: unknown,
    fetcher: () => Promise<{ request: QlooRequestRecord; response: T }>,
  ): Promise<GatewayResult<T>> {
    const cacheKey = `${tool}:${JSON.stringify(input)}`;
    const cached = this.cache.get(cacheKey) as CachedCall<T> | undefined;
    if (cached) return { data: cached.result, request: cached.request, auditId: cached.audit.id, cached: true };

    try {
      const { request, response } = await fetcher();
      const entry: QlooAuditEntry = {
        id: `qloo-${randomUUID()}`,
        tool,
        request,
        response,
        createdAt: this.now().toISOString(),
      };
      this.audit.push(entry);
      this.cache.set(cacheKey, { result: response, request, audit: entry });
      return { data: response, request, auditId: entry.id, cached: false };
    } catch (error) {
      this.cache.delete(cacheKey);
      throw error;
    }
  }

  searchEntity(input: SearchEntityInput): Promise<GatewayResult<QlooSearchResponse>> {
    return this.call("searchEntity", input, () => this.client.searchEntity(input));
  }

  getEntityDetails(entityIds: string[]): Promise<GatewayResult<QlooEntitiesResponse>> {
    return this.call("getEntityDetails", entityIds, () => this.client.getEntityDetails(entityIds));
  }

  getRecommendations(input: RecommendationInput): Promise<GatewayResult<QlooInsightsResponse>> {
    return this.call("getRecommendations", input, () => this.client.getRecommendations(input));
  }

  getTagInsights(input: TagInsightsInput): Promise<GatewayResult<QlooTagInsightsResponse>> {
    return this.call("getTagInsights", input, () => this.client.getTagInsights(input));
  }

  searchTags(query: string, take = 10, timeoutMs?: number): Promise<GatewayResult<QlooTagSearchResponse>> {
    return this.call("searchTags", { query, take, timeoutMs }, () => this.client.searchTags(query, take, timeoutMs));
  }

  auditCount(): number {
    return this.audit.length;
  }

  getAudit(): QlooAuditEntry[] {
    return [...this.audit];
  }
}

let defaultGateway: QlooGateway | null = null;

export function getDefaultGateway(): QlooGateway {
  defaultGateway ??= new QlooGateway(createQlooClient());
  return defaultGateway;
}

export function resetDefaultGatewayForTests(): void {
  defaultGateway = null;
}
