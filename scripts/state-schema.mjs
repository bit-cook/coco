import { readFile } from "node:fs/promises";

export class StateError extends Error {
  constructor(code) { super(code); this.code = code; this.name = "StateError"; }
}

const managedProviders = new Set(["idepub", "achai", "agnes", "stepfun"]);
const providerEnvironment = Object.freeze({ achai: "ACHAI_API_KEY", agnes: "AGNES_API_KEY", idepub: "IDEPUB_API_KEY", stepfun: "STEPFUN_API_KEY" });
const envKey = /^[A-Z][A-Z0-9_]*$/;
const pointerToken = /^(?:[^~/]|~0|~1)*$/;

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function fail(code) { throw new StateError(code); }

export function parseStrictJson(bytes, code = "STATE_JSON_INVALID") {
  let value;
  try { value = JSON.parse(Buffer.isBuffer(bytes) ? new TextDecoder("utf-8", { fatal: true }).decode(bytes) : bytes); } catch { fail(code); }
  return value;
}

export async function readStrictJson(path, code) { return parseStrictJson(await readFile(path), code); }

export function validateAuth(value) {
  if (!object(value)) fail("AUTH_SCHEMA_INVALID");
  for (const provider of managedProviders) {
    if (!(provider in value)) continue;
    const entry = value[provider];
    if (!object(entry) || entry.type !== "api_key" || typeof entry.key !== "string" || entry.key.length === 0) fail("AUTH_SCHEMA_INVALID");
    if (Object.keys(entry).some((key) => key !== "type" && key !== "key" && key !== "env")) fail("AUTH_SCHEMA_INVALID");
    if ("env" in entry) {
      if (!object(entry.env)) fail("AUTH_SCHEMA_INVALID");
      for (const [key, envValue] of Object.entries(entry.env)) if (!envKey.test(key) || typeof envValue !== "string") fail("AUTH_SCHEMA_INVALID");
    }
  }
  return value;
}

export function validateOwnership(value) {
  if (!object(value) || value.schemaVersion !== 1 || !object(value.managedFiles)) fail("OWNERSHIP_SCHEMA_INVALID");
  for (const entry of Object.values(value.managedFiles)) {
    if (!object(entry) || !Array.isArray(entry.ownedJsonPointers) || entry.ownedJsonPointers.some((pointer) => typeof pointer !== "string" || !pointer.startsWith("/") || pointer.slice(1).split("/").some((segment) => !pointerToken.test(segment)))) fail("OWNERSHIP_SCHEMA_INVALID");
  }
  return value;
}

export function validateJournal(value) {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.transactionId !== "string" || !["prepared", "applying", "committed"].includes(value.phase) || !Number.isInteger(value.nextIndex) || value.nextIndex < 0 || !Array.isArray(value.operations)) fail("JOURNAL_SCHEMA_INVALID");
  for (const operation of value.operations) if (!object(operation) || typeof operation.path !== "string" || !(operation.beforeSha256 === null || /^[a-f0-9]{64}$/.test(operation.beforeSha256)) || !/^[a-f0-9]{64}$/.test(operation.afterSha256) || typeof operation.tempPath !== "string" || !(operation.redactedBackupPath === null || typeof operation.redactedBackupPath === "string") || typeof operation.containsSecret !== "boolean") fail("JOURNAL_SCHEMA_INVALID");
  if (value.nextIndex > value.operations.length) fail("JOURNAL_SCHEMA_INVALID");
  return value;
}

export function encodePointerSegment(value) { return value.replace(/~/g, "~0").replace(/\//g, "~1"); }
export function decodePointerSegment(value) {
  if (!pointerToken.test(value)) fail("OWNERSHIP_POINTER_INVALID");
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function ownedProviderPointers(provider) {
  const segment = encodePointerSegment(provider);
  return ["baseUrl", "api", "authHeader", "compat", "models"].map((field) => `/providers/${segment}/${field}`);
}

export function ownedSettingsPointers() {
  return ["/defaultProvider", "/defaultModel", "/defaultThinkingLevel", "/enableInstallTelemetry", "/enabledModels", "/lastChangelogVersion"];
}

export function mergeOwnedValues({ existing, desired, pointers }) {
  if (!object(existing) || !object(desired) || !Array.isArray(pointers)) fail("OWNERSHIP_MERGE_INVALID");
  const result = structuredClone(existing);
  const created = [];
  const skipped = [];
  for (const pointer of pointers) {
    const segments = pointer.split("/").slice(1).map(decodePointerSegment);
    let target = result;
    let source = desired;
    for (const segment of segments.slice(0, -1)) {
      if (!object(source[segment])) fail("OWNERSHIP_MERGE_INVALID");
      source = source[segment];
      if (!(segment in target)) target[segment] = {};
      if (!object(target[segment])) { skipped.push(pointer); target = null; break; }
      target = target[segment];
    }
    if (target === null) continue;
    const final = segments.at(-1);
    if (typeof final !== "string" || !(final in source)) fail("OWNERSHIP_MERGE_INVALID");
    if (!(final in target)) { target[final] = structuredClone(source[final]); created.push(pointer); }
    else if (JSON.stringify(target[final]) !== JSON.stringify(source[final])) skipped.push(pointer);
  }
  return { created, skipped, value: result };
}

export function resolveCredential({ auth, environment = process.env, legacyModels, provider }) {
  if (!managedProviders.has(provider)) fail("AUTH_PROVIDER_INVALID");
  validateAuth(auth);
  const stored = auth[provider];
  if (stored) return { key: stored.key, source: "auth" };
  const envName = providerEnvironment[provider];
  if (typeof environment[envName] === "string" && environment[envName].length > 0) return { key: environment[envName], source: "environment" };
  const legacy = legacyModels?.providers?.[provider]?.apiKey;
  return typeof legacy === "string" && legacy.length > 0 ? { key: legacy, source: "legacy" } : { key: null, source: "none" };
}

export function rejectApiKeyArgs(argv) {
  const separator = argv.indexOf("--");
  const tokens = separator === -1 ? argv : argv.slice(0, separator);
  if (tokens.some((token) => token === "--api-key" || token.startsWith("--api-key="))) fail("API_KEY_ARG_FORBIDDEN");
}
