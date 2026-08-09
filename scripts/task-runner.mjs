import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";
import { processAlive, processIdentity, processMatches, terminateProcessTree } from "./task-process.mjs";
import { createTaskStore, selectRunnableTask } from "./task-state.mjs";
import { createTaskWorktree } from "./worktree-tasks.mjs";

function fail(code) { throw new StateError(code); }
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

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
  await store.update((state) => {
    const task = state.tasks.find((entry) => entry.id === id);
    if (!task) fail("TASK_NOT_FOUND");
    task.status = "cancelled"; task.finishedAt = at; task.updatedAt = at; task.lastError = "TERMINATED_BY_USER";
    return state;
  });
  const task = await awaitLaunch(store, id);
  if (task?.pid) {
    if (!task.processIdentity) fail("TASK_PROCESS_IDENTITY_REQUIRED");
    const result = await terminateProcessTree(task.pid, { identity: task.processIdentity });
    if (result.status !== "terminated" && result.status !== "absent") fail(result.status === "identity-mismatch" ? "TASK_PROCESS_IDENTITY_MISMATCH" : "TASK_PROCESS_STILL_ALIVE");
  }
  let cancelled;
  await store.update((state) => {
    cancelled = state.tasks.find((entry) => entry.id === id);
    if (!cancelled) fail("TASK_NOT_FOUND");
    cancelled.pid = null; cancelled.processIdentity = null; cancelled.launchPending = false;
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

export function createTaskRunner({ agentDir, root, spawnTask } = {}) {
  const store = createTaskStore({ agentDir });
  const paths = statePaths(agentDir);
  let stopping = false;
  let child = null;
  let childIdentity = null;
  const terminate = () => {
    stopping = true;
    const spawned = child; const identity = childIdentity;
    if (spawned?.pid && identity) identity.then((value) => value ? terminateProcessTree(spawned.pid, { identity: value }) : undefined).catch(() => {});
  };

  async function claim(id, worktree) {
    let claimed;
    await store.update((state) => {
      const task = state.tasks.find((entry) => entry.id === id);
      if (!task || task.status !== "queued") fail("TASK_NOT_RUNNABLE");
      task.status = "running"; task.startedAt = new Date().toISOString(); task.updatedAt = task.startedAt; task.attempts += 1;
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
      if (task.status === "cancelled") return state;
      const at = new Date().toISOString();
      task.status = status; task.finishedAt = at; task.updatedAt = at; task.launchPending = false; task.pid = null; task.processIdentity = null; task.result = result; task.lastError = error;
      if (task.schedule && status !== "cancelled") {
        task.status = "queued"; task.finishedAt = null; task.schedule.nextRunAt = new Date(Date.now() + task.schedule.intervalMs).toISOString();
      }
      return state;
    });
  }

  async function runOne(task) {
    let worktree = null;
    let claimed = false;
    try {
      if (task.worktree && !task.worktreePath) worktree = await createTaskWorktree({ agentDir, cwd: task.cwd, id: task.id });
      const currentTask = await claim(task.id, worktree); claimed = true;
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
          await store.update((state) => { const target = state.tasks.find(({ id }) => id === current.id); if (target?.status === "running" && identity) { target.pid = spawned.pid; target.processIdentity = identity; target.launchPending = false; } else if (target) { target.pid = spawned.pid; target.processIdentity = identity; cancelled = true; } return state; });
          if (cancelled || !identity) {
            const result = identity ? await terminateProcessTree(spawned.pid, { identity }) : { status: "identity-unavailable" };
            await store.update((state) => { const target = state.tasks.find(({ id }) => id === current.id); if (target) { target.launchPending = false; if (result.status === "terminated" || result.status === "absent") { target.pid = null; target.processIdentity = null; } else { target.lastError = result.status === "identity-mismatch" ? "TASK_PROCESS_IDENTITY_MISMATCH" : "TASK_PROCESS_STILL_ALIVE"; } } return state; });
          }
        }).catch(async () => { await store.update((state) => { const target = state.tasks.find(({ id }) => id === current.id); if (target) { target.pid = spawned.pid; target.processIdentity = null; target.launchPending = false; target.lastError = "TASK_PROCESS_IDENTITY_REQUIRED"; } return state; }).catch(() => {}); });
        spawned.stdout.on("data", (chunk) => { if (Buffer.byteLength(stdout) < 4_000_000) stdout += chunk; });
        spawned.stderr.on("data", (chunk) => { if (Buffer.byteLength(stderr) < 1_000_000) stderr += chunk; });
        spawned.on("error", (error) => { void publication.then(() => done({ code: 1, error: error.message, output: stdout })); });
        spawned.on("close", (code) => { void publication.then(() => done({ code: code ?? 1, error: stderr.slice(-10000), output: stdout })); });
      }));
      const outcome = await execute(currentTask);
      child = null; childIdentity = null;
      await finish(task.id, outcome.code === 0 ? "completed" : "failed", finalAssistantText(outcome.output ?? ""), outcome.code === 0 ? null : (outcome.error || "TASK_PROCESS_FAILED"));
    } catch (error) {
      if (claimed) await finish(task.id, "failed", null, error instanceof Error ? error.message : "TASK_FAILED").catch(() => {});
    }
  }

  async function run({ once = false } = {}) {
    await ensureAgentDirectory(agentDir);
    const beforeRecovery = await store.load();
    for (const task of beforeRecovery.tasks) if (task.status === "running" && task.pid && !task.processIdentity && await processAlive(task.pid)) fail("TASK_PROCESS_IDENTITY_REQUIRED");
    const startedAt = new Date().toISOString();
    const ownerId = randomUUID(); const identity = await processIdentity(process.pid);
    await publishRunnerState({ agentDir, ownerId, path: paths.runner, state: { ownerId, pid: process.pid, processIdentity: identity, schemaVersion: 1, startedAt } });
    await store.update(async (state) => {
      for (const task of state.tasks) {
        if (task.status !== "running") continue;
        if (task.pid && task.processIdentity && await processMatches(task.pid, task.processIdentity)) {
          const result = await terminateProcessTree(task.pid, { identity: task.processIdentity });
          if (result.status !== "terminated" && result.status !== "absent") fail("TASK_PROCESS_STILL_ALIVE");
        }
        task.status = "queued"; task.launchPending = false; task.pid = null; task.processIdentity = null; task.startedAt = null; task.updatedAt = new Date().toISOString(); task.lastError = "RECOVERED_AFTER_RUNNER_RESTART";
      }
      return state;
    });
    const signals = ["SIGINT", "SIGTERM"];
    for (const signal of signals) process.once(signal, terminate);
    try {
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
