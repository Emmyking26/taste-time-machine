import { writeFileSync } from "node:fs";
import { buildTasteProfile, getQlooErrorMessage } from "../lib/qloo";
import type {
  AnchorResolution,
  CulturalSignalGroup,
  QlooEntity,
  QlooRecommendationResult,
  RecommendedEntity,
  TasteProfile,
} from "../lib/qloo";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  }
}

const JSON_OUTPUT = "qloo-experiment-results.json";

function mark(anchor: AnchorResolution): string {
  if (!anchor.resolutionSucceeded) return anchor.state === "ambiguous" ? "⚠" : "✗";
  if (anchor.expectedTypes.includes("urn:entity:artist") && !anchor.selectedTypes.includes("urn:entity:artist")) {
    return "⚠";
  }
  return "✓";
}

function num(value: number | null | undefined, digits = 3): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function year(value: number | null): string {
  return value === null ? "year unknown" : String(value);
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return [value];
  return [];
}

function entityType(entity: QlooEntity): string {
  const types = [...(Array.isArray(entity.types) ? entity.types : []), entity.subtype ?? ""].filter(Boolean);
  return types.find((type) => type.startsWith("urn:entity:") && type !== "urn:entity") ?? entity.subtype ?? types[0] ?? "unknown";
}

function tagLabel(entity: QlooEntity): string {
  const tags = entity.tags ?? [];
  if (tags.length === 0) return "tags(0)";
  const names = tags
    .map((tag) => (typeof tag.name === "string" ? tag.name : ""))
    .filter(Boolean)
    .slice(0, 8);
  return `tags(${tags.length}): ${names.join(", ")}${tags.length > names.length ? ", …" : ""}`;
}

function explainabilityLabel(entity: RecommendedEntity | QlooEntity): string {
  const explainability = (entity as RecommendedEntity).qlooExplainability ?? entity.query?.explainability;
  if (!explainability) return "explainability: none";
  const signals = (explainability as { "signal.interests.entities"?: Array<{ entity_id?: string; score?: number }> })[
    "signal.interests.entities"
  ];
  if (!Array.isArray(signals)) return `explainability: ${JSON.stringify(explainability)}`;
  return `explainability: ${signals
    .map((signal) => `${signal.entity_id ?? "?"}@${num(signal.score, 3)}`)
    .join(", ")}`;
}

function locationLabel(entity: QlooEntity): string {
  const geocode = entity.properties?.geocode as Record<string, unknown> | undefined;
  if (!geocode) return "";
  return [geocode.name, geocode.admin1_region, geocode.country_code]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(", ");
}

function printSignals(group: CulturalSignalGroup, perSubtypeLimit = 100): void {
  const subtypes = Object.entries(group.bySubtype).sort(([a], [b]) => a.localeCompare(b));
  for (const [subtype, signals] of subtypes) {
    console.log(`  [${subtype}]`);
    for (const signal of signals.slice(0, perSubtypeLimit)) {
      console.log(
        `    - ${signal.name} | affinity ${num(signal.affinity)} | popularity ${num(signal.popularity)} | ${signal.tagId}`,
      );
    }
    if (signals.length > perSubtypeLimit) {
      console.log(`    … ${signals.length - perSubtypeLimit} more in this subtype (full data in ${JSON_OUTPUT})`);
    }
  }
}

