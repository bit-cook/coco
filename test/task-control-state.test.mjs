import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTaskRunner, getRunnerStatus } from "../scripts/task-runner.mjs";
import { createTaskEventStore } from "../scripts/task-events.mjs";
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
    assert.equal(task.activeRunId, null);
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
    const runId = "018f47a0-7b20-7cc5-8a33-111111111111";
    const runners = [createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask, uuid: () => runId }), createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask, uuid: () => runId })];
    const results = await Promise.allSettled(runners.map((runner) => runner.run({ once: true })));
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.filter(({ status, reason }) => status === "rejected" && /RUNNER_ALREADY_RUNNING/.test(reason?.message)).length, 1);
    assert.equal(executions, 1);
    const completed = (await store.load()).tasks.find(({ id }) => id === task.id);
    assert.equal(completed.status, "completed"); assert.equal(completed.attempts, 1);
    assert.equal(completed.activeRunId, null);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner claims expose one durable run ID and clear it after completion", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-run-id-"));
  const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-222222222222";
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "observe run identity", worktree: false });
    let observed;
    const runner = createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async (claimed) => { observed = claimed.activeRunId; assert.equal((await store.load()).tasks[0].activeRunId, runId); return { code: 0, output: "" }; }, uuid: () => runId });
    await runner.run({ once: true });
    assert.equal(observed, runId);
    const completed = (await store.load()).tasks.find(({ id }) => id === task.id);
    assert.equal(completed.status, "completed"); assert.equal(completed.activeRunId, null);
    assert.deepEqual((await createTaskEventStore({ agentDir }).read({ runId, taskId: task.id })).map(({ outcome, type }) => ({ outcome, type })), [
      { outcome: null, type: "run.started" },
      { outcome: null, type: "run.heartbeat" },
      { outcome: "completed", type: "run.finished" },
    ]);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner records failed terminal outcomes without persisting task content", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-failed-events-"));
  const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-666666666666";
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "private prompt", worktree: false });
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => ({ code: 1, error: "private error", output: "private output" }), uuid: () => runId }).run({ once: true });
    const events = await createTaskEventStore({ agentDir }).read({ runId, taskId: task.id });
    assert.deepEqual(events.map(({ outcome, type }) => ({ outcome, type })), [
      { outcome: null, type: "run.started" },
      { outcome: null, type: "run.heartbeat" },
      { outcome: "failed", type: "run.finished" },
    ]);
    assert.equal(JSON.stringify(events).includes("private"), false);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner restart replays a terminal outbox intent idempotently", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-event-replay-"));
  const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-777777777777";
  const eventId = "018f47a0-7b20-7cc5-8a33-888888888888";
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "replay terminal", worktree: false });
    await store.update((state) => {
      const target = state.tasks[0];
      target.status = "completed"; target.activeRunId = runId; target.finishedAt = new Date().toISOString();
      target.pendingRunEvent = { at: new Date().toISOString(), eventId, outcome: "completed", runId, type: "run.finished" };
      return state;
    });
    const events = createTaskEventStore({ agentDir });
    await events.append({ ...((await store.load()).tasks[0].pendingRunEvent), taskId: task.id });
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname }).run({ once: true });
    assert.deepEqual((await events.read({ runId, taskId: task.id })).map(({ eventId: id }) => id), [eventId]);
    const completed = (await store.load()).tasks[0];
    assert.equal(completed.pendingRunEvent, null); assert.equal(completed.activeRunId, null); assert.equal(completed.status, "completed");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("a corrupt started-event stream prevents launch and releases runner ownership", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-start-event-failure-"));
  const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-cccccccccccc";
  let executions = 0;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "must not execute", worktree: false });
    const events = createTaskEventStore({ agentDir });
    const path = events.pathFor(task.id, runId);
    await mkdir(join(agentDir, "task-events", task.id), { recursive: true, mode: 0o700 });
    await writeFile(path, "{corrupt}\n", { mode: 0o600 });
    const runner = createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => { executions += 1; return { code: 0, output: "" }; }, uuid: () => runId });
    await assert.rejects(runner.run({ once: true }), /TASK_EVENT_CORRUPT/);
    const retained = (await store.load()).tasks[0];
    assert.equal(executions, 0); assert.equal(retained.status, "running"); assert.equal(retained.activeRunId, runId); assert.equal(retained.pendingRunEvent.type, "run.started");
    assert.equal((await getRunnerStatus(agentDir)).status, "stopped");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("a corrupt terminal-event stream preserves non-runnable outbox state", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-terminal-event-failure-"));
  const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-dddddddddddd";
  const eventId = "018f47a0-7b20-7cc5-8a33-eeeeeeeeeeee";
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "must not rerun", worktree: false });
    await store.update((state) => {
      const target = state.tasks[0];
      target.status = "completed"; target.activeRunId = runId; target.finishedAt = new Date().toISOString();
      target.pendingRunEvent = { at: new Date().toISOString(), eventId, outcome: "completed", runId, type: "run.finished" };
      return state;
    });
    const events = createTaskEventStore({ agentDir });
    const path = events.pathFor(task.id, runId);
    await mkdir(join(agentDir, "task-events", task.id), { recursive: true, mode: 0o700 });
    await writeFile(path, "{corrupt}\n", { mode: 0o600 });
    await assert.rejects(createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname }).run({ once: true }), /TASK_EVENT_CORRUPT/);
    const retained = (await store.load()).tasks[0];
    assert.equal(retained.status, "completed"); assert.equal(retained.activeRunId, runId); assert.equal(retained.pendingRunEvent.eventId, eventId);
    assert.equal(selectRunnableTask(await store.load()), null); assert.equal((await getRunnerStatus(agentDir)).status, "stopped");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("scheduled attempts clear their run ID before requeueing and allocate a new one", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-scheduled-run-id-"));
  const store = createTaskStore({ agentDir });
  const runIds = ["018f47a0-7b20-7cc5-8a33-333333333333", "018f47a0-7b20-7cc5-8a33-444444444444"];
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "scheduled identity", schedule: { intervalMs: 60000, nextRunAt: new Date(0).toISOString() }, trigger: "schedule", worktree: false });
    const observed = [];
    for (const runId of runIds) {
      const runner = createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async (claimed) => { observed.push(claimed.activeRunId); return { code: 0, output: "" }; }, uuid: () => runId });
      await runner.run({ once: true });
      const queued = (await store.load()).tasks.find(({ id }) => id === task.id);
      assert.equal(queued.status, "queued"); assert.equal(queued.activeRunId, null); assert.equal(queued.heartbeatAt, null);
      await store.update((state) => { state.tasks[0].schedule.nextRunAt = new Date(0).toISOString(); return state; });
    }
    assert.deepEqual(observed, runIds);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner restart recovery clears an interrupted run ID before requeueing", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-recovered-run-id-"));
  const store = createTaskStore({ agentDir });
  try {
    await store.create({ cwd: process.cwd(), prompt: "recover identity", worktree: false });
    const interruptedRunId = "018f47a0-7b20-7cc5-8a33-555555555555";
    await store.update((state) => { const task = state.tasks[0]; task.status = "running"; task.activeRunId = interruptedRunId; task.startedAt = new Date().toISOString(); return state; });
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => ({ code: 0, output: "" }) }).run({ once: true });
    const completed = (await store.load()).tasks[0];
    assert.equal(completed.status, "completed"); assert.equal(completed.activeRunId, null); assert.equal(completed.heartbeatAt, null); assert.equal(completed.attempts, 1);
    assert.deepEqual((await createTaskEventStore({ agentDir }).read({ runId: interruptedRunId, taskId: completed.id })).map(({ outcome, type }) => ({ outcome, type })), [{ outcome: "abandoned", type: "run.abandoned" }]);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner heartbeats periodically and stops before the terminal event", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-heartbeat-periodic-"));
  const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-121212121212";
  let release;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "periodic heartbeat", worktree: false });
    const execution = new Promise((done) => { release = done; });
    const running = createTaskRunner({ agentDir, heartbeatIntervalMs: 10, root: new URL("..", import.meta.url).pathname, spawnTask: async () => execution, uuid: () => runId }).run({ once: true });
    const events = createTaskEventStore({ agentDir });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await events.read({ runId, taskId: task.id })).filter(({ type }) => type === "run.heartbeat").length >= 2) break;
      await new Promise((done) => setTimeout(done, 5));
    }
    const active = (await store.load()).tasks[0];
    assert.equal(active.status, "running"); assert.equal(active.launchPending, false); assert.notEqual(active.heartbeatAt, null);
    release({ code: 0, output: "" });
    await running;
    const completed = (await store.load()).tasks[0];
    assert.equal(completed.status, "completed"); assert.equal(completed.heartbeatAt, null);
    const sequence = (await events.read({ runId, taskId: task.id })).map(({ type }) => type);
    assert.ok(sequence.filter((type) => type === "run.heartbeat").length >= 2);
    assert.equal(sequence.at(-1), "run.finished");
  } finally { release?.({ code: 1, output: "" }); await rm(agentDir, { recursive: true, force: true }); }
});

