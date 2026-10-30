import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMemoryClues,
  filterInvestigationCandidates,
  generateFollowUpQuestion,
  investigateMemory,
  mergeMemoryClues,
  scoreInvestigationCandidate,
  voiceOutputText,
  type InvestigationCandidate,
} from "../lib/investigation";
import { QlooGateway } from "../lib/agent/qloo-gateway";
import type { QlooClient, QlooEntity, QlooRequestRecord } from "../lib/qloo";

const SUPREMES: QlooEntity = {
  entity_id: "supremes-entity",
  name: "The Supremes",
  types: ["urn:entity:artist"],
  popularity: 0.98,
  tags: [{ id: "urn:tag:genre:music:soul", name: "Soul", type: "urn:tag:genre:music" }],
};

const DIANA: QlooEntity = {
  entity_id: "diana-entity",
  name: "Diana Ross",
  types: ["urn:entity:artist"],
  popularity: 0.9,
  tags: [{ id: "urn:tag:genre:music:motown", name: "Motown", type: "urn:tag:genre:music" }],
};

function request(path: string): QlooRequestRecord {
  return { method: "GET", path, query: {} };
}

function fakeQloo(): QlooGateway {
  const client: QlooClient = {
    async searchEntity(input) {
      const entities = input.query.toLowerCase().includes("supremes") ? [SUPREMES] : input.query.toLowerCase().includes("detroit") ? [{ entity_id: "detroit-entity", name: "Detroit", types: ["urn:entity:place"] }] : [];
      return { request: request("/search"), response: { results: entities } };
    },
    async getEntityDetails() {
      return { request: request("/entities"), response: { results: [SUPREMES] } };
    },
    async getRecommendations() {
      return { request: request("/v2/insights"), response: { results: { entities: [SUPREMES, DIANA] } } };
    },
    async getTagInsights() {
      return { request: request("/v2/insights"), response: { results: { tags: [{ id: "urn:tag:genre:music:soul", name: "Soul", type: "urn:tag:genre:music", query: { affinity: 0.96 } }, { id: "urn:tag:genre:music:motown", name: "Motown", type: "urn:tag:genre:music", query: { affinity: 0.94 } }] } } };
    },
    async searchTags() {
      return { request: request("/v2/tags"), response: { results: { tags: [{ id: "urn:tag:genre:music:70s", name: "70s", type: "urn:tag:genre:music" }] } } };
    },
  };
  return new QlooGateway(client);
}

test("memory fragments become uncertain, editorial clues", () => {
  const result = extractMemoryClues("My dad played this song at home in Detroit in the seventies. I remember a woman singing, maybe a group.");
  assert.equal(result.memoryType, "music");
  assert.ok(result.clues.some((item) => item.value === "1970s" && item.certainty === "approximate"));
  assert.ok(result.clues.some((item) => item.value === "Detroit"));
  assert.ok(result.clues.some((item) => item.value === "Female vocalist" && item.certainty === "uncertain"));
  assert.ok(result.clues.some((item) => item.value === "Group" && item.certainty === "uncertain"));
});

test("correction replaces uncertainty without erasing remembered context", () => {
  const first = extractMemoryClues("A woman singing, maybe a group, from the seventies.").clues;
  const correction = extractMemoryClues("No, it was one woman.").clues;
  const merged = mergeMemoryClues(first, correction);
  assert.equal(merged.find((item) => item.id === "format")?.value, "Solo singer");
  assert.equal(merged.find((item) => item.id === "format")?.certainty, "remembered");
  assert.equal(merged.find((item) => item.id === "era")?.value, "1970s");
});

test("one human follow-up question is generated for an ambiguous singer format", () => {
  const clues = extractMemoryClues("A woman singing, maybe a group.").clues;
  const question = generateFollowUpQuestion("music", clues, []);
  assert.equal(question, "Do you remember if it was one singer or a group?");
  const candidate = {} as InvestigationCandidate;
  assert.notEqual(generateFollowUpQuestion("music", mergeMemoryClues(clues, extractMemoryClues("Definitely a group.").clues), [candidate]), "Do you remember if it was one singer or a group?");
});

test("candidate scoring and rejection stay explainable", () => {
  const clues = extractMemoryClues("A seventies Detroit song.").clues;
  const score = scoreInvestigationCandidate(SUPREMES, clues, ["Soul", "Motown"], 0.94);
  assert.ok(score > 0.5);
  const candidate: InvestigationCandidate = { id: "qloo:supremes-entity", entityId: SUPREMES.entity_id, title: SUPREMES.name, type: "music", strength: "strong_match", explanation: "Qloo evidence.", context: ["Soul"], signalNames: ["Soul"], provenance: "qloo", qlooEvidence: { requestIds: ["audit-1"] } };
  assert.equal(filterInvestigationCandidates([candidate], [candidate.id]).length, 0);
  assert.equal(filterInvestigationCandidates([candidate], []).length, 1);
});

test("investigation uses Qloo resolution, candidate generation, provenance, refinement, and confirmation", async () => {
  const gateway = fakeQloo();
  const first = await investigateMemory({ transcript: "My dad played The Supremes in Detroit in the seventies. I remember a woman singing, maybe a group." }, gateway);
  assert.equal(first.investigationStatus, "needs_clarification");
  assert.ok(first.resolvedAnchors.some((anchor) => anchor.name === "The Supremes"));
  assert.ok(first.provenance.qlooCalls > 0);
  assert.ok(first.provenance.qlooRequestIds.length > 0);

  const refined = await investigateMemory({ transcript: "Definitely a group.", previousClues: first.clues }, gateway);
  assert.ok(refined.candidates.length > 0);
  assert.equal(refined.investigationStatus, "candidates");
  assert.ok(refined.candidates.every((candidate) => candidate.provenance === "qloo"));

  const confirmed = await investigateMemory({ transcript: "Yes, that's it.", previousClues: refined.clues, confirmedCandidateId: refined.candidates[0].id }, gateway);
  assert.equal(confirmed.investigationStatus, "confirmed");
  assert.equal(voiceOutputText(confirmed), confirmed.spokenResponse);
});
