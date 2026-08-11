import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.mjs";
import { resolveExecutionRequest } from "./execution-mode.mjs";

const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const CAPABILITY_KEYS = ["isolated", "networkControl", "secretsControl", "workspaceRead", "workspaceWrite"];
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function createExecutionProviderDescriptor(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["capabilities", "id", "schemaVersion"].includes(key)) || (input.schemaVersion !== undefined && input.schemaVersion !== 1) || !PROVIDER_ID.test(input.id ?? "")) fail("EXECUTION_PROVIDER_INVALID");
  const capabilities = input.capabilities;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities) || Object.keys(capabilities).sort().join(",") !== CAPABILITY_KEYS.slice().sort().join(",") || CAPABILITY_KEYS.some((key) => typeof capabilities[key] !== "boolean")) fail("EXECUTION_PROVIDER_CAPABILITIES_INVALID");
  return Object.freeze({ capabilities: Object.freeze({ ...capabilities }), id: input.id, schemaVersion: 1 });
}

export function preflightExecutionRequest(provider, request = {}) {
  const descriptor = createExecutionProviderDescriptor(provider);
  if (!request || typeof request !== "object" || Array.isArray(request) || Object.keys(request).some((key) => !["hostConfirmed", "mode", "policy"].includes(key))) fail("EXECUTION_PREFLIGHT_INVALID");
  const resolved = resolveExecutionRequest({ ...request, capabilities: descriptor.capabilities });
  const binding = { providerId: descriptor.id, request: resolved, schemaVersion: 1 };
  return Object.freeze({ ...binding, requestSha256: createHash("sha256").update(canonicalJson(binding)).digest("hex"), status: "approved" });
}

export function verifyExecutionBinding(preflight, binding) {
  if (!preflight || preflight.schemaVersion !== 1 || preflight.status !== "approved" || !binding || binding.schemaVersion !== 1 || binding.status !== "approved") fail("EXECUTION_BINDING_INVALID");
  if (preflight.providerId !== binding.providerId || preflight.requestSha256 !== binding.requestSha256) fail("EXECUTION_BINDING_MISMATCH");
  return Object.freeze({ providerId: binding.providerId, requestSha256: binding.requestSha256, schemaVersion: 1, status: "verified" });
}

export function createExecutionProviderRegistry(inputs = []) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 32) fail("EXECUTION_PROVIDER_REGISTRY_INVALID");
  const providers = inputs.map(createExecutionProviderDescriptor).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(providers.map(({ id }) => id)).size !== providers.length) fail("EXECUTION_PROVIDER_DUPLICATE");
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  return Object.freeze({
    ids: Object.freeze(providers.map(({ id }) => id)),
    preflight(id, request) { const provider = byId.get(id); if (!provider) fail("EXECUTION_PROVIDER_NOT_FOUND"); return preflightExecutionRequest(provider, request); },
    schemaVersion: 1,
  });
}
