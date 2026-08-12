import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError, ownedProviderPointers, parseStrictJson, validateAuth } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";
import { MANAGED_PROVIDER_IDS } from "./product-identity.generated.mjs";

export const LEGACY_SYSTEM_SHA256 = "96132c8e262880d041b57891a69a4a6efc40a60864d64cbc5021af9427d67e5e";
const MANAGED_PROVIDERS = MANAGED_PROVIDER_IDS.includes("idepub") ? ["idepub", ...MANAGED_PROVIDER_IDS.filter((provider) => provider !== "idepub")] : [...MANAGED_PROVIDER_IDS];

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

async function existingJson(path, code, validator = (value) => value) {
  const info = await inspectRegular(path);
  if (info === null) return null;
  return validator(parseStrictJson(await readFile(path), code));
}

function modelsDocument(value) {
  if (!object(value) || !object(value.providers)) throw new StateError("MODELS_SCHEMA_INVALID");
  return value;
}

function migrationDocument(value) {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.rotationRequired) || value.rotationRequired.some((provider) => !MANAGED_PROVIDERS.includes(provider))) throw new StateError("MIGRATION_SCHEMA_INVALID");
  return value;
}

function migrateCredentials(models, auth, previous) {
  const nextModels = structuredClone(models);
  const nextAuth = structuredClone(auth ?? {});
  const rotationRequired = new Set(previous?.rotationRequired ?? []);
  const migrated = [];
  for (const provider of MANAGED_PROVIDERS) {
    const entry = nextModels.providers[provider];
    if (!object(entry) || typeof entry.apiKey !== "string" || entry.apiKey.length === 0) continue;
    if (!(provider in nextAuth)) nextAuth[provider] = { key: entry.apiKey, type: "api_key" };
    delete entry.apiKey;
    rotationRequired.add(provider);
    migrated.push(provider);
  }
  return { migrated, models: nextModels, auth: nextAuth, rotationRequired: [...rotationRequired].sort() };
}

async function promptPlan(agentDir) {
  const system = join(agentDir, "SYSTEM.md");
  const append = join(agentDir, "APPEND_SYSTEM.md");
  const systemInfo = await inspectRegular(system);
  if (systemInfo === null) return { action: "absent" };
  const bytes = await readFile(system);
  if (bytes.length !== 748 || hash(bytes) !== LEGACY_SYSTEM_SHA256) return { action: "unowned" };
  if (await inspectRegular(append) !== null) return { action: "conflict" };
  return { action: "rename", append, system };
}

function ownershipDocument(previous, migrated, prompt) {
  const managedFiles = object(previous?.managedFiles) ? structuredClone(previous.managedFiles) : {};
  if (migrated.length > 0) {
    managedFiles["models.json"] = { ownedJsonPointers: migrated.flatMap((provider) => ownedProviderPointers(provider)) };
    managedFiles["auth.json"] = { ownedJsonPointers: migrated.map((provider) => `/${provider}`) };
  }
  const result = { managedFiles, schemaVersion: 1 };
  if (prompt.action === "rename") result.legacySystem = { destination: "APPEND_SYSTEM.md", schemaVersion: 1, sourceSha256: LEGACY_SYSTEM_SHA256 };
  if (prompt.action === "rename") managedFiles["APPEND_SYSTEM.md"] = { destination: "APPEND_SYSTEM.md", ownedJsonPointers: [], sourceSha256: LEGACY_SYSTEM_SHA256 };
  return result;
}

function redactedBackup(models, migrated) {
  return { migratedProviders: migrated, models: models, schemaVersion: 1 };
}

export async function migrateState({ agentDir, dryRun = false }) {
  if (!dryRun) {
    await ensureAgentDirectory(agentDir);
    await recoverTransactions(agentDir);
  }
  const paths = statePaths(agentDir);
  const models = await existingJson(paths.models, "MODELS_SCHEMA_INVALID", modelsDocument);
  const auth = await existingJson(paths.auth, "AUTH_SCHEMA_INVALID", validateAuth);
  const ownership = await existingJson(paths.ownership, "OWNERSHIP_SCHEMA_INVALID");
  const migration = await existingJson(join(agentDir, "migration.json"), "MIGRATION_SCHEMA_INVALID", migrationDocument);
  const prompt = await promptPlan(agentDir);
  if (models === null) return { changed: [], dryRun, prompt: prompt.action, rotationRequired: [] };

  const credentials = migrateCredentials(models, auth, migration);
  const ownershipNext = ownershipDocument(ownership, credentials.migrated, prompt);
  const changed = [];
  if (credentials.migrated.length > 0) changed.push("models.json", "auth.json", "migration.json", "ownership.json", "backups");
  if (prompt.action === "rename") changed.push("APPEND_SYSTEM.md");
  if (dryRun || changed.length === 0) return { changed, dryRun, prompt: prompt.action, rotationRequired: credentials.rotationRequired };

  const transactionId = `migration-${randomUUID()}`;
  const backup = join(agentDir, "backups", `${transactionId}.models.json`);
  const operations = [];
  if (credentials.migrated.length > 0) {
    await mkdir(join(agentDir, "backups"), { recursive: true, mode: 0o700 });
    operations.push({ bytes: canonicalJson(credentials.models), path: paths.models });
    operations.push({ bytes: canonicalJson(credentials.auth), containsSecret: true, path: paths.auth });
    operations.push({ bytes: canonicalJson({ rotationRequired: credentials.rotationRequired, schemaVersion: 1 }), path: join(agentDir, "migration.json") });
    operations.push({ bytes: canonicalJson(redactedBackup(credentials.models, credentials.migrated)), path: backup });
    operations.push({ bytes: canonicalJson(ownershipNext), path: paths.ownership });
  } else if (prompt.action === "rename") {
    operations.push({ bytes: canonicalJson(ownershipNext), path: paths.ownership });
  }
  if (operations.length > 0) await applyStateTransaction({ agentDir, operations, transactionId });
  if (prompt.action === "rename") await rename(prompt.system, prompt.append);
  return { changed, dryRun, prompt: prompt.action, rotationRequired: credentials.rotationRequired };
}
