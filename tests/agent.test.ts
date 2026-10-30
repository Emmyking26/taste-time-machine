import assert from "node:assert/strict";
import test from "node:test";
import { resolveAnchor, type QlooEntity } from "../lib/qloo";
import {
  applyCaregiverFeedback,
  buildFeedbackContext,
  classifyMemories,
  composeSession,
  createMargaretProfile,
  isCandidateSuppressed,
  normalizeQlooSignal,
  scoreCandidate,
} from "../lib/agent";
import type { AgentCandidate, PersonProfile, Session, SessionItem } from "../lib/agent";

const SUPREMES: QlooEntity = {
  entity_id: "689CFC2A-A743-4CCB-998F-808A68880612",
  name: "The Supremes",
  types: ["urn:entity:artist"],
  popularity: 0.994,
};

const SUPREMES_CANDIDATES: QlooEntity[] = [
  SUPREMES,
  {
    entity_id: "CA138458-D66C-4BB5-902A-9CDF2464FBBA",
    name: "Les Suprêmes Dindes",
    types: ["urn:entity:artist"],
    popularity: 0.442,
  },
  {
    entity_id: "D9A78C90-218F-4C91-BF3A-BAB3849BF571",
    name: "Diana Ross and the Supremes",
    types: ["urn:entity:artist"],
    popularity: 0.987,
  },
  {
    entity_id: "552A6001-D61A-40AE-8DF0-F4927AF852F7",
    name: "The Supremes & The Temptations",
    types: ["urn:entity:artist"],
    popularity: 0.161,
  },
];

const MOTOWN_BRAND: QlooEntity = {
  entity_id: "D55B1CF3-7CA8-4991-AD79-AC7B76C43A83",
  name: "Motown",
  types: ["urn:entity:brand"],
  popularity: 0.944,
};

const MOTOWN_ARTIST_CANDIDATES: QlooEntity[] = [
  {
    entity_id: "3499185E-7912-45A4-84A6-260474E7ACD9",
    name: "Motown Masters",
    types: ["urn:entity:artist"],
    popularity: 0.754,
  },
  {
    entity_id: "8FB0E1DC-6B9E-41A1-AED6-1F4A89190BD1",
    name: "Motown Rage",
    types: ["urn:entity:artist"],
    popularity: 0.438,
  },
  {
    entity_id: "F9FED230-4D2D-4B83-A06C-DE5F30FBF47B",
    name: "Motown Magic",
    types: ["urn:entity:artist"],
    popularity: 0.242,
  },
];

function profileForTests(): PersonProfile {
  const profile = createMargaretProfile("2026-01-01T00:00:00.000Z");
  profile.anchors = [
    {
      id: "anchor-supremes",
      text: "The Supremes",
      entityId: SUPREMES.entity_id,
      name: SUPREMES.name,
      entityType: "urn:entity:artist",
      state: "resolved",
      confidence: 1,
      provenance: "caregiver",
    },
    {
      id: "anchor-motown",
      text: "Motown",
      entityId: MOTOWN_BRAND.entity_id,
      name: MOTOWN_BRAND.name,
      entityType: "urn:entity:brand",
      state: "resolved",
      confidence: 1,
      provenance: "caregiver",
      tagId: "urn:tag:genre:music:motown",
      tagName: "Motown",
      tagState: "resolved",
    },
  ];
  profile.discoveredSignals = [
    {
      source: "qloo",
      name: "Motown",
      id: "urn:tag:genre:music:motown",
      namespace: "urn:tag:genre:music",
      type: "urn:tag:genre:music",
      affinity: 0.99,
      sourceEntity: SUPREMES.entity_id,
      metadata: { sourceKind: "tag_insight" },
    },
    {
      source: "qloo",
      name: "Soul",
      id: "urn:tag:genre:music:soul",
      namespace: "urn:tag:genre:music",
      affinity: 0.98,
      sourceEntity: SUPREMES.entity_id,
      metadata: { sourceKind: "tag_insight" },
    },
    {
      source: "qloo",
      name: "60s",
      id: "urn:tag:genre:music:60s",
      namespace: "urn:tag:genre:music",
      affinity: 0.97,
      sourceEntity: SUPREMES.entity_id,
      metadata: { sourceKind: "tag_insight" },
    },
  ];
  return profile;
}

