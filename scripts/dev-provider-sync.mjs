import { resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { readFrozenProviderContracts } from "./provider-sync.mjs";
import { catalogPayload, catalogSha256, normalizeModels } from "./state-catalog.mjs";
import { StateError, ownedProviderPointers, parseStrictJson, resolveCredential, validateAuth, validateOwnership } from "./state-schema.mjs";
import { inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";

const capabilities = new WeakMap();
const PROVIDERS = ["achai", "agnes", "idepub", "stepfun"];
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function fail() { throw new StateError("TEST_SEAM_FORBIDDEN"); }

export function createProviderSyncTestCapability(root) {
  const capability = {};
  capabilities.set(capability, resolve(root));
  return capability;
}

function fixtureOrigin(capability, origin, root) {
  const canonicalRoot = resolve(root);
  if (process.env.NODE_ENV !== "test" || resolve(process.cwd()) !== canonicalRoot || capability === null || typeof capability !== "object" || capabilities.get(capability) !== canonicalRoot) fail();
  let url;
  try { url = new URL(origin); } catch { fail(); }
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]") || url.port === "" || !/^[1-9][0-9]{0,4}$/.test(url.port) || Number(url.port) > 65535 || url.pathname !== "/" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") fail();
  return url.origin;
}

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function byteOrder(left, right) { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }

function fetchFixtureCatalog(url, authorization) {
  return new Promise((resolve, reject) => {
    const headers = authorization === null ? { Accept: "application/json" } : { Accept: "application/json", Authorization: `Bearer ${authorization}` };
    const request = httpRequest(url, { headers, method: "GET", timeout: TIMEOUT_MS }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new StateError("PROVIDER_HTTP_STATUS")); return; }
      const chunks = []; let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) { request.destroy(new StateError("PROVIDER_BODY_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try { const bytes = Buffer.concat(chunks); resolve({ bytes, response: parseStrictJson(bytes, "CATALOG_SCHEMA_INVALID") }); }
        catch (error) { reject(error); }
      });
    });
    request.once("timeout", () => request.destroy(new StateError("PROVIDER_TIMEOUT")));
    request.once("error", (error) => reject(error instanceof StateError ? error : new StateError("PROVIDER_NETWORK_FAILURE")));
    request.end();
  });
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

function ownershipNext(previous, provider) {
  const managedFiles = structuredClone(previous?.managedFiles ?? {});
  const pointers = new Set(managedFiles["models.json"]?.ownedJsonPointers ?? []);
  for (const pointer of ownedProviderPointers(provider)) pointers.add(pointer);
  managedFiles["models.json"] = { ownedJsonPointers: [...pointers].sort(byteOrder) };
  return { managedFiles, schemaVersion: 1 };
}

async function syncFixtureModels({ agentDir, allowEmpty, origin, provider, root }) {
  await recoverTransactions(agentDir);
  if (!PROVIDERS.includes(provider)) throw new StateError("PROVIDER_INVALID");
  const { registry, transformations } = await readFrozenProviderContracts(root);
  const entry = registry.providers[provider];
  const paths = statePaths(agentDir);
  const currentModels = await optionalJson(paths.models, "MODELS_SCHEMA_INVALID", { providers: {} });
  if (!object(currentModels) || !object(currentModels.providers)) throw new StateError("MODELS_SCHEMA_INVALID");
  const previousOwnership = await optionalJson(paths.ownership, "OWNERSHIP_SCHEMA_INVALID", { managedFiles: {}, schemaVersion: 1 });
  validateOwnership(previousOwnership);
  const auth = await optionalJson(paths.auth, "AUTH_SCHEMA_INVALID", {});
  validateAuth(auth);
  const fetched = await fetchFixtureCatalog(new URL(entry.modelsPath, origin), resolveCredential({ auth, legacyModels: currentModels, provider }).key);
  const models = normalizeModels({ provider, response: fetched.response, transformations });
  if (!allowEmpty && models.length === 0) throw new StateError("EMPTY_CATALOG_REJECTED");
  const directory = join(paths.catalogs, provider);
  const oldModels = await optionalJson(join(directory, "current.models.json"), "CATALOG_SCHEMA_INVALID", null);
  const oldMeta = await optionalJson(join(directory, "current.meta.json"), "CATALOG_SCHEMA_INVALID", null);
  const metadata = { catalogSha256: catalogSha256(provider, models), fetchedAtUtc: new Date().toISOString(), modelCount: models.length, providerId: provider, registryVersion: 1, responseSha256: sha256(fetched.bytes), schemaVersion: 1 };
  const nextModels = structuredClone(currentModels);
  nextModels.providers[provider] = piProvider(entry, models, currentModels.providers[provider]);
  const operations = [];
  if (oldModels !== null && oldMeta !== null) operations.push({ bytes: canonicalJson(oldModels), path: join(directory, "previous.models.json") }, { bytes: canonicalJson(oldMeta), path: join(directory, "previous.meta.json") });
  operations.push({ bytes: canonicalJson(catalogPayload(provider, models)), path: join(directory, "current.models.json") }, { bytes: canonicalJson(metadata), path: join(directory, "current.meta.json") }, { bytes: canonicalJson(nextModels), path: paths.models }, { bytes: canonicalJson(ownershipNext(previousOwnership, provider)), path: paths.ownership });
  await applyStateTransaction({ agentDir, operations });
  return { modelCount: models.length, providers: [{ catalogSha256: metadata.catalogSha256, modelCount: models.length, provider }], status: "applied" };
}

export async function syncProviderModelsForTest({ agentDir, allowEmpty = false, capability, origin, provider, root }) {
  const fixture = fixtureOrigin(capability, origin, root);
  return syncFixtureModels({ agentDir, allowEmpty, origin: fixture, provider, root });
}
