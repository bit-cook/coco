import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.mjs";
import { resolveExecutionRequest } from "./execution-mode.mjs";

const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const CAPABILITY_KEYS = ["isolated", "networkControl", "secretsControl", "workspaceRead", "workspaceWrite"];
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function createExecutionProviderDescriptor(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["capabilities", "id"].includes(key)) || !PROVIDER_ID.test(input.id ?? "")) fail("EXECUTION_PROVIDER_INVALID");
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
