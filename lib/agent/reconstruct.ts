import { ensureQlooConfigured, getQlooErrorMessage, tagIdOf } from "@/lib/qloo";
import { collectAnchorInputs } from "./memories";
import { createAnchorId, getProfileStore, type ProfileStore } from "./profile";
import { getDefaultGateway, type QlooGateway } from "./qloo-gateway";
import { decadeFromTagName } from "./signals";
import { mergeAuditIntoProfile, mergeSignalsIntoProfile } from "./state";
import { AgentTools } from "./tools";
import type { Anchor, PersonProfile } from "./types";

export interface ReconstructionStep {
  id: string;
  label: string;
}

export interface ReconstructResult {
  profile: PersonProfile;
  steps: ReconstructionStep[];
  limitations: string[];
}

export interface ReconstructOptions {
  store?: ProfileStore;
  gateway?: QlooGateway;
  tools?: AgentTools;
  /** Mutate this profile instance instead of loading a fresh clone. */
  profile?: PersonProfile;
  persist?: boolean;
  now?: () => Date;
}

async function ensureAnchors(profile: PersonProfile, tools: AgentTools, limitations: string[]): Promise<void> {
  if (profile.anchors.length > 0) return;
  const inputs = collectAnchorInputs(profile);
  if (inputs.length === 0) {
    limitations.push("No caregiver memories were available to look up.");
    return;
  }

  const results = await Promise.all(
    inputs.map(async (input) => {
      try {
        return { input, result: await tools.resolveCulturalAnchor(input) };
      } catch (error) {
        limitations.push(`We could not look up “${input.text}”: ${getQlooErrorMessage(error)}`);
        return { input, result: null };
      }
    }),
  );

  for (const { input, result } of results) {
    if (!result) continue;
    const resolved = result.entity !== null || result.tag !== null;
    const state = resolved ? "resolved" : result.state;
    const anchor: Anchor = {
      id: createAnchorId(),
      text: input.text,
      entityId: result.entity?.entity_id ?? null,
      name: result.entity?.name ?? (typeof result.tag?.name === "string" ? result.tag.name : null),
      entityType: result.entityType,
      state,
      confidence: Math.max(result.confidence, result.tag ? 0.9 : 0),
      provenance: "caregiver",
      ...(result.tag ? { tagId: tagIdOf(result.tag) } : {}),
      ...(result.tag && typeof result.tag.name === "string" ? { tagName: result.tag.name } : {}),
      tagState: result.tagState,
      resolution: result.resolution,
      ...(result.tagResolution ? { tagResolution: result.tagResolution } : {}),
    };
    profile.anchors.push(anchor);
    if (!resolved) {
      limitations.push(
        `We kept “${input.text}” as a memory you shared, but could not match it to a cultural record.`,
      );
    }
  }
}

function stepsFromProfile(profile: PersonProfile, discoveredNow: boolean): ReconstructionStep[] {
  const steps: ReconstructionStep[] = [];
  const seen = new Set<string>();
  const add = (id: string, label: string) => {
    const key = id.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    steps.push({ id, label });
  };

  for (const anchor of profile.anchors) {
    if (anchor.state !== "resolved") continue;
    if (anchor.name || anchor.entityId) {
      add(`found:${anchor.name ?? anchor.text}`, `Found ${anchor.name ?? anchor.text}`);
    }
    if (anchor.tagName) {
      add(`connected:${anchor.tagName}`, `Connected ${anchor.tagName}`);
    }
  }

  const insight = profile.discoveredSignals.filter((signal) => {
    const kind = signal.metadata?.sourceKind;
    return kind === "tag_insight" || kind === "detroit_tag_insight";
  });
  const pool = insight.length > 0 ? insight : profile.discoveredSignals;

  const featured = ["Soul", "Motown", "R&B", "Gospel", "Funk", "Girl Groups", "Oldies"];
  for (const name of featured) {
    if (pool.some((signal) => signal.name.toLowerCase() === name.toLowerCase())) {
      add(`discovered:${name}`, `Discovered ${name}`);
    }
  }

  const eras = pool
    .map((signal) => decadeFromTagName(signal.name))
    .filter((era): era is NonNullable<typeof era> => era !== null);
  if (eras.length > 0) {
    const labels = [...new Set(eras.map((era) => era.label))];
    add("era", `Found ${labels.join(" and ")} cultural signals`);
  }

  const city = profile.hometown.city;
  const localized = profile.discoveredSignals.some((signal) => signal.metadata?.sourceKind === "detroit_tag_insight");
  const placeHit = profile.discoveredSignals.some((signal) => {
    const haystack = `${signal.namespace ?? ""} ${signal.type ?? ""} ${signal.name}`.toLowerCase();
    return haystack.includes("place") || haystack.includes(city.toLowerCase());
  });
  if (localized || placeHit) {
    add("place", `Exploring ${city} connections`);
  } else if (discoveredNow && city) {
    // Hometown is caregiver-known context used during lookup; only mention if discovery ran.
    add("place-context", `Held ${city} as a place to explore`);
  }

  return steps;
}

export async function reconstructCulturalWorld(
  profileId: string,
  options: ReconstructOptions = {},
): Promise<ReconstructResult> {
  ensureQlooConfigured();
  const store = options.store ?? getProfileStore();
  const profile = options.profile ?? store.getOrThrow(profileId);
  const gateway = options.gateway ?? getDefaultGateway();
  const tools = options.tools ?? new AgentTools(gateway);
  const now = options.now ?? (() => new Date());
  const persist = options.persist ?? true;
  const limitations: string[] = [];
  const auditStart = gateway.auditCount();
  const hadAnchors = profile.anchors.length > 0;
  const hadSignals = profile.discoveredSignals.length > 0;

  await ensureAnchors(profile, tools, limitations);

  const anchorIds = profile.anchors.map((anchor) => anchor.entityId).filter((id): id is string => Boolean(id));
  const missingSignalAnchors = anchorIds.filter(
    (anchorId) => !profile.discoveredSignals.some((signal) => signal.sourceEntity === anchorId),
  );
  let discoveredNow = false;
  if (missingSignalAnchors.length > 0) {
    try {
      const discovery = await tools.discoverCulturalSignals({
        anchorIds: missingSignalAnchors,
        profileContext: profile,
      });
      mergeSignalsIntoProfile(profile, discovery.signals);
      limitations.push(...discovery.limitations);
      discoveredNow = discovery.signals.length > 0;
    } catch (error) {
      limitations.push(`Cultural connections could not be loaded: ${getQlooErrorMessage(error)}`);
    }
  }

  const newAudit = gateway.getAudit().slice(auditStart);
  mergeAuditIntoProfile(profile, newAudit);
  profile.updatedAt = now().toISOString();
  if (persist) store.save(profile);

  const steps = stepsFromProfile(profile, discoveredNow || hadSignals);
  if (steps.length === 0 && (hadAnchors || profile.anchors.length > 0)) {
    steps.push({ id: "memories", label: "Kept the memories you shared" });
  }

  return { profile, steps, limitations: [...new Set(limitations)] };
}
