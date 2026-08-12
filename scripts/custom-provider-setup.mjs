import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }

async function readObject(path, fallback, code) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!object(value)) fail(code);
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    if (error?.code === code) throw error;
    fail(code);
  }
}

export function normalizeCustomBaseUrl(value) {
  let parsed;
  try { parsed = new URL(String(value ?? "").trim()); } catch { fail("CUSTOM_BASE_URL_INVALID"); }
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) fail("CUSTOM_BASE_URL_INVALID");
  return parsed.toString().replace(/\/$/, "");
}

export function customProviderId(baseUrl) {
  const hostname = new URL(baseUrl).hostname.toLowerCase().replace(/^api\./, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `custom-${hostname || "provider"}`;
}

export async function fetchCustomProviderModels({ baseUrl, fetchImpl = fetch, key, signal } = {}) {
  const normalized = normalizeCustomBaseUrl(baseUrl);
  if (typeof key !== "string" || key.trim() !== key || key.length === 0 || /[\r\n\0]/.test(key)) fail("CUSTOM_API_KEY_INVALID");
  const response = await fetchImpl(`${normalized}/models`, { headers: { Accept: "application/json", Authorization: `Bearer ${key}` }, signal });
  if (!response.ok) fail(`CUSTOM_MODELS_HTTP_${response.status}`);
  let payload;
  try { payload = await response.json(); } catch { fail("CUSTOM_MODELS_RESPONSE_INVALID"); }
  if (!object(payload) || !Array.isArray(payload.data)) fail("CUSTOM_MODELS_RESPONSE_INVALID");
  const ids = [...new Set(payload.data.map((entry) => object(entry) ? entry.id : undefined).filter((id) => typeof id === "string" && id.trim() === id && id.length > 0))].sort();
  if (ids.length === 0) fail("CUSTOM_MODELS_EMPTY");
  return ids;
}

export async function saveCustomProvider({ agentDir, baseUrl, key, modelId, providerId = customProviderId(normalizeCustomBaseUrl(baseUrl)) } = {}) {
  const normalized = normalizeCustomBaseUrl(baseUrl);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(providerId)) fail("CUSTOM_PROVIDER_ID_INVALID");
  if (typeof key !== "string" || key.trim() !== key || key.length === 0 || /[\r\n\0]/.test(key)) fail("CUSTOM_API_KEY_INVALID");
  if (typeof modelId !== "string" || modelId.trim() !== modelId || modelId.length === 0) fail("CUSTOM_MODEL_ID_INVALID");
  const paths = statePaths(agentDir);
  const [models, auth, settings] = await Promise.all([
    readObject(paths.models, { providers: {} }, "MODELS_SCHEMA_INVALID"),
    readObject(paths.auth, {}, "AUTH_SCHEMA_INVALID"),
    readObject(paths.settings, {}, "SETTINGS_SCHEMA_INVALID"),
  ]);
  if (!object(models.providers)) fail("MODELS_SCHEMA_INVALID");
  models.providers[providerId] = {
    api: "openai-completions",
    authHeader: true,
    baseUrl: normalized,
    compat: { maxTokensField: "max_tokens", supportsDeveloperRole: false, supportsReasoningEffort: false },
    models: [{ contextWindow: 128000, cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 }, id: modelId, input: ["text"], maxTokens: 16384, name: modelId, reasoning: false }],
    name: `Custom (${new URL(normalized).host})`,
  };
  auth[providerId] = { key, type: "api_key" };
  settings.defaultProvider = providerId;
  settings.defaultModel = modelId;
  await applyStateTransaction({ agentDir, operations: [
    { bytes: canonicalJson(models), path: paths.models },
    { bytes: canonicalJson(auth), containsSecret: true, path: paths.auth },
    { bytes: canonicalJson(settings), path: paths.settings },
  ] });
  return { baseUrl: normalized, modelId, providerId };
}
