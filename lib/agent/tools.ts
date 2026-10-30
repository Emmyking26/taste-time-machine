import {
  entitiesFromResponse,
  getQlooErrorMessage,
  resolveAnchor,
  resolveTagCandidates,
  tagsFromResponse,
  type AnchorResolution,
  type QlooEntity,
  type QlooEntityType,
  type QlooTag,
  type RecommendationInput,
} from "@/lib/qloo";
import type { QlooGateway } from "./qloo-gateway";
import {
  dedupeSignals,
  extractEraSignals,
  normalizeEntitySignals,
  normalizeQlooSignal,
  preferenceSignalNames,
  signalsForEntity,
} from "./signals";
import type {
  AgentCandidate,
  CulturalSignal,
  DiscoverSignalsToolResult,
  FindCandidatesToolResult,
  ItemType,
  PersonProfile,
  ResolveAnchorToolResult,
} from "./types";

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

export function entityTypeOf(entity: QlooEntity): string | null {
  const types = [...(entity.types ?? []), entity.subtype ?? ""].filter(Boolean);
  return types.find((type) => type.startsWith("urn:entity:") && type !== "urn:entity") ?? types[0] ?? null;
}

function tagNames(entity: QlooEntity): string[] {
  return (entity.tags ?? [])
    .map((tag) => (typeof tag.name === "string" ? tag.name.trim() : ""))
    .filter((name): name is string => name.length > 0);
}

function locationQuery(profile: PersonProfile): string {
  return [profile.hometown.city, profile.hometown.state].filter(Boolean).join(", ");
}

function primaryArtistAnchor(profile: PersonProfile) {
  return profile.anchors.find((anchor) => anchor.entityType === "urn:entity:artist" && anchor.entityId) ?? null;
}

function motownTagId(profile: PersonProfile): string | null {
  const anchor = profile.anchors.find((item) => item.tagId && /motown/i.test(item.tagId));
  return anchor?.tagId ?? null;
}

const FOOD_TAGS = new Set([
  "restaurant",
  "food",
  "cuisine",
  "dish",
  "menu",
  "cocktail",
  "cocktails",
  "wine",
  "beer",
  "coffee",
  "dining",
  "snack",
  "meal",
  "brunch",
  "tavern",
  "grill",
  "kitchen",
  "bakery",
  "bar",
]);

/** Prefer a real food venue over a museum that happens to carry one restaurant tag. */
function foodPlaceScore(entity: QlooEntity): number {
  let score = 0;
  if (/\b(restaurant|tavern|grill|kitchen|cafe|bar|bakery|diner|pub|bistro|eatery)\b/i.test(entity.name)) score += 2;
  for (const tag of tagNames(entity)) {
    if (FOOD_TAGS.has(tag.toLowerCase())) score += 1;
  }
  return score;
}

function baseCandidate(
  entity: QlooEntity,
  input: {
    type: ItemType;
    historicalStatus: AgentCandidate["historicalStatus"];
    provenance: AgentCandidate["provenance"];
    reasonSeed: string;
    geographicContext?: string;
    auditId?: string;
    year?: number;
  },
): AgentCandidate {
  const entitySignals = normalizeEntitySignals(entity, input.auditId);
  const signalNames = preferenceSignalNames(entitySignals, 5);
  return {
    id: `${input.provenance}:${input.type}:${entity.entity_id}`,
    type: input.type,
    title: entity.name,
    entityId: entity.entity_id,
    entityType: entityTypeOf(entity) ?? undefined,
    ...(input.year !== undefined ? { year: input.year } : {}),
    affinity: readNumber(entity.query?.affinity) ?? undefined,
    popularity: typeof entity.popularity === "number" ? entity.popularity : undefined,
    tags: [...new Set(tagNames(entity))],
    signalNames,
    provenance: input.provenance,
    historicalStatus: input.historicalStatus,
    ...(input.geographicContext ? { geographicContext: input.geographicContext } : {}),
    reasonSeed: input.reasonSeed,
    ...(entity.query?.explainability ? { qlooExplainability: entity.query.explainability } : {}),
    ...(input.auditId ? { auditId: input.auditId } : {}),
    rawEntity: entity,
  };
}

function mergeCandidate(existing: AgentCandidate | undefined, incoming: AgentCandidate): AgentCandidate {
  if (!existing) return incoming;
  if (incoming.provenance === "caregiver" && existing.provenance !== "caregiver") return incoming;
  if (existing.provenance === "caregiver" && incoming.provenance !== "caregiver") return existing;
  return (incoming.affinity ?? -1) > (existing.affinity ?? -1) ? incoming : existing;
}

