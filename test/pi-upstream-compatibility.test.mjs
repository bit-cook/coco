import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { compatibilityReceipt, parseRegistryMetadata, probeUpstreamCompatibility } from "../scripts/pi-upstream-compatibility.mjs";

const root = new URL("..", import.meta.url).pathname;
const base = { baselineVersion: "0.82.1", candidateIntegrity: "sha512-candidate", candidateVersion: "0.84.1", patcherSha256: "a".repeat(64) };

test("compatibility receipt requires every advisory promotion gate", () => {
  const candidate = compatibilityReceipt({ ...base, checks: { anchors: "passed", integrity: "passed", offlineSmoke: "passed", syntax: "passed", versionPolicy: "unsupported" } });
  assert.equal(candidate.compatibility, "candidate"); assert.equal(candidate.firstFailure, null); assert.equal(candidate.promotionAuthorized, false);
  const incompatible = compatibilityReceipt({ ...base, checks: { anchors: "COCO_PATCH_UNKNOWN_ANCHOR", integrity: "passed", offlineSmoke: "skipped", syntax: "skipped", versionPolicy: "unsupported" } });
  assert.equal(incompatible.compatibility, "incompatible"); assert.deepEqual(incompatible.firstFailure, { check: "anchors", code: "COCO_PATCH_UNKNOWN_ANCHOR" }); assert.equal(incompatible.promotionAuthorized, false);
});

test("compatibility receipt exposes only stable bounded failure codes", () => {
  const receipt = compatibilityReceipt({ ...base, checks: { anchors: "UPSTREAM_PATCH_FAILED", integrity: "passed", offlineSmoke: "skipped", syntax: "skipped", versionPolicy: "unsupported" } });
  assert.deepEqual(receipt.firstFailure, { check: "anchors", code: "UPSTREAM_PATCH_FAILED" }); assert.equal(JSON.stringify(receipt).includes("/tmp/"), false);
});

test("compatibility probe rejects implicit tags and semver ranges before network or temp writes", async () => {
  for (const value of [undefined, "latest", "^0.84.1", "0.84", "v0.84.1"]) await assert.rejects(() => probeUpstreamCompatibility({ candidateVersion: value, projectRoot: root }), (error) => error.code === "UPSTREAM_CANDIDATE_INVALID");
});

test("registry metadata parser accepts npm flat and direct shapes but rejects untrusted origins", () => {
  assert.deepEqual(parseRegistryMetadata({ "dist.integrity": "sha512-flat", "dist.tarball": "https://registry.npmjs.org/scope/package.tgz" }), { integrity: "sha512-flat", tarball: "https://registry.npmjs.org/scope/package.tgz" });
  assert.deepEqual(parseRegistryMetadata({ integrity: "sha512-direct", tarball: "https://registry.npmjs.org/package.tgz" }), { integrity: "sha512-direct", tarball: "https://registry.npmjs.org/package.tgz" });
  assert.throws(() => parseRegistryMetadata({ integrity: "sha512-value", tarball: "https://example.test/package.tgz" }), (error) => error.code === "UPSTREAM_METADATA_INVALID");
});

test("compatibility workflow is scheduled, manual, secret-free, and isolated from CI and Pages runners", async () => {
  const workflow = await readFile(join(root, ".github", "workflows", "upstream-compatibility.yml"), "utf8");
  assert.match(workflow, /schedule:\n    - cron: "17 3 \* \* 1"/); assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on: \[self-hosted, Linux, X64, coco-upstream\]/); assert.doesNotMatch(workflow, /coco-pages|coco-ci|secrets\./);
  assert.match(workflow, /if test "\$status" != 0 && test "\$status" != 3/); assert.match(workflow, /retention-days: 30/); assert.match(workflow, /promotionAuthorized/);
});

test("production patch defaults remain pinned while probe injection is explicit", async () => {
  const source = await readFile(join(root, "scripts", "apply-coco-identity-patch.mjs"), "utf8");
  assert.match(source, /const expectedVersion = "0\.82\.1"/); assert.match(source, /supportedVersion = expectedVersion/); assert.match(source, /ensureVersion\(join\(agent, "package\.json"\), supportedVersion\)/);
});
