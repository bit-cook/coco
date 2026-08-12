import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.mjs";
import { verifyExecutionBinding } from "./execution-provider.mjs";
import { verifyExecutionMatrixEvidence } from "./execution-matrix-evidence.mjs";
import { verifyDiscoveredExecutionAdapter, verifyExecutionAttestation } from "./execution-attestation.mjs";
import { verifyExecutionHandshake } from "./execution-handshake.mjs";
import { validExecutionBinding } from "./execution-bindings.mjs";
import { validTaskReceipt } from "./task-receipts.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const TASK_ID = /^[a-z0-9_-]{12}$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function verifyExecutionEvidenceChain({ preflight, binding, matrixEvidence, descriptor, cases, receipt, attestation, discovery, handshake, taskId, runId } = {}) {
  const adapter = verifyExecutionAttestation(attestation, descriptor);
  const discovered = verifyDiscoveredExecutionAdapter(discovery, attestation);
  const ready = verifyExecutionHandshake(handshake, { attestation, descriptor });
  const matrix = verifyExecutionMatrixEvidence(matrixEvidence, { cases, descriptor });
  if (!TASK_ID.test(taskId ?? "") || !RUN_ID.test(runId ?? "") || !validExecutionBinding(binding, { taskId, runId: runId.toLowerCase() }) || !validTaskReceipt(receipt, { taskId, runId: runId.toLowerCase() })) fail("EXECUTION_EVIDENCE_IDENTITY_INVALID");
  const bindingResult = verifyExecutionBinding(preflight, binding);
  if (ready.providerId !== adapter.providerId || adapter.providerId !== matrix.providerId || matrix.providerId !== bindingResult.providerId || matrix.providerId !== preflight.providerId) fail("EXECUTION_EVIDENCE_PROVIDER_MISMATCH");
  if (receipt.verdict !== "passed") fail("EXECUTION_RECEIPT_INVALID");
  const receiptSha256 = createHash("sha256").update(canonicalJson(receipt)).digest("hex");
  if (!SHA256.test(receiptSha256)) fail("EXECUTION_RECEIPT_INVALID");
  return Object.freeze({ adapterSha256: discovered.adapterSha256, attestationSha256: adapter.attestationSha256, handshakeSha256: ready.handshakeSha256, matrix: matrix.status, providerId: matrix.providerId, receiptSha256, requestSha256: bindingResult.requestSha256, schemaVersion: 1, status: "verified" });
}
