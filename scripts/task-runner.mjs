import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";
import { createTaskEventStore } from "./task-events.mjs";
import { createTaskLogStore } from "./task-logs.mjs";
import { processAlive, processIdentity, processMatches, terminateProcessTree } from "./task-process.mjs";
import { createTaskStore, selectRunnableTask } from "./task-state.mjs";
import { createTaskWorktree } from "./worktree-tasks.mjs";

function fail(code) { throw new StateError(code); }
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const abortableDelay = (milliseconds, signal) => new Promise((done) => {
  if (signal.aborted) { done(); return; }
  const timer = setTimeout(done, milliseconds);
  signal.addEventListener("abort", () => { clearTimeout(timer); done(); }, { once: true });
});

async function runnerState(path) {
  if (await inspectRegular(path) === null) return null;
  try { return JSON.parse(await readFile(path, "utf8")); } catch { fail("RUNNER_STATE_INVALID"); }
}

async function publishRunnerState({ agentDir, ownerId, path, state }) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await applyStateTransaction({ agentDir, operations: async () => {
        const existing = await runnerState(path);
        if (existing && existing.ownerId !== ownerId && (existing.processIdentity ? await processMatches(existing.pid, existing.processIdentity) : await processAlive(existing.pid))) fail("RUNNER_ALREADY_RUNNING");
        return [{ bytes: canonicalJson(state), path }];
      } });
      return;
    } catch (error) {
      if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error;
      await delay(10);
    }
  }
}

async function awaitLaunch(store, id) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = (await store.load()).tasks.find((entry) => entry.id === id);
    if (!task?.launchPending) return task;
    await delay(25);
  }
  fail("TASK_CANCEL_TIMEOUT");
}

export async function cancelTask(store, id) {
  const at = new Date().toISOString();
  let terminate = false;
  let cancelled;
  await store.update((state) => {
    const task = state.tasks.find((entry) => entry.id === id);
    if (!task) fail("TASK_NOT_FOUND");
    if (task.status === "running") {
      task.cancelPending = true; task.updatedAt = at; terminate = true;
    } else {
      if (task.pendingRunEvent !== null) fail("TASK_NOT_CANCELLABLE");
      task.status = "cancelled"; task.finishedAt = at; task.heartbeatAt = null; task.updatedAt = at; task.lastError = "TERMINATED_BY_USER";
      task.activeRunId = null; task.cancelPending = false; task.pid = null; task.processIdentity = null; task.launchPending = false;
      cancelled = structuredClone(task);
    }
    return state;
  });
  if (!terminate) return cancelled;
  try {
    const task = await awaitLaunch(store, id);
    if (task?.pid) {
      if (!task.processIdentity) fail("TASK_PROCESS_IDENTITY_REQUIRED");
      const result = await terminateProcessTree(task.pid, { identity: task.processIdentity });
      if (result.status !== "terminated" && result.status !== "absent") fail(result.status === "identity-mismatch" ? "TASK_PROCESS_IDENTITY_MISMATCH" : "TASK_PROCESS_STILL_ALIVE");
    }
  } catch (error) {
    await store.update((state) => { const task = state.tasks.find((entry) => entry.id === id); if (task) task.cancelPending = false; return state; });
    throw error;
  }
  await store.update((state) => {
    cancelled = state.tasks.find((entry) => entry.id === id);
    if (!cancelled) fail("TASK_NOT_FOUND");
    cancelled.status = "cancelled"; cancelled.finishedAt = at; cancelled.heartbeatAt = null; cancelled.updatedAt = at; cancelled.lastError = "TERMINATED_BY_USER";
    cancelled.activeRunId = null; cancelled.cancelPending = false; cancelled.pendingRunEvent = null; cancelled.pid = null; cancelled.processIdentity = null; cancelled.launchPending = false;
    return state;
  });
  return structuredClone(cancelled);
}

export async function getRunnerStatus(agentDir) {
  const state = await runnerState(statePaths(agentDir).runner);
  const running = state && (state.processIdentity ? await processMatches(state.pid, state.processIdentity) : await processAlive(state.pid));
  return running ? { ...state, legacyIdentity: !state.processIdentity, status: "running" } : { status: "stopped" };
}

