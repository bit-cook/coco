import { request as httpsRequest } from "node:https";
import { lstat, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { getAuthStatus } from "./auth-management.mjs";
import { COCO_VERSION, CORE_VERSION, resolveCocoRuntime } from "./coco-runtime-identity.mjs";
import { readFrozenProviderContracts } from "./provider-sync.mjs";
import { projectProviderReadiness } from "./provider-readiness.mjs";
import { verifyRuntimeIntegrity } from "./runtime-integrity.mjs";
import { catalogSha256 } from "./state-catalog.mjs";
import { parseStrictJson, resolveCredential, validateAuth, validateOwnership } from "./state-schema.mjs";
import { agentDirectory, statePaths } from "./state-paths.mjs";

const REGISTRY_URL = "https://registry.npmjs.org/%40earendil-works%2Fpi-coding-agent/latest";
const MAX_BODY = 1024 * 1024;
const DOCTOR_IDS = ["NODE_VERSION", "RUNTIME_INTEGRITY", "CONFIG_SCHEMA", "CONFIG_OWNERSHIP", "SECRET_PERMISSIONS", "AUTH_STATUS", "DEFAULT_MODEL", "CATALOG_FRESHNESS", "CATALOG_HASH", "SESSION_WRITABLE", "TRUST_POLICY", "PROMPT_OWNERSHIP", "GUARD_STATUS", "GUARD_DEGRADED_USER_EXTENSIONS", "PROVIDER_CONNECTIVITY", "WINDOWS_NATIVE_QA_NOT_RUN", "MACOS_NATIVE_QA_NOT_RUN"];
const USER_AGENT = `coco/${COCO_VERSION}`;

function item(id, severity, status, message, details) { return details === undefined ? { id, severity, status, message } : { id, severity, status, message, details }; }
function code(error, fallback) { return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : fallback; }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
async function regularDirectory(path) { const info = await lstat(path); return info.isDirectory() && !info.isSymbolicLink(); }
async function regularFile(path) { const info = await lstat(path); return info.isFile() && !info.isSymbolicLink(); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function catalogStatus(path) {
  const directories = await readdir(path, { withFileTypes: true });
  const catalogs = await Promise.all(directories.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map(async (entry) => {
    const directory = join(path, entry.name);
    const [models, metadata] = await Promise.all([validJson(join(directory, "current.models.json"), "CATALOG_SCHEMA_INVALID", (value) => object(value) && Array.isArray(value.models) && typeof value.providerId === "string" ? value : (() => { throw new Error("CATALOG_SCHEMA_INVALID"); })()), validJson(join(directory, "current.meta.json"), "CATALOG_SCHEMA_INVALID", (value) => object(value) && typeof value.catalogSha256 === "string" ? value : (() => { throw new Error("CATALOG_SCHEMA_INVALID"); })())]);
    return metadata.catalogSha256 === catalogSha256(models.providerId, models.models);
  }));
  return { fresh: catalogs.length > 0, hashesValid: catalogs.length > 0 && catalogs.every(Boolean) };
}
function version(value) { const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(value); return match === null ? null : match.slice(1).map(Number); }
function compare(left, right) { const a = version(left); const b = version(right); if (a === null || b === null) return null; for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1; return 0; }
function report(command, checks) {
  const sorted = [...checks].sort((left, right) => left.id.localeCompare(right.id));
  const fatal = sorted.some((entry) => entry.status === "fail" && entry.severity === "fatal");
  const inconclusive = sorted.some((entry) => entry.status === "fail" && entry.details?.failureCode !== undefined && entry.details.failureCode !== "OFFLINE" && entry.details.failureCode !== "AUTH_REJECTED");
  const warning = sorted.some((entry) => entry.status === "fail" && entry.severity === "warning");
  const status = fatal ? "fatal" : inconclusive ? "inconclusive" : warning ? "warning" : "healthy";
  return { schemaVersion: 1, command, status, exitCode: fatal || inconclusive ? 1 : 0, checks: sorted };
}
async function validJson(path, invalidCode, validate) { return validate(parseStrictJson(await readFile(path), invalidCode)); }
async function localCore(root) {
  const [runtime, integrity] = await Promise.all([resolveCocoRuntime({ root }), verifyRuntimeIntegrity({ root })]);
  return [item("CORE_VERSION", runtime.status === "approved" ? "info" : "fatal", runtime.status === "approved" ? "pass" : "fail", runtime.status === "approved" ? `Core ${CORE_VERSION} is installed.` : runtime.code), item("CORE_INTEGRITY", integrity.status === "approved" ? "info" : "fatal", integrity.status === "approved" ? "pass" : "fail", integrity.status === "approved" ? "Runtime integrity is verified." : integrity.code)];
}
function registry() {
  return new Promise((resolve) => {
const request = httpsRequest(REGISTRY_URL, { method: "GET", headers: { Accept: "application/json", "User-Agent": USER_AGENT }, timeout: 10_000 }, (response) => {
      const status = response.statusCode ?? 0;
      if (status !== 200) { response.resume(); resolve({ kind: "http", status }); return; }
      const chunks = []; let size = 0;
      response.on("data", (chunk) => { size += chunk.length; if (size > MAX_BODY) request.destroy(Object.assign(new Error("BODY_TOO_LARGE"), { code: "BODY_TOO_LARGE" })); else chunks.push(chunk); });
      response.on("end", () => { try { const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); resolve(object(body) && typeof body.version === "string" && version(body.version) !== null ? { kind: "ok", version: body.version } : { kind: "schema" }); } catch { resolve({ kind: "schema" }); } });
    });
    request.once("timeout", () => request.destroy(Object.assign(new Error("TIMEOUT"), { code: "TIMEOUT" })));
    request.once("error", (error) => resolve({ kind: "error", failureCode: error instanceof Error && "code" in error && error.code === "TIMEOUT" ? "TIMEOUT" : "DNS_FAILURE" }));
    request.end();
  });
}
function providerProbe(url, authorization) {
  return new Promise((resolve) => {
    const headers = authorization === null ? { Accept: "application/json", "User-Agent": USER_AGENT } : { Accept: "application/json", Authorization: `Bearer ${authorization}`, "User-Agent": USER_AGENT };
    const request = httpsRequest(url, { method: "GET", headers, timeout: 10_000 }, (response) => {
      const status = response.statusCode ?? 0;
      if (status === 401 || status === 403) { response.resume(); resolve({ kind: "auth", status }); return; }
      if (status !== 200) { response.resume(); resolve({ kind: "http", status }); return; }
      const chunks = []; let size = 0;
      response.on("data", (chunk) => { size += chunk.length; if (size > MAX_BODY) request.destroy(Object.assign(new Error("BODY_TOO_LARGE"), { code: "BODY_TOO_LARGE" })); else chunks.push(chunk); });
      response.on("end", () => { try { const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); resolve(object(body) && Array.isArray(body.data) ? { kind: "ok" } : { kind: "schema" }); } catch { resolve({ kind: "schema" }); } });
    });
    request.once("timeout", () => request.destroy(Object.assign(new Error("TIMEOUT"), { code: "TIMEOUT" })));
    request.once("error", (error) => {
      const errorCode = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "";
      resolve({ kind: "error", failureCode: errorCode === "ETIMEDOUT" || errorCode === "TIMEOUT" ? "TIMEOUT" : errorCode.startsWith("ERR_TLS") || errorCode.includes("CERT") ? "TLS_FAILURE" : "DNS_FAILURE" });
    });
    request.end();
  });
}
export async function coreStatus({ root }) { return report("core status", await localCore(root)); }
export async function coreCheck({ root }) {
  const checks = await localCore(root);
  if (process.env.PI_OFFLINE === "1") {
    return report("core check", [...checks, item("CORE_REGISTRY_CHECK", "info", "skipped", "Registry check skipped while offline.", { failureCode: "OFFLINE" })]);
  }
  const result = await registry();
  if (result.kind === "ok") { const relation = compare(CORE_VERSION, result.version); return report("core check", [...checks, item("CORE_REGISTRY_CHECK", "info", "pass", relation === 0 ? "up-to-date" : relation < 0 ? "update-available" : "local-newer")]); }
  const details = result.kind === "http" ? { failureCode: "HTTP_STATUS", httpStatus: result.status } : { failureCode: result.kind === "schema" ? "RESPONSE_SCHEMA" : result.failureCode };
  return report("core check", [...checks, item("CORE_REGISTRY_CHECK", "warning", "fail", "Registry check was inconclusive.", details)]);
}
export async function doctor({ connectivity = false, providerProbe: probe = providerProbe, root }) {
  const agentDir = agentDirectory(); const paths = statePaths(agentDir); const checks = [];
  const runtime = await resolveCocoRuntime({ root }); const integrity = await verifyRuntimeIntegrity({ root });
  checks.push(item("NODE_VERSION", runtime.status === "approved" ? "info" : "fatal", runtime.status === "approved" ? "pass" : "fail", runtime.status === "approved" ? "Supported Node runtime is active." : runtime.code));
  checks.push(item("RUNTIME_INTEGRITY", integrity.status === "approved" ? "info" : "fatal", integrity.status === "approved" ? "pass" : "fail", integrity.status === "approved" ? "Runtime integrity is verified." : integrity.code));
  let settings; let models; let ownership; const providerReadiness = new Map();
  try { settings = await validJson(paths.settings, "SETTINGS_SCHEMA_INVALID", (value) => object(value) ? value : (() => { throw new Error("SETTINGS_SCHEMA_INVALID"); })()); models = await validJson(paths.models, "MODELS_SCHEMA_INVALID", (value) => object(value) && object(value.providers) ? value : (() => { throw new Error("MODELS_SCHEMA_INVALID"); })()); await validJson(paths.auth, "AUTH_SCHEMA_INVALID", validateAuth); checks.push(item("CONFIG_SCHEMA", "info", "pass", "Managed state files are valid.")); } catch (error) { checks.push(item("CONFIG_SCHEMA", "fatal", "fail", code(error, "CONFIG_SCHEMA_INVALID"))); }
  const defaultProvider = typeof settings?.defaultProvider === "string" ? settings.defaultProvider : null;
  const defaultModel = typeof settings?.defaultModel === "string" ? settings.defaultModel : null;
  const providerConfigured = defaultProvider !== null && object(models?.providers?.[defaultProvider]);
  const modelAvailable = providerConfigured && defaultModel !== null && Array.isArray(models.providers[defaultProvider].models) && models.providers[defaultProvider].models.some((model) => model?.id === defaultModel);
  checks.push(item("DEFAULT_MODEL", modelAvailable ? "info" : "warning", modelAvailable ? "pass" : "fail", "Default model resolution was checked."));
  try { ownership = await validJson(paths.ownership, "OWNERSHIP_SCHEMA_INVALID", validateOwnership); checks.push(item("CONFIG_OWNERSHIP", "info", "pass", "Ownership metadata is valid.")); } catch (error) { const missing = code(error, "") === "ENOENT"; checks.push(item("CONFIG_OWNERSHIP", missing ? "warning" : "fatal", "fail", missing ? "Ownership metadata is missing; run coco manage bootstrap --yes." : code(error, "OWNERSHIP_SCHEMA_INVALID"))); }
  try {
    const provider = settings?.defaultProvider;
    if (typeof provider !== "string") throw new Error("DEFAULT_PROVIDER_INVALID");
    const [entry] = await getAuthStatus({ agentDir, provider });
    const failed = !entry.available || entry.rotationRequired;
    providerReadiness.set(provider, projectProviderReadiness({ catalogStatus: "unknown", configurationStatus: providerConfigured ? "configured" : "missing", credentialSource: entry.source, credentialStatus: entry.available ? "available" : "missing", modelId: defaultModel, modelStatus: modelAvailable ? "available" : "missing", provider, rotationRequired: entry.rotationRequired }));
    checks.push(item("AUTH_STATUS", failed ? "warning" : "info", failed ? "fail" : "pass", "Default provider credential availability was checked.", { provider: entry.provider, present: entry.available, source: entry.source, rotationRequired: entry.rotationRequired }));
  } catch (error) { checks.push(item("AUTH_STATUS", "fatal", "fail", code(error, "AUTH_SCHEMA_INVALID"))); }
  try { const directory = await lstat(agentDir); const auth = await lstat(paths.auth); const safe = directory.isDirectory() && !directory.isSymbolicLink() && auth.isFile() && !auth.isSymbolicLink() && (process.platform === "win32" || ((directory.mode & 0o077) === 0 && (auth.mode & 0o077) === 0)); checks.push(item("SECRET_PERMISSIONS", safe ? "info" : "fatal", safe ? "pass" : "fail", safe ? "Secret storage permissions are restricted." : "Secret storage permissions are unsafe.")); } catch { checks.push(item("SECRET_PERMISSIONS", "warning", "skipped", "No auth store is present.")); }
  try { const catalog = await catalogStatus(paths.catalogs); checks.push(item("CATALOG_FRESHNESS", catalog.fresh ? "info" : "warning", catalog.fresh ? "pass" : "fail", catalog.fresh ? "Current catalog metadata is present." : "No current catalog is available.")); checks.push(item("CATALOG_HASH", catalog.hashesValid ? "info" : "warning", catalog.hashesValid ? "pass" : "fail", catalog.hashesValid ? "Current catalog hashes are valid." : "Current catalog hashes are invalid or unavailable.")); } catch { checks.push(item("CATALOG_FRESHNESS", "warning", "fail", "No current catalog is available.")); checks.push(item("CATALOG_HASH", "warning", "fail", "Current catalog hashes are invalid or unavailable.")); }
  try { const sessions = join(agentDir, "sessions"); const writable = await regularDirectory(sessions) && (process.platform === "win32" || ((await lstat(sessions)).mode & 0o200) !== 0); checks.push(item("SESSION_WRITABLE", writable ? "info" : "warning", writable ? "pass" : "fail", writable ? "Session storage is writable." : "Session storage is unavailable or not writable.")); } catch { checks.push(item("SESSION_WRITABLE", "warning", "fail", "Session storage is unavailable or not writable.")); }
  try { const policy = join(root, "resources", "project-resource-policy.v1.json"); const document = parseStrictJson(await readFile(policy), "TRUST_POLICY_INVALID"); const valid = await regularFile(policy) && object(document) && document.schemaVersion === 1 && document.policy === "global-only"; checks.push(item("TRUST_POLICY", valid ? "info" : "fatal", valid ? "pass" : "fail", valid ? "Packaged trust policy is valid." : "Packaged trust policy is invalid.")); } catch (error) { checks.push(item("TRUST_POLICY", "fatal", "fail", code(error, "TRUST_POLICY_INVALID"))); }
  try { const system = join(agentDir, "SYSTEM.md"); const append = join(agentDir, "APPEND_SYSTEM.md"); let status = "pass"; let message = "Prompt ownership is valid."; try { await lstat(system); status = "fail"; message = "An unowned system prompt override is active."; } catch (error) { if (code(error, "") !== "ENOENT") throw error; } if (status === "pass") { try { const expected = ownership?.managedFiles?.["APPEND_SYSTEM.md"]?.sourceSha256; if (typeof expected !== "string" || !await regularFile(append) || sha256(await readFile(append)) !== expected) { status = "fail"; message = "Managed prompt ownership cannot be verified."; } } catch (error) { if (code(error, "") !== "ENOENT") throw error; } } checks.push(item("PROMPT_OWNERSHIP", status === "pass" ? "info" : "warning", status, message)); } catch (error) { checks.push(item("PROMPT_OWNERSHIP", "warning", "fail", code(error, "PROMPT_OWNERSHIP_INVALID"))); }
  try { const guard = await regularFile(join(root, "resources", "coco-guard.mjs")); checks.push(item("GUARD_STATUS", guard ? "info" : "fatal", guard ? "pass" : "fail", guard ? "Packaged guard is available." : "Packaged guard is invalid.")); } catch { checks.push(item("GUARD_STATUS", "fatal", "fail", "Packaged guard is unavailable.")); }
  checks.push(item("GUARD_DEGRADED_USER_EXTENSIONS", "warning", "skipped", "No user extension was requested.")); checks.push(item("WINDOWS_NATIVE_QA_NOT_RUN", "warning", "skipped", "Windows native QA was not run locally.")); checks.push(item("MACOS_NATIVE_QA_NOT_RUN", "warning", "skipped", "macOS native QA was not run locally."));
  if (!connectivity || process.env.PI_OFFLINE === "1") {
    checks.push(item("PROVIDER_CONNECTIVITY", "warning", "skipped", connectivity ? "Connectivity was skipped while offline." : "Connectivity was not requested.", { failureCode: "OFFLINE" }));
  } else {
    try {
      let auth = {};
      try { auth = await validJson(paths.auth, "AUTH_SCHEMA_INVALID", validateAuth); } catch (error) { if (code(error, "") !== "ENOENT") throw error; }
       const { registry: providers } = await readFrozenProviderContracts(root);
       const authStatuses = new Map((await getAuthStatus({ agentDir })).map((entry) => [entry.provider, entry]));
       const configured = Object.entries(providers.providers).map(([provider, definition]) => ({ credential: resolveCredential({ auth, provider }), definition, provider })).filter(({ credential }) => credential.key !== null);
       if (configured.length === 0) { checks.push(item("PROVIDER_CONNECTIVITY", "info", "skipped", "No configured providers were available to probe.")); }
       else {
       const probes = await Promise.all(configured.map(({ credential, definition }) => probe(new URL(definition.modelsPath, definition.origin), credential.key)));
       for (let index = 0; index < configured.length; index += 1) {
         const { credential, provider } = configured[index]; const result = probes[index]; const authStatus = authStatuses.get(provider);
         const isDefault = provider === defaultProvider; const configuredProvider = object(models?.providers?.[provider]);
         const availableModel = isDefault ? modelAvailable : configuredProvider && Array.isArray(models.providers[provider].models) && models.providers[provider].models.length > 0;
         providerReadiness.set(provider, projectProviderReadiness({ catalogStatus: "unknown", configurationStatus: configuredProvider ? "configured" : "missing", credentialSource: credential.source, credentialStatus: "available", modelId: isDefault ? defaultModel : null, modelStatus: availableModel ? "available" : "missing", provider, rotationRequired: authStatus?.rotationRequired === true, verificationScope: "models-endpoint", verificationStatus: result.kind === "ok" ? "verified" : result.kind === "auth" ? "rejected" : "inconclusive" }));
       }
       const failure = probes.find((entry) => entry.kind !== "ok");
      if (failure === undefined) checks.push(item("PROVIDER_CONNECTIVITY", "info", "pass", "Provider connectivity is healthy."));
      else if (failure.kind === "auth") checks.push(item("PROVIDER_CONNECTIVITY", "fatal", "fail", "Provider rejected credentials.", { failureCode: "AUTH_REJECTED", httpStatus: failure.status }));
      else if (failure.kind === "http") checks.push(item("PROVIDER_CONNECTIVITY", "warning", "fail", "Provider returned an unexpected status.", { failureCode: "HTTP_STATUS", httpStatus: failure.status }));
      else checks.push(item("PROVIDER_CONNECTIVITY", "warning", "fail", "Provider connectivity was inconclusive.", { failureCode: failure.kind === "schema" ? "RESPONSE_SCHEMA" : failure.failureCode }));
      }
    } catch (error) { checks.push(item("PROVIDER_CONNECTIVITY", "fatal", "fail", code(error, "RESPONSE_SCHEMA"))); }
  }
  const ids = new Set(checks.map((entry) => entry.id)); if (DOCTOR_IDS.some((id) => !ids.has(id))) throw new Error("DIAGNOSTIC_CHECK_MISSING");
  return { ...report("doctor", checks), providers: [...providerReadiness.values()] };
}
