import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { catalogPayload, catalogSha256, normalizeModels } from "./state-catalog.mjs";
import { StateError, ownedProviderPointers, parseStrictJson, resolveCredential, validateAuth, validateOwnership } from "./state-schema.mjs";
import { inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";

export const PROVIDER_REGISTRY_SHA256 = "70d4950b991a0891a5fd1d96a88def4c3c65b6192dc0c96c079ba92fda4f0467";
export const PROVIDER_TRANSFORMATIONS_SHA256 = "39c834dbadf987506ca74b75c9ebc4e36b37734ac7c4be6f996f63b3f924ad70";
const PROVIDERS = ["achai", "agnes", "idepub", "stepfun"];
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function fail(code) { throw new StateError(code); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function byteOrder(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }

async function frozenJson(root, name, expectedSha256, code) {
  const bytes = await readFile(join(root, "resources", name));
  if (sha256(bytes) !== expectedSha256) fail(code);
  const value = parseStrictJson(bytes, code);
  if (canonicalJson(value) !== bytes.toString("utf8")) fail(code);
  return value;
}

export async function readFrozenProviderContracts(root) {
  const [registry, transformations] = await Promise.all([
    frozenJson(root, "provider-registry.v1.json", PROVIDER_REGISTRY_SHA256, "REGISTRY_INTEGRITY_INVALID"),
    frozenJson(root, "provider-transformations.v1.json", PROVIDER_TRANSFORMATIONS_SHA256, "TRANSFORMATIONS_INTEGRITY_INVALID"),
  ]);
  if (registry.schemaVersion !== 1 || !object(registry.providers) || transformations.schemaVersion !== 1) fail("PROVIDER_CONTRACT_INVALID");
  for (const provider of PROVIDERS) {
    const entry = registry.providers[provider];
    if (!object(entry) || entry.api !== "openai-completions" || entry.authHeader !== true || !object(entry.compat) || typeof entry.baseUrl !== "string" || typeof entry.origin !== "string" || typeof entry.modelsPath !== "string" || typeof entry.chatPath !== "string") fail("PROVIDER_CONTRACT_INVALID");
  }
  return Object.freeze({ registry, transformations });
}

function fetchJson(url, authorization) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? httpsRequest : url.protocol === "http:" ? httpRequest : null;
    if (client === null) { reject(new StateError("PROVIDER_ORIGIN_INVALID")); return; }
    const headers = authorization === null ? { Accept: "application/json" } : { Accept: "application/json", Authorization: `Bearer ${authorization}` };
    const request = client(url, { headers, method: "GET", timeout: TIMEOUT_MS }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new StateError("PROVIDER_HTTP_STATUS")); return; }
      const chunks = []; let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) { request.destroy(new StateError("PROVIDER_BODY_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try { resolve({ bytes: Buffer.concat(chunks), response: parseStrictJson(Buffer.concat(chunks), "CATALOG_SCHEMA_INVALID") }); }
        catch (error) { reject(error); }
      });
    });
    request.once("timeout", () => request.destroy(new StateError("PROVIDER_TIMEOUT")));
    request.once("error", (error) => reject(error instanceof StateError ? error : new StateError("PROVIDER_NETWORK_FAILURE")));
    request.end();
  });
}

function providerUrl(entry) {
  const origin = new URL(entry.origin);
  const url = new URL(entry.modelsPath, origin);
  if (origin.protocol !== "https:" || url.origin !== origin.origin) fail("PROVIDER_ORIGIN_INVALID");
  return url;
}

async function optionalJson(path, code, fallback) {
  if (await inspectRegular(path) === null) return fallback;
  return parseStrictJson(await readFile(path), code);
}

function piProvider(entry, models, previous) {
  const overrides = object(previous?.modelOverrides) ? structuredClone(previous.modelOverrides) : undefined;
  const result = { api: entry.api, authHeader: true, baseUrl: entry.baseUrl, compat: structuredClone(entry.compat), models };
  if (overrides !== undefined) result.modelOverrides = overrides;
  return result;
}

function ownershipNext(previous, providers) {
  const managedFiles = structuredClone(previous?.managedFiles ?? {});
  const pointers = new Set(managedFiles["models.json"]?.ownedJsonPointers ?? []);
  for (const provider of providers) for (const pointer of ownedProviderPointers(provider)) pointers.add(pointer);
  managedFiles["models.json"] = { ownedJsonPointers: [...pointers].sort(byteOrder) };
  return { managedFiles, schemaVersion: 1 };
}

