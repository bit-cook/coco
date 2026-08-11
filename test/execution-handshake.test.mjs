import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { createExecutionAttestation } from "../scripts/execution-attestation.mjs";
import { verifyExecutionHandshake } from "../scripts/execution-handshake.mjs";
import { createExecutionProviderDescriptor } from "../scripts/execution-provider.mjs";

const provider = { capabilities: { isolated: true, networkControl: true, secretsControl: true, workspaceRead: true, workspaceWrite: true }, id: "linux-bwrap" };

test("execution handshake binds one ready response to attested provider evidence", () => {
  const descriptor = createExecutionProviderDescriptor(provider);
  const attestation = createExecutionAttestation({ adapterSha256: "a".repeat(64), adapterVersion: "1.0.0", descriptor });
  const response = { adapterSha256: attestation.adapterSha256, adapterVersion: attestation.adapterVersion, descriptorSha256: createHash("sha256").update(canonicalJson(descriptor)).digest("hex"), protocolVersion: 1, providerId: descriptor.id, schemaVersion: 1, status: "ready" };
  assert.equal(verifyExecutionHandshake(response, { attestation, descriptor }).status, "verified");
  assert.throws(() => verifyExecutionHandshake({ ...response, providerId: "other" }, { attestation, descriptor }), /EXECUTION_HANDSHAKE_MISMATCH/);
  assert.throws(() => verifyExecutionHandshake({ ...response, command: "run" }, { attestation, descriptor }), /EXECUTION_HANDSHAKE_INVALID/);
});

test("execution handshake rejects unsupported protocol and non-ready status", () => {
  const descriptor = createExecutionProviderDescriptor(provider);
  const attestation = createExecutionAttestation({ adapterSha256: "a".repeat(64), adapterVersion: "1.0.0", descriptor });
  const base = { adapterSha256: attestation.adapterSha256, adapterVersion: attestation.adapterVersion, descriptorSha256: "b".repeat(64), protocolVersion: 1, providerId: descriptor.id, schemaVersion: 1, status: "ready" };
  assert.throws(() => verifyExecutionHandshake({ ...base, protocolVersion: 2 }, { attestation, descriptor }), /EXECUTION_HANDSHAKE_INVALID/);
  assert.throws(() => verifyExecutionHandshake({ ...base, status: "executing" }, { attestation, descriptor }), /EXECUTION_HANDSHAKE_INVALID/);
});