function printEntityTags(anchor: AnchorResolution): void {
  if (anchor.tags.length === 0) {
    console.log("  entity metadata tags: none returned");
    return;
  }
  const groups = new Map<string, string[]>();
  for (const tag of anchor.tags) {
    const type = typeof tag.type === "string" ? tag.type : "unknown";
    const name = typeof tag.name === "string" ? tag.name : "(unnamed)";
    const id = tag.tag_id ?? tag.id ?? tag.value ?? "";
    const list = groups.get(type) ?? [];
    list.push(`${name} [${String(id)}]`);
    groups.set(type, list);
  }
  for (const [type, values] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${type}: ${values.join(", ")}`);
  }
}

function printAnchor(anchor: AnchorResolution): void {
  const selected = anchor.selected;
  console.log(
    `${mark(anchor)} ${anchor.caregiverInput}${selected ? ` → ${selected.name} [${selected.entity_id}]` : ""}`,
  );
  console.log(`  intended: ${anchor.intendedType}`);
  console.log(`  state: ${anchor.state} | confidence: ${num(anchor.confidence)} | match: ${anchor.matchType}`);
  if (selected) {
    console.log(`  type(s): ${anchor.selectedTypes.join(", ") || "unknown"} | popularity: ${num(selected.popularity)}`);
    const description = selected.properties?.short_description ?? selected.properties?.description;
    if (typeof description === "string") console.log(`  description: ${description}`);
    console.log(`  entity tags preserved: ${anchor.tags.length}`);
  }
  if (anchor.error) console.log(`  reason: ${anchor.error}`);
  for (const note of anchor.notes) console.log(`  note: ${note}`);

  if (anchor.candidateAssessments.length > 0) {
    console.log("  raw candidates preserved (top 6 by score):");
    for (const assessment of [...anchor.candidateAssessments]
      .sort((a, b) => b.nameScore - a.nameScore)
      .slice(0, 6)) {
      const chosen = selected?.entity_id === assessment.entityId ? " ← SELECTED" : "";
      console.log(
        `    - ${assessment.name} [${assessment.entityId}] | ${assessment.nameMatch} ${num(assessment.nameScore)} | compatible=${assessment.typeCompatible} | pop ${num(assessment.popularity)}${chosen}`,
      );
      console.log(`      ${assessment.reason}`);
    }
  }

  if (anchor.tagResolution) {
    const tag = anchor.tagResolution.selected;
    console.log(
      `  Qloo tag resolution: ${anchor.tagResolution.state}${tag ? ` → ${String(tag.name)} [${String(tag.id ?? tag.tag_id ?? "")}]` : ""} | confidence ${num(anchor.tagResolution.confidence)}`,
    );
    for (const note of anchor.tagResolution.notes) console.log(`    ${note}`);
    if (anchor.tagResolution.candidates.length > 0) {
      console.log(
        `    tag candidates: ${anchor.tagResolution.candidates
          .slice(0, 6)
          .map((item) => `${String(item.name ?? "")}[${String(item.id ?? item.tag_id ?? "")}]`)
          .join(", ")}`,
      );
    }
  }
}

function printConnectionCategory(profile: TasteProfile, category: string): void {
  const result = profile.recommendationsByCategory.find((run) => run.category === category);
  if (!result) return;
  console.log(`\n${category} — ${result.entities.length} result(s)`);
  if (result.entities.length === 0) {
    console.log("  Qloo returned no entities.");
    return;
  }
  for (const entity of result.entities) {
    console.log(
      `  - ${entity.name} [${entity.entity_id}] | affinity ${num(entity.affinity)} | popularity ${num(entity.popularity)} | ${tagLabel(entity)}`,
    );
    console.log(`    ${explainabilityLabel(entity)}`);
  }
}

function printHistoricalResult(result: QlooRecommendationResult): void {
  console.log(`\n${result.category} — ${result.entities.length} result(s)`);
  console.log(`  intent: ${result.intent}`);
  console.log(`  Qloo request: ${JSON.stringify(result.qlooRequest.query)}`);
  console.log(
    `  filter: field=${result.historicalFilter.field} | documentedForType=${result.historicalFilter.documentedForType} | appliedByQloo=${result.historicalFilter.appliedByQloo} | inside=${result.historicalFilter.resultsWithinPeriod} outside=${result.historicalFilter.resultsOutsidePeriod} unknown=${result.historicalFilter.resultsWithUnknownYear}`,
  );
  console.log(`  note: ${result.historicalFilter.note}`);
  if (result.limitations.length > 0) {
    for (const limitation of result.limitations) console.log(`  limitation: ${limitation}`);
  }
  if (result.entities.length === 0) {
    console.log("  Qloo returned no entities.");
    return;
  }
  for (const entity of result.entities) {
    const yearValue = result.historicalFilter.field === "publication_year" ? entity.publicationYear : entity.releaseYear;
    const date = entity.properties?.release_date;
    const country = strings(entity.properties?.release_country);
    const genres = strings(entity.properties?.genres);
    const location = locationLabel(entity);
    console.log(
      `  - ${entity.name} [${entity.entity_id}] | ${entityType(entity)} | year ${yearValue === null ? "unknown" : String(yearValue)}${typeof date === "string" ? ` (${date})` : ""}${country.length > 0 ? ` | country ${country.join("/")}` : ""}${location ? ` | ${location}` : ""} | affinity ${num(entity.affinity)} | popularity ${num(entity.popularity)} | ${tagLabel(entity)}`,
    );
    if (genres.length > 0) console.log(`    genres: ${genres.join(", ")}`);
    console.log(`    ${explainabilityLabel(entity)}`);
  }
}

function printExplainability(profile: TasteProfile): void {
  for (const result of profile.recommendationsByCategory) {
    const aggregate = result.aggregateExplainability as
      | {
          "signal.interests.entities"?: {
            effect_on_top3_recs?: Array<{ entity_id?: string; avg_score?: number }>;
          };
        }
      | null;
    const top3 = aggregate?.["signal.interests.entities"]?.effect_on_top3_recs ?? [];
    const aggregateLabel =
      top3.length === 0
        ? "aggregate explainability: not returned"
        : top3.map((item) => `${item.entity_id ?? "?"} avg_score ${num(item.avg_score)}`).join(", ");
    console.log(
      `  ${result.category}: per-entity ${result.perEntityExplainabilityCount}/${result.entities.length} | ${aggregateLabel}`,
    );
  }
}

function renderReport(profile: TasteProfile): void {
  console.log("TASTE TIME MACHINE — PHASE 1 RESULTS");
  console.log("====================================");
  console.log("");

  console.log("PROFILE — KNOWN BY CAREGIVER");
  console.log(`  ${profile.caregiverKnown.name} | born ${profile.person.birthYear} | ${profile.person.hometown}`);
  console.log(`  formative period: ${profile.person.formativePeriod.start}–${profile.person.formativePeriod.end}`);
  console.log(`  remembered interests: ${profile.caregiverKnown.rememberedInterests.join(", ")}`);
  console.log(
    `  provenance: Qloo anchor IDs ${profile.provenance.discoveredThroughQloo.anchorEntityIds.length}, tag signals ${profile.provenance.discoveredThroughQloo.tagSignalCount}, recommendations ${profile.provenance.discoveredThroughQloo.recommendationCount}, agent hypotheses ${profile.provenance.agentHypotheses.count}`,
  );
  console.log("");

  console.log("ANCHOR RESOLUTION");
  for (const anchor of profile.anchors) {
    printAnchor(anchor);
    console.log("");
  }

  if (profile.resolutionProbes.length > 0) {
    console.log("AMBIGUITY GUARD — REAL QLOO PROBES");
    for (const probe of profile.resolutionProbes) printAnchor(probe);
    console.log("");
  }

  console.log("QLOO CULTURAL SIGNALS");
  for (const group of profile.culturalSignals) {
    console.log(`\n${group.anchorName} [${group.anchorEntityId}] — ${group.signals.length} tag signal(s)`);
    console.log(`  request: ${JSON.stringify(group.request.query)}`);
    printSignals(group);
    for (const limitation of group.limitations) console.log(`  limitation: ${limitation}`);
    const anchor = profile.anchors.find((item) => item.selected?.entity_id === group.anchorEntityId);
    if (anchor) {
      console.log("  entity metadata tags (preserved from Qloo):");
      printEntityTags(anchor);
    }
  }
  if (profile.detroitCulturalSignals) {
    console.log(
      `\nDetroit-localized signals for ${profile.detroitCulturalSignals.anchorName} — ${profile.detroitCulturalSignals.signals.length} tag(s)`,
    );
    console.log(`  request: ${JSON.stringify(profile.detroitCulturalSignals.request.query)}`);
    printSignals(profile.detroitCulturalSignals, 20);
  }
  console.log("");

  console.log("DISCOVERED CONNECTIONS");
  printConnectionCategory(profile, "related_artists");
  printConnectionCategory(profile, "motown_brand_related_artists");
  console.log("");

  console.log("HISTORICAL MUSIC");
  const eraSignals = profile.recommendationsByCategory.filter(
    (run) => run.category.startsWith("historical_music_") && run.category !== "historical_music_era_merged",
  );
  if (eraSignals.length === 0) {
    console.log("  No era-tag historical music run was possible.");
  } else {
    for (const run of eraSignals) {
      printHistoricalResult(run);
    }
  }
  console.log("");

  console.log("HISTORICAL MOVIES");
  const movies = profile.recommendationsByCategory.find((run) => run.category === "historical_movies");
  if (movies) printHistoricalResult(movies);
  console.log("");

  console.log("HISTORICAL TV");
  const tv = profile.recommendationsByCategory.find((run) => run.category === "historical_tv");
  if (tv) printHistoricalResult(tv);
  console.log("");

  console.log("OTHER CULTURAL SIGNALS");
  for (const category of ["historical_books", "detroit_places", "cross_category_brands"]) {
    const run = profile.recommendationsByCategory.find((item) => item.category === category);
    if (run) printHistoricalResult(run);
  }
  console.log("");

  console.log("EXPLAINABILITY");
  printExplainability(profile);
  const sample = profile.recommendationsByCategory.find((run) => run.entities.some((entity) => entity.qlooExplainability));
  const sampleEntity = sample?.entities.find((entity) => entity.qlooExplainability);
  if (sampleEntity) {
    console.log(`  sample per-entity payload (${sampleEntity.name}): ${JSON.stringify(sampleEntity.qlooExplainability)}`);
  }
  console.log("");

  console.log("WHAT QLOO DOES WELL");
  const successfulCategories = profile.supportedCategories.filter((category) => category.usefulData);
  console.log(
    `  - Exact entity search: ${profile.anchors.filter((anchor) => anchor.resolutionSucceeded).map((anchor) => anchor.caregiverInput).join(", ") || "none"}.`,
  );
  console.log("  - Tag-level taste analysis with numeric affinities through filter.type=urn:tag + signal.interests.entities.");
  console.log("  - Cross-category recommendations with affinity, popularity, and per-entity explainability.");
  console.log("  - Documented date filtering for movies/TV (release_year) and books (publication_year).");
  console.log("  - Documented country filtering for movies/TV (release_country).");
  console.log("  - Documented locality filtering for places (filter.location.query + filter.location.radius).");
  console.log("  - Era tags as a music-era signal when no artist release-year filter exists.");
  console.log(`  - Categories with usable output in this run: ${successfulCategories.map((category) => `${category.category}(${category.resultCount})`).join(", ") || "none"}.`);
  console.log("");

  console.log("WHAT QLOO CANNOT PROVIDE");
  console.log("  - No release_year/active-year filter for urn:entity:artist; sending filter.release_year to artists is silently ignored.");
  console.log("  - No historical date filter for brands or places; those results are contemporary affinity, not period evidence.");
  console.log("  - Artist entities do not expose a release/active year, so exact historical verification of music is impossible from Qloo alone.");
  console.log("  - Explainability is input-entity attribution, not a human-readable semantic reason such as “because she loved Motown”.");
  console.log("  - Affinity is not personal memory or proof of individual preference; it is aggregate taste association.");
  console.log("  - Tag search returns duplicate names across namespaces, so exact tag selection needs explicit disambiguation metadata.");
  console.log("  - Some entities lack popularity or release-year metadata; absence must not be treated as a match.");
  console.log("  - `signal.location.query` biases taste toward a locality; it does not constrain place results to that locality. Use `filter.location.query` for that.");
  console.log("  - Qloo does not label a recommendation as “historically authentic for Margaret”; that would be an agent hypothesis.");
  console.log("");

  console.log("PRODUCT IMPLICATIONS");
  console.log("  - Resolution must be scored, type-aware, and allowed to return ambiguous/unresolved; never take results[0].");
  console.log("  - Keep KNOWN BY CAREGIVER, DISCOVERED THROUGH QLOO, and AGENT HYPOTHESIS as separate ledgers in the data model and UI.");
  console.log("  - Use Qloo tag insights for cultural reconstruction and era cues; use documented date/country filters for films, TV, and books.");
  console.log("  - Do not claim historical music dates from Qloo; present era-tag evidence and label it as an era signal.");
  console.log("  - For places, choose filter.location.query (constraint) vs signal.location.query (taste bias) deliberately.");
  console.log("  - Preserve raw Qloo candidates and responses as evidence behind every claim.");
  console.log("  - Build caregiver disambiguation for concepts like Motown instead of forcing an artist match.");
  console.log("  - Cache and budget Qloo calls (the Detroit place call took ~18s in probing).");
  console.log("");
}

function renderLimitations(profile: TasteProfile): void {
  console.log("LIMITATIONS");
  for (const limitation of profile.limitations) console.log(`- ${limitation}`);
  console.log("");
}

async function main(): Promise<void> {
  try {
    const profile = await buildTasteProfile();
    renderReport(profile);
    renderLimitations(profile);
    writeFileSync(JSON_OUTPUT, JSON.stringify(profile, null, 2), "utf8");
    console.log(`Full structured evidence written to ${JSON_OUTPUT}`);
  } catch (error) {
    console.error(`Qloo experiment failed: ${getQlooErrorMessage(error)}`);
    console.error(JSON.stringify({ error: "Qloo experiment did not run.", detail: getQlooErrorMessage(error) }, null, 2));
    process.exitCode = 1;
  }
}

void main();
