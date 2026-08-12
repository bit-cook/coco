import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { readCredentialObservations } from "./auth-management.mjs";
import { canonicalJson } from "./canonical-json.mjs";
import { MANAGED_PROVIDER_IDS } from "./product-identity.generated.mjs";
import { projectProviderReadiness } from "./provider-readiness.mjs";
import { catalogPayload, catalogSha256 } from "./state-catalog.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { inspectRegular, statePaths } from "./state-paths.mjs";

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(code) { throw new StateError(code); }
async function optional(path, code, fallback) { if (await inspectRegular(path) === null) return fallback; return parseStrictJson(await readFile(path), code); }
const modelId = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const customProviderId = /^[a-z0-9][a-z0-9._-]*$/;

async function catalogStatus(paths, provider, configuredModels) {
  try {
    const modelsPath = join(paths.catalogs, provider, "current.models.json"); const metaPath = join(paths.catalogs, provider, "current.meta.json");
    const [modelsInfo, metaInfo] = await Promise.all([inspectRegular(modelsPath), inspectRegular(metaPath)]);
    if (modelsInfo === null && metaInfo === null) return "unknown";
    if (modelsInfo === null || metaInfo === null) throw new Error("PARTIAL");
    const [modelsBytes, metaBytes] = await Promise.all([readFile(modelsPath), readFile(metaPath)]);
    const payload = parseStrictJson(modelsBytes, "CATALOG_EVIDENCE_INVALID"); const metadata = parseStrictJson(metaBytes, "CATALOG_EVIDENCE_INVALID");
    if (modelsBytes.toString("utf8") !== canonicalJson(payload) || metaBytes.toString("utf8") !== canonicalJson(metadata) || !object(payload) || !object(metadata)) throw new Error("NONCANONICAL");
    if (JSON.stringify(Object.keys(payload).sort()) !== JSON.stringify(["models", "providerId", "schemaVersion"]) || payload.schemaVersion !== 1 || payload.providerId !== provider || !Array.isArray(payload.models) || payload.models.some((model) => !object(model) || typeof model.id !== "string" || !modelId.test(model.id)) || canonicalJson(payload) !== canonicalJson(catalogPayload(provider, payload.models))) throw new Error("PAYLOAD");
    const fields = ["catalogSha256", "fetchedAtUtc", "modelCount", "providerId", "registryVersion", "responseSha256", "schemaVersion"];
    if (JSON.stringify(Object.keys(metadata).sort()) !== JSON.stringify(fields) || metadata.schemaVersion !== 1 || metadata.registryVersion !== 1 || metadata.providerId !== provider || !/^[a-f0-9]{64}$/.test(metadata.catalogSha256) || !/^[a-f0-9]{64}$/.test(metadata.responseSha256) || !Number.isInteger(metadata.modelCount) || metadata.modelCount < 0 || typeof metadata.fetchedAtUtc !== "string" || Number.isNaN(Date.parse(metadata.fetchedAtUtc)) || new Date(metadata.fetchedAtUtc).toISOString() !== metadata.fetchedAtUtc || metadata.modelCount !== payload.models.length || metadata.catalogSha256 !== catalogSha256(provider, payload.models)) throw new Error("METADATA");
    return Array.isArray(configuredModels) && canonicalJson(configuredModels) === canonicalJson(payload.models) ? "synced" : "unknown";
  } catch { throw new StateError("CATALOG_EVIDENCE_INVALID"); }
}

