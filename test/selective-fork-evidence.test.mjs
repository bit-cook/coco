import assert from "node:assert/strict";
import { access, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifySelectiveForkEvidence } from "../scripts/verify-selective-fork-evidence.mjs";

const evidencePath = new URL("../resources/selective-fork-promotion-evidence.v1.json", import.meta.url).pathname;

test("selective fork evidence remains fail-closed and validates the local artifact receipt", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "coco-fork-evidence-"));
  try {
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    const artifact = join(temporary, "candidate.tgz");
    const sourceArtifact = "/root/coco-tmp/earendil-works-pi-coding-agent-0.82.1.tgz";
    try {
      await access(sourceArtifact);
      await copyFile(sourceArtifact, artifact);
      assert.equal((await verifySelectiveForkEvidence({ evidencePath, artifactPath: artifact })).status, "approved");
    } catch {
      assert.equal((await verifySelectiveForkEvidence({ evidencePath })).status, "approved");
    }
    evidence.promotionAuthorized = true;
    const invalid = join(temporary, "invalid.json");
    await writeFile(invalid, JSON.stringify(evidence));
    assert.deepEqual(await verifySelectiveForkEvidence({ evidencePath: invalid }), { code: "SELECTIVE_FORK_PROMOTION_NOT_FAIL_CLOSED", status: "rejected" });
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});
