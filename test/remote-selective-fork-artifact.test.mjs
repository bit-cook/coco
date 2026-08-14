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
  evidence.evidence.candidateBuild.reproducibleSha256 = evidence.candidate.package.sha256;
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
    const artifactPath = join(directory, "verified.tgz");
    const result = await verifyRemoteSelectiveForkArtifact({ artifactPath, evidencePath: value.evidencePath, fetchImpl: async (url, options) => { requested = { options, url }; return response(value.bytes); } });
    assert.equal(result.status, "approved"); assert.equal(result.promotionAuthorized, false); assert.equal(requested.url, value.evidence.candidate.package.artifact); assert.equal(requested.options.redirect, "follow");
    assert.deepEqual(await readFile(artifactPath), value.bytes);
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ artifactPath, evidencePath: value.evidencePath, fetchImpl: async () => response(value.bytes) }), rejected("SELECTIVE_FORK_ARTIFACT_OUTPUT_FAILED"));

    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => response(Buffer.from("tampered")) }), rejected("SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH"));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => response(Buffer.concat([value.bytes, Buffer.from("overflow")]), { headers: { get: () => null } }) }), rejected("SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH"));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => response(value.bytes, { url: "https://example.test/candidate.tgz" }) }), rejected("SELECTIVE_FORK_REMOTE_REDIRECT_INVALID"));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => response(value.bytes, { ok: false }) }), rejected("SELECTIVE_FORK_REMOTE_DOWNLOAD_FAILED"));
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("promotion verification workflow is scheduled and manual, read-only, bounded, and isolated on its dedicated runner", async () => {
  const workflow = await readFile(new URL("../.github/workflows/selective-fork-promotion.yml", import.meta.url), "utf8");
  const verifier = await readFile(new URL("../scripts/verify-isolated-model-panel-candidate.mjs", import.meta.url), "utf8");
  assert.match(workflow, /schedule:\n    - cron: "23 4 \* \* \*"/); assert.match(workflow, /workflow_dispatch:/); assert.match(workflow, /permissions:\n  contents: read/); assert.match(workflow, /runs-on: \[self-hosted, Linux, X64, coco-promotion\]/); assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /verify-isolated-model-panel-candidate\.mjs/); assert.match(workflow, /scope!=="isolated"/); assert.match(workflow, /loader\?\.fallbackOwner!=="fallback"/); assert.match(workflow, /pty\?\.reload!=="passed"/); assert.match(workflow, /pty\?\.panelOpens<2/); assert.match(workflow, /promotionAuthorized!==false/); assert.match(workflow, /retention-days: 30/);
  assert.match(workflow, /\$RUNNER_TOOL_CACHE\/node\/22\.19\.0\/x64\/bin/); assert.match(workflow, /test "\$\(node --version\)" = "v22\.19\.0"/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/); assert.match(workflow, /npm run verify:architecture/); assert.match(workflow, /npm run verify:closure/);
  assert.doesNotMatch(workflow, /push:|pull_request:|secrets\.|contents: write|npm publish|actions\/setup-node/);
  assert.match(verifier, /MAX_MEMBERS = 25_000/); assert.match(verifier, /MAX_EXTRACTED_BYTES = 256 \* 1024 \* 1024/); assert.match(verifier, /--no-same-owner/); assert.match(verifier, /type !== "-" && type !== "d"/); assert.match(verifier, /cocoCandidate/); assert.match(verifier, /candidate-bundled/); assert.match(verifier, /spawn\("timeout", \["30s", "script"/); assert.match(verifier, /"\/reload\\r"/); assert.match(verifier, /panelOpens < 2/); assert.match(verifier, /PI_OFFLINE: "1"/); assert.match(verifier, /extension: "resources\/coco-model-panel\.mjs"/); assert.doesNotMatch(verifier, /npm install|npm publish|process\.env/);
});

test("remote selective fork verification rejects cross-repository and unbounded requests before fetch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-remote-fork-"));
  try {
    const value = await fixture(directory); let calls = 0;
    value.evidence.candidate.package.artifact = value.evidence.candidate.package.artifact.replace("bit-cook/pi-selective-fork", "other/repository");
    await writeFile(value.evidencePath, JSON.stringify(value.evidence));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ evidencePath: value.evidencePath, fetchImpl: async () => { calls++; } }), rejected("SELECTIVE_FORK_REMOTE_REQUEST_INVALID"));
    assert.equal(calls, 0);
    await writeFile(value.evidencePath, JSON.stringify((await fixture(directory)).evidence));
    assert.deepEqual(await verifyRemoteSelectiveForkArtifact({ artifactPath: "relative.tgz", evidencePath: value.evidencePath, fetchImpl: async () => { calls++; } }), rejected("SELECTIVE_FORK_ARTIFACT_OUTPUT_INVALID"));
    assert.equal(calls, 0);
  } finally { await rm(directory, { force: true, recursive: true }); }
});
