import assert from "node:assert/strict";
import test from "node:test";

import { createExecutionProviderDescriptor, createExecutionProviderRegistry, preflightExecutionRequest, verifyExecutionBinding } from "../scripts/execution-provider.mjs";
import { evaluateExecutionMatrix } from "../scripts/execution-matrix.mjs";
import { createExecutionMatrixEvidence, verifyExecutionMatrixEvidence } from "../scripts/execution-matrix-evidence.mjs";
import { verifyExecutionEvidenceChain } from "../scripts/execution-evidence-chain.mjs";
import { createExecutionAttestation, verifyDiscoveredExecutionAdapter, verifyExecutionAttestation } from "../scripts/execution-attestation.mjs";

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

test("execution evidence chain verifies matrix, binding, and passed receipt together", () => {
  const cases = [{ mode: "isolated-required" }]; const descriptor = createExecutionProviderDescriptor(isolated);
  const preflight = preflightExecutionRequest(isolated, cases[0]);
  const binding = { providerId: preflight.providerId, requestSha256: preflight.requestSha256, schemaVersion: 1, status: "approved" };
  const matrixEvidence = createExecutionMatrixEvidence({ cases, descriptor, providerId: descriptor.id, results: evaluateExecutionMatrix(isolated, cases) });
  const attestation = createExecutionAttestation({ adapterSha256: "a".repeat(64), adapterVersion: "1.0.0", descriptor });
  const discovery = { bytes: 1, path: "/adapter", schemaVersion: 1, sha256: "a".repeat(64) };
  const receipt = { exitCode: 0, runId: "018f47a0-7b20-7cc5-8a33-111111111111", schemaVersion: 1, verdict: "passed" };
  const chain = verifyExecutionEvidenceChain({ attestation, binding, cases, descriptor, discovery, matrixEvidence, preflight, receipt });
  assert.equal(chain.status, "verified"); assert.equal(chain.providerId, "linux-bwrap");
  assert.throws(() => verifyExecutionEvidenceChain({ attestation, binding, cases, descriptor, discovery, matrixEvidence, preflight, receipt: { ...receipt, verdict: "failed" } }), /EXECUTION_RECEIPT_INVALID/);
  assert.throws(() => verifyExecutionEvidenceChain({ attestation, binding, cases, descriptor, matrixEvidence, preflight, receipt }), /EXECUTION_ADAPTER_EVIDENCE_INVALID/);
});

test("execution provider registry is bounded, deterministic, and preflight-only", () => {
  const host = { capabilities: { isolated: false, networkControl: false, secretsControl: false, workspaceRead: true, workspaceWrite: true }, id: "host" };
  const registry = createExecutionProviderRegistry([isolated, host]);
  assert.deepEqual(registry.ids, ["host", "linux-bwrap"]);
  assert.equal(registry.preflight("host", { hostConfirmed: true, mode: "host-explicit" }).providerId, "host");
  assert.equal("execute" in registry, false);
  assert.throws(() => registry.preflight("missing", { mode: "isolated-required" }), /EXECUTION_PROVIDER_NOT_FOUND/);
  assert.throws(() => createExecutionProviderRegistry([isolated, isolated]), /EXECUTION_PROVIDER_DUPLICATE/);
});

test("execution attestation binds adapter identity, version, and provider descriptor", () => {
  const descriptor = createExecutionProviderDescriptor(isolated);
  const attestation = createExecutionAttestation({ adapterSha256: "a".repeat(64), adapterVersion: "1.0.0", descriptor });
  assert.equal(verifyExecutionAttestation(attestation, descriptor).status, "verified");
  assert.throws(() => verifyExecutionAttestation(attestation, createExecutionProviderDescriptor({ ...isolated, id: "other" })), /EXECUTION_ATTESTATION_MISMATCH/);
  assert.throws(() => createExecutionAttestation({ adapterSha256: "bad", adapterVersion: "latest", descriptor }), /EXECUTION_ATTESTATION_INVALID/);
});

test("adapter discovery evidence must match the attested binary digest", () => {
  const descriptor = createExecutionProviderDescriptor(isolated);
  const attestation = createExecutionAttestation({ adapterSha256: "a".repeat(64), adapterVersion: "1.0.0", descriptor });
  const discovery = { bytes: 1, path: "/adapter", schemaVersion: 1, sha256: "a".repeat(64) };
  assert.equal(verifyDiscoveredExecutionAdapter(discovery, attestation).status, "verified");
  assert.throws(() => verifyDiscoveredExecutionAdapter({ ...discovery, sha256: "b".repeat(64) }, attestation), /EXECUTION_ADAPTER_DIGEST_MISMATCH/);
  assert.throws(() => verifyDiscoveredExecutionAdapter({ ...discovery, bytes: 0 }, attestation), /EXECUTION_ADAPTER_EVIDENCE_INVALID/);
  assert.throws(() => verifyDiscoveredExecutionAdapter({ ...discovery, extra: true }, attestation), /EXECUTION_ADAPTER_EVIDENCE_INVALID/);
  assert.throws(() => verifyDiscoveredExecutionAdapter({ ...discovery, path: "relative" }, attestation), /EXECUTION_ADAPTER_EVIDENCE_INVALID/);
});