async function syncModels({ agentDir, allowEmpty = false, fetchCatalog, providerIds = PROVIDERS, root }) {
  await recoverTransactions(agentDir);
  const { registry, transformations } = await readFrozenProviderContracts(root);
  const ids = [...new Set(providerIds)].sort(byteOrder);
  if (ids.length === 0 || ids.some((id) => !PROVIDERS.includes(id))) fail("PROVIDER_INVALID");
  const paths = statePaths(agentDir);
  const currentModels = await optionalJson(paths.models, "MODELS_SCHEMA_INVALID", { providers: {} });
  if (!object(currentModels) || !object(currentModels.providers)) fail("MODELS_SCHEMA_INVALID");
  const previousOwnership = await optionalJson(paths.ownership, "OWNERSHIP_SCHEMA_INVALID", { managedFiles: {}, schemaVersion: 1 });
  validateOwnership(previousOwnership);
  const auth = await optionalJson(paths.auth, "AUTH_SCHEMA_INVALID", {});
  validateAuth(auth);
  const prepared = [];
  for (const provider of ids) {
    const entry = registry.providers[provider];
    const fetched = await fetchCatalog({ authorization: resolveCredential({ auth, legacyModels: currentModels, provider }).key, entry, provider });
    const models = normalizeModels({ provider, response: fetched.response, transformations });
    if (!allowEmpty && models.length === 0) fail("EMPTY_CATALOG_REJECTED");
    const payload = catalogPayload(provider, models);
    const metadata = { catalogSha256: catalogSha256(provider, models), fetchedAtUtc: new Date().toISOString(), modelCount: models.length, providerId: provider, registryVersion: 1, responseSha256: sha256(fetched.bytes), schemaVersion: 1 };
    prepared.push({ entry, metadata, models, provider });
  }
  const nextModels = structuredClone(currentModels);
  const operations = [];
  for (const item of prepared) {
    const directory = join(paths.catalogs, item.provider);
    const currentModelsPath = join(directory, "current.models.json");
    const currentMetaPath = join(directory, "current.meta.json");
    const previousModelsPath = join(directory, "previous.models.json");
    const previousMetaPath = join(directory, "previous.meta.json");
    const oldModels = await optionalJson(currentModelsPath, "CATALOG_SCHEMA_INVALID", null);
    const oldMeta = await optionalJson(currentMetaPath, "CATALOG_SCHEMA_INVALID", null);
    if (oldModels !== null && oldMeta !== null) {
      operations.push({ bytes: canonicalJson(oldModels), path: previousModelsPath }, { bytes: canonicalJson(oldMeta), path: previousMetaPath });
    }
    operations.push({ bytes: canonicalJson(catalogPayload(item.provider, item.models)), path: currentModelsPath }, { bytes: canonicalJson(item.metadata), path: currentMetaPath });
    nextModels.providers[item.provider] = piProvider(item.entry, item.models, currentModels.providers[item.provider]);
  }
  const ownership = ownershipNext(previousOwnership, ids);
  operations.push({ bytes: canonicalJson(nextModels), path: paths.models }, { bytes: canonicalJson(ownership), path: paths.ownership });
  await applyStateTransaction({ agentDir, operations });
  return { modelCount: prepared.reduce((count, item) => count + item.models.length, 0), providers: prepared.map((item) => ({ catalogSha256: item.metadata.catalogSha256, modelCount: item.models.length, provider: item.provider })), status: "applied" };
}

export async function syncProviderModels({ agentDir, allowEmpty = false, providerIds = PROVIDERS, root }) {
  return syncModels({ agentDir, allowEmpty, fetchCatalog: ({ authorization, entry }) => fetchJson(providerUrl(entry), authorization), providerIds, root });
}

export async function syncProviderModelsFromSourceFixture({ agentDir, allowEmpty = false, origin, provider, root }) {
  return syncModels({
    agentDir,
    allowEmpty,
    fetchCatalog: ({ authorization, entry }) => fetchJson(new URL(entry.modelsPath, origin), authorization),
    providerIds: [provider],
    root,
  });
}
