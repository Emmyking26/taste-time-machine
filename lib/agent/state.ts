import type { CulturalSignal, PersonProfile, QlooAuditEntry } from "./types";

/**
 * Merge newly discovered Qloo signals into a profile without discarding the
 * original tag record. Higher-affinity duplicates replace lower ones.
 */
export function mergeSignalsIntoProfile(profile: PersonProfile, incoming: CulturalSignal[]): void {
  const existing = new Map<string, number>();
  profile.discoveredSignals.forEach((signal, index) => {
    const kind = typeof signal.metadata?.sourceKind === "string" ? signal.metadata.sourceKind : "unknown";
    existing.set(`${signal.sourceEntity ?? ""}|${signal.id ?? signal.name.toLowerCase()}|${kind}`, index);
  });

  for (const signal of incoming) {
    const kind = typeof signal.metadata?.sourceKind === "string" ? signal.metadata.sourceKind : "unknown";
    const key = `${signal.sourceEntity ?? ""}|${signal.id ?? signal.name.toLowerCase()}|${kind}`;
    const index = existing.get(key);
    if (index === undefined) {
      profile.discoveredSignals.push(signal);
      existing.set(key, profile.discoveredSignals.length - 1);
    } else if ((signal.affinity ?? -1) > (profile.discoveredSignals[index].affinity ?? -1)) {
      profile.discoveredSignals[index] = signal;
    }
  }
}

export function mergeAuditIntoProfile(profile: PersonProfile, incoming: QlooAuditEntry[]): void {
  const byId = new Map((profile.qlooAudit ?? []).map((entry) => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);
  profile.qlooAudit = [...byId.values()].slice(-200);
}
