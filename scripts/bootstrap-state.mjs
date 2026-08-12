import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { ownedProviderPointers, ownedSettingsPointers, parseStrictJson, StateError, validateOwnership } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";
import { MANAGED_PROVIDER_IDS } from "./product-identity.generated.mjs";
import { projectProviderReadiness } from "./provider-readiness.mjs";

const PROVIDERS = MANAGED_PROVIDER_IDS.includes("idepub") ? ["idepub", ...MANAGED_PROVIDER_IDS.filter((provider) => provider !== "idepub")] : [...MANAGED_PROVIDER_IDS];
const DEFAULT_SETTINGS = { defaultModel: "agnes-2.5-flash", defaultProvider: "agnes", defaultThinkingLevel: "max", enableInstallTelemetry: false, lastChangelogVersion: "0.5.2", theme: "coco-orange-light/coco-orange" };

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function settingsDocument(value) { if (!object(value)) throw new StateError("SETTINGS_SCHEMA_INVALID"); return value; }
function modelsDocument(value) { if (!object(value) || !object(value.providers)) throw new StateError("MODELS_SCHEMA_INVALID"); return value; }
async function existingJson(path, code, validator) { if (await inspectRegular(path) === null) return null; return validator(parseStrictJson(await readFile(path), code)); }

function registryDocument(value) {
  if (!object(value) || !object(value.providers)) throw new StateError("REGISTRY_SCHEMA_INVALID");
  for (const provider of PROVIDERS) {
    const entry = value.providers[provider];
    if (!object(entry) || typeof entry.baseUrl !== "string" || typeof entry.api !== "string" || entry.authHeader !== true || !object(entry.compat)) throw new StateError("REGISTRY_SCHEMA_INVALID");
  }
  return value;
}

function seedDocument(value) {
  if (!object(value) || value.schemaVersion !== 1 || !object(value.providers)) throw new StateError("MODEL_SEEDS_INVALID");
  for (const provider of PROVIDERS) if (!Array.isArray(value.providers[provider]) || value.providers[provider].some((model) => !object(model) || typeof model.id !== "string" || typeof model.name !== "string")) throw new StateError("MODEL_SEEDS_INVALID");
  return value;
}

function seededModels(models) {
  return models.map((model) => ({ contextWindow: 128000, cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 }, input: ["text"], maxTokens: 16384, reasoning: false, ...structuredClone(model) }));
}

function mergeSettings(existing, ownership) {
  const value = structuredClone(existing ?? {}); const created = []; const skipped = [];
  for (const pointer of ownedSettingsPointers()) {
    const key = pointer.slice(1);
    if (!(key in value)) { value[key] = structuredClone(DEFAULT_SETTINGS[key]); created.push(pointer); }
    else if (JSON.stringify(value[key]) !== JSON.stringify(DEFAULT_SETTINGS[key])) skipped.push(pointer);
  }
  if (["dark", "coco-orange"].includes(value.theme) && !ownership?.managedFiles?.["settings.json"]?.ownedJsonPointers?.includes("/theme")) {
    value.theme = "coco-orange-light/coco-orange";
    created.push("/theme");
  }
  if (value.theme === "coco-orange-light/coco-orange" && !ownership?.managedFiles?.["settings.json"]?.ownedJsonPointers?.includes("/theme")) created.push("/theme");
  return { created, skipped, value };
}

function mergeModels(existing, registry, seeds) {
  const value = structuredClone(existing ?? { providers: {} }); const created = []; const skipped = [];
  for (const provider of PROVIDERS) {
    const source = registry.providers[provider]; const current = value.providers[provider];
    if (current === undefined) {
      value.providers[provider] = { api: source.api, authHeader: true, baseUrl: source.baseUrl, compat: structuredClone(source.compat), models: seededModels(seeds.providers[provider]) };
      created.push(...ownedProviderPointers(provider)); continue;
    }
    if (!object(current)) { skipped.push(`/providers/${provider}`); continue; }
    if (["baseUrl", "api", "authHeader", "compat"].some((field) => field in current && JSON.stringify(current[field]) !== JSON.stringify(source[field]))) {
      skipped.push(`/providers/${provider}`); continue;
    }
    for (const field of ["baseUrl", "api", "authHeader", "compat", "models"]) {
      if (!(field in current)) { current[field] = field === "models" ? seededModels(seeds.providers[provider]) : structuredClone(source[field]); created.push(`/providers/${provider}/${field}`); }
    }
  }
  return { created, skipped, value };
}

async function promptPlan(agentDir, root, ownership) {
  const system = join(agentDir, "SYSTEM.md"); const append = join(agentDir, "APPEND_SYSTEM.md");
  if (await inspectRegular(system) !== null) return { action: "system-override", created: [], skipped: ["APPEND_SYSTEM.md"], warnings: ["UNOWNED_SYSTEM_OVERRIDE"] };
  const appendInfo = await inspectRegular(append);
  if (appendInfo !== null) {
    const ownedHash = ownership?.managedFiles?.["APPEND_SYSTEM.md"]?.sourceSha256;
    const matched = typeof ownedHash === "string" && ownedHash === hash(await readFile(append));
    return matched ? { action: "owned", created: [], skipped: [], warnings: [] } : { action: "unowned", created: [], skipped: ["APPEND_SYSTEM.md"], warnings: ownedHash ? ["OWNED_APPEND_DRIFT"] : [] };
  }
  const bytes = await readFile(join(root, "resources", "append-system-v1.md"));
  return { action: "create", bytes, created: ["APPEND_SYSTEM.md"], skipped: [], sourceSha256: hash(bytes), warnings: [] };
}

