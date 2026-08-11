import assert from "node:assert/strict";
import test from "node:test";

import { resolveExecutionMode, resolveExecutionPolicy, resolveExecutionRequest } from "../scripts/execution-mode.mjs";

test("isolated-required fails closed when isolation is unavailable", () => {
  assert.throws(() => resolveExecutionMode({ mode: "isolated-required" }), /EXECUTION_ISOLATION_UNAVAILABLE/);
  assert.deepEqual(resolveExecutionMode({ isolatedAvailable: true, mode: "isolated-required" }), { isolated: true, label: "isolated", mode: "isolated-required", schemaVersion: 1 });
});

test("execution policy defaults deny network and secrets with workspace write", () => {
  assert.deepEqual(resolveExecutionPolicy(), { network: "deny", schemaVersion: 1, secrets: "deny", workspace: "write" });
  assert.deepEqual(resolveExecutionPolicy({ secrets: "mask", workspace: "read" }), { network: "deny", schemaVersion: 1, secrets: "mask", workspace: "read" });
  assert.throws(() => resolveExecutionPolicy({ unknown: true }), /EXECUTION_POLICY_INVALID/);
  assert.throws(() => resolveExecutionPolicy({ network: "fallback" }), /EXECUTION_POLICY_INVALID/);
});

test("host-explicit requires confirmation and remains visibly non-isolated", () => {
  assert.throws(() => resolveExecutionMode({ mode: "host-explicit" }), /EXECUTION_HOST_CONFIRMATION_REQUIRED/);
  assert.deepEqual(resolveExecutionMode({ hostConfirmed: true, isolatedAvailable: true, mode: "host-explicit" }), { isolated: false, label: "non-isolated", mode: "host-explicit", schemaVersion: 1 });
  assert.throws(() => resolveExecutionMode({ isolatedAvailable: true }), /EXECUTION_MODE_INVALID/);
});

test("isolated execution requests require every policy enforcement capability", () => {
  const capabilities = { isolated: true, networkControl: true, secretsControl: true, workspaceRead: true, workspaceWrite: true };
  const request = resolveExecutionRequest({ capabilities, mode: "isolated-required" });
  assert.equal(request.enforcement, "provider"); assert.equal(request.mode.label, "isolated");
  assert.throws(() => resolveExecutionRequest({ capabilities: { ...capabilities, networkControl: false }, mode: "isolated-required" }), /EXECUTION_NETWORK_CONTROL_UNAVAILABLE/);
  assert.throws(() => resolveExecutionRequest({ capabilities: { ...capabilities, secretsControl: false }, mode: "isolated-required" }), /EXECUTION_SECRETS_CONTROL_UNAVAILABLE/);
  assert.throws(() => resolveExecutionRequest({ capabilities: { ...capabilities, workspaceWrite: false }, mode: "isolated-required" }), /EXECUTION_WORKSPACE_CONTROL_UNAVAILABLE/);
});

test("host execution requests remain explicit and cannot smuggle unknown fields", () => {
  const request = resolveExecutionRequest({ hostConfirmed: true, mode: "host-explicit", policy: { network: "deny" } });
  assert.equal(request.enforcement, "host"); assert.equal(request.mode.label, "non-isolated");
  assert.throws(() => resolveExecutionRequest({ fallback: true, hostConfirmed: true, mode: "host-explicit" }), /EXECUTION_REQUEST_INVALID/);
  assert.throws(() => resolveExecutionRequest({ capabilities: { shell: true }, mode: "isolated-required" }), /EXECUTION_CAPABILITIES_INVALID/);
});
