import { createQlooClient, ensureQlooConfigured } from "../lib/qloo";
import { AgentTools } from "../lib/agent/tools";
import { QlooGateway } from "../lib/agent/qloo-gateway";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  }
}

async function main() {
  ensureQlooConfigured();
  const tools = new AgentTools(new QlooGateway(createQlooClient()));
  const memories = ["The Supremes", "Motown", "classic Hollywood movies", "Sunday family dinners"];
  for (const text of memories) {
    const result = await tools.resolveCulturalAnchor({
      text,
      preferredTypes: [
        "urn:entity:artist",
        "urn:entity:brand",
        "urn:entity:movie",
        "urn:entity:tv_show",
        "urn:entity:place",
      ],
    });
    console.log(JSON.stringify({
      text,
      state: result.state,
      entity: result.entity ? { id: result.entity.entity_id, name: result.entity.name, types: result.entity.types, subtype: result.entity.subtype } : null,
      entityType: result.entityType,
      confidence: result.confidence,
      matchType: result.matchType,
      tag: result.tag ? { id: result.tag.id, name: result.tag.name } : null,
      tagState: result.tagState,
      candidates: result.candidates.slice(0, 4).map((candidate) => ({ name: candidate.name, types: candidate.types })),
      notes: result.notes,
    }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