function ownershipDocument(previous, settings, models, prompt) {
  const managedFiles = structuredClone(previous?.managedFiles ?? {});
  if (settings.length > 0) managedFiles["settings.json"] = { ownedJsonPointers: settings };
  if (models.length > 0) managedFiles["models.json"] = { ownedJsonPointers: [...new Set([...(managedFiles["models.json"]?.ownedJsonPointers ?? []), ...models])] };
  if (prompt.action === "create") managedFiles["APPEND_SYSTEM.md"] = { ownedJsonPointers: [], sourceSha256: prompt.sourceSha256 };
  return { managedFiles, schemaVersion: 1 };
}

function providerSnapshot(settings, models, catalogStatuses = {}) {
  return MANAGED_PROVIDER_IDS.map((provider) => {
    const definition = models?.providers?.[provider]; const configured = object(definition);
    const isDefault = settings?.defaultProvider === provider; const modelId = isDefault && typeof settings?.defaultModel === "string" ? settings.defaultModel : null;
    const available = configured && Array.isArray(definition.models) && (modelId === null ? definition.models.length > 0 : definition.models.some((model) => model?.id === modelId));
    return projectProviderReadiness({ catalogStatus: catalogStatuses[provider] ?? "unknown", configurationStatus: configured ? "configured" : "missing", credentialSource: "unknown", credentialStatus: "unknown", modelId, modelStatus: available ? "available" : "missing", provider, rotationRequired: null });
  });
}

export async function bootstrapState({ agentDir, dryRun = false, root }) {
  if (!dryRun) { await ensureAgentDirectory(agentDir); await recoverTransactions(agentDir); }
  const paths = statePaths(agentDir);
  const registry = registryDocument(parseStrictJson(await readFile(join(root, "resources", "provider-registry.v1.json")), "REGISTRY_SCHEMA_INVALID"));
  const seeds = seedDocument(parseStrictJson(await readFile(join(root, "resources", "provider-model-seeds.v1.json")), "MODEL_SEEDS_INVALID"));
  const settings = await existingJson(paths.settings, "SETTINGS_SCHEMA_INVALID", settingsDocument);
  const models = await existingJson(paths.models, "MODELS_SCHEMA_INVALID", modelsDocument);
  const ownership = await existingJson(paths.ownership, "OWNERSHIP_SCHEMA_INVALID", validateOwnership);
  const settingPlan = mergeSettings(settings, ownership); const modelPlan = mergeModels(models, registry, seeds); const prompt = await promptPlan(agentDir, root, ownership);
  const ownershipNext = ownershipDocument(ownership, settingPlan.created, modelPlan.created, prompt);
  const ownershipChanged = JSON.stringify(ownershipNext) !== JSON.stringify(ownership ?? null);
  const created = [...prompt.created, ...(modelPlan.created.length > 0 ? ["models.json"] : []), ...(settingPlan.created.length > 0 ? ["settings.json"] : []), ...(ownershipChanged ? ["ownership.json"] : [])];
  const skipped = [...prompt.skipped, ...settingPlan.skipped, ...modelPlan.skipped];
  const warnings = [...prompt.warnings, ...settingPlan.skipped.map((pointer) => `SETTING_CONFLICT:${pointer}`), ...modelPlan.skipped.map((pointer) => `PROVIDER_CONFLICT:${pointer}`)];
  const seeded = Object.fromEntries(PROVIDERS.filter((provider) => modelPlan.created.some((pointer) => pointer === `/providers/${provider}/models`)).map((provider) => [provider, "seeded"]));
  const providerReadiness = { current: providerSnapshot(settings, models), projected: providerSnapshot(settingPlan.value, modelPlan.value, seeded), schemaVersion: 1, scope: "all-managed" };
  if (created.length === 0) return { created: [], dryRun, providerReadiness, skipped, status: "noop", warnings };
  if (dryRun) return { created, dryRun, providerReadiness, skipped, status: "planned", warnings };
  const operations = [];
  if (prompt.action === "create") operations.push({ bytes: prompt.bytes, path: join(agentDir, "APPEND_SYSTEM.md") });
  if (modelPlan.created.length > 0) operations.push({ bytes: canonicalJson(modelPlan.value), path: paths.models });
  if (settingPlan.created.length > 0) operations.push({ bytes: canonicalJson(settingPlan.value), path: paths.settings });
  if (ownershipChanged) operations.push({ bytes: canonicalJson(ownershipNext), path: paths.ownership });
  if (operations.length > 0) await applyStateTransaction({ agentDir, operations });
  return { created, dryRun, providerReadiness, skipped, status: "applied", warnings };
}
