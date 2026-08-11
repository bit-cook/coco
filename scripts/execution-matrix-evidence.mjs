import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 64 * 1024;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export function createExecutionMatrixEvidence({ providerId, descriptor, cases, results } = {}) {
  if (typeof providerId !== "string" || !descriptor || !Array.isArray(cases) || !Array.isArray(results) || cases.length !== results.length || cases.length < 1 || cases.length > 256) fail("EXECUTION_MATRIX_EVIDENCE_INVALID");
  const descriptorSha256 = createHash("sha256").update(canonicalJson(descriptor)).digest("hex");
  const casesSha256 = createHash("sha256").update(canonicalJson(cases)).digest("hex");
  const evidence = { cases: results, casesSha256, descriptorSha256, providerId, schemaVersion: 1 };
  if (Buffer.byteLength(canonicalJson(evidence)) > MAX_BYTES) fail("EXECUTION_MATRIX_EVIDENCE_TOO_LARGE");
  return Object.freeze(evidence);
}

export function verifyExecutionMatrixEvidence(evidence, { descriptor, cases } = {}) {
  if (!evidence || evidence.schemaVersion !== 1 || !Array.isArray(evidence.cases) || !descriptor || !Array.isArray(cases)) fail("EXECUTION_MATRIX_EVIDENCE_INVALID");
  const descriptorSha256 = createHash("sha256").update(canonicalJson(descriptor)).digest("hex");
  const casesSha256 = createHash("sha256").update(canonicalJson(cases)).digest("hex");
  if (!SHA256.test(evidence.descriptorSha256) || !SHA256.test(evidence.casesSha256) || evidence.descriptorSha256 !== descriptorSha256 || evidence.casesSha256 !== casesSha256 || evidence.cases.length !== cases.length) fail("EXECUTION_MATRIX_EVIDENCE_MISMATCH");
  return Object.freeze({ providerId: evidence.providerId, schemaVersion: 1, status: "verified" });
}
