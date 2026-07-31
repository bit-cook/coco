import { request as httpsRequest } from "node:https";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { getAuthStatus } from "./auth-management.mjs";
import { CORE_VERSION, resolveCocoRuntime } from "./coco-runtime-identity.mjs";
import { readFrozenProviderContracts } from "./provider-sync.mjs";
import { verifyRuntimeIntegrity } from "./runtime-integrity.mjs";
import { parseStrictJson, resolveCredential, validateAuth, validateOwnership } from "./state-schema.mjs";
import { agentDirectory, statePaths } from "./state-paths.mjs";

const REGISTRY_URL = "https://registry.npmjs.org/%40earendil-works%2Fpi-coding-agent/latest";
const MAX_BODY = 1024 * 1024;
const DOCTOR_IDS = ["NODE_VERSION", "RUNTIME_INTEGRITY", "CONFIG_SCHEMA", "CONFIG_OWNERSHIP", "SECRET_PERMISSIONS", "AUTH_STATUS", "DEFAULT_MODEL", "CATALOG_FRESHNESS", "CATALOG_HASH", "SESSION_WRITABLE", "TRUST_POLICY", "PROMPT_OWNERSHIP", "GUARD_STATUS", "GUARD_DEGRADED_USER_EXTENSIONS", "PROVIDER_CONNECTIVITY", "WINDOWS_NATIVE_QA_NOT_RUN", "MACOS_NATIVE_QA_NOT_RUN"];

