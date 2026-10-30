import { writeFileSync } from "node:fs";
import {
  MARGARET_PROFILE_ID,
  generateSession,
  getProfileStore,
  recordFeedback,
  type GeneratedSessionResult,
  type PersonProfile,
  type SessionItem,
} from "../lib/agent";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  }
}

const JSON_OUTPUT = "agent-demo-results.json";

function printItem(item: SessionItem): void {
  console.log(
    `  [${item.type}] ${item.title} | ${item.provenance} | confidence ${item.confidence?.toFixed(3) ?? "—"} | ${item.durationMinutes ?? "?"} min`,
  );
  console.log(`    why: ${item.reason}`);
  if (item.entityId) console.log(`    entity: ${item.entityId}${item.year ? ` | year ${item.year}` : ""}`);
  if (item.signalNames && item.signalNames.length > 0) console.log(`    signals: ${item.signalNames.join(", ")}`);
}

function printSession(label: string, result: GeneratedSessionResult): void {
  console.log(`\n${label} — ${result.session.id}`);
  console.log(`  duration: ${result.session.durationMinutes} min | status: ${result.session.status}`);
  for (const item of result.session.items) printItem(item);
  console.log(`  adaptation: ${result.adaptation.summary}`);
  console.log(
    `  evidence: caregiver ${result.evidence.caregiverKnown.length}, qloo ${result.evidence.qlooEvidence.length}, agent ${result.evidence.agentHypotheses.length}`,
  );
  console.log(`  reasoning: ${result.reasoningSummary}`);
  if (result.limitations.length > 0) {
    console.log("  limitations:");
    for (const limitation of result.limitations) console.log(`    - ${limitation}`);
  }
}

function stripProfile(profile: PersonProfile): Omit<PersonProfile, "qlooAudit"> & { audit: unknown[] } {
  const { qlooAudit, ...rest } = profile;
  return {
    ...rest,
    audit: (qlooAudit ?? []).map((entry) => ({
      id: entry.id,
      tool: entry.tool,
      request: entry.request,
      createdAt: entry.createdAt,
    })),
  };
}

async function main(): Promise<void> {
  const store = getProfileStore();
  const profile = store.getOrThrow(MARGARET_PROFILE_ID);

  console.log("TASTE TIME MACHINE — PHASE 2 AGENT DEMO");
  console.log("=======================================");
  console.log(`Profile: ${profile.name} | born ${profile.birthYear} | ${profile.hometown.city}, ${profile.hometown.state}`);
  console.log(
    `Known by caregiver: ${profile.caregiverKnown.rememberedInterests.join(", ")} | window ${profile.formativePeriod.startYear}–${profile.formativePeriod.endYear}`,
  );
  console.log("");

  const first = await generateSession(MARGARET_PROFILE_ID, { store });
  printSession("SESSION 1 (baseline)", first);

  const firstMusic = first.session.items.find((item) => item.type === "music");
  if (!firstMusic) throw new Error("Session 1 did not contain a music item; cannot demonstrate feedback adaptation.");

  console.log("\nCAREGIVER OBSERVATION");
  console.log(`  ${firstMusic.title} → lit_up`);
  const feedback = recordFeedback(
    MARGARET_PROFILE_ID,
    first.session.id,
    [{ sessionItemId: firstMusic.id, reaction: "lit_up", note: "Simulated caregiver observation for the Phase 2 demo." }],
    { store },
  );
  const learnedSignals = feedback.profile.preferencesLearned
    .filter((preference) => preference.kind === "signal" && preference.tone > 0)
    .map((preference) => preference.signal);
  console.log(`  learned positive signals: ${learnedSignals.join(", ")}`);
  console.log(`  safety: ${feedback.safety.guidance}`);

  const second = await generateSession(MARGARET_PROFILE_ID, { store });
  printSession("SESSION 2 (after feedback)", second);

  const secondMusic = second.session.items.find((item) => item.type === "music");
  const changed = Boolean(
    secondMusic &&
      (secondMusic.entityId !== firstMusic.entityId || secondMusic.title !== firstMusic.title),
  );
  const categoryCount = new Set(second.session.items.map((item) => item.type)).size;

  console.log("\nADAPTIVE COMPARISON");
  console.log(`  session 1 music: ${firstMusic.title} [${firstMusic.provenance}]`);
  console.log(`  session 2 music: ${secondMusic?.title ?? "none"} [${secondMusic?.provenance ?? "none"}]`);
  console.log(`  music changed: ${changed}`);
  console.log(`  feedback applied: ${second.adaptation.feedbackApplied}`);
  console.log(`  liked signals used: ${second.adaptation.likedSignals.join(", ") || "none"}`);
  console.log(`  replay avoided: ${second.adaptation.replayedItemsAvoided.join(", ") || "none"}`);
  console.log(`  distinct session categories: ${categoryCount}`);

  const output = {
    generatedAt: new Date().toISOString(),
    profile: stripProfile(store.getOrThrow(MARGARET_PROFILE_ID)),
    session1: first,
    caregiverFeedback: {
      sessionId: first.session.id,
      sessionItemId: firstMusic.id,
      itemTitle: firstMusic.title,
      reaction: "lit_up",
      learnedSignals,
      safety: feedback.safety,
    },
    session2: second,
    comparison: {
      session1Music: { title: firstMusic.title, entityId: firstMusic.entityId, provenance: firstMusic.provenance },
      session2Music: secondMusic
        ? { title: secondMusic.title, entityId: secondMusic.entityId, provenance: secondMusic.provenance }
        : null,
      musicChanged: changed,
      feedbackApplied: second.adaptation.feedbackApplied,
      likedSignals: second.adaptation.likedSignals,
      replayedItemsAvoided: second.adaptation.replayedItemsAvoided,
      distinctCategories: categoryCount,
    },
  };
  writeFileSync(JSON_OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`\nFull structured demo written to ${JSON_OUTPUT}`);

  if (!changed || !second.adaptation.feedbackApplied || second.adaptation.likedSignals.length === 0) {
    console.error("Phase 2 adaptive behaviour was not demonstrated: the second session did not change as expected.");
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(`Phase 2 agent demo failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
