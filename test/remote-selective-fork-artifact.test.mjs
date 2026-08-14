import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyRemoteSelectiveForkArtifact } from "../scripts/verify-remote-selective-fork-artifact.mjs";

const sourceEvidence = new URL("../resources/selective-fork-promotion-evidence.v1.json", import.meta.url).pathname;
const rejected = (code) => ({ code, status: "rejected" });

async function fixture(directory) {
  const evidence = JSON.parse(await readFile(sourceEvidence, "utf8"));
  const bytes = Buffer.from("remote selective fork artifact fixture\n");
  evidence.candidate.package.bytes = bytes.length;
  evidence.candidate.package.sha256 = createHash("sha256").update(bytes).digest("hex");
  evidence.candidate.package.integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const evidencePath = join(directory, "evidence.json");
  await writeFile(evidencePath, JSON.stringify(evidence));
  return { bytes, evidence, evidencePath };
}

function response(bytes, overrides = {}) {
  return { body: new Blob([bytes]).stream(), headers: { get: () => String(bytes.length) }, ok: true, url: "https://release-assets.githubusercontent.com/candidate.tgz", ...overrides };
}

test("remote selective fork verification binds GitHub release identity and exact artifact bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-remote-fork-"));
  try {
    const value = await fixture(directory); let requested;
    const result = await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async (url, options) => { requested = { options, url }; return response(value.bytes); } });
    assert.equal(result.status, "approved"); assert.equal(result.promotionAuthorized, false); assert.equal(requested.url, value.evidence.candidate.package.artifact); assert.equal(requested.options.redirect, "follow");

    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => response(Buffer.from("tampered")) }), rejected("SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH"));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => response(Buffer.concat([value.bytes, Buffer.from("overflow")]), { headers: { get: () => null } }) }), rejected("SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH"));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => response(value.bytes, { url: "https://example.test/candidate.tgz" }) }), rejected("SELECTIVE_FORK_REMOTE_REDIRECT_INVALID"));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => response(value.bytes, { ok: false }) }), rejected("SELECTIVE_FORK_REMOTE_DOWNLOAD_FAILED"));
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("promotion verification workflow is manual, read-only, bounded, and isolated on the upstream runner", async () => {
  const workflow = await readFile(new URL("../.github/workflows/selective-fork-promotion.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/); assert.match(workflow, /permissions:\n  contents: read/); assert.match(workflow, /runs-on: \[self-hosted, Linux, X64, coco-upstream\]/); assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /verify-remote-selective-fork-artifact\.mjs/); assert.match(workflow, /promotionAuthorized!==false/); assert.match(workflow, /retention-days: 30/);
  assert.doesNotMatch(workflow, /schedule:|push:|pull_request:|secrets\.|contents: write|npm ci|npm publish/);
});

test("remote selective fork verification rejects cross-repository and unbounded requests before fetch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-remote-fork-"));
  try {
    const value = await fixture(directory); let calls = 0;
    value.evidence.candidate.package.artifact = value.evidence.candidate.package.artifact.replace("bit-cook/pi-selective-fork", "other/repository");
    await writeFile(value.evidencePath, JSON.stringify(value.evidence));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => { calls++; } }), rejected("SELECTIVE_FORK_REMOTE_REQUEST_INVALID"));
    assert.equal(calls, 0);
  } finally { await rm(directory, { force: true, recursive: true }); }
});
