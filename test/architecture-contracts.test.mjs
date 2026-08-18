import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyArchitectureContracts, verifyPatchInventory, verifyUpstreamSource } from "../scripts/verify-architecture-contracts.mjs";
import { upstreamDashboard } from "../scripts/pi-upstream-dashboard.mjs";

const root = new URL("..", import.meta.url);

test("M0 architecture contracts approve the committed product, patch, capability, and upstream baseline", async () => {
  assert.deepEqual(await verifyArchitectureContracts(), { capabilities: 22, patches: 8, providers: 5, status: "approved", upstream: "0.82.1", version: "0.6.2" });
});

test("an artifact patch function cannot be added without an inventory domain and removal contract", async () => {
  const [source, inventory] = await Promise.all([
    readFile(new URL("scripts/apply-coco-identity-patch.mjs", root), "utf8"),
    readFile(new URL("resources/patch-inventory.v1.json", root), "utf8").then(JSON.parse),
  ]);
  assert.throws(() => verifyPatchInventory(`${source}\nasync function patchEmergencyFeature() {}\n`, inventory), (error) => error.code === "UNREGISTERED_PATCH_FUNCTION");
  const missingOwner = structuredClone(inventory); delete missingOwner.domains[0].owner;
  assert.throws(() => verifyPatchInventory(source, missingOwner), (error) => error.code === "PATCH_FIELD_MISSING");
});

test("upstream source provenance rejects commit, tag, or evidence drift", async () => {
  const baseline = JSON.parse(await readFile(new URL("resources/upstream-baseline.v1.json", root), "utf8")); verifyUpstreamSource(baseline);
  for (const mutate of [(value) => value.source.commitSha = "0".repeat(40), (value) => value.source.tag = "v0.82.0", (value) => value.source.provenance = "guessed"]) { const changed = structuredClone(baseline); mutate(changed); assert.throws(() => verifyUpstreamSource(changed), (error) => error.code === "UPSTREAM_SOURCE_PROVENANCE_INVALID"); }
});

test("offline upstream dashboard is deterministic, network-free, and honest about unknown source lag", async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("NETWORK_NOT_ALLOWED"); };
  try {
    const first = await upstreamDashboard(["--as-of", "2026-08-12"]);
    const second = await upstreamDashboard(["--as-of", "2026-08-12"]);
    assert.equal(calls, 0);
    assert.deepEqual(first, second);
    assert.equal(first.mode, "offline");
    assert.equal(first.baseline.version, "0.82.1");
    assert.equal(first.baseline.ageDays, 18);
    assert.equal(first.baseline.sourceCommitKnown, true);
    assert.equal(first.lag.commitsBehind, null);
    assert.equal(first.upstream.queryAttempted, false);
  } finally { globalThis.fetch = originalFetch; }
});
