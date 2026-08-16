import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTaskRunner, getRunnerStatus } from "../scripts/task-runner.mjs";
import { createTaskEventStore } from "../scripts/task-events.mjs";
import { createTaskReceiptStore } from "../scripts/task-receipts.mjs";
import { createTaskRunSupervisorStore } from "../scripts/task-run-supervisor.mjs";
import { processAlive, processIdentity, terminateProcessTree } from "../scripts/task-process.mjs";
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
    const receipt = await createTaskReceiptStore({ agentDir }).read({ runId, taskId: task.id });
    assert.equal(receipt.exitCode, 1); assert.equal(receipt.verdict, "failed"); assert.equal(JSON.stringify(receipt).includes("private"), false);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("started-run exceptions still produce sealed failed evidence", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-started-failure-"));
  const store = createTaskStore({ agentDir }); const runId = "018f47a0-7b20-7cc5-8a33-050505050505";
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "started failure", worktree: false });
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => { throw new Error("STARTED_EXECUTION_FAILED"); }, uuid: () => runId }).run({ once: true });
    const failed = (await store.load()).tasks[0]; assert.equal(failed.status, "failed"); assert.equal(failed.lastError, "STARTED_EXECUTION_FAILED");
    const receipt = await createTaskReceiptStore({ agentDir }).read({ taskId: task.id, runId }); assert.equal(receipt.verdict, "failed");
    assert.deepEqual((await createTaskEventStore({ agentDir }).read({ taskId: task.id, runId })).map(({ type }) => type), ["run.started", "run.heartbeat", "run.finished"]);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("terminal evidence truncates multi-byte result and error at schema byte limits", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-terminal-bounds-"));
  const store = createTaskStore({ agentDir }); const runId = "018f47a0-7b20-7cc5-8a33-060606060606";
  try {
    await store.create({ cwd: process.cwd(), prompt: "bounded terminal evidence", worktree: false });
    const output = `${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "汉".repeat(400_000) }] } })}\n`;
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => ({ code: 1, error: "错".repeat(10_000), output }), uuid: () => runId }).run({ once: true });
    const failed = (await store.load()).tasks[0]; assert.equal(failed.status, "failed"); assert.ok(Buffer.byteLength(failed.result) <= 1_000_000); assert.ok(Buffer.byteLength(failed.lastError) <= 10_000);
    assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(failed.result))); assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(failed.lastError)));
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner restart completes persisted terminal evidence without re-executing the task", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-terminal-evidence-"));
  const store = createTaskStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-bdbdbdbdbdbd";
  let executions = 0;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "terminal evidence recovery", worktree: false });
    const failingReceipts = { write: async () => { throw new Error("receipt unavailable"); } };
    const first = createTaskRunner({ agentDir, receiptStore: failingReceipts, root: new URL("..", import.meta.url).pathname, spawnTask: async () => { executions += 1; return { code: 0, output: "" }; }, uuid: () => runId });
    await assert.rejects(first.run({ once: true }), /receipt unavailable/);
    const retained = (await store.load()).tasks[0];
    assert.equal(retained.status, "running"); assert.equal(retained.activeRunId, runId); assert.equal(retained.terminalEvidence.status, "completed");
    const second = createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => { executions += 1; return { code: 1, output: "must not run" }; } });
    await second.run({ once: true });
    const completed = (await store.load()).tasks[0];
    assert.equal(executions, 1); assert.equal(completed.status, "completed"); assert.equal(completed.terminalEvidence, null); assert.equal(completed.activeRunId, null);
    assert.equal((await createTaskReceiptStore({ agentDir }).read({ taskId: task.id, runId })).verdict, "passed");
    assert.deepEqual((await createTaskEventStore({ agentDir }).read({ taskId: task.id, runId })).filter(({ type }) => type === "run.finished").map(({ outcome }) => outcome), ["completed"]);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner restart consumes a durable supervisor outcome without re-executing", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-supervisor-outcome-"));
  const store = createTaskStore({ agentDir }); const supervisors = createTaskRunSupervisorStore({ agentDir }); const events = createTaskEventStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-020202020202"; let executions = 0; let holder;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "durable supervisor recovery", worktree: false });
    const startedAt = new Date(Date.now() - 1000).toISOString();
    await store.update((state) => { const target = state.tasks[0]; target.status = "running"; target.activeRunId = runId; target.startedAt = startedAt; target.updatedAt = startedAt; return state; });
    await events.append({ at: startedAt, eventId: "018f47a0-7b20-7cc5-8a33-030303030303", runId, taskId: task.id, type: "run.started" });
    const prepared = await supervisors.prepare({ cwd: process.cwd(), prompt: task.prompt, runId, taskId: task.id });
    holder = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" }); holder.unref();
    const identity = await processIdentity(holder.pid); await supervisors.register({ pid: holder.pid, processIdentity: identity, runId, taskId: task.id });
    await supervisors.authorize({ runId, specSha256: prepared.specSha256, taskId: task.id });
    await writeFile(prepared.paths.stdout, '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"recovered"}]}}\n', { mode: 0o600 });
    await supervisors.writeOutcome({ endedAt: new Date().toISOString(), exitCode: 0, runId, specSha256: prepared.specSha256, startedAt, taskId: task.id });
    await terminateProcessTree(holder.pid, { graceMs: 50, identity });
    try { process.kill(-holder.pid, "SIGKILL"); } catch {} holder = null;
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => { executions += 1; return { code: 1, output: "must not execute" }; } }).run({ once: true });
    const completed = (await store.load()).tasks[0]; assert.equal(executions, 0); assert.equal(completed.status, "completed"); assert.equal(completed.result, "recovered");
    assert.equal((await createTaskReceiptStore({ agentDir }).read({ taskId: task.id, runId })).verdict, "passed");
  } finally {
    if (holder?.pid) { const identity = await processIdentity(holder.pid); if (identity) await terminateProcessTree(holder.pid, { graceMs: 50, identity }); try { process.kill(-holder.pid, "SIGKILL"); } catch {} }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("runner restart never requeues an authorized run with no durable outcome", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-supervisor-indoubt-"));
  const store = createTaskStore({ agentDir }); const supervisors = createTaskRunSupervisorStore({ agentDir });
  const runId = "018f47a0-7b20-7cc5-8a33-040404040404"; let executions = 0; let holder;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "in doubt supervisor", worktree: false });
    const startedAt = new Date().toISOString();
    await store.update((state) => { const target = state.tasks[0]; target.status = "running"; target.activeRunId = runId; target.startedAt = startedAt; target.updatedAt = startedAt; return state; });
    const prepared = await supervisors.prepare({ cwd: process.cwd(), prompt: task.prompt, runId, taskId: task.id });
    holder = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" }); holder.unref();
    const identity = await processIdentity(holder.pid); await supervisors.register({ pid: holder.pid, processIdentity: identity, runId, taskId: task.id }); await supervisors.authorize({ runId, specSha256: prepared.specSha256, taskId: task.id });
    await terminateProcessTree(holder.pid, { graceMs: 50, identity });
    try { process.kill(-holder.pid, "SIGKILL"); } catch {} holder = null;
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => { executions += 1; return { code: 0, output: "must not execute" }; } }).run({ once: true });
    const retained = (await store.load()).tasks[0]; assert.equal(executions, 0); assert.equal(retained.status, "running"); assert.equal(retained.activeRunId, runId); assert.equal(retained.lastError, "EXECUTION_OUTCOME_IN_DOUBT");
  } finally {
    if (holder?.pid) { const identity = await processIdentity(holder.pid); if (identity) await terminateProcessTree(holder.pid, { graceMs: 50, identity }); try { process.kill(-holder.pid, "SIGKILL"); } catch {} }
    await rm(agentDir, { recursive: true, force: true });
  }
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

