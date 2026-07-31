import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";

const modelId = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const idepubNonChat = /(?:^|[-_.])(image|audio|asr|tts|realtime)(?:$|[-_.])/i;

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(code) { throw new StateError(code); }
function byteOrder(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }

export function normalizeModels({ provider, response, transformations }) {
  if (!object(response) || !Array.isArray(response.data) || !object(transformations)) fail("CATALOG_SCHEMA_INVALID");
  const models = [];
  const seen = new Set();
  for (const raw of response.data) {
    if (!object(raw) || typeof raw.id !== "string" || !modelId.test(raw.id) || seen.has(raw.id)) fail("CATALOG_SCHEMA_INVALID");
    seen.add(raw.id);
    const key = `${provider}/${raw.id}`;
    if (transformations.denylist?.includes(key) || (provider === "idepub" && idepubNonChat.test(raw.id))) continue;
    if (provider === "achai" && "supported_endpoint_types" in raw) {
      if (!Array.isArray(raw.supported_endpoint_types)) fail("CATALOG_SCHEMA_INVALID");
      if (!raw.supported_endpoint_types.includes("openai") && !raw.supported_endpoint_types.includes("openai-response")) continue;
    }
    const defaults = transformations.defaults;
    if (!object(defaults) || !Array.isArray(defaults.input) || !object(defaults.cost)) fail("CAPABILITY_SCHEMA_INVALID");
    const override = transformations.capabilityOverrides?.[key] ?? {};
    const name = transformations.displayNames?.[key] ?? (typeof raw.display_name === "string" && raw.display_name.length > 0 ? raw.display_name : raw.id);
    models.push({ contextWindow: defaults.contextWindow, cost: structuredClone(defaults.cost), id: raw.id, input: [...defaults.input], maxTokens: defaults.maxTokens, name, reasoning: override.reasoning ?? defaults.reasoning });
  }
  models.sort((left, right) => byteOrder(left.id, right.id));
  return models;
}

export function catalogPayload(provider, models) {
  const unique = new Set(models.map((model) => model.id));
  if (unique.size !== models.length) fail("CATALOG_SCHEMA_INVALID");
  const sorted = [...models].sort((left, right) => byteOrder(left.id, right.id));
  return { models: sorted, providerId: provider, schemaVersion: 1 };
}

export function catalogSha256(provider, models) { return sha256(canonicalJson(catalogPayload(provider, models))); }
