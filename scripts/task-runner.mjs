import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, constants, lstat, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";
import { createTaskEventStore } from "./task-events.mjs";
import { createTaskLogStore } from "./task-logs.mjs";
import { createTaskReceiptStore } from "./task-receipts.mjs";
import { processAlive, processIdentity, processMatches, terminateProcessTree } from "./task-process.mjs";
import { createTaskRunSupervisorStore } from "./task-run-supervisor.mjs";
import { createTaskStore, selectRunnableTask } from "./task-state.mjs";
import { ensureTaskWorktree, isUnrecoverableWorktreeError, planTaskWorktree, repositoryRoot } from "./worktree-tasks.mjs";
import { resolveRuntimeRoot } from "./runtime-root.mjs";

function fail(code) { throw new StateError(code); }
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const abortableDelay = (milliseconds, signal) => new Promise((done) => {
  if (signal.aborted) { done(); return; }
  const timer = setTimeout(done, milliseconds);
  signal.addEventListener("abort", () => { clearTimeout(timer); done(); }, { once: true });
});

async function runnerState(path) {
  if (await inspectRegular(path) === null) return null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { return JSON.parse(await readFile(path, "utf8")); } catch (error) {
      if (error?.code === "ENOENT") return null;
      if (attempt < 19) { await delay(1); continue; }
      if (error instanceof SyntaxError) throw new StateError("RUNNER_STATE_INVALID");
      throw error;
    }
  }
}

async function publishRunnerState({ agentDir, ownerId, path, state }) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await applyStateTransaction({ agentDir, operations: async () => {
        if (await stoppingState(agentDir)) fail("RUNNER_STOPPING");
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

function stoppingPath(agentDir) { return `${statePaths(agentDir).runner}.stopping`; }

async function stoppingState(agentDir) {
  const path = stoppingPath(agentDir);
  if (await inspectRegular(path) === null) return null;
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error?.code === "ENOENT") return null; fail("RUNNER_STATE_INVALID"); }
}

async function setRunnerStopping(agentDir, stopping) {
  const path = stoppingPath(agentDir);
  if (!stopping) { await rm(path, { force: true }); return; }
  let previous;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await applyStateTransaction({ agentDir, operations: async () => {
        const existing = await stoppingState(agentDir);
        if (existing) {
          const ownerAlive = existing.pid && existing.processIdentity && await processMatches(existing.pid, existing.processIdentity);
          if (ownerAlive) fail("RUNNER_STOPPING");
          await rm(path, { force: true });
        }
        previous = await runnerState(statePaths(agentDir).runner);
        return [{ bytes: canonicalJson({ operationId: randomUUID(), ownerPid: process.pid, ownerIdentity: await processIdentity(process.pid), phase: "stopping", schemaVersion: 1, stopping: true, stoppingAt: new Date().toISOString() }), path }];
      } });
      return previous;
    } catch (error) {
      if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error;
      await delay(10);
    }
  }
}

