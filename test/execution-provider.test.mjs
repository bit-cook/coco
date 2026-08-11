import assert from "node:assert/strict";
import test from "node:test";

import { createExecutionProviderDescriptor, preflightExecutionRequest, verifyExecutionBinding } from "../scripts/execution-provider.mjs";
import { evaluateExecutionMatrix } from "../scripts/execution-matrix.mjs";
import { createExecutionMatrixEvidence, verifyExecutionMatrixEvidence } from "../scripts/execution-matrix-evidence.mjs";

const isolated = { capabilities: { isolated: true, networkControl: true, secretsControl: true, workspaceRead: true, workspaceWrite: true }, id: "linux-bwrap" };

test("execution provider descriptors require an exact immutable capability shape", () => {
  const descriptor = createExecutionProviderDescriptor(isolated);
  assert.equal(descriptor.id, "linux-bwrap"); assert.equal(Object.isFrozen(descriptor.capabilities), true);
  assert.throws(() => createExecutionProviderDescriptor({ ...isolated, command: "sh" }), /EXECUTION_PROVIDER_INVALID/);
  assert.throws(() => createExecutionProviderDescriptor({ capabilities: { ...isolated.capabilities, networkControl: undefined }, id: "linux-bwrap" }), /EXECUTION_PROVIDER_CAPABILITIES_INVALID/);
});

test("execution preflight binds an approved request to one provider", () => {
  const result = preflightExecutionRequest(isolated, { mode: "isolated-required", policy: { workspace: "read" } });
  assert.equal(result.status, "approved"); assert.equal(result.providerId, "linux-bwrap"); assert.equal(result.request.policy.workspace, "read"); assert.match(result.requestSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(result, preflightExecutionRequest(isolated, { mode: "isolated-required", policy: { workspace: "read" } }));
  assert.throws(() => preflightExecutionRequest({ ...isolated, capabilities: { ...isolated.capabilities, networkControl: false } }, { mode: "isolated-required" }), /EXECUTION_NETWORK_CONTROL_UNAVAILABLE/);
  assert.throws(() => preflightExecutionRequest(isolated, { command: "npm test", mode: "isolated-required" }), /EXECUTION_PREFLIGHT_INVALID/);
});

test("execution binding verification rejects provider or request substitution", () => {
  const result = preflightExecutionRequest(isolated, { mode: "isolated-required", policy: { workspace: "read" } });
  const binding = { providerId: result.providerId, requestSha256: result.requestSha256, schemaVersion: 1, status: "approved" };
  assert.deepEqual(verifyExecutionBinding(result, binding), { providerId: "linux-bwrap", requestSha256: result.requestSha256, schemaVersion: 1, status: "verified" });
  assert.throws(() => verifyExecutionBinding(result, { ...binding, providerId: "other" }), /EXECUTION_BINDING_MISMATCH/);
  assert.throws(() => verifyExecutionBinding(result, { ...binding, requestSha256: "b".repeat(64) }), /EXECUTION_BINDING_MISMATCH/);
});

test("execution capability matrix reports deterministic approval and rejection codes", () => {
  const cases = [
    { mode: "isolated-required" },
    { mode: "isolated-required", policy: { workspace: "read" } },
    { hostConfirmed: true, mode: "host-explicit", policy: { network: "allow" } },
    { mode: "host-explicit" },
  ];
  const matrix = evaluateExecutionMatrix(isolated, cases);
  assert.deepEqual(matrix.map(({ code, status }) => ({ code, status })), [
    { code: undefined, status: "approved" },
    { code: undefined, status: "approved" },
    { code: undefined, status: "approved" },
    { code: "EXECUTION_HOST_CONFIRMATION_REQUIRED", status: "rejected" },
  ]);
  assert.deepEqual(matrix, evaluateExecutionMatrix(isolated, cases));
  assert.throws(() => evaluateExecutionMatrix(isolated, []), /EXECUTION_MATRIX_INVALID/);
});

test("execution matrix evidence binds provider descriptor and exact cases", () => {
  const cases = [{ mode: "isolated-required" }, { hostConfirmed: true, mode: "host-explicit" }];
  const descriptor = createExecutionProviderDescriptor(isolated);
  const results = evaluateExecutionMatrix(isolated, cases);
  const evidence = createExecutionMatrixEvidence({ cases, descriptor, providerId: descriptor.id, results });
  assert.equal(verifyExecutionMatrixEvidence(evidence, { cases, descriptor }).status, "verified");
  assert.throws(() => verifyExecutionMatrixEvidence(evidence, { cases: cases.slice(0, 1), descriptor }), /EXECUTION_MATRIX_EVIDENCE_MISMATCH/);
  assert.throws(() => verifyExecutionMatrixEvidence(evidence, { cases, descriptor: { ...descriptor, id: "other" } }), /EXECUTION_MATRIX_EVIDENCE_MISMATCH/);
});
