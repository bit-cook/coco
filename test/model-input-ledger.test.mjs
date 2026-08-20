import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createModelInputLedger } from "../scripts/model-input-ledger.mjs";

const input = (generationId = "generation-1") => ({ generationId, messages: [{ role: "user", content: "hello" }], provider: "local", systemPrompt: "system", tools: [{ name: "read" }] });

test("model input projection is canonical, idempotent, and generation-bound", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-model-input-ledger-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const ledger = createModelInputLedger({ agentDir });
  const first = await ledger.record("request-1", input()), duplicate = await ledger.record("request-1", input());
  assert.deepEqual(first, duplicate); assert.equal((await ledger.verify("request-1", input())).status, "verified");
  await assert.rejects(ledger.record("request-1", input("generation-2")), { code: "MODEL_INPUT_DIGEST_CONFLICT" });
  await assert.rejects(ledger.verify("request-1", { ...input(), systemPrompt: "changed" }), { code: "MODEL_INPUT_DIGEST_MISMATCH" });
});

test("model input ledger rejects oversized projections", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-model-input-large-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const ledger = createModelInputLedger({ agentDir });
  await assert.rejects(ledger.record("large", { ...input(), messages: [{ role: "user", content: "x".repeat(4 * 1024 * 1024) }] }), { code: "MODEL_INPUT_TOO_LARGE" });
});
