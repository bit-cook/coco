import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError, parseStrictJson, resolveCredential, validateAuth } from "./state-schema.mjs";
import { inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";
import { MANAGED_PROVIDER_IDS } from "./product-identity.generated.mjs";
import { projectProviderReadiness } from "./provider-readiness.mjs";

const MANAGED_PROVIDERS = new Set(MANAGED_PROVIDER_IDS);
const MAX_KEY_BYTES = 16 * 1024;

function fail(code) { throw new StateError(code); }

function validProvider(provider) {
  if (!MANAGED_PROVIDERS.has(provider)) fail("AUTH_PROVIDER_INVALID");
  return provider;
}

function authStatus(auth, provider, environment, rotationRequired = false) {
  const credential = resolveCredential({ auth, environment, provider });
  const available = credential.source !== "none";
  return {
    available,
    provider,
    readiness: projectProviderReadiness({ credentialSource: credential.source, credentialStatus: available ? "available" : "missing", provider, rotationRequired }),
    rotationRequired,
    source: credential.source,
  };
}

async function existingAuth(agentDir) {
  const path = statePaths(agentDir).auth;
  if (await inspectRegular(path) === null) return {};
  return validateAuth(parseStrictJson(await readFile(path), "AUTH_SCHEMA_INVALID"));
}

async function existingModels(agentDir) {
  const path = statePaths(agentDir).models;
  if (await inspectRegular(path) === null) return { providers: {} };
  const models = parseStrictJson(await readFile(path), "MODELS_SCHEMA_INVALID");
  if (models === null || typeof models !== "object" || Array.isArray(models) || models.providers === null || typeof models.providers !== "object" || Array.isArray(models.providers)) fail("MODELS_SCHEMA_INVALID");
  return models;
}

export async function rotationProviders(agentDir) {
  const path = `${agentDir}/migration.json`;
  if (await inspectRegular(path) === null) return [];
  const document = parseStrictJson(await readFile(path), "MIGRATION_SCHEMA_INVALID");
  if (document === null || typeof document !== "object" || Array.isArray(document) || document.schemaVersion !== 1 || !Array.isArray(document.rotationRequired) || document.rotationRequired.some((provider) => !MANAGED_PROVIDERS.has(provider))) fail("MIGRATION_SCHEMA_INVALID");
  return document.rotationRequired;
}

export async function readCredentialObservations({ agentDir, environment = process.env }) {
  const auth = await existingAuth(agentDir);
  const models = await existingModels(agentDir);
  const rotation = new Set(await rotationProviders(agentDir));
  return Object.freeze({
    providers: Object.freeze(MANAGED_PROVIDER_IDS.map((provider) => {
      const credential = resolveCredential({ auth, environment, legacyModels: models, provider });
      return Object.freeze({ credential: Object.freeze({ rotationRequired: rotation.has(provider), source: credential.source, status: credential.source === "none" ? "missing" : "available" }), provider });
    })),
    schemaVersion: 1,
    scope: "all-managed",
  });
}

export function parseStdinKey(bytes) {
  if (bytes.length > MAX_KEY_BYTES) fail("AUTH_KEY_INVALID");
  let key;
  try { key = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail("AUTH_KEY_INVALID"); }
  if (key.endsWith("\n")) key = key.slice(0, -1);
  if (key.endsWith("\r")) key = key.slice(0, -1);
  if (key.length === 0 || /[\r\n\0]/u.test(key) || /^\p{White_Space}|\p{White_Space}$/u.test(key)) fail("AUTH_KEY_INVALID");
  return key;
}

export async function readStdinKey(input) {
  const chunks = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_KEY_BYTES) fail("AUTH_KEY_INVALID");
    chunks.push(bytes);
  }
  return parseStdinKey(Buffer.concat(chunks));
}

