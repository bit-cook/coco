import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";

const ID = /^[a-z0-9_-]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(["run.started", "run.finished", "run.abandoned"]);
const OUTCOMES = new Set([null, "completed", "failed", "abandoned"]);
const STATUSES = new Set(["queued", "provisioning", "running", "blocked", "completed", "failed", "cancelled"]);
const TRIGGERS = new Set(["manual", "schedule", "webhook", "github"]);
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, maximum) => typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value) <= maximum && !/[\0\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);

function fail(code) { throw new StateError(code); }
export function taskId(random = randomBytes) { return random(9).toString("base64url").toLowerCase(); }
export function emptyTaskState() { return { revision: 0, schemaVersion: 1, tasks: [] }; }

export function validTask(task) {
  if (!object(task) || !ID.test(task.id) || !text(task.prompt, 100000) || !text(task.cwd, 4096) || !STATUSES.has(task.status) || !TRIGGERS.has(task.trigger)) return false;
  if (!iso(task.createdAt) || !iso(task.updatedAt) || !Number.isSafeInteger(task.attempts) || task.attempts < 0 || task.attempts > 1000) return false;
  if (!(task.worktree === true || task.worktree === false) || (task.worktreePath !== null && !text(task.worktreePath, 4096)) || (task.branch !== null && !text(task.branch, 256)) || (task.baseCommit !== null && !/^[0-9a-f]{40,64}$/.test(task.baseCommit))) return false;
  if (task.provisioning !== null && (!object(task.provisioning) || !text(task.provisioning.worktreePath, 4096) || !text(task.provisioning.branch, 256) || !/^[0-9a-f]{40,64}$/.test(task.provisioning.baseCommit) || Object.keys(task.provisioning).sort().join(",") !== "baseCommit,branch,worktreePath")) return false;
  if (task.status === "provisioning" && (task.provisioning === null || task.worktree !== true)) return false;
  if (task.schedule !== null && (!object(task.schedule) || !Number.isSafeInteger(task.schedule.intervalMs) || task.schedule.intervalMs < 60000 || task.schedule.intervalMs > 31536000000 || !iso(task.schedule.nextRunAt))) return false;
  if (task.webhookSecret !== null && (typeof task.webhookSecret !== "string" || task.webhookSecret.length !== 64 || !/^[a-f0-9]+$/.test(task.webhookSecret))) return false;
  if (task.github !== null && (!object(task.github) || !text(task.github.event, 100) || (task.github.repository !== null && !text(task.github.repository, 300)))) return false;
  if (task.pid !== null && (!Number.isSafeInteger(task.pid) || task.pid < 1)) return false;
  if (task.activeRunId !== null && (typeof task.activeRunId !== "string" || !UUID.test(task.activeRunId))) return false;
  if (task.pendingRunEvent !== null) {
    const event = task.pendingRunEvent;
    if (!object(event) || !UUID.test(event.eventId) || !UUID.test(event.runId) || !EVENT_TYPES.has(event.type) || !iso(event.at) || !OUTCOMES.has(event.outcome)) return false;
    if (((event.type === "run.finished" && !["completed", "failed"].includes(event.outcome)) || (event.type === "run.abandoned" && event.outcome !== "abandoned") || (event.type === "run.started" && event.outcome !== null))) return false;
    if (Object.keys(event).sort().join(",") !== ["at", "eventId", "outcome", "runId", "type"].sort().join(",")) return false;
    if (task.activeRunId !== event.runId) return false;
  }
  if (task.terminalEvidence !== null) {
    const evidence = task.terminalEvidence;
    if (!object(evidence) || !iso(evidence.endedAt) || !UUID.test(evidence.eventId)
      || !Number.isSafeInteger(evidence.exitCode) || evidence.exitCode < 0 || evidence.exitCode > 255
      || !["completed", "failed"].includes(evidence.status) || evidence.status !== (evidence.exitCode === 0 ? "completed" : "failed")
      || typeof evidence.logsTruncated !== "boolean"
      || (evidence.result !== null && (typeof evidence.result !== "string" || Buffer.byteLength(evidence.result) > 1000000))
      || (evidence.lastError !== null && (typeof evidence.lastError !== "string" || Buffer.byteLength(evidence.lastError) > 10000))
      || Object.keys(evidence).sort().join(",") !== ["endedAt", "eventId", "exitCode", "lastError", "logsTruncated", "result", "status"].sort().join(",")) return false;
    if (task.status !== "running" || task.activeRunId === null || task.pendingRunEvent !== null) return false;
  }
  if (typeof task.cancelPending !== "boolean") return false;
  if (task.cancelPending && task.status !== "running") return false;
  if (task.activeRunId !== null && task.status !== "running" && !(["run.finished", "run.abandoned"].includes(task.pendingRunEvent?.type))) return false;
  if (task.pendingRunEvent?.type === "run.started" && task.status !== "running") return false;
  if (task.pendingRunEvent?.type === "run.finished" && !["completed", "failed", "queued"].includes(task.status)) return false;
  if (task.pendingRunEvent?.type === "run.abandoned" && !["queued", "cancelled"].includes(task.status)) return false;
  if (typeof task.launchPending !== "boolean") return false;
  if (task.processIdentity !== null && (typeof task.processIdentity !== "string" || task.processIdentity.length > 200)) return false;
  if (task.heartbeatAt !== null && !iso(task.heartbeatAt)) return false;
  if (task.heartbeatAt !== null && task.status !== "running") return false;
  if (task.startedAt !== null && !iso(task.startedAt)) return false;
  if (task.finishedAt !== null && !iso(task.finishedAt)) return false;
  if (task.lastError !== null && (typeof task.lastError !== "string" || Buffer.byteLength(task.lastError) > 10000)) return false;
  if (typeof task.logsTruncated !== "boolean") return false;
  if (task.result !== null && (typeof task.result !== "string" || Buffer.byteLength(task.result) > 1000000)) return false;
  return Object.keys(task).sort().join(",") === ["activeRunId", "attempts", "baseCommit", "branch", "cancelPending", "createdAt", "cwd", "finishedAt", "github", "heartbeatAt", "id", "lastError", "launchPending", "logsTruncated", "pendingRunEvent", "pid", "processIdentity", "prompt", "provisioning", "result", "schedule", "startedAt", "status", "terminalEvidence", "trigger", "updatedAt", "webhookSecret", "worktree", "worktreePath"].sort().join(",");
}

