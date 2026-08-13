import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const evidenceFile = "resources/selective-fork-promotion-evidence.v1.json";

function reject(code) {
  return { code, status: "rejected" };
}

function requiredString(value) {
  return typeof value === "string" && value.length > 0;
}

export async function verifySelectiveForkEvidence({ evidencePath = join(root, evidenceFile), artifactPath } = {}) {
  let evidence;
  try {
    evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch {
    return reject("SELECTIVE_FORK_EVIDENCE_INVALID");
  }
  const candidate = evidence.candidate;
  const packageEvidence = candidate?.package;
  if (evidence.schemaVersion !== 1 || evidence.promotionAuthorized !== false || evidence.status !== "candidate-evidence-only") return reject("SELECTIVE_FORK_PROMOTION_NOT_FAIL_CLOSED");
  if (!requiredString(evidence.base?.package) || !requiredString(evidence.base?.sourceCommit) || !requiredString(evidence.base?.tag)) return reject("SELECTIVE_FORK_BASE_INVALID");
  if (!requiredString(candidate?.repository) || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate.repository) || candidate.published !== false || !requiredString(candidate.sourceCommit) || !/^coco-v\d+\.\d+\.\d+-coco\.\d+$/.test(candidate.sourceTag ?? "")) return reject("SELECTIVE_FORK_PROVENANCE_INVALID");
  if (!requiredString(packageEvidence?.name) || !requiredString(packageEvidence?.version) || !/^https:\/\/github\.com\/.+\/releases\/download\/.+\/.+\.tgz$/.test(packageEvidence?.artifact ?? "") || !Number.isInteger(packageEvidence.bytes) || !/^[a-f0-9]{64}$/.test(packageEvidence.sha256) || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(packageEvidence.integrity) || !/^https:\/\/github\.com\/.+\/releases\/tag\/.+$/.test(packageEvidence?.remoteRelease ?? "")) return reject("SELECTIVE_FORK_PACKAGE_RECEIPT_INVALID");
  if (evidence.gates?.remoteProvenance !== "source-tag-published" || evidence.gates?.packageIntegrity !== "remote-release-asset-verified-and-locked" || evidence.gates?.productionRegistration !== "blocked") return reject("SELECTIVE_FORK_GATES_INVALID");
  if (artifactPath) {
    try {
      const bytes = await readFile(artifactPath);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
      if (bytes.length !== packageEvidence.bytes || sha256 !== packageEvidence.sha256 || integrity !== packageEvidence.integrity) return reject("SELECTIVE_FORK_ARTIFACT_INTEGRITY_MISMATCH");
    } catch {
      return reject("SELECTIVE_FORK_ARTIFACT_UNREADABLE");
    }
  }
  return { package: packageEvidence.name, sourceCommit: candidate.sourceCommit, status: "approved", promotionAuthorized: false };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const artifactPath = process.argv[2];
  const result = await verifySelectiveForkEvidence({ artifactPath });
  console.log(JSON.stringify(result));
  process.exit(result.status === "approved" ? 0 : 1);
}