test("short tasks stop the heartbeat wait immediately", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-heartbeat-short-"));
  const store = createTaskStore({ agentDir });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "short heartbeat", worktree: false });
    const started = Date.now();
    await createTaskRunner({ agentDir, heartbeatIntervalMs: 30000, root: new URL("..", import.meta.url).pathname, spawnTask: async () => ({ code: 0, output: "" }) }).run({ once: true });
    assert.ok(Date.now() - started < 5000);
    const completed = (await store.load()).tasks.find(({ id }) => id === task.id);
    assert.equal(completed.status, "completed"); assert.equal(completed.heartbeatAt, null); assert.equal(completed.launchPending, false);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner rejects unsafe heartbeat intervals", () => {
  assert.throws(() => createTaskRunner({ agentDir: process.cwd(), heartbeatIntervalMs: 0, root: process.cwd() }), /TASK_HEARTBEAT_INTERVAL_INVALID/);
  assert.throws(() => createTaskRunner({ agentDir: process.cwd(), heartbeatIntervalMs: Number.NaN, root: process.cwd() }), /TASK_HEARTBEAT_INTERVAL_INVALID/);
});

test("empty task states have no runnable work", () => {
  assert.equal(selectRunnableTask(emptyTaskState()), null);
});

test("task state rejects outbox events associated with a different run", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-event-invariant-"));
  const store = createTaskStore({ agentDir });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "validate outbox identity", worktree: false });
    const state = await store.load();
    const target = state.tasks[0];
    target.status = "running"; target.activeRunId = "018f47a0-7b20-7cc5-8a33-999999999999";
    target.pendingRunEvent = { at: new Date().toISOString(), eventId: "018f47a0-7b20-7cc5-8a33-aaaaaaaaaaaa", outcome: null, runId: "018f47a0-7b20-7cc5-8a33-bbbbbbbbbbbb", type: "run.started" };
    assert.equal(validTaskState(state), false);
    await assert.rejects(store.update((current) => { current.tasks.find(({ id }) => id === task.id).activeRunId = target.activeRunId; current.tasks.find(({ id }) => id === task.id).pendingRunEvent = target.pendingRunEvent; current.tasks.find(({ id }) => id === task.id).status = "running"; return current; }), /TASK_STATE_INVALID/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
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
