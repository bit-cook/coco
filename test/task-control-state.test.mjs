import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTaskRunner, getRunnerStatus } from "../scripts/task-runner.mjs";
import { processAlive } from "../scripts/task-process.mjs";
import { statePaths } from "../scripts/state-paths.mjs";
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

test("legacy runner state remains visible and blocks duplicate task recovery", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-legacy-"));
  const legacyRunner = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  try {
    await writeFile(statePaths(agentDir).runner, `${JSON.stringify({ pid: legacyRunner.pid, schemaVersion: 1, startedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
    assert.deepEqual(await getRunnerStatus(agentDir), { legacyIdentity: true, pid: legacyRunner.pid, schemaVersion: 1, startedAt: (JSON.parse(await readFile(statePaths(agentDir).runner))).startedAt, status: "running" });
    await assert.rejects(createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname }).run({ once: true }), /RUNNER_ALREADY_RUNNING/);
  } finally {
    try { process.kill(legacyRunner.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("legacy live task PID is not requeued without process identity", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-legacy-process-"));
  const legacyTask = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  const store = createTaskStore({ agentDir });
  try {
    await store.create({ cwd: process.cwd(), prompt: "legacy task", worktree: false });
    await store.update((state) => { const task = state.tasks[0]; task.status = "running"; task.pid = legacyTask.pid; task.processIdentity = null; return state; });
    await assert.rejects(createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname }).run({ once: true }), /TASK_PROCESS_IDENTITY_REQUIRED/);
    const retained = (await store.load()).tasks[0];
    assert.equal(retained.status, "running"); assert.equal(retained.pid, legacyTask.pid); assert.equal(await processAlive(legacyTask.pid), true);
  } finally {
    try { process.kill(legacyTask.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("concurrent runners acquire exclusive ownership without corrupting a claimed task", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-runner-owner-"));
  const store = createTaskStore({ agentDir });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "single owner", worktree: false });
    let executions = 0;
    const spawnTask = async () => { executions += 1; await new Promise((done) => setTimeout(done, 100)); return { code: 0, output: "" }; };
    const runners = [createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask }), createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask })];
    const results = await Promise.allSettled(runners.map((runner) => runner.run({ once: true })));
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.filter(({ status, reason }) => status === "rejected" && /RUNNER_ALREADY_RUNNING/.test(reason?.message)).length, 1);
    assert.equal(executions, 1);
    const completed = (await store.load()).tasks.find(({ id }) => id === task.id);
    assert.equal(completed.status, "completed"); assert.equal(completed.attempts, 1);
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
