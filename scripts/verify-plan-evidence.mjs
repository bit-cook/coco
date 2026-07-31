import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { verifyPartialManifest } from "./verify-final-verifier-manifest.mjs";

export async function verifyPlanEvidence({ evidencePath, manifestPath, planPath }) {
  try { const [text, plan, manifestBytes] = await Promise.all([readFile(evidencePath, "utf8"), readFile(planPath), readFile(manifestPath)]); const evidence = JSON.parse(text); const manifest = await verifyPartialManifest(manifestPath); const valid = text === canonicalJson(evidence) && evidence.schemaVersion === 1 && evidence.task === 1 && evidence.status === "approved" && evidence.planSha256 === createHash("sha256").update(plan).digest("hex") && evidence.artifacts?.partialManifestSha256 === sha256(manifestBytes) && Array.isArray(evidence.cases) && evidence.cases.every((entry) => entry.status === "passed") && !Object.values(evidence.artifacts).some((value) => typeof value === "string" && /secret|violation/i.test(value)); return valid && manifest.status === "approved" ? { schemaVersion: 1, status: "approved", violations: [] } : { status: "rejected", violations: ["TASK_EVIDENCE_INVALID"] }; } catch { return { status: "rejected", violations: ["TASK_EVIDENCE_INVALID"] }; }
}