function candidate(overrides: Partial<AgentCandidate> & Pick<AgentCandidate, "id" | "type" | "title">): AgentCandidate {
  return {
    tags: [],
    signalNames: [],
    provenance: "qloo",
    historicalStatus: "inside_period",
    reasonSeed: "Test evidence.",
    ...overrides,
  };
}

function sessionWithMusic(profile: PersonProfile): Session {
  const item: SessionItem = {
    id: "item-supremes",
    type: "music",
    title: "The Supremes",
    entityId: SUPREMES.entity_id,
    reason: "Caregiver-known.",
    provenance: "caregiver",
    signalNames: ["Motown", "Soul"],
  };
  const session: Session = {
    id: "session-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    durationMinutes: 20,
    status: "planned",
    items: [
      item,
      {
        id: "item-conversation",
        type: "conversation",
        title: "What was a typical Sunday dinner like?",
        reason: "Agent hypothesis.",
        provenance: "agent",
        signalNames: [],
      },
    ],
    caregiverFeedback: [],
  };
  profile.sessionHistory = [session];
  return session;
}

test("1. The Supremes resolves as urn:entity:artist", () => {
  const result = resolveAnchor("The Supremes", SUPREMES_CANDIDATES, ["urn:entity:artist"]);
  assert.equal(result.state, "resolved");
  assert.equal(result.selected?.entity_id, SUPREMES.entity_id);
  assert.deepEqual(result.selected?.types, ["urn:entity:artist"]);
  assert.equal(result.matchType, "exact");
});

test("2. Motown resolves as urn:entity:brand and is not forced into an artist", () => {
  const asBrand = resolveAnchor("Motown", [MOTOWN_BRAND, ...MOTOWN_ARTIST_CANDIDATES], [
    "urn:entity:brand",
    "urn:entity:artist",
  ]);
  assert.equal(asBrand.state, "resolved");
  assert.equal(asBrand.selected?.entity_id, MOTOWN_BRAND.entity_id);
  assert.ok(asBrand.selected?.types?.includes("urn:entity:brand"));

  const artistOnly = resolveAnchor("Motown", MOTOWN_ARTIST_CANDIDATES, ["urn:entity:artist"]);
  assert.notEqual(artistOnly.selected?.entity_id, MOTOWN_ARTIST_CANDIDATES[0].entity_id);
  assert.equal(artistOnly.selected, null);
});

test("3. Ambiguous inputs return ambiguous instead of selecting the first result", () => {
  const result = resolveAnchor("Motown", MOTOWN_ARTIST_CANDIDATES, ["urn:entity:artist"]);
  assert.equal(result.state, "ambiguous");
  assert.equal(result.selected, null);
  assert.ok(result.assessments.length >= 3);
  assert.ok(result.notes.some((note) => note.includes("not selected")));
});

