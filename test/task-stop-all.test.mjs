import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTaskRunner, stopRunner } from "../scripts/task-runner.mjs";
import { processAlive, processIdentity } from "../scripts/task-process.mjs";
import { statePaths } from "../scripts/state-paths.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

test("stop-all supervision terminates a live Agent process group and persists cancellation", { skip: process.platform === "win32" }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-stop-all-"));
  const store = createTaskStore({ agentDir });
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "long-running agent", worktree: false });
    await store.update(async (state) => { const active = state.tasks.find(({ id }) => id === task.id); active.status = "running"; active.pid = child.pid; active.processIdentity = await processIdentity(child.pid); active.startedAt = new Date().toISOString(); active.updatedAt = active.startedAt; return state; });
    assert.equal(await processAlive(child.pid), true);
    assert.deepEqual(await stopRunner(agentDir), { status: "stopped", stopped: 1 });
    assert.equal(await processAlive(child.pid), false);
    const cancelled = (await store.load()).tasks[0];
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.pid, null); assert.equal(cancelled.lastError, "TERMINATED_BY_USER");
  } finally {
    if (await processAlive(child.pid)) try { process.kill(-child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("stop-all stops a verified runner while retaining an unverifiable task PID", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-stop-all-mismatch-"));
  const store = createTaskStore({ agentDir });
  const taskProcess = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  const runnerProcess = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "unverifiable", worktree: false });
    await store.update((state) => { const active = state.tasks[0]; active.status = "running"; active.pid = taskProcess.pid; active.processIdentity = "wrong-identity"; return state; });
    await writeFile(statePaths(agentDir).runner, `${JSON.stringify({ pid: runnerProcess.pid, processIdentity: await processIdentity(runnerProcess.pid), schemaVersion: 1, startedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
    await assert.rejects(stopRunner(agentDir), /TASK_PROCESS_IDENTITY_MISMATCH/);
    assert.equal(await processAlive(runnerProcess.pid), false);
    const retained = (await store.load()).tasks.find(({ id }) => id === task.id);
    assert.equal(retained.pid, taskProcess.pid); assert.equal(retained.processIdentity, "wrong-identity");
  } finally {
    for (const child of [taskProcess, runnerProcess]) try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("stop-all barrier prevents a concurrent runner claim", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-stop-all-barrier-"));
  const store = createTaskStore({ agentDir });
  try {
    await store.create({ cwd: process.cwd(), prompt: "must remain queued", worktree: false });
    const stopping = `${statePaths(agentDir).runner}.stopping`;
    await writeFile(stopping, `${JSON.stringify({ schemaVersion: 1, stopping: true, stoppingAt: new Date().toISOString() })}\n`, { mode: 0o600 });
    const runner = createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => ({ code: 0, output: "" }) });
    await assert.rejects(runner.run({ once: true }), /RUNNER_STOPPING/);
    assert.equal((await store.load()).tasks[0].status, "queued");
    assert.deepEqual(JSON.parse(await readFile(stopping, "utf8")).stopping, true);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("stop-all takes over a stale stopping barrier after its owner dies", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-stop-stale-"));
  try {
    const path = statePaths(agentDir).runner + ".stopping";
    await mkdir(agentDir, { recursive: true, mode: 0o700 });
    await writeFile(path, JSON.stringify({ operationId: "018f47a0-7b20-7cc5-8a33-aaaaaaaaaaaa", ownerIdentity: "linux:stale", ownerPid: 999999, phase: "stopping", schemaVersion: 1, stopping: true, stoppingAt: "2026-08-16T00:00:00.000Z" }) + "\n", { mode: 0o600 });
    const result = await stopRunner(agentDir); assert.equal(result.status, "stopped");
    await assert.rejects(stat(path));
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
