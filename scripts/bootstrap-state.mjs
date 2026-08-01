import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { ownedProviderPointers, ownedSettingsPointers, parseStrictJson, StateError, validateOwnership } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";

const PROVIDERS = ["idepub", "achai", "agnes", "stepfun"];
const DEFAULT_SETTINGS = { defaultModel: "agnes-2.5-flash", defaultProvider: "agnes", defaultThinkingLevel: "max", enableInstallTelemetry: false, enabledModels: ["agnes/agnes-2.5-flash"], lastChangelogVersion: "0.1.1" };

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

function mergeSettings(existing) {
  const value = structuredClone(existing ?? {}); const created = []; const skipped = [];
  for (const pointer of ownedSettingsPointers()) {
    const key = pointer.slice(1);
    if (!(key in value)) { value[key] = structuredClone(DEFAULT_SETTINGS[key]); created.push(pointer); }
    else if (JSON.stringify(value[key]) !== JSON.stringify(DEFAULT_SETTINGS[key])) skipped.push(pointer);
  }
  return { created, skipped, value };
}

function mergeModels(existing, registry) {
  const value = structuredClone(existing ?? { providers: {} }); const created = []; const skipped = [];
  for (const provider of PROVIDERS) {
    const source = registry.providers[provider]; const current = value.providers[provider];
    if (current === undefined) {
      value.providers[provider] = { api: source.api, authHeader: true, baseUrl: source.baseUrl, compat: structuredClone(source.compat), models: [] };
      created.push(...ownedProviderPointers(provider)); continue;
    }
    if (!object(current)) { skipped.push(`/providers/${provider}`); continue; }
    if (["baseUrl", "api", "authHeader", "compat"].some((field) => field in current && JSON.stringify(current[field]) !== JSON.stringify(source[field]))) {
      skipped.push(`/providers/${provider}`); continue;
    }
    for (const field of ["baseUrl", "api", "authHeader", "compat", "models"]) {
      if (!(field in current)) { current[field] = field === "models" ? [] : structuredClone(source[field]); created.push(`/providers/${provider}/${field}`); }
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

export async function bootstrapState({ agentDir, dryRun = false, root }) {
  if (!dryRun) { await ensureAgentDirectory(agentDir); await recoverTransactions(agentDir); }
  const paths = statePaths(agentDir);
  const registry = registryDocument(parseStrictJson(await readFile(join(root, "resources", "provider-registry.v1.json")), "REGISTRY_SCHEMA_INVALID"));
  const settings = await existingJson(paths.settings, "SETTINGS_SCHEMA_INVALID", settingsDocument);
  const models = await existingJson(paths.models, "MODELS_SCHEMA_INVALID", modelsDocument);
  const ownership = await existingJson(paths.ownership, "OWNERSHIP_SCHEMA_INVALID", validateOwnership);
  const settingPlan = mergeSettings(settings); const modelPlan = mergeModels(models, registry); const prompt = await promptPlan(agentDir, root, ownership);
  const ownershipNext = ownershipDocument(ownership, settingPlan.created, modelPlan.created, prompt);
  const ownershipChanged = JSON.stringify(ownershipNext) !== JSON.stringify(ownership ?? null);
  const created = [...prompt.created, ...(modelPlan.created.length > 0 ? ["models.json"] : []), ...(settingPlan.created.length > 0 ? ["settings.json"] : []), ...(ownershipChanged ? ["ownership.json"] : [])];
  const skipped = [...prompt.skipped, ...settingPlan.skipped, ...modelPlan.skipped];
  const warnings = [...prompt.warnings, ...settingPlan.skipped.map((pointer) => `SETTING_CONFLICT:${pointer}`), ...modelPlan.skipped.map((pointer) => `PROVIDER_CONFLICT:${pointer}`)];
  if (created.length === 0 && skipped.length === 0) return { created: [], dryRun, skipped: [], status: "noop", warnings };
  if (dryRun) return { created, dryRun, skipped, status: "planned", warnings };
  const operations = [];
  if (prompt.action === "create") operations.push({ bytes: prompt.bytes, path: join(agentDir, "APPEND_SYSTEM.md") });
  if (modelPlan.created.length > 0) operations.push({ bytes: canonicalJson(modelPlan.value), path: paths.models });
  if (settingPlan.created.length > 0) operations.push({ bytes: canonicalJson(settingPlan.value), path: paths.settings });
  if (ownershipChanged) operations.push({ bytes: canonicalJson(ownershipNext), path: paths.ownership });
  if (operations.length > 0) await applyStateTransaction({ agentDir, operations });
  return { created, dryRun, skipped, status: "applied", warnings };
}