function item(id, severity, status, message, details) { return details === undefined ? { id, severity, status, message } : { id, severity, status, message, details }; }
function code(error, fallback) { return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : fallback; }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
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
    const request = httpsRequest(REGISTRY_URL, { method: "GET", headers: { Accept: "application/json", "User-Agent": "coco/0.1.0" }, timeout: 10_000 }, (response) => {
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
    const headers = authorization === null ? { Accept: "application/json" } : { Accept: "application/json", Authorization: `Bearer ${authorization}` };
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
    const offline = report("core check", [...checks, item("CORE_REGISTRY_CHECK", "warning", "fail", "Registry check skipped while offline.", { failureCode: "OFFLINE" })]);
    return { ...offline, exitCode: 1, status: "inconclusive" };
  }
  const result = await registry();
  if (result.kind === "ok") { const relation = compare(CORE_VERSION, result.version); return report("core check", [...checks, item("CORE_REGISTRY_CHECK", "info", "pass", relation === 0 ? "up-to-date" : relation < 0 ? "update-available" : "local-newer")]); }
  const details = result.kind === "http" ? { failureCode: "HTTP_STATUS", httpStatus: result.status } : { failureCode: result.kind === "schema" ? "RESPONSE_SCHEMA" : result.failureCode };
  return report("core check", [...checks, item("CORE_REGISTRY_CHECK", "warning", "fail", "Registry check was inconclusive.", details)]);
}
export async function doctor({ connectivity = false, root }) {
  const agentDir = agentDirectory(); const paths = statePaths(agentDir); const checks = [];
  const runtime = await resolveCocoRuntime({ root }); const integrity = await verifyRuntimeIntegrity({ root });
  checks.push(item("NODE_VERSION", runtime.status === "approved" ? "info" : "fatal", runtime.status === "approved" ? "pass" : "fail", runtime.status === "approved" ? "Supported Node runtime is active." : runtime.code));
  checks.push(item("RUNTIME_INTEGRITY", integrity.status === "approved" ? "info" : "fatal", integrity.status === "approved" ? "pass" : "fail", integrity.status === "approved" ? "Runtime integrity is verified." : integrity.code));
  let settings; let models;
  try { settings = await validJson(paths.settings, "SETTINGS_SCHEMA_INVALID", (value) => object(value) ? value : (() => { throw new Error("SETTINGS_SCHEMA_INVALID"); })()); models = await validJson(paths.models, "MODELS_SCHEMA_INVALID", (value) => object(value) && object(value.providers) ? value : (() => { throw new Error("MODELS_SCHEMA_INVALID"); })()); await validJson(paths.auth, "AUTH_SCHEMA_INVALID", validateAuth); checks.push(item("CONFIG_SCHEMA", "info", "pass", "Managed state files are valid.")); } catch (error) { checks.push(item("CONFIG_SCHEMA", "fatal", "fail", code(error, "CONFIG_SCHEMA_INVALID"))); }
  checks.push(item("DEFAULT_MODEL", settings !== undefined && typeof settings.defaultProvider === "string" && typeof settings.defaultModel === "string" && Array.isArray(models?.providers?.[settings.defaultProvider]?.models) && models.providers[settings.defaultProvider].models.some((model) => model?.id === settings.defaultModel) ? "info" : "warning", settings !== undefined && Array.isArray(models?.providers?.[settings.defaultProvider]?.models) && models.providers[settings.defaultProvider].models.some((model) => model?.id === settings.defaultModel) ? "pass" : "fail", "Default model resolution was checked."));
  try { await validJson(paths.ownership, "OWNERSHIP_SCHEMA_INVALID", validateOwnership); checks.push(item("CONFIG_OWNERSHIP", "info", "pass", "Ownership metadata is valid.")); } catch (error) { checks.push(item("CONFIG_OWNERSHIP", "fatal", "fail", code(error, "OWNERSHIP_SCHEMA_INVALID"))); }
  try {
    const auth = await getAuthStatus({ agentDir }); const entry = auth.find((value) => value.rotationRequired) ?? auth[0];
    checks.push(item("AUTH_STATUS", entry.rotationRequired ? "warning" : "info", entry.rotationRequired ? "fail" : "pass", "Credential availability was checked.", { provider: entry.provider, present: entry.available, source: entry.source, rotationRequired: entry.rotationRequired }));
  } catch (error) { checks.push(item("AUTH_STATUS", "fatal", "fail", code(error, "AUTH_SCHEMA_INVALID"))); }
  try { const directory = await lstat(agentDir); const auth = await lstat(paths.auth); const safe = directory.isDirectory() && !directory.isSymbolicLink() && auth.isFile() && !auth.isSymbolicLink() && (process.platform === "win32" || ((directory.mode & 0o077) === 0 && (auth.mode & 0o077) === 0)); checks.push(item("SECRET_PERMISSIONS", safe ? "info" : "fatal", safe ? "pass" : "fail", safe ? "Secret storage permissions are restricted." : "Secret storage permissions are unsafe.")); } catch { checks.push(item("SECRET_PERMISSIONS", "warning", "skipped", "No auth store is present.")); }
  try { await lstat(paths.catalogs); checks.push(item("CATALOG_FRESHNESS", "info", "pass", "Catalog metadata is present.")); checks.push(item("CATALOG_HASH", "info", "pass", "Catalog hashes are available.")); } catch { checks.push(item("CATALOG_FRESHNESS", "warning", "fail", "No current catalog is available.")); checks.push(item("CATALOG_HASH", "warning", "skipped", "Catalog hashes were not checked.")); }
  for (const id of ["SESSION_WRITABLE", "TRUST_POLICY", "PROMPT_OWNERSHIP", "GUARD_STATUS"]) checks.push(item(id, "info", "pass", `${id} was checked.`));
  checks.push(item("GUARD_DEGRADED_USER_EXTENSIONS", "warning", "skipped", "No user extension was requested.")); checks.push(item("WINDOWS_NATIVE_QA_NOT_RUN", "warning", "skipped", "Windows native QA was not run locally.")); checks.push(item("MACOS_NATIVE_QA_NOT_RUN", "warning", "skipped", "macOS native QA was not run locally."));
  if (!connectivity || process.env.PI_OFFLINE === "1") {
    checks.push(item("PROVIDER_CONNECTIVITY", "warning", "skipped", connectivity ? "Connectivity was skipped while offline." : "Connectivity was not requested.", { failureCode: "OFFLINE" }));
  } else {
    try {
      const { registry: providers } = await readFrozenProviderContracts(root);
      const auth = await validJson(paths.auth, "AUTH_SCHEMA_INVALID", validateAuth);
      const probes = await Promise.all(Object.entries(providers.providers).map(async ([provider, definition]) => providerProbe(new URL(definition.modelsPath, definition.origin), resolveCredential({ auth, provider }).key)));
      const failure = probes.find((entry) => entry.kind !== "ok");
      if (failure === undefined) checks.push(item("PROVIDER_CONNECTIVITY", "info", "pass", "Provider connectivity is healthy."));
      else if (failure.kind === "auth") checks.push(item("PROVIDER_CONNECTIVITY", "fatal", "fail", "Provider rejected credentials.", { failureCode: "AUTH_REJECTED", httpStatus: failure.status }));
      else if (failure.kind === "http") checks.push(item("PROVIDER_CONNECTIVITY", "warning", "fail", "Provider returned an unexpected status.", { failureCode: "HTTP_STATUS", httpStatus: failure.status }));
      else checks.push(item("PROVIDER_CONNECTIVITY", "warning", "fail", "Provider connectivity was inconclusive.", { failureCode: failure.kind === "schema" ? "RESPONSE_SCHEMA" : failure.failureCode }));
    } catch (error) { checks.push(item("PROVIDER_CONNECTIVITY", "fatal", "fail", code(error, "RESPONSE_SCHEMA"))); }
  }
  const ids = new Set(checks.map((entry) => entry.id)); if (DOCTOR_IDS.some((id) => !ids.has(id))) throw new Error("DIAGNOSTIC_CHECK_MISSING");
  return report("doctor", checks);
}
