import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { processAlive, processIdentity } from "../scripts/task-process.mjs";
import { cancelTask } from "../scripts/task-runner.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";
import { createTaskRunner } from "../scripts/task-runner.mjs";

test("queued tasks cancel without entering process termination", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-queued-"));
  const store = createTaskStore({ agentDir });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "queued task", worktree: false });
    const cancelled = await cancelTask(store, task.id);
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.cancelPending, false); assert.equal(cancelled.activeRunId, null);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("cancelling an injected run clears heartbeat state without waiting for a process", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-injected-"));
  const store = createTaskStore({ agentDir });
  let release;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "injected cancellation", worktree: false });
    const execution = new Promise((done) => { release = done; });
    const running = createTaskRunner({ agentDir, heartbeatIntervalMs: 10, spawnTask: async () => execution }).run({ once: true });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = (await store.load()).tasks[0];
      if (current.status === "running" && current.heartbeatAt !== null) break;
      await new Promise((done) => setTimeout(done, 5));
    }
    const cancelled = await cancelTask(store, task.id);
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.heartbeatAt, null); assert.equal(cancelled.activeRunId, null);
    release({ code: 0, output: "" }); await running;
    assert.equal((await store.load()).tasks[0].status, "cancelled");
  } finally { release?.({ code: 1, output: "" }); await rm(agentDir, { recursive: true, force: true }); }
});

test("cancellation waits for launch publication and confirms process-tree termination", { skip: process.platform === "win32" }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-race-"));
  const store = createTaskStore({ agentDir });
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "launch race", worktree: false });
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.activeRunId = randomUUID(); active.launchPending = true; return state; });
    const cancellation = cancelTask(store, task.id);
    await new Promise((done) => setTimeout(done, 50));
    await store.update(async (state) => { const active = state.tasks[0]; active.pid = child.pid; active.processIdentity = await processIdentity(child.pid); active.launchPending = false; return state; });
    const cancelled = await cancellation;
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.activeRunId, null); assert.equal(cancelled.heartbeatAt, null); assert.equal(cancelled.pid, null); assert.equal(await processAlive(child.pid), false);
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
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.activeRunId = randomUUID(); active.pid = child.pid; active.processIdentity = "wrong-identity"; return state; });
    await assert.rejects(cancelTask(store, task.id), /TASK_PROCESS_IDENTITY_MISMATCH/);
    const failed = (await store.load()).tasks[0];
    assert.equal(failed.status, "running"); assert.equal(failed.cancelPending, false); assert.notEqual(failed.activeRunId, null); assert.equal(failed.pid, child.pid); assert.equal(failed.processIdentity, "wrong-identity"); assert.equal(await processAlive(child.pid), true);
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
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.activeRunId = randomUUID(); active.pid = child.pid; active.processIdentity = null; return state; });
    await assert.rejects(cancelTask(store, task.id), /TASK_PROCESS_IDENTITY_REQUIRED/);
    const retained = (await store.load()).tasks[0];
    assert.equal(retained.status, "running"); assert.equal(retained.cancelPending, false); assert.notEqual(retained.activeRunId, null); assert.equal(retained.pid, child.pid); assert.equal(retained.processIdentity, null); assert.equal(await processAlive(child.pid), true);
  } finally {
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});