export async function providerStatus({ agentDir, provider } = {}) {
  const paths = statePaths(agentDir);
  const settings = await optional(paths.settings, "SETTINGS_SCHEMA_INVALID", {}); if (!object(settings)) fail("SETTINGS_SCHEMA_INVALID");
  const models = await optional(paths.models, "MODELS_SCHEMA_INVALID", { providers: {} }); if (!object(models) || !object(models.providers)) fail("MODELS_SCHEMA_INVALID");
  for (const id of MANAGED_PROVIDER_IDS) if (id in models.providers && (!object(models.providers[id]) || !Array.isArray(models.providers[id].models))) fail("MODELS_SCHEMA_INVALID");
  const customIds = Object.keys(models.providers).filter((id) => !MANAGED_PROVIDER_IDS.includes(id)).sort();
  for (const id of customIds) { const definition = models.providers[id]; if (!customProviderId.test(id) || !object(definition) || definition.api !== "openai-completions" || definition.authHeader !== true || typeof definition.baseUrl !== "string" || !Array.isArray(definition.models) || definition.models.length === 0 || definition.models.some((model) => !object(model) || typeof model.id !== "string" || !modelId.test(model.id))) fail("CUSTOM_PROVIDER_SCHEMA_INVALID"); }
  if (provider !== undefined && !MANAGED_PROVIDER_IDS.includes(provider) && !customIds.includes(provider)) fail("PROVIDER_INVALID");
  const credentials = new Map((await readCredentialObservations({ agentDir })).providers.map((entry) => [entry.provider, entry.credential]));
  if (customIds.length > 0) {
    const auth = await optional(paths.auth, "AUTH_SCHEMA_INVALID", {}); if (!object(auth)) fail("AUTH_SCHEMA_INVALID");
    for (const id of customIds) { const entry = auth[id]; if (entry !== undefined && (!object(entry) || entry.type !== "api_key" || typeof entry.key !== "string" || entry.key.length === 0)) fail("CUSTOM_AUTH_SCHEMA_INVALID"); credentials.set(id, Object.freeze({ rotationRequired: false, source: entry === undefined ? "none" : "auth", status: entry === undefined ? "missing" : "available" })); }
  }
  const defaultProvider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : null;
  const defaultModel = typeof settings.defaultModel === "string" ? settings.defaultModel : null;
  const ids = provider === undefined ? [...MANAGED_PROVIDER_IDS, ...customIds] : [provider];
  const catalogs = new Map(await Promise.all(ids.map(async (id) => [id, MANAGED_PROVIDER_IDS.includes(id) ? await catalogStatus(paths, id, models.providers[id]?.models) : "unknown"])));
  const providers = ids.map((id) => {
    const definition = models.providers[id]; const configured = object(definition); const isDefault = id === defaultProvider; const modelId = isDefault ? defaultModel : null;
    const available = configured && (modelId === null ? definition.models.length > 0 : definition.models.some((model) => model?.id === modelId)); const credential = credentials.get(id);
    return projectProviderReadiness({ catalogStatus: catalogs.get(id), configurationStatus: configured ? "configured" : "missing", credentialSource: credential.source, credentialStatus: credential.status, modelId, modelStatus: available ? "available" : "missing", provider: id, rotationRequired: credential.rotationRequired });
  });
  return { command: "manage providers status", defaultModel: { id: defaultModel, provider: defaultProvider }, providers, schemaVersion: 1, scope: provider === undefined ? "all-managed" : "provider" };
}

export function formatProviderStatus(result) {
  const width = Math.max(...result.providers.map(({ provider }) => provider.length)); const value = (input) => input ?? "none";
  const lines = [`coco providers status: ${result.scope === "provider" ? result.providers[0].provider : result.scope}`, `default: provider=${value(result.defaultModel.provider)} model=${value(result.defaultModel.id)}`];
  for (const entry of result.providers) { const model = entry.model.id === null ? "any" : `default:${entry.model.id}`; const rotation = entry.credential.rotationRequired === null ? "unknown" : entry.credential.rotationRequired ? "yes" : "no"; lines.push(`${entry.provider.padEnd(width)} local=${entry.localStatus} configuration=${entry.configuration.status} model(${model})=${entry.model.status} credential=${entry.credential.status} source=${entry.credential.source} rotation=${rotation} catalog=${entry.catalog.status} verification=${entry.verification.status}`); }
  return `${lines.join("\n")}\n`;
}