export class AgentTools {
  constructor(private readonly gateway: QlooGateway) {}

  async resolveCulturalAnchor(input: {
    text: string;
    preferredTypes?: QlooEntityType[];
  }): Promise<ResolveAnchorToolResult> {
    const preferredTypes = input.preferredTypes ?? [];
    const search = await this.gateway.searchEntity({
      query: input.text,
      ...(preferredTypes.length > 0 ? { types: preferredTypes } : {}),
      take: 10,
    });
    const candidates = entitiesFromResponse(search.data);
    const resolution = resolveAnchor(input.text, candidates, preferredTypes);

    let tagResolution = null;
    let tagCandidates: QlooTag[] = [];
    let tag: QlooTag | null = null;
    let tagAuditId: string | null = null;
    const shouldSearchTag = !resolution.selected || preferredTypes.includes("urn:entity:brand");
    if (shouldSearchTag) {
      try {
        const tagSearch = await this.gateway.searchTags(input.text, 10);
        const tagResult = resolveTagCandidates(input.text, tagsFromResponse(tagSearch.data));
        tagResolution = {
          ...tagResult,
          request: tagSearch.request,
          response: tagSearch.data,
        };
        tagCandidates = tagResult.candidates;
        tag = tagResult.selected;
        tagAuditId = tagSearch.auditId;
      } catch {
        // Tag search failure does not invalidate a resolved entity.
      }
    }

    const auditIds = [search.auditId, ...(tagAuditId ? [tagAuditId] : [])];
    const selected = resolution.selected;
    const anchorResolution: AnchorResolution = {
      caregiverInput: input.text,
      provenance: "KNOWN BY CAREGIVER",
      intendedType: preferredTypes.join(", ") || "unspecified",
      expectedTypes: preferredTypes,
      searchRequest: search.request,
      searchResponse: search.data,
      candidates,
      candidateAssessments: resolution.assessments,
      selected,
      resolutionSucceeded: selected !== null,
      state: resolution.state,
      confidence: resolution.confidence,
      matchType: resolution.matchType,
      selectedTypes: selected ? [...(selected.types ?? []), selected.subtype ?? ""].filter(Boolean) : [],
      tagResolution,
      tags: [],
      error: resolution.error,
      notes: resolution.notes,
    };

    return {
      text: input.text,
      state: resolution.state,
      entity: selected,
      entityType: selected ? entityTypeOf(selected) : null,
      confidence: resolution.confidence,
      matchType: resolution.matchType,
      notes: resolution.notes,
      candidates,
      tag,
      tagState: tagResolution?.state ?? "unresolved",
      tagCandidates,
      auditIds: [...new Set(auditIds)],
      resolution: anchorResolution,
      tagResolution,
    };
  }

  async discoverCulturalSignals(input: {
    anchorIds: string[];
    profileContext: PersonProfile;
  }): Promise<DiscoverSignalsToolResult> {
    const anchorIds = [...new Set(input.anchorIds.filter(Boolean))];
    if (anchorIds.length === 0) {
      return { signals: [], limitations: ["No resolved anchor entity IDs were available for Qloo signal discovery."], auditIds: [] };
    }

    const limitations: string[] = [];
    const auditIds: string[] = [];
    const signals: CulturalSignal[] = [];

    const detailsPromise = this.gateway
      .getEntityDetails(anchorIds)
      .then((result) => result)
      .catch((error: unknown) => {
        limitations.push(`Qloo entity details failed: ${getQlooErrorMessage(error)}`);
        return null;
      });

    const insightPromises = anchorIds.map((anchorId) =>
      this.gateway
        .getTagInsights({ anchorEntityIds: [anchorId], take: 50 })
        .then((result) => ({ anchorId, result }))
        .catch((error: unknown) => {
          limitations.push(`Qloo tag insight failed for ${anchorId}: ${getQlooErrorMessage(error)}`);
          return null;
        }),
    );

    const artist = primaryArtistAnchor(input.profileContext);
    const shouldLocalize = artist && /detroit/i.test(input.profileContext.hometown.city);
    const detroitPromise = shouldLocalize
      ? this.gateway
          .getTagInsights({
            anchorEntityIds: [artist.entityId!],
            locationQuery: locationQuery(input.profileContext),
            take: 20,
          })
          .catch((error: unknown) => {
            limitations.push(`Detroit-localized tag insight failed: ${getQlooErrorMessage(error)}`);
            return null;
          })
      : Promise.resolve(null);

    const [details, insights, detroit] = await Promise.all([detailsPromise, Promise.all(insightPromises), detroitPromise]);

    if (details) {
      auditIds.push(details.auditId);
      const entities = entitiesFromResponse(details.data);
      for (const entity of entities) {
        signals.push(...normalizeEntitySignals(entity, details.auditId));
      }
      if (entities.length === 0) limitations.push("Qloo returned no entity details for the resolved anchors.");
    }

    for (const insight of insights) {
      if (!insight) continue;
      auditIds.push(insight.result.auditId);
      const tags = tagsFromResponse(insight.result.data);
      for (const tag of tags) {
        const signal = normalizeQlooSignal(tag, insight.anchorId, "tag_insight", insight.result.auditId);
        if (signal) signals.push(signal);
      }
      if (tags.length === 0) limitations.push(`Qloo returned no tag signals for anchor ${insight.anchorId}.`);
    }

    if (detroit) {
      auditIds.push(detroit.auditId);
      const tags = tagsFromResponse(detroit.data);
      for (const tag of tags) {
        const signal = normalizeQlooSignal(tag, artist!.entityId!, "detroit_tag_insight", detroit.auditId);
        if (signal) signals.push(signal);
      }
    }

    const deduped = dedupeSignals(signals);
    if (deduped.length === 0) limitations.push("Qloo returned no usable cultural signals for the resolved anchors.");

    return {
      signals: deduped,
      limitations: [...new Set(limitations)],
      auditIds: [...new Set(auditIds)],
    };
  }

