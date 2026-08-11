import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.mjs";
import { verifyExecutionAttestation } from "./execution-attestation.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function verifyExecutionHandshake(response, { attestation, descriptor } = {}) {
  if (!response || typeof response !== "object" || Array.isArray(response) || Object.keys(response).sort().join(",") !== "adapterSha256,adapterVersion,descriptorSha256,protocolVersion,providerId,schemaVersion,status" || response.schemaVersion !== 1 || response.protocolVersion !== 1 || response.status !== "ready" || !SHA256.test(response.adapterSha256 ?? "") || !SHA256.test(response.descriptorSha256 ?? "")) fail("EXECUTION_HANDSHAKE_INVALID");
  const verified = verifyExecutionAttestation(attestation, descriptor);
  const descriptorSha256 = createHash("sha256").update(canonicalJson(descriptor)).digest("hex");
  if (response.providerId !== verified.providerId || response.adapterSha256 !== attestation.adapterSha256 || response.adapterVersion !== attestation.adapterVersion || response.descriptorSha256 !== descriptorSha256) fail("EXECUTION_HANDSHAKE_MISMATCH");
  const binding = { ...response };
  return Object.freeze({ handshakeSha256: createHash("sha256").update(canonicalJson(binding)).digest("hex"), providerId: response.providerId, protocolVersion: 1, schemaVersion: 1, status: "verified" });
}
