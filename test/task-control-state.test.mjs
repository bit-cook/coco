import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTaskStore, emptyTaskState, selectRunnableTask, validTaskState } from "../scripts/task-state.mjs";

test("task state persists validated worktree tasks transactionally", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-state-"));
  try {
    const store = createTaskStore({ agentDir, now: () => new Date("2026-08-09T12:00:00Z"), random: () => Buffer.alloc(9, 1) });
    const task = await store.create({ cwd: process.cwd(), prompt: "Implement the control plane", worktree: true });
    assert.match(task.id, /^[a-z0-9_-]{12}$/);
    assert.equal(task.status, "queued");
    const state = await store.load();
    assert.equal(state.revision, 1);
    assert.equal(selectRunnableTask(state).id, task.id);
    assert.equal((await stat(store.path)).mode & 0o777, 0o600);
    assert.equal(validTaskState(JSON.parse(await readFile(store.path, "utf8"))), true);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("empty task states have no runnable work", () => {
  assert.equal(selectRunnableTask(emptyTaskState()), null);
});

test("independent task stores serialize concurrent updates without loss", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-concurrent-"));
  try {
    const first = createTaskStore({ agentDir }); const second = createTaskStore({ agentDir });
    await Promise.all([first.create({ cwd: process.cwd(), prompt: "first", worktree: false }), second.create({ cwd: process.cwd(), prompt: "second", worktree: false })]);
    const state = await first.load();
    assert.equal(state.tasks.length, 2); assert.equal(state.revision, 2);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
