import { closeSync, existsSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function text(value, code) {
  const result = String(value ?? "").trim();
  if (result === "") fail(code);
  return result;
}
function positiveInteger(value, fallback, code) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(code);
  return parsed;
}
function readObject(path, fallback, code) {
  if (!existsSync(path)) return structuredClone(fallback);
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); } catch { fail(code); }
  if (!object(value)) fail(code);
  return value;
}
function atomicJson(path, value) {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value)}\n`); } finally { closeSync(descriptor); }
  renameSync(temporary, path);
}

export function configureIntranetModel({ agentDir, environment = process.env, key } = {}) {
  const provider = text(environment.COCO_INTRANET_PROVIDER || "intranet", "INTRANET_PROVIDER_REQUIRED");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(provider)) fail("INTRANET_PROVIDER_INVALID");
  const baseUrl = text(environment.COCO_INTRANET_BASE_URL, "INTRANET_BASE_URL_REQUIRED");
  let parsedUrl;
  try { parsedUrl = new URL(baseUrl); } catch { fail("INTRANET_BASE_URL_INVALID"); }
  if (!new Set(["http:", "https:"]).has(parsedUrl.protocol)) fail("INTRANET_BASE_URL_INVALID");
  const modelId = text(environment.COCO_INTRANET_MODEL_ID, "INTRANET_MODEL_ID_REQUIRED");
  const modelName = text(environment.COCO_INTRANET_MODEL_NAME || modelId, "INTRANET_MODEL_NAME_REQUIRED");
  const contextWindow = positiveInteger(environment.COCO_INTRANET_CONTEXT_WINDOW, 128000, "INTRANET_CONTEXT_WINDOW_INVALID");
  const maxTokens = positiveInteger(environment.COCO_INTRANET_MAX_TOKENS, 16384, "INTRANET_MAX_TOKENS_INVALID");
  const authHeader = environment.COCO_INTRANET_AUTH_HEADER !== "0";
  const keyEnvironment = text(environment.COCO_INTRANET_API_KEY_ENV || "INTRANET_AI_API_KEY", "INTRANET_API_KEY_ENV_REQUIRED");
  if (!/^[A-Z][A-Z0-9_]*$/.test(keyEnvironment)) fail("INTRANET_API_KEY_ENV_INVALID");

  const modelsPath = join(agentDir, "models.json");
  const settingsPath = join(agentDir, "settings.json");
  const authPath = join(agentDir, "auth.json");
  const models = readObject(modelsPath, { providers: {} }, "MODELS_SCHEMA_INVALID");
  if (!object(models.providers)) fail("MODELS_SCHEMA_INVALID");
  if (provider in models.providers) fail("INTRANET_PROVIDER_CONFLICT");

  models.providers[provider] = {
    api: "openai-completions",
    apiKey: authHeader ? `$${keyEnvironment}` : "intranet-keyless",
    authHeader,
    baseUrl: parsedUrl.toString().replace(/\/$/, ""),
    compat: { maxTokensField: "max_tokens", supportsDeveloperRole: false, supportsReasoningEffort: false },
    models: [{
      contextWindow,
      cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
      id: modelId,
      input: ["text"],
      maxTokens,
      name: modelName,
      reasoning: false,
    }],
  };

  const settings = readObject(settingsPath, {}, "SETTINGS_SCHEMA_INVALID");
  if (!("defaultProvider" in settings)) settings.defaultProvider = provider;
  if (!("defaultModel" in settings)) settings.defaultModel = modelId;
  if (!("defaultThinkingLevel" in settings)) settings.defaultThinkingLevel = "off";
  const auth = readObject(authPath, {}, "AUTH_SCHEMA_INVALID");
  if (key !== undefined) {
    if (typeof key !== "string" || key === "" || key.trim() !== key || /[\r\n\0]/.test(key)) fail("INTRANET_API_KEY_INVALID");
    if (provider in auth) fail("INTRANET_AUTH_CONFLICT");
    auth[provider] = { key, type: "api_key" };
    delete models.providers[provider].apiKey;
  }

  atomicJson(modelsPath, models);
  atomicJson(settingsPath, settings);
  atomicJson(authPath, auth);
  return { auth: key === undefined ? (authHeader ? `environment:${keyEnvironment}` : "none") : "stored", baseUrl: models.providers[provider].baseUrl, modelId, provider };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const agentDir = process.argv[2];
  if (!agentDir) fail("INTRANET_AGENT_DIR_REQUIRED");
  const keyFile = process.argv[3];
  const key = keyFile ? readFileSync(keyFile, "utf8").replace(/\r?\n$/, "") : undefined;
  process.stdout.write(`${JSON.stringify(configureIntranetModel({ agentDir, key }))}\n`);
}
