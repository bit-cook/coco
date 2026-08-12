import { resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { syncModels } from "./provider-sync.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { MANAGED_PROVIDER_IDS } from "./product-identity.generated.mjs";

const capabilities = new WeakMap();
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

export async function syncProviderModelsForTest({ agentDir, allowEmpty = false, capability, origin, provider, root }) {
  const fixture = fixtureOrigin(capability, origin, root);
  if (!MANAGED_PROVIDER_IDS.includes(provider)) throw new StateError("PROVIDER_INVALID");
  return syncModels({
    agentDir,
    allowEmpty,
    fetchCatalog: ({ authorization, entry }) => fetchFixtureCatalog(new URL(entry.modelsPath, fixture), authorization),
    providerIds: [provider],
    root,
  });
}