async function clearRunnerStopping(agentDir) {
  await setRunnerStopping(agentDir, false);
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
  await store.update(async (state) => {
    const task = state.tasks.find((entry) => entry.id === id);
    if (!task) fail("TASK_NOT_FOUND");
    if (task.status === "running") {
      if (task.terminalEvidence !== null) fail("TASK_NOT_CANCELLABLE");
      if (task.activeRunId !== null) {
        const supervised = await createTaskRunSupervisorStore({ agentDir: store.agentDir }).inspect({ taskId: task.id, runId: task.activeRunId });
        if (supervised.outcome !== null) fail("TASK_NOT_CANCELLABLE");
      }
      task.cancelPending = true; task.updatedAt = at; terminate = true;
    } else {
       if (!["queued", "provisioning", "blocked"].includes(task.status)) fail("TASK_NOT_CANCELLABLE");
      if (task.pendingRunEvent !== null) fail("TASK_NOT_CANCELLABLE");
       task.status = "cancelled"; task.finishedAt = at; task.heartbeatAt = null; task.updatedAt = at; task.lastError = "TERMINATED_BY_USER"; task.provisioning = null;
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
  const afterTermination = (await store.load()).tasks.find((entry) => entry.id === id);
  if (afterTermination?.activeRunId) {
    const supervisor = createTaskRunSupervisorStore({ agentDir: store.agentDir });
    const state = await supervisor.inspect({ taskId: id, runId: afterTermination.activeRunId });
    if (state.authorization) {
      try { await supervisor.revoke({ generation: state.generation, ownerId: state.owner?.ownerId, taskId: id, runId: afterTermination.activeRunId, specSha256: state.specSha256 }); }
      catch (error) {
        if (error?.code !== "TASK_RUN_OUTCOME_EXISTS") throw error;
        await store.update((value) => { const task = value.tasks.find((entry) => entry.id === id); if (task) task.cancelPending = false; return value; });
        fail("TASK_NOT_CANCELLABLE");
      }
    }
  }
  await store.update((state) => {
    cancelled = state.tasks.find((entry) => entry.id === id);
    if (!cancelled) fail("TASK_NOT_FOUND");
    if (cancelled.terminalEvidence !== null) { cancelled.cancelPending = false; cancelled.updatedAt = new Date().toISOString(); return state; }
    cancelled.status = "cancelled"; cancelled.finishedAt = at; cancelled.heartbeatAt = null; cancelled.updatedAt = at; cancelled.lastError = "TERMINATED_BY_USER";
    cancelled.cancelPending = false; cancelled.pendingRunEvent = cancelled.activeRunId ? { at, eventId: randomUUID(), outcome: "abandoned", runId: cancelled.activeRunId, type: "run.abandoned" } : null; cancelled.pid = null; cancelled.processIdentity = null; cancelled.launchPending = false;
    return state;
  });
  if (cancelled.pendingRunEvent) {
    const pending = cancelled.pendingRunEvent, events = createTaskEventStore({ agentDir: store.agentDir, enforceLifecycle: true });
    await events.append({ ...pending, taskId: id });
    await store.update((state) => { const task = state.tasks.find((entry) => entry.id === id); if (task?.pendingRunEvent?.eventId === pending.eventId) { task.pendingRunEvent = null; task.activeRunId = null; } return state; });
    cancelled = (await store.load()).tasks.find((entry) => entry.id === id);
  }
  return structuredClone(cancelled);
}

export async function getRunnerStatus(agentDir) {
  const state = await runnerState(statePaths(agentDir).runner);
  const running = state && (state.processIdentity ? await processMatches(state.pid, state.processIdentity) : await processAlive(state.pid));
  return running ? { ...state, legacyIdentity: !state.processIdentity, status: "running" } : { status: "stopped" };
}

export async function startDetachedRunner({ agentDir, root }) {
  if (await stoppingState(agentDir)) fail("RUNNER_STOPPING");
  const status = await getRunnerStatus(agentDir);
  if (status.status === "running") return status;
  await ensureAgentDirectory(agentDir);
  const logs = join(agentDir, "logs");
  await mkdir(logs, { recursive: true, mode: 0o700 });
  const output = await open(join(logs, "runner.log"), "a", 0o600);
  const runtimeRoot = await resolveRuntimeRoot({ agentDir, root, statePaths: statePaths(agentDir) });
  const child = spawn(process.execPath, [join(runtimeRoot, "scripts", "task-runner-main.mjs"), "--agent-dir", agentDir, "--root", runtimeRoot], {
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
  const runner = await setRunnerStopping(agentDir, true);
  const ids = new Set();
  const failures = [];
  let status = "stopped";
  if (runner && await processAlive(runner.pid)) {
    if (!runner.processIdentity) status = "identity-unavailable";
    else if (!await processMatches(runner.pid, runner.processIdentity)) status = "identity-mismatch";
    else {
      const result = await terminateProcessTree(runner.pid, { identity: runner.processIdentity });
      status = result.status === "terminated" || result.status === "absent" ? "stopped" : result.status;
    }
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const active = (await store.load()).tasks.filter(({ launchPending, pid, status: taskStatus }) => launchPending || pid || taskStatus === "running");
    if (active.length === 0) break;
    for (const { id } of active) {
      ids.add(id);
      try { await cancelTask(store, id); } catch (error) { failures.push(error); }
    }
  }
  const remaining = (await store.load()).tasks.filter(({ launchPending, pid, status: taskStatus }) => launchPending || pid || taskStatus === "running");
  if (remaining.length > 0 && failures.length === 0) failures.push(new StateError("TASK_PROCESS_STILL_ALIVE"));
  if (status === "stopped" && failures.length === 0 && remaining.length === 0) await clearRunnerStopping(agentDir);
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

function truncateUtf8(value, maxBytes) {
  const text = typeof value === "string" ? value : "";
  if (Buffer.byteLength(text) <= maxBytes) return text;
  let output = "", bytes = 0;
  for (const character of text) { const size = Buffer.byteLength(character); if (bytes + size > maxBytes) break; output += character; bytes += size; }
  return output;
}

function boundedOutputChunks(value, maxBytes = 12 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) fail("TASK_LOG_RECORD_INVALID");
  const chunks = []; let current = ""; let size = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character);
    if (bytes > maxBytes) fail("TASK_LOG_RECORD_INVALID");
    if (current && size + bytes > maxBytes) { chunks.push(current); current = ""; size = 0; }
    current += character; size += bytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

function appendBounded(current, value, maxBytes) {
  const remaining = maxBytes - Buffer.byteLength(current);
  if (remaining <= 0 || value.length === 0) return { output: current, truncated: value.length > 0 };
  if (Buffer.byteLength(value) <= remaining) return { output: current + value, truncated: false };
  let prefix = "", bytes = 0;
  for (const character of value) { const size = Buffer.byteLength(character); if (bytes + size > remaining) break; prefix += character; bytes += size; }
  return { output: current + prefix, truncated: true };
}

async function readSupervisorOutput(path, maxBytes) {
  let before;
  try { before = await lstat(path); } catch (error) { throw error; }
  if (!before.isFile() || before.isSymbolicLink() || (process.platform !== "win32" && (before.mode & 0o077) !== 0)) fail("TASK_LOG_IMPORT_INVALID");
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat(), after = await lstat(path);
    if (!opened.isFile() || opened.size > maxBytes || (process.platform !== "win32" && (opened.mode & 0o077) !== 0)
      || opened.dev !== before.dev || opened.ino !== before.ino || opened.dev !== after.dev || opened.ino !== after.ino) fail("TASK_LOG_IMPORT_INVALID");
    const bytes = await handle.readFile(), final = await handle.stat(), finalPath = await lstat(path);
    if (bytes.length !== opened.size || final.size !== opened.size || final.mtimeNs !== opened.mtimeNs || final.ctimeNs !== opened.ctimeNs
      || final.dev !== finalPath.dev || final.ino !== finalPath.ino) fail("TASK_LOG_IMPORT_INVALID");
    return bytes;
  } finally { await handle?.close(); }
}

export async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes.subarray(offset));
    const written = result?.bytesWritten;
    if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset) fail("TASK_LOG_CAPTURE_WRITE_FAILED");
    offset += written;
  }
}

