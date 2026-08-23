import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchService } from "../scripts/orch-service.mjs";
import { createTaskRunner } from "../scripts/task-runner.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

test("runner consumes a durable inbox item only after claiming its queued task", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-runner-")); t.after(() => rm(agentDir, { recursive: true, force: true }));
  const store = createTaskStore({ agentDir }), task = await store.create({ cwd: process.cwd(), prompt: "inbox task", worktree: false });
  const orch = createOrchService({ agentDir }); await orch.admit({ category: "follow-up", createdAt: "2026-08-23T00:00:00.000Z", id: "inbox-intent", priority: 1, source: task.id });
  await createTaskRunner({ agentDir, root: process.cwd(), spawnTask: async () => ({ code: 0, output: "done" }) }).run({ once: true });
  assert.equal((await store.load()).tasks[0].status, "completed"); assert.equal(await orch.next(), null);
});

test("inbox item for a non-queued task does not block ordinary runnable selection", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-runner-fallback-")); t.after(() => rm(agentDir, { recursive: true, force: true }));
  const store = createTaskStore({ agentDir }), blocked = await store.create({ cwd: process.cwd(), initialStatus: "blocked", prompt: "blocked", worktree: false }), queued = await store.create({ cwd: process.cwd(), prompt: "queued", worktree: false });
  const orch = createOrchService({ agentDir }); await orch.admit({ category: "child", createdAt: "2026-08-23T00:00:00.000Z", id: "blocked-intent", priority: 1, source: blocked.id });
  await createTaskRunner({ agentDir, root: process.cwd(), spawnTask: async () => ({ code: 0, output: "done" }) }).run({ once: true });
  const state = await store.load(); assert.equal(state.tasks.find(({ id }) => id === queued.id).status, "completed"); assert.equal((await orch.next()).source, blocked.id);
});