export function validTaskState(value) {
  return object(value) && value.schemaVersion === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0 && Array.isArray(value.tasks) && value.tasks.length <= 10000 && value.tasks.every(validTask) && new Set(value.tasks.map(({ id }) => id)).size === value.tasks.length;
}

export async function readTaskState(path) {
  if (await inspectRegular(path) === null) return emptyTaskState();
  let value;
  try { value = JSON.parse(await readFile(path, "utf8")); } catch { fail("TASK_STATE_INVALID"); }
  if (object(value) && value.schemaVersion === 1 && Array.isArray(value.tasks)) for (const task of value.tasks) if (object(task)) { if (!("activeRunId" in task)) task.activeRunId = null; if (!("baseCommit" in task)) task.baseCommit = null; if (!("cancelPending" in task)) task.cancelPending = false; if (!("heartbeatAt" in task)) task.heartbeatAt = null; if (!("logsTruncated" in task)) task.logsTruncated = false; if (!("pendingRunEvent" in task)) task.pendingRunEvent = null; if (!("processIdentity" in task)) task.processIdentity = null; if (!("launchPending" in task)) task.launchPending = false; if (!("terminalEvidence" in task)) task.terminalEvidence = null; if (!("provisioning" in task)) task.provisioning = null; }
  if (!validTaskState(value)) fail("TASK_STATE_INVALID");
  return value;
}

export function queueTaskTrigger(state, taskId, at = new Date().toISOString()) {
  const task = state.tasks.find(({ id }) => id === taskId);
  if (!task) return { accepted: false, reason: "task-not-found" };
  if (!["blocked", "completed", "failed"].includes(task.status)) return { accepted: false, reason: task.status };
  task.status = "queued";
  task.updatedAt = at;
  task.finishedAt = null;
  return { accepted: true };
}

export function createTaskStore({ agentDir, now = () => new Date(), random = randomBytes } = {}) {
  const directory = resolve(agentDir);
  const path = statePaths(directory).tasks;
  let queue = Promise.resolve();
  const serialized = (operation) => { const result = queue.then(operation, operation); queue = result.catch(() => {}); return result; };
  async function update(change) {
    return serialized(async () => {
      await ensureAgentDirectory(directory);
      let output;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          await applyStateTransaction({ agentDir: directory, operations: async () => {
            const current = await readTaskState(path);
            const next = await change(structuredClone(current));
            if (!validTaskState(next)) fail("TASK_STATE_INVALID");
            next.revision = current.revision + 1;
            output = structuredClone(next);
            return [{ bytes: canonicalJson(next), path }];
          } });
          return output;
        } catch (error) {
          if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error;
          await new Promise((done) => setTimeout(done, 10));
        }
      }
      return output;
    });
  }
  async function create(input) {
    const createdAt = now().toISOString();
    const task = {
      activeRunId: null, attempts: 0, baseCommit: null, branch: null, cancelPending: false, createdAt, cwd: resolve(input.cwd), finishedAt: null,
      github: input.github ?? null, heartbeatAt: null, id: taskId(random), lastError: null, launchPending: false, logsTruncated: false, pid: null, processIdentity: null,
      pendingRunEvent: null, prompt: input.prompt.trim(), provisioning: null, result: null, schedule: input.schedule ?? null, terminalEvidence: null,
      startedAt: null, status: input.initialStatus ?? "queued", trigger: input.trigger ?? "manual", updatedAt: createdAt,
      webhookSecret: input.webhookSecret ?? null, worktree: input.worktree !== false, worktreePath: null,
    };
    if (!validTask(task)) fail("TASK_INVALID");
    await update((state) => { state.tasks.push(task); return state; });
    return structuredClone(task);
  }
  return {
    create,
    load: () => serialized(async () => { await ensureAgentDirectory(directory); return structuredClone(await readTaskState(path)); }),
    agentDir: directory,
    path,
    update,
  };
}

export function selectRunnableTask(state, now = Date.now()) {
  return state.tasks
    .filter((task) => task.status === "queued" && task.activeRunId === null && task.pendingRunEvent === null && (task.schedule === null || Date.parse(task.schedule.nextRunAt) <= now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
}
