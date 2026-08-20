import assert from "node:assert/strict";
import { lstat, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createModelInputLedger } from "../scripts/model-input-ledger.mjs";

const input = (generationId = "generation-1") => ({ generationId, messages: [{ role: "user", content: "hello" }], provider: "local", systemPrompt: "system", tools: [{ name: "read" }] });

test("model input projection is canonical, idempotent, and generation-bound", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-model-input-ledger-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const ledger = createModelInputLedger({ agentDir });
  const first = await ledger.record("request-1", input()), duplicate = await ledger.record("request-1", input());
  assert.deepEqual(first, duplicate); assert.equal((await ledger.verify("request-1", input())).status, "verified");
  if (process.platform !== "win32") assert.equal((await lstat(join(agentDir, "model-input-ledger", "request-1.json"))).mode & 0o077, 0);
  await assert.rejects(ledger.record("request-1", input("generation-2")), { code: "MODEL_INPUT_DIGEST_CONFLICT" });
  await assert.rejects(ledger.verify("request-1", { ...input(), systemPrompt: "changed" }), { code: "MODEL_INPUT_DIGEST_MISMATCH" });
});

test("model input ledger rejects corrupt files and symlinks", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-model-input-corrupt-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const ledger = createModelInputLedger({ agentDir });
  await ledger.record("corrupt", input()); await writeFile(join(agentDir, "model-input-ledger", "corrupt.json"), "{}\n"); await assert.rejects(ledger.read("corrupt"), { code: "MODEL_INPUT_LEDGER_CORRUPT" });
  await symlink(join(agentDir, "model-input-ledger", "corrupt.json"), join(agentDir, "model-input-ledger", "linked.json")); await assert.rejects(ledger.read("linked"));
});

test("model input ledger rejects oversized projections", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-model-input-large-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const ledger = createModelInputLedger({ agentDir });
  await assert.rejects(ledger.record("large", { ...input(), messages: [{ role: "user", content: "x".repeat(4 * 1024 * 1024) }] }), { code: "MODEL_INPUT_TOO_LARGE" });
});

test("compacted, resumed, and tool projections remain distinct and bounded", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-model-input-variants-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const ledger = createModelInputLedger({ agentDir });
  const compacted = { ...input(), messages: [{ role: "summary", content: "compacted" }] }, resumed = { ...input(), messages: [{ role: "user", content: "resumed" }] }, tool = { ...input(), tools: [{ name: "mcp", schema: { type: "object" } }] };
  const values = await Promise.all([ledger.record("compact", compacted), ledger.record("resume", resumed), ledger.record("tool", tool)]);
  assert.equal(new Set(values.map(({ requestSha256 }) => requestSha256)).size, 3);
  for (const id of ["compact", "resume", "tool"]) assert.equal((await ledger.read(id)).projection.provider, "local");
});
