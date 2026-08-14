import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifySelectiveForkEvidence } from "../scripts/verify-selective-fork-evidence.mjs";

const evidencePath = new URL("../resources/selective-fork-promotion-evidence.v1.json", import.meta.url).pathname;

const rejected = (code) => ({ code, status: "rejected" });

test("selective fork evidence validates self-contained artifact bytes and remains fail-closed", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "coco-fork-evidence-"));
  try {
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    const bytes = Buffer.from("deterministic selective fork fixture\n");
    const artifact = join(temporary, "candidate.tgz");
    const fixtureEvidence = join(temporary, "evidence.json");
    evidence.candidate.package.bytes = bytes.length;
    evidence.candidate.package.sha256 = createHash("sha256").update(bytes).digest("hex");
    evidence.evidence.candidateBuild.reproducibleSha256 = evidence.candidate.package.sha256;
    evidence.candidate.package.integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    await writeFile(artifact, bytes);
    await writeFile(fixtureEvidence, JSON.stringify(evidence));
    assert.equal((await verifySelectiveForkEvidence({ evidencePath: fixtureEvidence, artifactPath: artifact })).status, "approved");

    await writeFile(artifact, Buffer.concat([bytes, Buffer.from("tampered")]));
    assert.deepEqual(await verifySelectiveForkEvidence({ evidencePath: fixtureEvidence, artifactPath: artifact }), rejected("SELECTIVE_FORK_ARTIFACT_INTEGRITY_MISMATCH"));
    assert.deepEqual(await verifySelectiveForkEvidence({ evidencePath: fixtureEvidence, artifactPath: join(temporary, "missing.tgz") }), rejected("SELECTIVE_FORK_ARTIFACT_UNREADABLE"));
    await writeFile(artifact, bytes);

    for (const [code, mutate] of [
      ["SELECTIVE_FORK_PROMOTION_NOT_FAIL_CLOSED", (value) => { value.promotionAuthorized = true; }],
      ["SELECTIVE_FORK_AUTHORIZATION_INVALID", (value) => { value.authorization.production = true; }],
      ["SELECTIVE_FORK_BUILD_EVIDENCE_INVALID", (value) => { value.evidence.candidateBuild.reproducibleSha256 = "0".repeat(64); }],
      ["SELECTIVE_FORK_GATES_INVALID", (value) => { value.gates.productionRegistration = "enabled"; }],
      ["SELECTIVE_FORK_CI_EVIDENCE_INVALID", (value) => { value.evidence.cocoCi.status = "failed"; }],
      ["SELECTIVE_FORK_ISOLATED_EVIDENCE_INVALID", (value) => { value.evidence.isolatedPromotion.loader.owner = "fallback"; }],
      ["SELECTIVE_FORK_ISOLATED_EVIDENCE_INVALID", (value) => { value.evidence.isolatedPromotion.pty.reload = "failed"; }],
      ["SELECTIVE_FORK_ARTIFACT_INTEGRITY_MISMATCH", (value) => { value.candidate.package.sha256 = "0".repeat(64); value.evidence.candidateBuild.reproducibleSha256 = value.candidate.package.sha256; }],
      ["SELECTIVE_FORK_PACKAGE_RECEIPT_INVALID", (value) => { value.candidate.package.integrity = "invalid"; }],
    ]) {
      const invalid = structuredClone(evidence); mutate(invalid); await writeFile(fixtureEvidence, JSON.stringify(invalid));
      assert.deepEqual(await verifySelectiveForkEvidence({ evidencePath: fixtureEvidence, artifactPath: artifact }), rejected(code));
    }
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});