export function createTaskRunner({ agentDir, captureFileOpen = open, heartbeatIntervalMs = 30000, logStore, receiptStore, root, spawnChild = spawn, spawnTask, supervisorStore, uuid = randomUUID } = {}) {
  if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs <= 0) fail("TASK_HEARTBEAT_INTERVAL_INVALID");
  const store = createTaskStore({ agentDir });
  const events = createTaskEventStore({ agentDir, enforceLifecycle: true });
  const logs = logStore ?? createTaskLogStore({ agentDir });
  const receipts = receiptStore ?? createTaskReceiptStore({ agentDir });
  const supervisors = supervisorStore ?? createTaskRunSupervisorStore({ agentDir });
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
      try { await events.append({ at, eventId: randomUUID(), runId, taskId: id, type: "run.heartbeat" }); }
      catch (error) { if (error?.code !== "TASK_EVENT_TELEMETRY_LIMIT_EXCEEDED") throw error; }
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
    await store.update(async (state) => {
      // The persisted stop barrier is checked while holding the same state lock as the claim.
      if (await stoppingState(agentDir)) fail("RUNNER_STOPPING");
      const task = state.tasks.find((entry) => entry.id === id);
       if (!task || !["queued", "provisioning"].includes(task.status)) fail("TASK_NOT_RUNNABLE");
      if (task.attempts >= 1000) {
        const at = new Date().toISOString();
        task.status = "failed"; task.finishedAt = at; task.updatedAt = at; task.lastError = "TASK_ATTEMPT_LIMIT_REACHED"; task.schedule = null;
        claimed = structuredClone(task);
        return state;
      }
       task.status = "running"; task.startedAt = new Date().toISOString(); task.updatedAt = task.startedAt; task.attempts += 1; task.activeRunId = uuid(); task.cancelPending = false; task.logsTruncated = false; task.outcomeInDoubt = null; task.terminalEvidence = null;
      task.pendingRunEvent = pendingRunEvent("run.started", task.activeRunId);
      task.launchPending = true;
       if (worktree) { task.worktreePath = worktree.path; task.branch = worktree.branch; task.baseCommit = worktree.baseCommit; task.provisioning = null; }
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

  async function persistTerminalEvidence(id, outcome, terminal = {}) {
    let persisted = false;
    await store.update((state) => {
      const task = state.tasks.find((entry) => entry.id === id);
      if (!task) fail("TASK_NOT_FOUND");
      if (task.status === "cancelled" && task.activeRunId === null) return state;
      if (task.status !== "running" || task.activeRunId === null || task.pendingRunEvent !== null) fail("TASK_TERMINAL_EVIDENCE_INVALID");
      const status = outcome.code === 0 ? "completed" : "failed";
      const endedAt = terminal.endedAt ?? new Date().toISOString();
       task.heartbeatAt = null; task.launchPending = false; task.outcomeInDoubt = null; task.pid = null; task.processIdentity = null;
      task.terminalEvidence = { endedAt, eventId: terminal.eventId ?? randomUUID(), exitCode: outcome.code, lastError: outcome.code === 0 ? null : truncateUtf8(outcome.error || "TASK_PROCESS_FAILED", 10000), logsTruncated: outcome.logsTruncated === true, result: truncateUtf8(finalAssistantText(outcome.output ?? ""), 1000000), status };
      task.updatedAt = endedAt; persisted = true;
      return state;
    });
    return persisted;
  }

  async function supervisedOutcome(task, state) {
    const stdout = await readSupervisorOutput(state.paths.stdout, 4_000_000);
    const stderr = await readSupervisorOutput(state.paths.stderr, 1_000_000);
    const descriptor = await logs.materializeSupervisorOutput({ at: state.outcome.endedAt, runId: task.activeRunId, stderr, stdout, taskId: task.id });
    const output = stdout.toString("utf8"), error = stderr.subarray(Math.max(0, stderr.length - 10000)).toString("utf8");
    return { descriptor, outcome: { code: state.outcome.exitCode, error, logsTruncated: state.outcome.stdoutTruncated || state.outcome.stderrTruncated, output } };
  }

  async function consumeSupervisorOutcome(task, state) {
    const { outcome } = await supervisedOutcome(task, state);
    if (!task.terminalEvidence) await persistTerminalEvidence(task.id, outcome, { endedAt: state.outcome.endedAt });
    await flushTerminalEvidence(task.id);
  }

  async function reconcileSupervisedRuns({ waitForLive = false } = {}) {
    const supervised = new Set();
    for (const task of (await store.load()).tasks) {
      if (task.status !== "running" || !task.activeRunId || task.terminalEvidence) continue;
      let state = await supervisors.inspect({ taskId: task.id, runId: task.activeRunId });
      if (!state.spec) continue;
      supervised.add(task.id);
      if (waitForLive && state.authorization && !state.outcome && state.registration && await processMatches(state.registration.pid, state.registration.processIdentity)) {
        for (let attempt = 0; attempt < 200 && !state.outcome && await processMatches(state.registration.pid, state.registration.processIdentity); attempt += 1) { await delay(25); state = await supervisors.inspect({ taskId: task.id, runId: task.activeRunId }); }
      }
       if (state.outcome) { await consumeSupervisorOutcome(task, state); continue; }
       if (state.phase === "abandoned") { supervised.delete(task.id); continue; }
       if (state.authorization) {
         const alive = state.registration && await processMatches(state.registration.pid, state.registration.processIdentity);
         if (!alive) await store.update((tasks) => { const target = tasks.tasks.find(({ id }) => id === task.id); if (target?.activeRunId === task.activeRunId) { const at = new Date().toISOString(); target.cancelPending = false; target.heartbeatAt = null; target.launchPending = false; target.lastError = "EXECUTION_OUTCOME_IN_DOUBT"; target.outcomeInDoubt = { at, generation: state.generation, reason: "authorized-without-outcome", runId: task.activeRunId }; target.pid = null; target.processIdentity = null; target.updatedAt = at; } return tasks; });
         continue;
       }
       if (state.registration && await processMatches(state.registration.pid, state.registration.processIdentity)) {
         const terminated = await terminateProcessTree(state.registration.pid, { identity: state.registration.processIdentity });
         if (!["terminated", "absent"].includes(terminated.status)) fail("TASK_PROCESS_STILL_ALIVE");
       }
       if (["prepared", "registered"].includes(state.phase) && state.stale) {
         const takeover = await supervisors.takeover({ expectedGeneration: state.generation, taskId: task.id, runId: task.activeRunId });
         await supervisors.abandon({ ...takeover, specSha256: state.specSha256, taskId: task.id, runId: task.activeRunId });
         supervised.delete(task.id);
       }
    }
    return supervised;
  }

  async function flushTerminalEvidence(id) {
    const task = (await store.load()).tasks.find((entry) => entry.id === id);
    const evidence = task?.terminalEvidence;
    if (!task || !evidence || !task.activeRunId) return;
    const descriptor = await logs.seal({ taskId: task.id, runId: task.activeRunId });
    await receipts.write({ endedAt: evidence.endedAt, exitCode: evidence.exitCode, log: { bytes: descriptor.bytes, records: descriptor.records, ref: descriptor.ref, sha256: descriptor.sha256 }, runId: task.activeRunId, startedAt: task.startedAt, taskId: task.id });
    await store.update((state) => {
      const target = state.tasks.find((entry) => entry.id === id);
      if (!target?.terminalEvidence || target.terminalEvidence.eventId !== evidence.eventId || target.activeRunId !== task.activeRunId) return state;
      target.status = evidence.status; target.finishedAt = evidence.endedAt; target.heartbeatAt = null; target.updatedAt = evidence.endedAt;
      target.pendingRunEvent = { at: evidence.endedAt, eventId: evidence.eventId, outcome: evidence.status, runId: target.activeRunId, type: "run.finished" };
      target.cancelPending = false; target.launchPending = false; target.logsTruncated = evidence.logsTruncated; target.pid = null; target.processIdentity = null; target.result = evidence.result; target.lastError = evidence.lastError; target.terminalEvidence = null;
      if (target.schedule) { target.status = "queued"; target.finishedAt = null; target.schedule.nextRunAt = new Date(Date.parse(evidence.endedAt) + target.schedule.intervalMs).toISOString(); }
      return state;
    });
    await flushPending(id);
  }

  async function runOne(task) {
    let worktree = null;
    let claimed = false;
    let claimedRunId = null;
    let started = false;
    let terminalPersisted = false;
    try {
       if (task.worktree) {
         const planned = task.provisioning
           ? { branch: task.provisioning.branch, path: task.provisioning.worktreePath, baseCommit: task.provisioning.baseCommit, repo: task.cwd }
           : await planTaskWorktree({ agentDir, cwd: task.cwd, id: task.id });
         if (!task.provisioning) await store.update((state) => {
           const target = state.tasks.find(({ id }) => id === task.id);
           if (target?.status === "queued") { target.status = "provisioning"; target.worktreePath = planned.path; target.branch = planned.branch; target.baseCommit = planned.baseCommit; target.provisioning = { baseCommit: planned.baseCommit, branch: planned.branch, worktreePath: planned.path }; target.updatedAt = new Date().toISOString(); }
           return state;
         });
         const current = (await store.load()).tasks.find(({ id }) => id === task.id);
         if (current?.status !== "provisioning") return;
         worktree = await ensureTaskWorktree({ agentDir, cwd: task.cwd, id: task.id, planned: { ...planned, repo: planned.repo ?? await repositoryRoot(task.cwd) } });
       }
      const currentTask = await claim(task.id, worktree); claimed = true; claimedRunId = currentTask.activeRunId;
      if (currentTask.status === "failed" && currentTask.lastError === "TASK_ATTEMPT_LIMIT_REACHED") return;
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
      const supervisedExecute = async (current) => {
        const prepared = await supervisors.prepare({ cwd, prompt: current.prompt, runId: current.activeRunId, taskId: current.id });
        let stdoutFile, stderrFile;
        try {
          stdoutFile = await captureFileOpen(prepared.paths.stdout, "a", 0o600);
          stderrFile = await captureFileOpen(prepared.paths.stderr, "a", 0o600);
        } catch (error) {
          await stdoutFile?.close().catch(() => {});
          error.taskLogCaptureFailure = true;
          throw error;
        }
        child = spawnChild(process.execPath, [join(root, "scripts", "task-run-supervisor-main.mjs"), "--task-id", current.id, "--run-id", current.activeRunId, "--generation", String(prepared.generation), "--owner-id", prepared.ownerId], {
          cwd, detached: process.platform !== "win32", env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", "pipe", "pipe"],
        });
        const spawned = child;
        let stdoutBytes = 0, stderrBytes = 0, stdoutTruncated = false, stderrTruncated = false, captureError = null, captureWrites = Promise.resolve();
        const recordCaptureError = (error) => { captureError ??= error; };
        const capture = (stream, file, chunk, cap) => {
          const accepted = chunk.subarray(0, Math.max(0, cap - (stream === "stdout" ? stdoutBytes : stderrBytes)));
          if (stream === "stdout") { stdoutBytes += accepted.length; stdoutTruncated ||= accepted.length < chunk.length; }
          else { stderrBytes += accepted.length; stderrTruncated ||= accepted.length < chunk.length; }
          if (accepted.length > 0) captureWrites = captureWrites.then(() => captureError ? undefined : writeAll(file, accepted)).catch(recordCaptureError);
        };
        spawned.stdout.on("data", (chunk) => capture("stdout", stdoutFile, chunk, 4_000_000));
        spawned.stderr.on("data", (chunk) => capture("stderr", stderrFile, chunk, 1_000_000));
        const closed = new Promise((done) => { spawned.once("error", (error) => done({ code: 1, error })); spawned.once("close", (code) => done({ code: code ?? 1 })); });
        let registered;
        for (let attempt = 0; attempt < 400; attempt += 1) {
          const state = await supervisors.inspect({ taskId: current.id, runId: current.activeRunId });
          if (state.registration) { registered = state.registration; break; }
          if (!await processAlive(spawned.pid)) break;
          await delay(10);
        }
        if (!registered || registered.pid !== spawned.pid || !await processMatches(registered.pid, registered.processIdentity)) {
          const identity = await processIdentity(spawned.pid);
          if (identity) await terminateProcessTree(spawned.pid, { identity });
          await captureWrites;
          for (const file of [stdoutFile, stderrFile]) {
            try { await file.sync(); } catch (error) { recordCaptureError(error); }
            try { await file.close(); } catch (error) { recordCaptureError(error); }
          }
          await supervisors.abandon({ generation: prepared.generation, ownerId: prepared.ownerId, runId: current.activeRunId, specSha256: prepared.specSha256, taskId: current.id });
          fail("TASK_RUN_REGISTRATION_INVALID");
        }
        childIdentity = Promise.resolve(registered.processIdentity);
        let authorize = false;
        await store.update((state) => {
          const target = state.tasks.find(({ id }) => id === current.id);
          authorize = target?.status === "running" && !target.cancelPending && target.activeRunId === current.activeRunId;
          if (target) { target.pid = registered.pid; target.processIdentity = registered.processIdentity; target.launchPending = false; }
          return state;
        });
        if (!authorize) { await terminateProcessTree(registered.pid, { identity: registered.processIdentity }); fail("TASK_RUN_NOT_AUTHORIZED"); }
        await supervisors.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId: current.id, runId: current.activeRunId, specSha256: prepared.specSha256 });
        const closedOutcome = await closed;
        await captureWrites;
        for (const file of [stdoutFile, stderrFile]) {
          try { await file.sync(); } catch (error) { recordCaptureError(error); }
          try { await file.close(); } catch (error) { recordCaptureError(error); }
        }
        const state = await supervisors.inspect({ taskId: current.id, runId: current.activeRunId });
        if (!state.outcome) {
          await store.update((tasks) => { const target = tasks.tasks.find(({ id }) => id === current.id); if (target) { const at = new Date().toISOString(); target.lastError = "EXECUTION_OUTCOME_IN_DOUBT"; target.outcomeInDoubt = { at, generation: prepared.generation, reason: "authorized-without-outcome", runId: current.activeRunId }; target.pid = null; target.processIdentity = null; target.launchPending = false; target.updatedAt = at; } return tasks; });
          fail("EXECUTION_OUTCOME_IN_DOUBT");
        }
        const { outcome } = await supervisedOutcome(current, state);
        outcome.logsTruncated ||= stdoutTruncated || stderrTruncated;
        if (closedOutcome.error) outcome.error ||= closedOutcome.error.message;
        if (captureError) { outcome.code = 1; outcome.error = `TASK_LOG_CAPTURE_WRITE_FAILED: ${captureError.message}`; outcome.logsTruncated = true; }
        return outcome;
      };
      const legacyExecute = (current) => new Promise((done) => {
        let stdout = ""; let stderr = "";
        child = spawnChild(process.execPath, [join(root, "bin", "coco"), "--mode", "json", "--no-approve", current.prompt], {
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
        const HIGH_WATER_WRITES = 64, LOW_WATER_WRITES = 16;
        const stdoutDecoder = new StringDecoder("utf8"), stderrDecoder = new StringDecoder("utf8");
        let writeTail = Promise.resolve(), pendingWrites = 0, logError = null, logSaturated = false, stdoutTruncated = false, stderrTruncated = false, completed = false;
        const resumeStreams = () => { if (!logError && pendingWrites > LOW_WATER_WRITES) return; spawned.stdout.resume(); spawned.stderr.resume(); };
        const enqueue = (stream, text) => {
          for (const data of boundedOutputChunks(text)) {
            pendingWrites += 1;
            if (pendingWrites >= HIGH_WATER_WRITES) { spawned.stdout.pause(); spawned.stderr.pause(); }
            writeTail = writeTail.then(async () => {
              if (!logError && !logSaturated) {
                try { await logs.append({ taskId: current.id, runId: current.activeRunId, stream, data }); }
                catch (error) { if (error?.code === "TASK_LOG_LIMIT_EXCEEDED") logSaturated = true; else logError = error; }
              }
              pendingWrites -= 1; resumeStreams();
            });
          }
        };
        const capture = (stream, chunk, cap) => {
          const decoder = stream === "stdout" ? stdoutDecoder : stderrDecoder;
          const text = decoder.write(chunk);
          const bounded = appendBounded(stream === "stdout" ? stdout : stderr, text, cap);
          if (stream === "stdout") { stdout = bounded.output; stdoutTruncated ||= bounded.truncated; }
          else { stderr = bounded.output; stderrTruncated ||= bounded.truncated; }
          if (!logError && !logSaturated) enqueue(stream, text);
        };
        spawned.stdout.on("data", (chunk) => capture("stdout", chunk, 4_000_000));
        spawned.stderr.on("data", (chunk) => capture("stderr", chunk, 1_000_000));
        const complete = (outcome) => {
          if (completed) return; completed = true;
          const tailStdout = stdoutDecoder.end(), tailStderr = stderrDecoder.end();
          if (tailStdout && !logError && !logSaturated) enqueue("stdout", tailStdout);
          if (tailStderr && !logError && !logSaturated) enqueue("stderr", tailStderr);
          void writeTail.then(() => publication).then(() => {
            if (logError) done({ code: 1, error: `TASK_LOG_WRITE_FAILED: ${logError.message}`, logsTruncated: false, output: stdout });
            else done({ ...outcome, logsTruncated: logSaturated || stdoutTruncated || stderrTruncated });
          }).catch((error) => done({ code: 1, error: error.message, logsTruncated: false, output: stdout }));
        };
        spawned.on("error", (error) => complete({ code: 1, error: error.message, output: stdout }));
        spawned.on("close", (code) => complete({ code: code ?? 1, error: stderr.slice(-10000), output: stdout }));
      });
      const execute = spawnTask ?? (spawnChild === spawn ? supervisedExecute : legacyExecute);
      let outcome;
      try { outcome = await execute(currentTask); }
      finally { heartbeatController.abort(); await heartbeatLoop; }
      if (heartbeatError) throw heartbeatError;
      child = null; childIdentity = null;
      terminalPersisted = await persistTerminalEvidence(task.id, outcome);
      if (terminalPersisted) await flushTerminalEvidence(task.id);
    } catch (error) {
      if (!claimed && isUnrecoverableWorktreeError(error)) {
        await store.update((state) => {
          const target = state.tasks.find(({ id }) => id === task.id);
          if (target?.status === "provisioning") {
            const at = new Date().toISOString();
            target.status = "blocked"; target.updatedAt = at; target.lastError = error.code; target.provisioning = null;
          }
          return state;
        });
        return "blocked";
      }
      if (!claimed || !started) throw error;
      if (terminalPersisted || error?.code === "EXECUTION_OUTCOME_IN_DOUBT") throw error;
      if (error?.code === "TASK_RUN_REGISTRATION_INVALID") {
        await store.update((state) => {
          const target = state.tasks.find(({ id }) => id === task.id);
          if (target?.status === "running" && !target.cancelPending && target.activeRunId === claimedRunId) {
            const at = new Date().toISOString(); target.status = "queued"; target.pendingRunEvent = pendingRunEvent("run.abandoned", target.activeRunId, "abandoned"); target.heartbeatAt = null; target.startedAt = null; target.updatedAt = at; target.lastError = "TASK_RUN_REGISTRATION_INVALID"; target.launchPending = false; target.pid = null; target.processIdentity = null;
          }
          return state;
        });
        await flushPending(task.id);
        return "abandoned";
      }
      const outcome = { code: 1, error: error instanceof Error ? error.message : "TASK_FAILED", logsTruncated: error?.taskLogCaptureFailure === true, output: "" };
      terminalPersisted = await persistTerminalEvidence(task.id, outcome);
      if (terminalPersisted) await flushTerminalEvidence(task.id);
    }
  }

  async function run({ once = false } = {}) {
    await ensureAgentDirectory(agentDir);
    const beforeRecovery = await store.load();
    for (const task of beforeRecovery.tasks) if (task.status === "running" && task.pid && !task.processIdentity && await processAlive(task.pid)) fail("TASK_PROCESS_IDENTITY_REQUIRED");
    const startedAt = new Date().toISOString();
    const ownerId = randomUUID(); const identity = await processIdentity(process.pid);
    await publishRunnerState({ agentDir, ownerId, path: paths.runner, state: { ownerId, pid: process.pid, processIdentity: identity, runtimeKey: process.env.COCO_RUNTIME_KEY ?? null, runtimeRoot: process.env.COCO_RUNTIME_ROOT ?? null, schemaVersion: 1, startedAt } });
    const signals = ["SIGINT", "SIGTERM"];
    for (const signal of signals) process.once(signal, terminate);
    try {
      for (const task of (await store.load()).tasks) if (task.pendingRunEvent) await flushPending(task.id);
       for (const task of (await store.load()).tasks) if (task.terminalEvidence) await flushTerminalEvidence(task.id);
       for (const task of (await store.load()).tasks) if (task.status === "provisioning") await runOne(task);
      const supervised = await reconcileSupervisedRuns({ waitForLive: true });
      await store.update(async (state) => {
        for (const task of state.tasks) {
          if (task.status !== "running" || supervised.has(task.id)) continue;
          if (task.pid && task.processIdentity && await processMatches(task.pid, task.processIdentity)) {
            const result = await terminateProcessTree(task.pid, { identity: task.processIdentity });
            if (result.status !== "terminated" && result.status !== "absent") fail("TASK_PROCESS_STILL_ALIVE");
          }
          const at = new Date().toISOString(); task.cancelPending = false; task.heartbeatAt = null; task.launchPending = false; task.pid = null; task.processIdentity = null; task.updatedAt = at;
        }
        return state;
      });
      await store.update((state) => {
        for (const task of state.tasks) {
          if (task.status !== "running" || task.terminalEvidence || task.outcomeInDoubt) continue;
          const at = new Date().toISOString();
          task.status = "queued"; task.pendingRunEvent = task.activeRunId ? pendingRunEvent("run.abandoned", task.activeRunId, "abandoned") : null; task.startedAt = null; task.updatedAt = at; task.lastError = "RECOVERED_AFTER_RUNNER_RESTART";
        }
        return state;
      });
      for (const task of (await store.load()).tasks) if (task.pendingRunEvent?.type === "run.abandoned") await flushPending(task.id);
      do {
        await reconcileSupervisedRuns();
        const state = await store.load();
        const task = selectRunnableTask(state);
        if (task) {
          const outcome = await runOne(task);
          if (once && outcome !== "blocked") break;
        } else {
          if (!once) await delay(1000);
          else break;
        }
      } while (!stopping);
    } finally {
      for (const signal of signals) process.removeListener(signal, terminate);
      let current;
      try { current = await runnerState(paths.runner); } catch (error) { if (error?.code !== "RUNNER_STATE_INVALID") throw error; }
      if (current?.ownerId === ownerId && current.pid === process.pid && current.processIdentity === identity && !await stoppingState(agentDir)) await rm(paths.runner, { force: true });
    }
  }
  return { run };
}
