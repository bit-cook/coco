import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchService } from "../scripts/orch-service.mjs";
import { createTaskRunner } from "../scripts/task-runner.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

test("runner restart cancels active children after parent failure", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-parent-failure-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const store = createTaskStore({ agentDir }), orch = createOrchService({ agentDir });
  const parent = await store.create({ cwd: process.cwd(), prompt: "parent", worktree: false }), child = await store.create({ cwd: process.cwd(), prompt: "child", trigger: "child", worktree: false }); await orch.registerChild(parent.id, child.id);
  await store.update((state) => { const target = state.tasks.find(({ id }) => id === parent.id); target.status = "failed"; target.finishedAt = new Date().toISOString(); target.lastError = "PARENT_FAILED"; return state; });
  await createTaskRunner({ agentDir, root: process.cwd(), spawnTask: async () => ({ code: 0, output: "unused" }) }).run({ once: true });
  assert.equal((await store.load()).tasks.find(({ id }) => id === child.id).status, "cancelled"); assert.equal((await orch.parent(child.id)).status, "cancelled");
});
