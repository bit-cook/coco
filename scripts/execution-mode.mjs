const MODES = new Set(["isolated-required", "host-explicit"]);
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function resolveExecutionMode({ mode, isolatedAvailable = false, hostConfirmed = false } = {}) {
  if (!MODES.has(mode)) fail("EXECUTION_MODE_INVALID");
  if (mode === "isolated-required") {
    if (!isolatedAvailable) fail("EXECUTION_ISOLATION_UNAVAILABLE");
    return Object.freeze({ isolated: true, label: "isolated", mode, schemaVersion: 1 });
  }
  if (!hostConfirmed) fail("EXECUTION_HOST_CONFIRMATION_REQUIRED");
  return Object.freeze({ isolated: false, label: "non-isolated", mode, schemaVersion: 1 });
}

export function resolveExecutionPolicy(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["network", "secrets", "workspace"].includes(key))) fail("EXECUTION_POLICY_INVALID");
  const policy = { network: input.network ?? "deny", secrets: input.secrets ?? "deny", workspace: input.workspace ?? "write" };
  if (!["deny", "allow"].includes(policy.network) || !["deny", "mask"].includes(policy.secrets) || !["read", "write"].includes(policy.workspace)) fail("EXECUTION_POLICY_INVALID");
  return Object.freeze({ ...policy, schemaVersion: 1 });
}

export { MODES as executionModes };