async function hiddenLine(input) {
  if (!input.isTTY || typeof input.setRawMode !== "function") fail("AUTH_TTY_UNAVAILABLE");
  return new Promise((resolve, reject) => {
    let bytes = Buffer.alloc(0);
    let settled = false;
    const attempt = (action) => {
      try {
        action();
        return true;
      } catch {
        return false;
      }
    };
    const restoreRawMode = () => {
      attempt(() => input.setRawMode(false));
    };
    const cleanup = () => {
      attempt(() => input.off("data", onData));
      attempt(() => input.off("end", onEnd));
      attempt(() => input.off("close", onClose));
      attempt(() => input.off("error", onError));
      restoreRawMode();
      attempt(() => input.pause());
    };
    const settle = (action) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const rejectCancelled = () => settle(() => reject(new StateError("AUTH_INPUT_CANCELLED")));
    const rejectInvalid = () => settle(() => reject(new StateError("AUTH_KEY_INVALID")));
    const removeLastCodePoint = () => {
      if (bytes.length === 0) return true;
      let start = bytes.length - 1;
      while (start > 0 && (bytes[start] & 0xc0) === 0x80) start -= 1;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start));
      } catch {
        return false;
      }
      bytes = bytes.subarray(0, start);
      return true;
    };
    const append = (byte) => {
      if (bytes.length >= MAX_KEY_BYTES) return false;
      bytes = Buffer.concat([bytes, Buffer.from([byte])]);
      return true;
    };
    const onData = (chunk) => {
      const incoming = Buffer.from(chunk);
      for (let index = 0; index < incoming.length; index += 1) {
        const byte = incoming[index];
        if (byte === 3 || byte === 4) { rejectCancelled(); return; }
        if (byte === 13 || byte === 10) {
          try {
            const key = parseStdinKey(bytes);
            settle(() => resolve(key));
          } catch (error) {
            settle(() => reject(error));
          }
          return;
        }
        if (byte === 8 || byte === 127) {
          if (!removeLastCodePoint()) rejectInvalid();
          if (settled) return;
          continue;
        }
        if (byte === 27) {
          if (incoming[index + 1] !== 91 || incoming[index + 2] !== 51 || incoming[index + 3] !== 126) { rejectInvalid(); return; }
          index += 3;
          if (!removeLastCodePoint()) rejectInvalid();
          if (settled) return;
          continue;
        }
        if (!append(byte)) { rejectInvalid(); return; }
      }
    };
    input.on("data", onData);
    const onEnd = () => rejectCancelled();
    const onClose = () => rejectCancelled();
    const onError = () => rejectCancelled();
    input.on("end", onEnd);
    input.on("close", onClose);
    input.on("error", onError);
    try {
      input.setRawMode(true);
      input.resume();
    } catch {
      settle(() => reject(new StateError("AUTH_TTY_UNAVAILABLE")));
    }
  });
}

export async function readInteractiveKey(input, output) {
  output.write("API key: ");
  const key = await hiddenLine(input);
  output.write("\nConfirm API key: ");
  const confirmation = await hiddenLine(input);
  output.write("\n");
  if (key !== confirmation) fail("AUTH_CONFIRMATION_MISMATCH");
  return key;
}

export async function confirmInteractiveRemove(input, output) {
  if (!input.isTTY) fail("CONFIRMATION_REQUIRED");
  output.write("Remove credential? [y/N] ");
  const answer = await hiddenLine(input);
  output.write("\n");
  if (answer !== "y" && answer !== "yes") fail("CONFIRMATION_REJECTED");
}

export async function getAuthStatus({ agentDir, environment = process.env, provider }) {
  if (provider !== undefined) validProvider(provider);
  await recoverTransactions(agentDir);
  const auth = await existingAuth(agentDir);
  const rotation = new Set(await rotationProviders(agentDir));
  const providers = provider === undefined ? [...MANAGED_PROVIDERS] : [provider];
  return providers.map((id) => authStatus(auth, id, environment, rotation.has(id)));
}

export async function setAuthKey({ agentDir, key, provider }) {
  validProvider(provider);
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") > MAX_KEY_BYTES || key.length === 0 || /[\r\n\0]/u.test(key) || /^\p{White_Space}|\p{White_Space}$/u.test(key)) fail("AUTH_KEY_INVALID");
  await recoverTransactions(agentDir);
  const auth = structuredClone(await existingAuth(agentDir));
  const current = auth[provider];
  auth[provider] = current?.env === undefined ? { key, type: "api_key" } : { env: current.env, key, type: "api_key" };
  const rotation = await rotationProviders(agentDir);
  const nextRotation = rotation.filter((id) => id !== provider);
  const paths = statePaths(agentDir);
  const operations = [{ bytes: canonicalJson(auth), containsSecret: true, path: paths.auth }];
  if (nextRotation.length !== rotation.length) operations.push({ bytes: canonicalJson({ rotationRequired: nextRotation, schemaVersion: 1 }), path: `${agentDir}/migration.json` });
  await applyStateTransaction({ agentDir, operations });
  const [status] = await getAuthStatus({ agentDir, environment: {}, provider });
  return status;
}

export async function removeAuthKey({ agentDir, environment = process.env, provider }) {
  validProvider(provider);
  await recoverTransactions(agentDir);
  const auth = structuredClone(await existingAuth(agentDir));
  delete auth[provider];
  await applyStateTransaction({ agentDir, operations: [{ bytes: canonicalJson(auth), containsSecret: true, path: statePaths(agentDir).auth }] });
  const [status] = await getAuthStatus({ agentDir, environment, provider });
  return status;
}
