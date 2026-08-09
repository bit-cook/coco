import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { processAlive, processIdentity } from "../scripts/task-process.mjs";
import { cancelTask } from "../scripts/task-runner.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

test("cancellation waits for launch publication and confirms process-tree termination", { skip: process.platform === "win32" }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-race-"));
  const store = createTaskStore({ agentDir });
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "launch race", worktree: false });
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.launchPending = true; return state; });
    const cancellation = cancelTask(store, task.id);
    await new Promise((done) => setTimeout(done, 50));
    await store.update(async (state) => { const active = state.tasks[0]; active.pid = child.pid; active.processIdentity = await processIdentity(child.pid); active.launchPending = false; return state; });
    const cancelled = await cancellation;
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.pid, null); assert.equal(await processAlive(child.pid), false);
  } finally {
    if (await processAlive(child.pid)) try { process.kill(-child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("cancellation preserves process metadata when identity verification fails", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-identity-"));
  const store = createTaskStore({ agentDir });
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "identity mismatch", worktree: false });
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.pid = child.pid; active.processIdentity = "wrong-identity"; return state; });
    await assert.rejects(cancelTask(store, task.id), /TASK_PROCESS_IDENTITY_MISMATCH/);
    const failed = (await store.load()).tasks[0];
    assert.equal(failed.pid, child.pid); assert.equal(failed.processIdentity, "wrong-identity"); assert.equal(await processAlive(child.pid), true);
  } finally {
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("cancellation fails closed for a live PID without process identity", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-no-identity-"));
  const store = createTaskStore({ agentDir });
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "missing identity", worktree: false });
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.pid = child.pid; active.processIdentity = null; return state; });
    await assert.rejects(cancelTask(store, task.id), /TASK_PROCESS_IDENTITY_REQUIRED/);
    const retained = (await store.load()).tasks[0];
    assert.equal(retained.pid, child.pid); assert.equal(retained.processIdentity, null); assert.equal(await processAlive(child.pid), true);
  } finally {
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});
