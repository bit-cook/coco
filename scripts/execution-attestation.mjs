import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function createExecutionAttestation({ adapterSha256, adapterVersion, descriptor } = {}) {
  if (!SHA256.test(adapterSha256 ?? "") || !VERSION.test(adapterVersion ?? "") || !descriptor || descriptor.schemaVersion !== 1) fail("EXECUTION_ATTESTATION_INVALID");
  const descriptorSha256 = createHash("sha256").update(canonicalJson(descriptor)).digest("hex");
  const binding = { adapterSha256, adapterVersion, descriptorSha256, providerId: descriptor.id, schemaVersion: 1 };
  return Object.freeze({ ...binding, attestationSha256: createHash("sha256").update(canonicalJson(binding)).digest("hex"), status: "attested" });
}

export function verifyExecutionAttestation(attestation, descriptor) {
  if (!attestation || attestation.schemaVersion !== 1 || attestation.status !== "attested" || !descriptor || descriptor.schemaVersion !== 1) fail("EXECUTION_ATTESTATION_INVALID");
  const expected = createExecutionAttestation({ adapterSha256: attestation.adapterSha256, adapterVersion: attestation.adapterVersion, descriptor });
  if (canonicalJson(expected) !== canonicalJson(attestation)) fail("EXECUTION_ATTESTATION_MISMATCH");
  return Object.freeze({ attestationSha256: attestation.attestationSha256, providerId: attestation.providerId, schemaVersion: 1, status: "verified" });
}

export function verifyDiscoveredExecutionAdapter(discovery, attestation) {
  if (!discovery || discovery.schemaVersion !== 1 || !attestation || attestation.schemaVersion !== 1 || attestation.status !== "attested") fail("EXECUTION_ADAPTER_EVIDENCE_INVALID");
  if (discovery.sha256 !== attestation.adapterSha256) fail("EXECUTION_ADAPTER_DIGEST_MISMATCH");
  return Object.freeze({ adapterSha256: discovery.sha256, adapterVersion: attestation.adapterVersion, path: discovery.path, schemaVersion: 1, status: "verified" });
}
