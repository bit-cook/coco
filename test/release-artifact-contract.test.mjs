import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { createReleaseArtifactManifest, expectedReleaseAssets, parseReleaseOwnershipMarker, planDraftRecovery, planRemoteAssetRecovery, releaseOwnershipMarker, verifyDraftOwnership, verifyLocalReleaseArtifacts, verifyPrivateReleaseReceipt, verifyRemoteReleaseArtifacts, writePrivateReleaseReceipt } from "../scripts/release-artifact-contract.mjs";

const expected = { attempt: "2", draftId: "300", runId: "200", sourceCommit: "a".repeat(40), tag: "v0.6.2", version: "0.6.2" };

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "coco-release-contract-"));
  for (const { name } of expectedReleaseAssets(expected.version)) await writeFile(join(directory, name), `bytes:${name}\n`);
  const result = await createReleaseArtifactManifest({ directory, ...expected });
  assert.equal(result.status, "approved");
  return { directory, manifest: result.manifest };
}

function remote(manifest) {
  return {
    commit: { sha: expected.sourceCommit },
    release: { assets: manifest.assets.map(({ name, sha256, size }) => ({ digest: `sha256:${sha256}`, name, size })), body: releaseOwnershipMarker(expected), draft: true, id: Number(expected.draftId), tag_name: expected.tag },
  };
}