export async function startDetachedRunner({ agentDir, root }) {
  const status = await getRunnerStatus(agentDir);
  if (status.status === "running") return status;
  await ensureAgentDirectory(agentDir);
  const logs = join(agentDir, "logs");
  await mkdir(logs, { recursive: true, mode: 0o700 });
  const output = await open(join(logs, "runner.log"), "a", 0o600);
  const child = spawn(process.execPath, [join(root, "scripts", "task-runner-main.mjs"), "--agent-dir", agentDir, "--root", root], {
    detached: true, env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", output.fd, output.fd],
  });
  child.unref();
  await output.close();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(20);
    const next = await getRunnerStatus(agentDir);
    if (next.status === "running") return next;
  }
  fail("RUNNER_START_FAILED");
}

export async function stopRunner(agentDir) {
  const store = createTaskStore({ agentDir });
  const snapshot = await store.load();
  const active = snapshot.tasks.filter(({ launchPending, pid, status }) => launchPending || pid || status === "running");
  const ids = new Set(active.map(({ id }) => id));
  const failures = [];
  for (const id of ids) try { await cancelTask(store, id); } catch (error) { failures.push(error); }
  const state = await runnerState(statePaths(agentDir).runner);
  let status = "stopped";
  if (state && await processAlive(state.pid)) {
    if (!state.processIdentity) status = "identity-unavailable";
    else if (!await processMatches(state.pid, state.processIdentity)) status = "identity-mismatch";
    else { const result = await terminateProcessTree(state.pid, { identity: state.processIdentity }); status = result.status === "terminated" || result.status === "absent" ? "stopped" : result.status; }
  }
  if (failures.length > 0) throw failures[0];
  return { status, ...(ids.size > 0 ? { stopped: ids.size } : {}) };
}

function finalAssistantText(output) {
  let result = "";
  for (const line of output.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const text = event.message.content?.filter((part) => part.type === "text").map((part) => part.text).join("\n");
        if (text) result = text;
      }
    } catch {}
  }
  return result;
}