  async findHistoricalCandidates(input: {
    signals: CulturalSignal[];
    profileContext: PersonProfile;
    category: ItemType;
  }): Promise<FindCandidatesToolResult> {
    if (input.category === "conversation") {
      return { category: input.category, candidates: [], limitations: [], auditIds: [] };
    }

    const artist = primaryArtistAnchor(input.profileContext);
    if (!artist?.entityId) {
      return {
        category: input.category,
        candidates: [],
        limitations: ["No resolved artist anchor was available, so Qloo candidate generation was skipped."],
        auditIds: [],
      };
    }

    const window = {
      startYear: input.profileContext.formativePeriod.startYear,
      endYear: input.profileContext.formativePeriod.endYear,
    };
    const geo = locationQuery(input.profileContext);
    const limitations: string[] = [];
    const auditIds: string[] = [];
    const candidates: AgentCandidate[] = [];

    if (input.category === "music") {
      const eras = extractEraSignals(input.signals, window).slice(0, 2);
      const motown = motownTagId(input.profileContext);
      const runs: Array<Promise<{ entities: QlooEntity[]; auditId?: string; limitation?: string; eraLabel?: string }>> = [];

      const run = async (label: string, request: RecommendationInput, eraLabel?: string) => {
        try {
          const result = await this.gateway.getRecommendations(request);
          return { entities: entitiesFromResponse(result.data), auditId: result.auditId, ...(eraLabel ? { eraLabel } : {}) };
        } catch (error) {
          return { entities: [], limitation: `${label}: ${getQlooErrorMessage(error)}`, ...(eraLabel ? { eraLabel } : {}) };
        }
      };

      if (eras.length === 0) {
        runs.push(run("Qloo music fallback", {
          filterType: "urn:entity:artist",
          anchorEntityIds: [artist.entityId],
          take: 10,
          explainability: true,
        }));
      } else {
        for (const era of eras) {
          runs.push(run(`Qloo music ${era.label} (artist anchor)`, {
            filterType: "urn:entity:artist",
            anchorEntityIds: [artist.entityId],
            filterTags: [era.tagId],
            take: 8,
            explainability: true,
          }, era.label));
          if (motown) {
            runs.push(run(`Qloo music ${era.label} (Motown tag anchor)`, {
              filterType: "urn:entity:artist",
              anchorTagIds: [motown],
              filterTags: [era.tagId],
              take: 8,
              explainability: true,
            }, era.label));
          }
        }
      }

      const results = await Promise.all(runs);
      const byId = new Map<string, AgentCandidate>();
      for (const result of results) {
        if (result.auditId) auditIds.push(result.auditId);
        if (result.limitation) limitations.push(result.limitation);
        for (const entity of result.entities) {
          const eraLabel = result.eraLabel ?? null;
          const candidate = baseCandidate(entity, {
            type: "music",
            historicalStatus: eras.length > 0 ? "era_tag" : "unknown",
            provenance: "qloo",
            reasonSeed: `Qloo artist affinity with ${artist.name}${eraLabel ? ` under the Qloo era signal ${eraLabel}` : ""}.`,
            geographicContext: geo,
            ...(result.auditId ? { auditId: result.auditId } : {}),
          });
          byId.set(candidate.entityId!, mergeCandidate(byId.get(candidate.entityId!), candidate));
        }
      }

      const anchorSignals = signalsForEntity(input.signals, artist.entityId);
      const anchorMetadata = anchorSignals.filter((signal) => signal.metadata?.sourceKind === "entity_metadata");
      const anchorCandidate: AgentCandidate = {
        id: `caregiver:music:${artist.entityId}`,
        type: "music",
        title: artist.name ?? artist.text,
        entityId: artist.entityId,
        entityType: artist.entityType ?? "urn:entity:artist",
        ...(artist.resolution?.selected?.popularity ? { popularity: artist.resolution.selected.popularity } : {}),
        tags: [...new Set(anchorSignals.map((signal) => signal.name))],
        signalNames: preferenceSignalNames(anchorMetadata.length > 0 ? anchorMetadata : anchorSignals, 5),
        provenance: "caregiver",
        historicalStatus: "era_tag",
        geographicContext: geo,
        reasonSeed: `Caregiver listed “${artist.text}” as a remembered interest.`,
      };
      byId.set(anchorCandidate.entityId!, mergeCandidate(byId.get(anchorCandidate.entityId!), anchorCandidate));
      candidates.push(...byId.values());
      if (eras.length === 0) limitations.push("No Qloo era tag was available for music; the fallback artist run is not date-filtered.");
    }

    if (input.category === "film" || input.category === "tv") {
      const filterType: QlooEntityType = input.category === "film" ? "urn:entity:movie" : "urn:entity:tv_show";
      try {
        const result = await this.gateway.getRecommendations({
          filterType,
          anchorEntityIds: [artist.entityId],
          releaseYear: { start: window.startYear, end: window.endYear },
          releaseCountry: [input.profileContext.hometown.country],
          take: 10,
          explainability: true,
        });
        auditIds.push(result.auditId);
        for (const entity of entitiesFromResponse(result.data)) {
          const year = readNumber(entity.properties?.release_year) ?? undefined;
          const inside = year !== undefined && year >= window.startYear && year <= window.endYear;
          const candidate = baseCandidate(entity, {
            type: input.category,
            historicalStatus: year === undefined ? "unknown" : inside ? "inside_period" : "outside_period",
            provenance: "qloo",
            reasonSeed: `Qloo ${input.category === "film" ? "film" : "TV"} affinity with ${artist.name}${year !== undefined ? `, released ${year}` : ""}.`,
            geographicContext: input.profileContext.hometown.country,
            auditId: result.auditId,
            ...(year !== undefined ? { year } : {}),
          });
          candidates.push(candidate);
        }
      } catch (error) {
        limitations.push(`Qloo ${input.category} recommendation failed: ${getQlooErrorMessage(error)}`);
      }
    }

    if (input.category === "food") {
      try {
        const result = await this.gateway.getRecommendations({
          filterType: "urn:entity:place",
          anchorEntityIds: [artist.entityId],
          locationQuery: geo,
          locationRadiusMeters: 0,
          take: 10,
          explainability: true,
        });
        auditIds.push(result.auditId);
        const scored = entitiesFromResponse(result.data)
          .map((entity) => ({ entity, score: foodPlaceScore(entity) }))
          .filter((item) => item.score > 0);
        const bestScore = Math.max(0, ...scored.map((item) => item.score));
        const foodPlaces = scored.filter((item) => item.score === bestScore).map((item) => item.entity);
        for (const entity of foodPlaces) {
          candidates.push(
            baseCandidate(entity, {
              type: "food",
              historicalStatus: "not_date_verifiable",
              provenance: "qloo",
              reasonSeed: `Qloo food/place affinity with ${artist.name}, constrained to ${geo}. This is a place-level sensory cue, not a verified historical restaurant.`,
              geographicContext: geo,
              auditId: result.auditId,
            }),
          );
        }
        if (candidates.length === 0) {
          limitations.push(
            "Qloo has no urn:entity:food type, and the Detroit place results had no food-tagged place. The session will use a caregiver food cue instead.",
          );
        }
      } catch (error) {
        limitations.push(`Qloo food/place recommendation failed: ${getQlooErrorMessage(error)}`);
      }
    }

    return {
      category: input.category,
      candidates,
      limitations: [...new Set(limitations)],
      auditIds: [...new Set(auditIds)],
    };
  }
}
