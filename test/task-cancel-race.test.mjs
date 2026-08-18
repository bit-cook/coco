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
import { createTaskRunSupervisorStore } from "../scripts/task-run-supervisor.mjs";

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

test("durable terminal evidence wins a concurrent cancellation arbitration", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-terminal-evidence-"));
  const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-070707070707";
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "terminal wins", worktree: false });
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.activeRunId = runId; active.startedAt = new Date().toISOString(); active.launchPending = true; return state; });
    const cancelling = cancelTask(store, task.id);
    for (let attempt = 0; attempt < 100; attempt += 1) { if ((await store.load()).tasks[0].cancelPending) break; await new Promise((done) => setTimeout(done, 5)); }
    await store.update((state) => { const active = state.tasks[0]; active.launchPending = false; active.terminalEvidence = { encodingLoss: false, endedAt: new Date().toISOString(), eventId: "018f47a0-7b20-7cc5-8a33-080808080808", exitCode: 0, lastError: null, logsTruncated: false, result: "done", status: "completed" }; return state; });
    const arbitration = await cancelling;
    assert.equal(arbitration.status, "running"); assert.equal(arbitration.cancelPending, false); assert.equal(arbitration.activeRunId, runId); assert.equal(arbitration.terminalEvidence.status, "completed");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("durable supervisor outcome cannot be overwritten by cancellation", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-supervisor-outcome-")); const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-090909090909"; let child;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "outcome wins", worktree: false });
    child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" }); const identity = await processIdentity(child.pid);
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.activeRunId = runId; active.pid = child.pid; active.processIdentity = identity; active.startedAt = "2026-08-15T00:00:00.000Z"; return state; });
    const supervisor = createTaskRunSupervisorStore({ agentDir }), prepared = await supervisor.prepare({ cwd: process.cwd(), prompt: "outcome wins", runId, taskId: task.id });
    await supervisor.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, taskId: task.id, runId }); await supervisor.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId: task.id, runId, specSha256: prepared.specSha256 });
    await supervisor.writeOutcome({ endedAt: "2026-08-15T00:00:01.000Z", exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, runId, specSha256: prepared.specSha256, startedAt: "2026-08-15T00:00:00.000Z", taskId: task.id });
    await assert.rejects(cancelTask(store, task.id), /TASK_NOT_CANCELLABLE/);
    const retained = (await store.load()).tasks[0]; assert.equal(retained.status, "running"); assert.equal(retained.activeRunId, runId);
  } finally {
    if (child?.pid) { try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {} }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("terminal tasks cannot be rewritten by cancellation", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-cancel-terminal-")); const store = createTaskStore({ agentDir });
  try {
    for (const status of ["completed", "failed", "cancelled"]) {
      const task = await store.create({ cwd: process.cwd(), prompt: `terminal ${status}`, worktree: false });
      await store.update((state) => { const target = state.tasks.find(({ id }) => id === task.id); target.status = status; target.finishedAt = "2026-08-16T00:00:00.000Z"; return state; });
      await assert.rejects(cancelTask(store, task.id), /TASK_NOT_CANCELLABLE/);
      assert.equal((await store.load()).tasks.find(({ id }) => id === task.id).status, status);
    }
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
