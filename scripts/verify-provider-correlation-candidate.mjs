import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

function rejected(code) { return { code, status: "rejected" }; }
export async function verifyProviderCorrelationCandidate({ artifactPath, evidencePath = new URL("../resources/provider-correlation-candidate.v1.json", import.meta.url) } = {}) {
  let value; try { value = JSON.parse(await readFile(evidencePath, "utf8")); } catch { return rejected("PROVIDER_CORRELATION_EVIDENCE_INVALID"); }
  const candidate = value.candidate, evidence = value.evidence;
  if (value.schemaVersion !== 1 || value.status !== "production-approved" || value.promotionAuthorized !== true) return rejected("PROVIDER_CORRELATION_PROMOTION_INVALID");
  if (value.base?.package !== "@earendil-works/pi-coding-agent@0.82.1" || value.base?.sourceCommit !== "b4f293684bba718d59cc1157679bcf6157b3a7f5" || value.base?.tag !== "v0.82.1") return rejected("PROVIDER_CORRELATION_BASE_INVALID");
  if (candidate?.repository !== "https://github.com/bit-cook/pi-selective-fork" || !/^[a-f0-9]{40}$/.test(candidate.sourceCommit ?? "") || candidate.sourceTag !== "coco-v0.82.1-coco.11" || !candidate.artifact?.endsWith("/earendil-works-pi-coding-agent-0.82.1-coco.11.tgz") || !candidate.coreArtifact?.endsWith("/earendil-works-pi-agent-core-0.82.1-coco.11.tgz") || !Number.isInteger(candidate.bytes) || !Number.isInteger(candidate.coreBytes) || !/^[a-f0-9]{64}$/.test(candidate.sha256 ?? "") || !/^[a-f0-9]{64}$/.test(candidate.coreSha256 ?? "") || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(candidate.integrity ?? "") || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(candidate.coreIntegrity ?? "")) return rejected("PROVIDER_CORRELATION_CANDIDATE_INVALID");
  if (!/^\d+$/.test(evidence?.candidateRun ?? "") || evidence.check !== "passed" || evidence.focusedTests !== 29 || evidence.offlineInstall !== "passed" || evidence.packageSmoke !== "passed" || evidence.forkPr !== "https://github.com/bit-cook/pi-selective-fork/pull/3" || evidence.issue !== "https://github.com/earendil-works/pi/issues/8380") return rejected("PROVIDER_CORRELATION_RUN_INVALID");
  if (artifactPath) {
    try { const bytes = await readFile(artifactPath); if (bytes.length !== candidate.bytes || createHash("sha256").update(bytes).digest("hex") !== candidate.sha256 || `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== candidate.integrity) return rejected("PROVIDER_CORRELATION_ARTIFACT_MISMATCH"); }
    catch { return rejected("PROVIDER_CORRELATION_ARTIFACT_UNREADABLE"); }
  }
  return { sourceCommit: candidate.sourceCommit, sourceTag: candidate.sourceTag, status: "approved" };
}
