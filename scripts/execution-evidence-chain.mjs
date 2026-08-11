import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.mjs";
import { verifyExecutionBinding } from "./execution-provider.mjs";
import { verifyExecutionMatrixEvidence } from "./execution-matrix-evidence.mjs";
import { verifyDiscoveredExecutionAdapter, verifyExecutionAttestation } from "./execution-attestation.mjs";
import { verifyExecutionHandshake } from "./execution-handshake.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function verifyExecutionEvidenceChain({ preflight, binding, matrixEvidence, descriptor, cases, receipt, attestation, discovery, handshake } = {}) {
  const adapter = verifyExecutionAttestation(attestation, descriptor);
  const discovered = verifyDiscoveredExecutionAdapter(discovery, attestation);
  const ready = verifyExecutionHandshake(handshake, { attestation, descriptor });
  const matrix = verifyExecutionMatrixEvidence(matrixEvidence, { cases, descriptor });
  const bindingResult = verifyExecutionBinding(preflight, binding);
  if (ready.providerId !== adapter.providerId || adapter.providerId !== matrix.providerId || matrix.providerId !== bindingResult.providerId || matrix.providerId !== preflight.providerId) fail("EXECUTION_EVIDENCE_PROVIDER_MISMATCH");
  if (!receipt || receipt.schemaVersion !== 1 || receipt.verdict !== "passed") fail("EXECUTION_RECEIPT_INVALID");
  const receiptSha256 = createHash("sha256").update(canonicalJson(receipt)).digest("hex");
  if (!SHA256.test(receiptSha256)) fail("EXECUTION_RECEIPT_INVALID");
  return Object.freeze({ adapterSha256: discovered.adapterSha256, attestationSha256: adapter.attestationSha256, handshakeSha256: ready.handshakeSha256, matrix: matrix.status, providerId: matrix.providerId, receiptSha256, requestSha256: bindingResult.requestSha256, schemaVersion: 1, status: "verified" });
}
