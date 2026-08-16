import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { collectRuntimeGarbage } from "../scripts/runtime-store.mjs";
import { resolveRuntimeRoot } from "../scripts/runtime-root.mjs";
import policy from "../scripts/runtime-store-policy.cjs";

const key = `${"a".repeat(64)}-node137-linux-x64`, old = 1_000_000;
test("runtime GC preserves current, referenced, and leased keys and removes stale debris", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-runtime-store-"));
  try {
    await Promise.all([mkdir(join(root, key)), mkdir(join(root, `${"b".repeat(64)}-node137-linux-x64`)), mkdir(join(root, `${"c".repeat(64)}-node137-linux-x64`)), mkdir(join(root, ".leases"))]);
    await mkdir(join(root, ".staging-old")); await writeFile(join(root, ".old.lock"), "x");
    await writeFile(join(root, ".leases", "live"), JSON.stringify({ key: `${"c".repeat(64)}-node137-linux-x64`, pid: 1 })); await utimes(join(root, ".staging-old"), old / 1000, old / 1000); await utimes(join(root, ".old.lock"), old / 1000, old / 1000);
    await collectRuntimeGarbage({ currentKey: key, graceMs: 100, runtimeStore: root, staleMs: 100, references: new Set([resolve(join(root, `${"b".repeat(64)}-node137-linux-x64`))]), now: () => 2_000_000, isLeaseAlive: async (value) => value.pid === 1 });
    await assert.doesNotReject(import("node:fs/promises").then(({ access }) => access(join(root, key)))); await assert.doesNotReject(import("node:fs/promises").then(({ access }) => access(join(root, `${"b".repeat(64)}-node137-linux-x64`)))); await assert.doesNotReject(import("node:fs/promises").then(({ access }) => access(join(root, `${"c".repeat(64)}-node137-linux-x64`))));
    await assert.rejects(access(join(root, ".staging-old"))); await assert.doesNotReject(access(join(root, ".old.lock")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("runtime resolver skips stale state and uses the next valid snapshot", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-runtime-root-"));
  try {
    const staleKey = `${"b".repeat(64)}-node137-linux-x64`, validKey = `${"c".repeat(64)}-node137-linux-x64`;
    const validRoot = join(agentDir, "runtime", validKey), runner = join(agentDir, "runner.json"), control = join(agentDir, "control.json");
    await mkdir(validRoot, { recursive: true });
    await writeFile(join(validRoot, ".runtime-complete.json"), JSON.stringify({ key: validKey, schemaVersion: 1 }));
    await writeFile(runner, JSON.stringify({ runtimeKey: staleKey, runtimeRoot: join(agentDir, "runtime", staleKey) }));
    await writeFile(control, JSON.stringify({ runtimeKey: validKey, runtimeRoot: validRoot }));
    assert.equal(await resolveRuntimeRoot({ agentDir, root: join(agentDir, "source"), statePaths: { control, runner } }), resolve(validRoot));
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runtime completion and storage budgets fail closed", () => {
  const runtimeKey = `${"d".repeat(64)}-node137-linux-x64`, manifestHash = "e".repeat(64);
  assert.equal(policy.completionValid({ key: runtimeKey, manifestHash, schemaVersion: 1 }, runtimeKey, manifestHash), true);
  assert.equal(policy.completionValid({ key: runtimeKey, manifestHash: "f".repeat(64), schemaVersion: 1 }, runtimeKey, manifestHash), false);
  assert.equal(policy.storageBudgetValid({ availableBytes: 64 * 1024 * 1024, availableInodes: 1024 }), true);
  assert.equal(policy.storageBudgetValid({ availableBytes: 64 * 1024 * 1024 - 1, availableInodes: 1024 }), false);
  assert.equal(policy.storageBudgetValid({ availableBytes: 64 * 1024 * 1024, availableInodes: 1023 }), false);
});
