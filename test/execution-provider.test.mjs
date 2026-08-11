import assert from "node:assert/strict";
import test from "node:test";

import { createExecutionProviderDescriptor, preflightExecutionRequest } from "../scripts/execution-provider.mjs";

const isolated = { capabilities: { isolated: true, networkControl: true, secretsControl: true, workspaceRead: true, workspaceWrite: true }, id: "linux-bwrap" };

test("execution provider descriptors require an exact immutable capability shape", () => {
  const descriptor = createExecutionProviderDescriptor(isolated);
  assert.equal(descriptor.id, "linux-bwrap"); assert.equal(Object.isFrozen(descriptor.capabilities), true);
  assert.throws(() => createExecutionProviderDescriptor({ ...isolated, command: "sh" }), /EXECUTION_PROVIDER_INVALID/);
  assert.throws(() => createExecutionProviderDescriptor({ capabilities: { ...isolated.capabilities, networkControl: undefined }, id: "linux-bwrap" }), /EXECUTION_PROVIDER_CAPABILITIES_INVALID/);
});

test("execution preflight binds an approved request to one provider", () => {
  const result = preflightExecutionRequest(isolated, { mode: "isolated-required", policy: { workspace: "read" } });
  assert.equal(result.status, "approved"); assert.equal(result.providerId, "linux-bwrap"); assert.equal(result.request.policy.workspace, "read");
  assert.throws(() => preflightExecutionRequest({ ...isolated, capabilities: { ...isolated.capabilities, networkControl: false } }, { mode: "isolated-required" }), /EXECUTION_NETWORK_CONTROL_UNAVAILABLE/);
  assert.throws(() => preflightExecutionRequest(isolated, { command: "npm test", mode: "isolated-required" }), /EXECUTION_PREFLIGHT_INVALID/);
});