test("exact nine-asset manifest is canonical and local bytes match names, sizes, digests, roles, and release binding", async () => {
  const { directory, manifest } = await fixture();
  try {
    assert.equal(manifest.assets.length, 9);
    assert.deepEqual(Object.keys(manifest.assets[0]).sort(), ["attempt", "name", "role", "runId", "sha256", "size", "sourceCommit", "tag", "version"]);
    assert.equal((await verifyLocalReleaseArtifacts({ directory, manifest, ...expected })).status, "approved");
    assert.equal(canonicalJson(manifest), canonicalJson(JSON.parse(canonicalJson(manifest))));
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("CLI rejects a non-canonical manifest contract", async () => {
  const { directory, manifest } = await fixture();
  const path = join(directory, "..", `noncanonical-${process.pid}.json`);
  try {
    await writeFile(path, JSON.stringify(manifest, null, 2));
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(process.execPath, [
      join(new URL("..", import.meta.url).pathname, "scripts", "release-artifact-contract.mjs"), "verify-local",
      "--directory", directory, "--manifest", path, "--version", expected.version, "--tag", expected.tag,
      "--source-commit", expected.sourceCommit, "--run-id", expected.runId, "--attempt", expected.attempt, "--draft-id", expected.draftId,
    ], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /RELEASE_MANIFEST_INVALID/);
  } finally { await rm(path, { force: true }); await rm(directory, { force: true, recursive: true }); }
});

test("local exact inventory rejects missing, extra, wrong size, and wrong digest", async () => {
  const cases = [
    ["RELEASE_ASSET_MISSING", async ({ directory }) => rm(join(directory, "install.sh"))],
    ["RELEASE_ASSET_EXTRA", async ({ directory }) => writeFile(join(directory, "extra"), "extra")],
    ["RELEASE_ASSET_SIZE_MISMATCH", async ({ manifest }) => { manifest.assets[0].size += 1; }],
    ["RELEASE_ASSET_DIGEST_MISMATCH", async ({ manifest }) => { manifest.assets[0].sha256 = "b".repeat(64); }],
  ];
  for (const [code, mutate] of cases) {
    const item = await fixture();
    try { await mutate(item); assert.equal((await verifyLocalReleaseArtifacts({ ...item, ...expected })).code, code); }
    finally { await rm(item.directory, { force: true, recursive: true }); }
  }
});

test("remote GitHub API inventory rejects missing, extra, duplicate exact/semantic, wrong size, and wrong digest", async () => {
  const { directory, manifest } = await fixture();
  try {
    const cases = [
      ["RELEASE_ASSET_MISSING", (value) => value.release.assets.pop()],
      ["RELEASE_ASSET_EXTRA", (value) => value.release.assets.push({ digest: `sha256:${"0".repeat(64)}`, name: "extra.bin", size: 1 })],
      ["RELEASE_ASSET_DUPLICATE", (value) => value.release.assets.push({ ...value.release.assets[0] })],
      ["RELEASE_ASSET_SEMANTIC_DUPLICATE", (value) => value.release.assets.push({ digest: `sha256:${"0".repeat(64)}`, name: "coco-agent-copy.vsix", size: 1 })],
      ["RELEASE_ASSET_SIZE_MISMATCH", (value) => { value.release.assets[0].size += 1; }],
      ["RELEASE_ASSET_DIGEST_MISMATCH", (value) => { value.release.assets[0].digest = `sha256:${"0".repeat(64)}`; }],
    ];
    for (const [code, mutate] of cases) {
      const value = structuredClone(remote(manifest)); mutate(value);
      assert.equal(verifyRemoteReleaseArtifacts({ manifest, ...value, ...expected }).code, code);
    }
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("manifest and GitHub API binding reject stale or concurrent attempt and wrong version, tag, commit, run, draft, or owner", async () => {
  const { directory, manifest } = await fixture();
  try {
    const localCases = [
      ["RELEASE_VERSION_MISMATCH", "version", "0.6.3"],
      ["RELEASE_TAG_MISMATCH", "tag", "v0.6.3"],
      ["RELEASE_COMMIT_MISMATCH", "sourceCommit", "b".repeat(40)],
      ["RELEASE_RUN_MISMATCH", "runId", "201"],
      ["RELEASE_ATTEMPT_STALE", "attempt", "3"],
    ];
    for (const [code, field, value] of localCases) {
      const changed = structuredClone(manifest);
      for (const entry of changed.assets) entry[field] = value;
      assert.equal((await verifyLocalReleaseArtifacts({ directory, manifest: changed, ...expected })).code, code);
    }
    const wrongTag = remote(manifest); wrongTag.release.tag_name = "v9.9.9";
    assert.equal(verifyRemoteReleaseArtifacts({ manifest, ...wrongTag, ...expected }).code, "RELEASE_TAG_MISMATCH");
    const wrongCommit = remote(manifest); wrongCommit.commit.sha = "b".repeat(40);
    assert.equal(verifyRemoteReleaseArtifacts({ manifest, ...wrongCommit, ...expected }).code, "RELEASE_COMMIT_MISMATCH");
    const wrongDraft = remote(manifest); wrongDraft.release.id += 1;
    assert.equal(verifyRemoteReleaseArtifacts({ manifest, ...wrongDraft, ...expected }).code, "RELEASE_DRAFT_MISMATCH");
    const staleOwner = remote(manifest); staleOwner.release.body = releaseOwnershipMarker({ ...expected, attempt: "1" });
    assert.equal(verifyRemoteReleaseArtifacts({ manifest, ...staleOwner, ...expected }).status, "approved");
    const concurrentOwner = remote(manifest); concurrentOwner.release.body = releaseOwnershipMarker({ ...expected, runId: "201" });
    assert.equal(verifyDraftOwnership({ release: concurrentOwner.release, ...expected }).code, "RELEASE_OWNERSHIP_MISMATCH");
    const published = remote(manifest); published.release.draft = false;
    assert.equal(verifyDraftOwnership({ release: published.release, ...expected }).code, "RELEASE_DRAFT_NOT_PRIVATE");
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("approved remote verification produces a canonical private receipt", async () => {
  const { directory, manifest } = await fixture();
  const receipt = join(directory, "private", "receipt.json");
  try {
    const value = remote(manifest);
    assert.equal(verifyRemoteReleaseArtifacts({ manifest, ...value, ...expected }).status, "approved");
    await mkdir(join(directory, "private"), { mode: 0o700 });
    const written = await writePrivateReleaseReceipt({ manifest, path: receipt, ...expected });
    assert.equal(written.status, "approved");
    assert.equal(verifyPrivateReleaseReceipt({ manifest, receipt: written.receipt, ...expected }).status, "approved");
    assert.equal((await stat(receipt)).mode & 0o777, 0o600);
    const bytes = await readFile(receipt, "utf8");
    assert.equal(bytes, canonicalJson(JSON.parse(bytes)));
    await chmod(receipt, 0o644);
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("receipt rejects stale/concurrent ownership, a different draft, manifest overwrite, or incomplete lifecycle checks", async () => {
  const { directory, manifest } = await fixture();
  try {
    const path = join(directory, "receipt.json");
    const written = await writePrivateReleaseReceipt({ manifest, path, ...expected });
    assert.equal(written.status, "approved");
    const cases = [
      ["RELEASE_ATTEMPT_STALE", { attempt: "3" }],
      ["RELEASE_RUN_MISMATCH", { runId: "201" }],
      ["RELEASE_DRAFT_MISMATCH", { draftId: "301" }],
    ];
    for (const [code, changed] of cases) assert.equal(verifyPrivateReleaseReceipt({ manifest, receipt: written.receipt, ...expected, ...changed }).code, code);
    const overwritten = structuredClone(manifest); overwritten.assets[0].sha256 = "b".repeat(64);
    assert.equal(verifyPrivateReleaseReceipt({ manifest: overwritten, receipt: written.receipt, ...expected }).code, "RELEASE_RECEIPT_MANIFEST_MISMATCH");
    const incomplete = structuredClone(written.receipt); incomplete.checks.vsix = "rejected";
    assert.equal(verifyPrivateReleaseReceipt({ manifest, receipt: incomplete, ...expected }).code, "RELEASE_RECEIPT_INVALID");
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("rerun failed and rerun all attempts CAS-take over only the same run, tag, and commit draft", () => {
  const old = { ...remote({ assets: [] }).release, assets: [], body: releaseOwnershipMarker({ ...expected, attempt: "1" }) };
  assert.deepEqual(parseReleaseOwnershipMarker(old.body), { attempt: "1", runId: expected.runId, sourceCommit: expected.sourceCommit });
  assert.deepEqual(planDraftRecovery({ release: old, ...expected }), { action: "takeover", draftId: expected.draftId, previousAttempt: "1", status: "approved" });
  const current = { ...old, body: releaseOwnershipMarker(expected) };
  assert.equal(planDraftRecovery({ release: current, ...expected }).action, "reuse");
  assert.equal(planDraftRecovery({ release: null, ...expected }).action, "create");
  assert.equal(planDraftRecovery({ release: { ...old, body: releaseOwnershipMarker({ ...expected, runId: "201" }) }, ...expected }).code, "RELEASE_OWNERSHIP_MISMATCH");
  assert.equal(planDraftRecovery({ release: { ...old, body: releaseOwnershipMarker({ ...expected, sourceCommit: "b".repeat(40) }) }, ...expected }).code, "RELEASE_OWNERSHIP_MISMATCH");
  assert.equal(planDraftRecovery({ release: { ...old, draft: false }, ...expected }).code, "RELEASE_ALREADY_PUBLISHED");
  assert.equal(planDraftRecovery({ release: { ...old, body: releaseOwnershipMarker({ ...expected, attempt: "3" }) }, ...expected }).code, "RELEASE_ATTEMPT_STALE");
});

test("partial upload recovery reuses exact assets, uploads only missing assets, and rejects overwritten bytes", async () => {
  const { directory, manifest } = await fixture();
  try {
    const value = remote(manifest);
    value.release.assets.splice(3);
    const partial = planRemoteAssetRecovery({ manifest, release: value.release, ...expected });
    assert.equal(partial.status, "approved");
    assert.equal(partial.reused, 3);
    assert.deepEqual(partial.missing, manifest.assets.slice(3).map((entry) => entry.name));
    assert.deepEqual(planRemoteAssetRecovery({ manifest, release: remote(manifest).release, ...expected }).missing, []);
    const wrongSize = remote(manifest); wrongSize.release.assets[0].size += 1;
    assert.equal(planRemoteAssetRecovery({ manifest, release: wrongSize.release, ...expected }).code, "RELEASE_ASSET_SIZE_MISMATCH");
    const overwritten = remote(manifest); overwritten.release.assets[0].digest = `sha256:${"0".repeat(64)}`;
    assert.equal(planRemoteAssetRecovery({ manifest, release: overwritten.release, ...expected }).code, "RELEASE_ASSET_DIGEST_MISMATCH");
  } finally { await rm(directory, { force: true, recursive: true }); }
});
