import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { stopRunner } from "../scripts/task-runner.mjs";
import { processAlive } from "../scripts/task-process.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

test("stop-all supervision terminates a live Agent process group and persists cancellation", { skip: process.platform === "win32" }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-stop-all-"));
  const store = createTaskStore({ agentDir });
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "long-running agent", worktree: false });
    await store.update((state) => { const active = state.tasks.find(({ id }) => id === task.id); active.status = "running"; active.pid = child.pid; active.startedAt = new Date().toISOString(); active.updatedAt = active.startedAt; return state; });
    assert.equal(await processAlive(child.pid), true);
    assert.deepEqual(await stopRunner(agentDir), { status: "stopped" });
    assert.equal(await processAlive(child.pid), false);
    const cancelled = (await store.load()).tasks[0];
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.pid, null); assert.equal(cancelled.lastError, "TERMINATED_BY_USER");
  } finally {
    if (await processAlive(child.pid)) try { process.kill(-child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});