test("4. Qloo-derived signals and items are marked provenance qloo", () => {
  const signal = normalizeQlooSignal(
    { name: "Motown", id: "urn:tag:genre:music:motown", type: "urn:tag:genre:music", query: { affinity: 0.99 } },
    SUPREMES.entity_id,
    "tag_insight",
    "audit-1",
  );
  assert.equal(signal?.source, "qloo");
  assert.equal(signal?.affinity, 0.99);

  const profile = profileForTests();
  const visual = candidate({
    id: "qloo:film:lady-sings-the-blues",
    type: "film",
    title: "Lady Sings the Blues",
    entityId: "A7E79F99-8E24-46F9-960B-F5F05F9B8A1A",
    year: 1972,
    affinity: 0.89,
    signalNames: ["Drama", "Jazz score"],
    provenance: "qloo",
  });
  const evaluation = scoreCandidate(visual, profile);
  const session = composeSession({
    profile,
    evaluations: [{ candidate: visual, evaluation }],
    now: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(session.items.find((item) => item.type === "film")?.provenance, "qloo");
});

test("5. Agent inference is marked provenance agent", () => {
  const profile = profileForTests();
  const session = composeSession({ profile, evaluations: [], now: "2026-01-01T00:00:00.000Z" });
  const conversation = session.items.filter((item) => item.type === "conversation");
  assert.ok(conversation.length >= 1);
  assert.ok(conversation.every((item) => item.provenance === "agent"));
});

test("6. lit_up feedback increases adjacent relevance and down-ranks replay", () => {
  const profile = profileForTests();
  const session = sessionWithMusic(profile);
  applyCaregiverFeedback(profile, session.id, [{ sessionItemId: "item-supremes", reaction: "lit_up" }]);

  const feedback = buildFeedbackContext(profile);
  const adjacent = candidate({
    id: "qloo:music:martha",
    type: "music",
    title: "Martha Reeves & The Vandellas",
    entityId: "56CC4C32-5A31-4EB0-9472-89A0E18F6315",
    affinity: 0.982,
    signalNames: ["Motown", "Soul"],
  });
  const replay = candidate({
    id: "caregiver:music:supremes",
    type: "music",
    title: "The Supremes",
    entityId: SUPREMES.entity_id,
    affinity: 0.95,
    signalNames: ["Motown", "Soul"],
  });

  const baselineProfile = profileForTests();
  const baseline = scoreCandidate(adjacent, baselineProfile);
  const after = scoreCandidate(adjacent, profile, feedback);
  assert.ok(after.score > baseline.score, `expected ${after.score} > ${baseline.score}`);

  const replayAfter = scoreCandidate(replay, profile, feedback);
  assert.ok(replayAfter.score < after.score, "replay should score below the adjacent artist");
  assert.ok(feedback.likedSignals.includes("motown"));
});

test("7. agitated feedback suppresses related candidates", () => {
  const profile = profileForTests();
  const session = sessionWithMusic(profile);
  applyCaregiverFeedback(profile, session.id, [{ sessionItemId: "item-supremes", reaction: "agitated" }]);

  const related = candidate({
    id: "qloo:music:related",
    type: "music",
    title: "The Marvelettes",
    entityId: "56CC4C32-5A31-4EB0-9472-89A0E18F6315",
    affinity: 0.97,
    signalNames: ["Motown", "Soul"],
  });
  assert.equal(isCandidateSuppressed(related, profile), true);

  const evaluation = scoreCandidate(related, profile);
  assert.equal(evaluation.suppressed, true);
  assert.equal(evaluation.eligible, false);
  assert.equal(evaluation.score, 0);
});

test("8a. Caregiver memories are classified without inventing Qloo data", () => {
  const classified = classifyMemories([
    "The Supremes",
    "Motown",
    "classic Hollywood movies",
    "Sunday family dinners",
  ]);
  assert.deepEqual(classified.rememberedMusic, ["The Supremes", "Motown"]);
  assert.deepEqual(classified.rememberedMovies, ["classic Hollywood movies"]);
  assert.deepEqual(classified.rememberedFoods, ["Sunday family dinners"]);
  assert.equal(classified.rememberedInterests.length, 4);
});

test("8. A session contains multiple cultural categories, not repetitive items", () => {
  const profile = profileForTests();
  const music = candidate({
    id: "caregiver:music:supremes",
    type: "music",
    title: "The Supremes",
    entityId: SUPREMES.entity_id,
    affinity: 0.95,
    signalNames: ["Motown", "Soul"],
    provenance: "caregiver",
  });
  const film = candidate({
    id: "qloo:film:funny-girl",
    type: "film",
    title: "Funny Girl",
    year: 1968,
    affinity: 0.875,
    signalNames: ["Broadway scale", "Nostalgic"],
  });
  const food = candidate({
    id: "qloo:food:mixing-board",
    type: "food",
    title: "The Mixing Board",
    affinity: 0.82,
    signalNames: ["Cocktails", "Modern"],
    historicalStatus: "not_date_verifiable",
  });

  const evaluations = [music, film, food].map((item) => ({ candidate: item, evaluation: scoreCandidate(item, profile) }));
  const session = composeSession({ profile, evaluations, now: "2026-01-01T00:00:00.000Z" });
  const types = new Set(session.items.map((item) => item.type));
  assert.ok(types.size >= 3, `expected multiple categories, got ${[...types].join(", ")}`);
  assert.equal(session.items.filter((item) => item.type === "music").length, 1);
  assert.ok(session.items.some((item) => item.type === "conversation"));
  assert.ok(session.items.every((item) => item.provenance));
  assert.ok(session.durationMinutes >= 10);
});