test("scheduled attempt cap becomes a durable failure without crashing the runner", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-attempt-cap-")); const store = createTaskStore({ agentDir });
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "attempt cap", schedule: { intervalMs: 60000, nextRunAt: new Date(0).toISOString() }, trigger: "schedule", worktree: false });
    await store.update((state) => { state.tasks[0].attempts = 1000; return state; });
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => { throw new Error("must not execute"); } }).run({ once: true });
    const failed = (await store.load()).tasks.find(({ id }) => id === task.id);
    assert.equal(failed.status, "failed"); assert.equal(failed.lastError, "TASK_ATTEMPT_LIMIT_REACHED"); assert.equal(failed.schedule, null); assert.equal(failed.attempts, 1000);
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

test("runner applies backpressure without dropping high-volume child output", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-output-backpressure-"));
  const store = createTaskStore({ agentDir }); const persisted = [];
  const runId = "018f47a0-7b20-7cc5-8a33-abababababab";
  try {
    await store.create({ cwd: process.cwd(), prompt: "high output", worktree: false });
    const expected = "🎉汉字".repeat(100_000);
    const spawnChild = () => spawn(process.execPath, ["-e", "process.stdout.write('🎉汉字'.repeat(100000))"], { stdio: ["ignore", "pipe", "pipe"] });
    const logStore = { append: async ({ data, stream }) => { await new Promise((done) => setTimeout(done, 2)); persisted.push({ data, stream }); }, seal: async () => ({ bytes: Buffer.byteLength(expected), latestAt: null, records: persisted.length, ref: `task-logs/${(await store.load()).tasks[0].id}/${runId}.jsonl`, sha256: "0".repeat(64) }) };
    const receiptStore = { write: async () => ({}) };
    await createTaskRunner({ agentDir, logStore, receiptStore, root: new URL("..", import.meta.url).pathname, spawnChild, uuid: () => runId }).run({ once: true });
    assert.equal((await store.load()).tasks[0].status, "completed");
    assert.equal(persisted.every(({ stream }) => stream === "stdout"), true);
    assert.equal(persisted.map(({ data }) => data).join(""), expected); assert.ok(persisted.length > 64);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner fails observably when child output cannot be persisted", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-output-failure-"));
  const store = createTaskStore({ agentDir }); const runId = "018f47a0-7b20-7cc5-8a33-cdcdcdcdcdcd";
  try {
    await store.create({ cwd: process.cwd(), prompt: "failed logging", worktree: false });
    const spawnChild = () => spawn(process.execPath, ["-e", "process.stdout.write('output')"], { stdio: ["ignore", "pipe", "pipe"] });
    const logStore = { append: async () => { throw new Error("disk unavailable"); }, seal: async () => ({ bytes: 0, latestAt: null, records: 0, ref: `task-logs/${(await store.load()).tasks[0].id}/${runId}.jsonl`, sha256: "0".repeat(64) }) };
    await createTaskRunner({ agentDir, logStore, receiptStore: { write: async () => ({}) }, root: new URL("..", import.meta.url).pathname, spawnChild, uuid: () => runId }).run({ once: true });
    const failed = (await store.load()).tasks[0]; assert.equal(failed.status, "failed"); assert.match(failed.lastError, /TASK_LOG_WRITE_FAILED/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner preserves child success when bounded log storage is saturated", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-output-saturated-"));
  const store = createTaskStore({ agentDir }); const runId = "018f47a0-7b20-7cc5-8a33-efefefefefef"; let appends = 0;
  try {
    await store.create({ cwd: process.cwd(), prompt: "bounded logging", worktree: false });
    const spawnChild = () => spawn(process.execPath, ["-e", "process.stdout.write('x'.repeat(30000))"], { stdio: ["ignore", "pipe", "pipe"] });
    const logStore = { append: async () => { appends += 1; const error = new Error("TASK_LOG_LIMIT_EXCEEDED"); error.code = "TASK_LOG_LIMIT_EXCEEDED"; throw error; }, seal: async () => ({ bytes: 0, latestAt: null, records: 0, ref: `task-logs/${(await store.load()).tasks[0].id}/${runId}.jsonl`, sha256: "0".repeat(64) }) };
    await createTaskRunner({ agentDir, logStore, receiptStore: { write: async () => ({}) }, root: new URL("..", import.meta.url).pathname, spawnChild, uuid: () => runId }).run({ once: true });
    const completed = (await store.load()).tasks[0]; assert.equal(completed.status, "completed"); assert.equal(completed.lastError, null); assert.equal(completed.logsTruncated, true); assert.equal(appends, 1);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("supervised capture write failure publishes failed truncated evidence without re-execution", { timeout: 30_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-supervised-capture-failure-"));
  const store = createTaskStore({ agentDir }); const runId = "018f47a0-7b20-7cc5-8a33-f1f1f1f1f1f1"; let injected = false, executions = 0;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "--version", worktree: false });
    const captureFileOpen = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      return {
        close: () => handle.close(),
        sync: () => handle.sync(),
        write: async (bytes) => {
          if (!injected) { injected = true; const error = new Error("disk full"); error.code = "ENOSPC"; throw error; }
          return handle.write(bytes);
        },
      };
    };
    await createTaskRunner({ agentDir, captureFileOpen, root: new URL("..", import.meta.url).pathname, uuid: () => runId }).run({ once: true });
    const failed = (await store.load()).tasks[0];
    assert.equal(injected, true); assert.equal(failed.status, "failed"); assert.equal(failed.logsTruncated, true); assert.match(failed.lastError, /TASK_LOG_CAPTURE_WRITE_FAILED: disk full/);
    const receipt = await createTaskReceiptStore({ agentDir }).read({ taskId: task.id, runId }); assert.equal(receipt.verdict, "failed");
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, spawnTask: async () => { executions += 1; return { code: 0, output: "must not run" }; } }).run({ once: true });
    assert.equal(executions, 0); assert.equal((await store.load()).tasks[0].status, "failed");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("supervised capture close failure cannot publish a passed receipt", { timeout: 30_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-supervised-close-failure-"));
  const store = createTaskStore({ agentDir }); const runId = "018f47a0-7b20-7cc5-8a33-f2f2f2f2f2f2"; let injected = false;
  try {
    const task = await store.create({ cwd: process.cwd(), prompt: "--version", worktree: false });
    const captureFileOpen = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      return {
        close: async () => { await handle.close(); if (!injected) { injected = true; throw new Error("close failed"); } },
        sync: () => handle.sync(),
        write: (bytes) => handle.write(bytes),
      };
    };
    await createTaskRunner({ agentDir, captureFileOpen, root: new URL("..", import.meta.url).pathname, uuid: () => runId }).run({ once: true });
    const failed = (await store.load()).tasks[0];
    assert.equal(injected, true); assert.equal(failed.status, "failed"); assert.equal(failed.logsTruncated, true); assert.match(failed.lastError, /TASK_LOG_CAPTURE_WRITE_FAILED: close failed/);
    const receipt = await createTaskReceiptStore({ agentDir }).read({ taskId: task.id, runId }); assert.equal(receipt.verdict, "failed");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("empty task states have no runnable work", () => {
  assert.equal(selectRunnableTask(emptyTaskState()), null);
});

test("blocked tasks do not prevent selection of following queued work", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-blocked-selection-"));
  const store = createTaskStore({ agentDir });
  try {
    const first = await store.create({ cwd: process.cwd(), prompt: "blocked", worktree: true });
    const second = await store.create({ cwd: process.cwd(), prompt: "runnable", worktree: false });
    await store.update((state) => {
      const task = state.tasks.find(({ id }) => id === first.id);
      task.status = "blocked"; task.lastError = "WORKTREE_CONFLICT";
      return state;
    });
    const state = await store.load();
    assert.equal(validTaskState(state), true);
    assert.equal(selectRunnableTask(state).id, second.id);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
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