function boundedOutputChunks(value, maxBytes = 12 * 1024) {
  const chunks = []; let current = ""; let size = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character);
    if (current && size + bytes > maxBytes) { chunks.push(current); current = ""; size = 0; }
    current += character; size += bytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function createTaskRunner({ agentDir, heartbeatIntervalMs = 30000, root, spawnTask, uuid = randomUUID } = {}) {
  if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs <= 0) fail("TASK_HEARTBEAT_INTERVAL_INVALID");
  const store = createTaskStore({ agentDir });
  const events = createTaskEventStore({ agentDir, enforceLifecycle: true });
  const logs = createTaskLogStore({ agentDir });
  const paths = statePaths(agentDir);
  let stopping = false;
  let child = null;
  let childIdentity = null;
  const terminate = () => {
    stopping = true;
    const spawned = child; const identity = childIdentity;
    if (spawned?.pid && identity) identity.then((value) => value ? terminateProcessTree(spawned.pid, { identity: value }) : undefined).catch(() => {});
  };

  function pendingRunEvent(type, runId, outcome = null) {
    return { at: new Date().toISOString(), eventId: randomUUID(), outcome, runId, type };
  }

  async function flushPending(id) {
    const task = (await store.load()).tasks.find((entry) => entry.id === id);
    const pending = task?.pendingRunEvent;
    if (!pending) return;
    await events.append({ ...pending, taskId: id });
    await store.update((state) => {
      const target = state.tasks.find((entry) => entry.id === id);
      if (!target || target.pendingRunEvent?.eventId !== pending.eventId) return state;
      target.pendingRunEvent = null;
      if (pending.type === "run.finished" || pending.type === "run.abandoned") target.activeRunId = null;
      return state;
    });
  }

  async function heartbeat(id, runId) {
    const at = new Date().toISOString();
    let active = false;
    await store.update((state) => {
      const task = state.tasks.find((entry) => entry.id === id);
      active = task?.status === "running" && !task.cancelPending && task.pendingRunEvent === null && task.activeRunId === runId;
      return state;
    });
    if (active) {
      await events.append({ at, eventId: randomUUID(), runId, taskId: id, type: "run.heartbeat" });
      await store.update((state) => {
        const task = state.tasks.find((entry) => entry.id === id);
        if (task?.status === "running" && !task.cancelPending && task.pendingRunEvent === null && task.activeRunId === runId) { task.heartbeatAt = at; task.updatedAt = at; }
        return state;
      });
    }
    return active;
  }

  async function claim(id, worktree) {
    let claimed;
    await store.update((state) => {
      const task = state.tasks.find((entry) => entry.id === id);
      if (!task || task.status !== "queued") fail("TASK_NOT_RUNNABLE");
      task.status = "running"; task.startedAt = new Date().toISOString(); task.updatedAt = task.startedAt; task.attempts += 1; task.activeRunId = uuid(); task.cancelPending = false;
      task.pendingRunEvent = pendingRunEvent("run.started", task.activeRunId);
      task.launchPending = true;
      if (worktree) { task.worktreePath = worktree.path; task.branch = worktree.branch; }
      claimed = structuredClone(task); return state;
    });
    return claimed;
  }

  async function finish(id, status, result, error = null) {
    await store.update((state) => {
      const task = state.tasks.find((entry) => entry.id === id);
      if (!task) fail("TASK_NOT_FOUND");
      if (task.status === "cancelled" || task.cancelPending) return state;
      if (task.status !== "running" || task.pendingRunEvent !== null || task.activeRunId === null) return state;
      const at = new Date().toISOString();
      task.status = status; task.finishedAt = at; task.heartbeatAt = null; task.updatedAt = at; task.pendingRunEvent = pendingRunEvent("run.finished", task.activeRunId, status); task.launchPending = false; task.pid = null; task.processIdentity = null; task.result = result; task.lastError = error;
      if (task.schedule && status !== "cancelled") {
        task.status = "queued"; task.finishedAt = null; task.schedule.nextRunAt = new Date(Date.now() + task.schedule.intervalMs).toISOString();
      }
      return state;
    });
    await flushPending(id);
  }

  async function runOne(task) {
    let worktree = null;
    let claimed = false;
    let started = false;
    try {
      if (task.worktree && !task.worktreePath) worktree = await createTaskWorktree({ agentDir, cwd: task.cwd, id: task.id });
      const currentTask = await claim(task.id, worktree); claimed = true;
      await flushPending(task.id); started = true;
      let launch = false;
      await store.update((state) => {
        const target = state.tasks.find(({ id }) => id === currentTask.id);
        launch = target?.status === "running" && !target.cancelPending && target.activeRunId === currentTask.activeRunId;
        if (target && !launch) target.launchPending = false;
        return state;
      });
      if (!launch) return;
      if (spawnTask) await store.update((state) => {
        const target = state.tasks.find(({ id }) => id === currentTask.id);
        if (target?.status === "running" && !target.cancelPending && target.activeRunId === currentTask.activeRunId) target.launchPending = false;
        return state;
      });
      let heartbeatError = null;
      const heartbeatController = new AbortController();
      const heartbeatLoop = (async () => {
        while (!heartbeatController.signal.aborted) {
          if (!await heartbeat(task.id, currentTask.activeRunId)) return;
          await abortableDelay(heartbeatIntervalMs, heartbeatController.signal);
        }
      })().catch((error) => { heartbeatError = error; terminate(); });
      const cwd = currentTask.worktreePath ?? currentTask.cwd;
      const execute = spawnTask ?? ((current) => new Promise((done) => {
        let stdout = ""; let stderr = "";
        child = spawn(process.execPath, [join(root, "bin", "coco"), "--mode", "json", "--no-approve", current.prompt], {
          cwd, detached: process.platform !== "win32", env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", "pipe", "pipe"],
        });
        const spawned = child;
        childIdentity = processIdentity(spawned.pid);
        const publication = childIdentity.then(async (identity) => {
          let cancelled = false;
          await store.update((state) => { const target = state.tasks.find(({ id }) => id === current.id); if (target?.status === "running" && !target.cancelPending && identity) { target.pid = spawned.pid; target.processIdentity = identity; target.launchPending = false; } else if (target) { target.pid = spawned.pid; target.processIdentity = identity; cancelled = true; } return state; });
          if (cancelled || !identity) {
            const result = identity ? await terminateProcessTree(spawned.pid, { identity }) : { status: "identity-unavailable" };
            await store.update((state) => { const target = state.tasks.find(({ id }) => id === current.id); if (target) { target.launchPending = false; if (result.status === "terminated" || result.status === "absent") { target.pid = null; target.processIdentity = null; } else { target.lastError = result.status === "identity-mismatch" ? "TASK_PROCESS_IDENTITY_MISMATCH" : "TASK_PROCESS_STILL_ALIVE"; } } return state; });
          }
        }).catch(async () => { await store.update((state) => { const target = state.tasks.find(({ id }) => id === current.id); if (target) { target.pid = spawned.pid; target.processIdentity = null; target.launchPending = false; target.lastError = "TASK_PROCESS_IDENTITY_REQUIRED"; } return state; }).catch(() => {}); });
        const writes = [];
        const capture = (stream, chunk, cap) => { const text = chunk.toString("utf8"); if (Buffer.byteLength(stream === "stdout" ? stdout : stderr) < cap) { if (stream === "stdout") stdout += text; else stderr += text; } for (const data of boundedOutputChunks(text)) writes.push(logs.append({ taskId: current.id, runId: current.activeRunId, stream, data })); };
        spawned.stdout.on("data", (chunk) => capture("stdout", chunk, 4_000_000));
        spawned.stderr.on("data", (chunk) => capture("stderr", chunk, 1_000_000));
        const complete = (outcome) => { void Promise.all(writes).then(() => publication).then(() => done(outcome)).catch((error) => done({ code: 1, error: error.message, output: stdout })); };
        spawned.on("error", (error) => complete({ code: 1, error: error.message, output: stdout }));
        spawned.on("close", (code) => complete({ code: code ?? 1, error: stderr.slice(-10000), output: stdout }));
      }));
      let outcome;
      try { outcome = await execute(currentTask); }
      finally { heartbeatController.abort(); await heartbeatLoop; }
      if (heartbeatError) throw heartbeatError;
      child = null; childIdentity = null;
      await finish(task.id, outcome.code === 0 ? "completed" : "failed", finalAssistantText(outcome.output ?? ""), outcome.code === 0 ? null : (outcome.error || "TASK_PROCESS_FAILED"));
    } catch (error) {
      if (!claimed || !started) throw error;
      await finish(task.id, "failed", null, error instanceof Error ? error.message : "TASK_FAILED");
    }
  }

  async function run({ once = false } = {}) {
    await ensureAgentDirectory(agentDir);
    const beforeRecovery = await store.load();
    for (const task of beforeRecovery.tasks) if (task.status === "running" && task.pid && !task.processIdentity && await processAlive(task.pid)) fail("TASK_PROCESS_IDENTITY_REQUIRED");
    const startedAt = new Date().toISOString();
    const ownerId = randomUUID(); const identity = await processIdentity(process.pid);
    await publishRunnerState({ agentDir, ownerId, path: paths.runner, state: { ownerId, pid: process.pid, processIdentity: identity, schemaVersion: 1, startedAt } });
    const signals = ["SIGINT", "SIGTERM"];
    for (const signal of signals) process.once(signal, terminate);
    try {
      await store.update(async (state) => {
        for (const task of state.tasks) {
          if (task.status !== "running") continue;
          if (task.pid && task.processIdentity && await processMatches(task.pid, task.processIdentity)) {
            const result = await terminateProcessTree(task.pid, { identity: task.processIdentity });
            if (result.status !== "terminated" && result.status !== "absent") fail("TASK_PROCESS_STILL_ALIVE");
          }
          const at = new Date().toISOString();
          task.cancelPending = false; task.heartbeatAt = null; task.launchPending = false; task.pid = null; task.processIdentity = null; task.updatedAt = at;
        }
        return state;
      });
      for (const task of (await store.load()).tasks) if (task.pendingRunEvent) await flushPending(task.id);
      await store.update((state) => {
        for (const task of state.tasks) {
          if (task.status !== "running") continue;
          const at = new Date().toISOString();
          task.status = "queued"; task.pendingRunEvent = task.activeRunId ? pendingRunEvent("run.abandoned", task.activeRunId, "abandoned") : null; task.startedAt = null; task.updatedAt = at; task.lastError = "RECOVERED_AFTER_RUNNER_RESTART";
        }
        return state;
      });
      for (const task of (await store.load()).tasks) if (task.pendingRunEvent?.type === "run.abandoned") await flushPending(task.id);
      do {
        const state = await store.load();
        const task = selectRunnableTask(state);
        if (task) await runOne(task);
        else if (!once) await delay(1000);
      } while (!once && !stopping);
    } finally {
      for (const signal of signals) process.removeListener(signal, terminate);
      const current = await runnerState(paths.runner);
      if (current?.ownerId === ownerId && current.pid === process.pid && current.processIdentity === identity) await rm(paths.runner, { force: true });
    }
  }
  return { run };
}
