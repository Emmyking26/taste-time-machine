/**
 * CPU-only contract check for the OrbBloop shader.
 *
 * Validates (no GPU needed):
 *  1. The WGSL parses and reflects — `prepareShader` throws on malformed WGSL.
 *  2. The `ubo` uniform struct's member names exactly match the keys the
 *     component writes in `orb-bloop.tsx`'s `fx.set({ ubo: {...} })` call.
 *     vgpu packs that object by member name, so a typo here would silently
 *     zero out a field at runtime.
 *  3. The fragment entry point is discoverable, so `effect()` can pick it up.
 */
import { BLOOP_WGSL, BLOOP_WGSL_SOURCE } from "../components/ui/orb-bloop-utils/bloop-wgsl";

/** Mirror of the object built in components/ui/orb-bloop.tsx. */
const COMPONENT_UBO_KEYS = [
  "time",
  "micLevel",
  "stateListen",
  "listenTimestamp",
  "stateThink",
  "thinkTimestamp",
  "stateSpeak",
  "speakTimestamp",
  "avgMag",
  "cumulativeAudio",
  "viewport",
  "watercolorStrength",
  "watercolorAnimated",
  "bloopColorMain",
  "bloopColorLow",
  "bloopColorMid",
  "bloopColorHigh",
] as const;

type Reflection = {
  entryPoints?: ReadonlyArray<{ name: string; stage: string }>;
  bindings?: ReadonlyArray<{
    name: string;
    addressSpace?: string;
    layout?: { members?: ReadonlyArray<{ name: string }> };
  }>;
};

function main() {
  const reflection = (BLOOP_WGSL as unknown as { reflection: Reflection }).reflection;

  console.log("wgsl length:", BLOOP_WGSL_SOURCE.length);
  console.log(
    "entryPoints:",
    JSON.stringify(reflection.entryPoints?.map((e) => `${e.stage}:${e.name}`) ?? []),
  );

  const ubo = reflection.bindings?.find((b) => b.name === "ubo");
  if (!ubo) {
    console.error("FAIL: no binding named 'ubo' found in reflection.");
    console.error(
      "bindings present:",
      JSON.stringify(reflection.bindings?.map((b) => b.name) ?? []),
    );
    process.exitCode = 1;
    return;
  }
  if (ubo.addressSpace !== "uniform") {
    console.error(`FAIL: 'ubo' addressSpace is ${ubo.addressSpace}, expected uniform.`);
    process.exitCode = 1;
    return;
  }

  const shaderKeys = (ubo.layout?.members ?? []).map((m) => m.name);
  console.log("ubo members:", JSON.stringify(shaderKeys));

  const missing = COMPONENT_UBO_KEYS.filter((k) => !shaderKeys.includes(k));
  const extra = shaderKeys.filter((k) => !(COMPONENT_UBO_KEYS as readonly string[]).includes(k));

  const fragment = reflection.entryPoints?.find((e) => e.stage === "fragment");
  const checks: Array<[string, boolean, string]> = [
    ["fragment entry point exists", !!fragment, fragment?.name ?? "(none)"],
    ["uniform struct named 'ubo'", true, ubo.name],
    ["no component keys missing from shader", missing.length === 0, missing.join(", ") || "none"],
    ["no shader keys absent from component", extra.length === 0, extra.join(", ") || "none"],
    ["member order matches component call order", JSON.stringify(shaderKeys) === JSON.stringify(COMPONENT_UBO_KEYS), ""],
  ];

  let failed = 0;
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
    if (!ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exitCode = 1;
    return;
  }
  console.log("\nAll checks passed.");
}

main();
