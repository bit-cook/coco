import assert from "node:assert/strict";
import test from "node:test";

import { createCommandRecoveryJournal } from "../scripts/command-recovery-journal.mjs";
import { createDurableEffectFence } from "../scripts/durable-effect-fence.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("durable fence persists before effect and replays the result", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coco-effect-fence-")); t.after(() => rm(directory, { recursive: true, force: true })); const fence = createDurableEffectFence({ journal: createCommandRecoveryJournal({ directory }) }); let calls = 0;
  const input = { commandId: "effect-1", effectGeneration: 1, operationId: "test.effect", request: { value: 1 } };
  assert.deepEqual(await fence.run({ ...input, effect: async () => { calls += 1; return { ok: true }; } }), { response: { ok: true }, status: "completed" });
  assert.deepEqual(await fence.run({ ...input, effect: async () => { calls += 1; return { ok: false }; } }), { response: { ok: true }, status: "replayed" }); assert.equal(calls, 1);
});

test("persistence failure produces no effect and uncertain effect is not replayed", async () => {
  let calls = 0; const journal = { async beginExecution() {}, async markUncertain() {}, async receive() { throw new Error("journal unavailable"); }, async recordResult() {} }; const fence = createDurableEffectFence({ journal });
  await assert.rejects(fence.run({ commandId: "blocked", effect: async () => { calls += 1; } }), /journal unavailable/); assert.equal(calls, 0);
});
