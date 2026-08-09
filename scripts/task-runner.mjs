import { spawn } from "node:child_process";
import { chmod, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { atomicReplace } from "./state-transaction.mjs";
import { processAlive, terminateProcessTree } from "./task-process.mjs";
import { createTaskStore, selectRunnableTask } from "./task-state.mjs";
import { createTaskWorktree } from "./worktree-tasks.mjs";

function fail(code) { throw new StateError(code); }
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function runnerState(path) {
  if (await inspectRegular(path) === null) return null;
  try { return JSON.parse(await readFile(path, "utf8")); } catch { fail("RUNNER_STATE_INVALID"); }
}

export async function getRunnerStatus(agentDir) {
  const state = await runnerState(statePaths(agentDir).runner);
  return state && await processAlive(state.pid) ? { ...state, status: "running" } : { status: "stopped" };
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
  const active = snapshot.tasks.filter(({ pid, status }) => pid || status === "running");
  const ids = new Set(active.map(({ id }) => id));
  const results = await Promise.all(active.filter(({ pid }) => pid).map(({ pid }) => terminateProcessTree(pid)));
  if (results.some(({ status }) => status === "alive")) fail("TASK_PROCESS_STILL_ALIVE");
  if (ids.size > 0) {
    const at = new Date().toISOString();
    await store.update((value) => { for (const task of value.tasks) if (ids.has(task.id)) { task.status = "cancelled"; task.pid = null; task.finishedAt = at; task.updatedAt = at; task.lastError = "TERMINATED_BY_USER"; } return value; });
  }
  const state = await runnerState(statePaths(agentDir).runner);
  if (!state || !await processAlive(state.pid)) return { status: "stopped" };
  const result = await terminateProcessTree(state.pid);
  return { status: result.status === "terminated" ? "stopped" : result.status };
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
  const terminate = () => { stopping = true; if (child?.pid) terminateProcessTree(child.pid).catch(() => {}); };

  async function claim(id, worktree) {
    let claimed;
    await store.update((state) => {
      const task = state.tasks.find((entry) => entry.id === id);
      if (!task || task.status !== "queued") fail("TASK_NOT_RUNNABLE");
      task.status = "running"; task.startedAt = new Date().toISOString(); task.updatedAt = task.startedAt; task.attempts += 1;
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
      task.status = status; task.finishedAt = at; task.updatedAt = at; task.pid = null; task.result = result; task.lastError = error;
      if (task.schedule && status !== "cancelled") {
        task.status = "queued"; task.finishedAt = null; task.schedule.nextRunAt = new Date(Date.now() + task.schedule.intervalMs).toISOString();
      }
      return state;
    });
  }

  async function runOne(task) {
    let worktree = null;
    try {
      if (task.worktree && !task.worktreePath) worktree = await createTaskWorktree({ agentDir, cwd: task.cwd, id: task.id });
      const claimed = await claim(task.id, worktree);
      const cwd = claimed.worktreePath ?? claimed.cwd;
      const execute = spawnTask ?? ((current) => new Promise((done) => {
        let stdout = ""; let stderr = "";
        child = spawn(process.execPath, [join(root, "bin", "coco"), "--mode", "json", "--no-approve", current.prompt], {
          cwd, detached: process.platform !== "win32", env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", "pipe", "pipe"],
        });
        store.update((state) => { const target = state.tasks.find(({ id }) => id === current.id); if (target) target.pid = child.pid; return state; }).catch(() => {});
        child.stdout.on("data", (chunk) => { if (Buffer.byteLength(stdout) < 4_000_000) stdout += chunk; });
        child.stderr.on("data", (chunk) => { if (Buffer.byteLength(stderr) < 1_000_000) stderr += chunk; });
        child.on("error", (error) => done({ code: 1, error: error.message, output: stdout }));
        child.on("close", (code) => done({ code: code ?? 1, error: stderr.slice(-10000), output: stdout }));
      }));
      const outcome = await execute(claimed);
      child = null;
      await finish(task.id, outcome.code === 0 ? "completed" : "failed", finalAssistantText(outcome.output ?? ""), outcome.code === 0 ? null : (outcome.error || "TASK_PROCESS_FAILED"));
    } catch (error) {
      await finish(task.id, "failed", null, error instanceof Error ? error.message : "TASK_FAILED").catch(() => {});
    }
  }

  async function run({ once = false } = {}) {
    await ensureAgentDirectory(agentDir);
    const existing = await runnerState(paths.runner);
    if (existing && existing.pid !== process.pid && await processAlive(existing.pid)) fail("RUNNER_ALREADY_RUNNING");
    const startedAt = new Date().toISOString();
    await atomicReplace({ agentDir, path: paths.runner, bytes: canonicalJson({ pid: process.pid, schemaVersion: 1, startedAt }) });
    await store.update(async (state) => {
      for (const task of state.tasks) {
        if (task.status !== "running") continue;
        if (task.pid && await processAlive(task.pid)) await terminateProcessTree(task.pid);
        task.status = "queued"; task.pid = null; task.startedAt = null; task.updatedAt = new Date().toISOString(); task.lastError = "RECOVERED_AFTER_RUNNER_RESTART";
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
      if (current?.pid === process.pid) await rm(paths.runner, { force: true });
    }
  }
  return { run };
}
