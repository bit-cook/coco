import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";
import { queueTaskTrigger, readTaskState, validTaskState } from "./task-state.mjs";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ID = /^[A-Za-z0-9._:-]{1,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10000;
function fail(code) { throw new StateError(code); }
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
function validDelivery(entry) {
  return entry && ID.test(entry.taskId) && ID.test(entry.deliveryId) && ["github", "generic"].includes(entry.kind) && iso(entry.acceptedAt)
    && (entry.dispatchId === null || UUID.test(entry.dispatchId))
    && Object.keys(entry).sort().join(",") === "acceptedAt,deliveryId,dispatchId,kind,taskId";
}
function validIntent(intent) {
  const hasOwner = Object.hasOwn(intent ?? {}, "ownerId");
  return intent && UUID.test(intent.dispatchId) && ID.test(intent.deliveryId) && ["github", "generic"].includes(intent.kind) && ID.test(intent.taskId)
    && iso(intent.createdAt) && (!hasOwner || intent.ownerId === null || UUID.test(intent.ownerId)) && Number.isSafeInteger(intent.generation) && intent.generation >= 1
    && Object.keys(intent).sort().join(",") === (hasOwner ? "createdAt,deliveryId,dispatchId,generation,kind,ownerId,taskId" : "createdAt,deliveryId,dispatchId,generation,kind,taskId");
}
function valid(value) {
  return value && value.schemaVersion === 2 && Array.isArray(value.deliveries) && value.deliveries.length <= MAX_ENTRIES
    && value.deliveries.every(validDelivery) && Array.isArray(value.dispatchPending) && value.dispatchPending.length <= MAX_ENTRIES && value.dispatchPending.every(validIntent)
    && new Set(value.deliveries.map((entry) => `${entry.taskId}\0${entry.kind}\0${entry.deliveryId}`)).size === value.deliveries.length;
}
function legacyDispatchId(entry) {
  const hex = createHash("sha256").update(`${entry.taskId}\0${entry.kind}\0${entry.deliveryId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function migrate(value, tasks = null) {
  if (value && value.schemaVersion === 1 && Array.isArray(value.deliveries)) {
    const latest = new Map();
    for (const entry of value.deliveries) latest.set(entry.taskId, entry);
    const deliveries = value.deliveries.map((entry) => {
      const task = tasks?.tasks?.find(({ id }) => id === entry.taskId);
      const pending = latest.get(entry.taskId) === entry && task && ["queued", "provisioning"].includes(task.status) && task.activeRunId === null;
      return { ...entry, dispatchId: pending ? legacyDispatchId(entry) : null };
    });
    value = { deliveries, dispatchPending: deliveries.filter(({ dispatchId }) => dispatchId !== null).map(({ acceptedAt, deliveryId, dispatchId, kind, taskId }) => ({ createdAt: acceptedAt, deliveryId, dispatchId, generation: 1, kind, taskId })), schemaVersion: 2 };
  }
  if (!valid(value)) fail("WEBHOOK_DELIVERY_CORRUPT");
  const dispatches = value.deliveries.filter(({ dispatchId }) => dispatchId !== null);
  const ids = new Set(dispatches.map(({ dispatchId }) => dispatchId));
  if (new Set(value.dispatchPending.map(({ dispatchId }) => dispatchId)).size !== value.dispatchPending.length
    || ids.size !== dispatches.length
    || value.dispatchPending.some((intent) => {
      const delivery = dispatches.find(({ dispatchId }) => dispatchId === intent.dispatchId);
      return !delivery || delivery.deliveryId !== intent.deliveryId || delivery.kind !== intent.kind || delivery.taskId !== intent.taskId || delivery.acceptedAt !== intent.createdAt;
    })) fail("WEBHOOK_DELIVERY_CORRUPT");
  return value;
}
function prune(state, cutoff) {
  const pending = new Set(state.dispatchPending.map(({ dispatchId }) => dispatchId));
  state.deliveries = state.deliveries.filter((entry) => Date.parse(entry.acceptedAt) >= cutoff || (entry.dispatchId !== null && pending.has(entry.dispatchId)));
}
async function readState(path, taskPath = null) {
  if (await inspectRegular(path) === null) return { deliveries: [], dispatchPending: [], schemaVersion: 2 };
  let state;
  try { state = JSON.parse(await readFile(path, "utf8")); } catch { fail("WEBHOOK_DELIVERY_CORRUPT"); }
  let tasks = null;
  if (state.schemaVersion === 1 && taskPath) try { tasks = JSON.parse(await readFile(taskPath, "utf8")); } catch { tasks = null; }
  return migrate(state, tasks);
}
export function createWebhookDeliveryStore({ agentDir, now = () => new Date(), uuid = randomUUID } = {}) {
  const path = statePaths(agentDir).webhookDeliveries;
  const taskPath = statePaths(agentDir).tasks;
  async function accept({ taskId, deliveryId, kind }) {
    if (!ID.test(taskId) || !ID.test(deliveryId) || !["github", "generic"].includes(kind)) fail("WEBHOOK_DELIVERY_INVALID");
    let result;
    await ensureAgentDirectory(agentDir);
    for (let attempt = 0; attempt < 100; attempt += 1) try {
      await applyStateTransaction({ agentDir, operations: async () => {
        const state = await readState(path, taskPath);
        prune(state, now().getTime() - RETENTION_MS);
        const duplicate = state.deliveries.find((entry) => entry.taskId === taskId && entry.deliveryId === deliveryId && entry.kind === kind);
        if (duplicate) {
          const intent = duplicate.dispatchId === null ? null : state.dispatchPending.find(({ dispatchId }) => dispatchId === duplicate.dispatchId) ?? null;
          result = { accepted: false, duplicate: true, intent: structuredClone(intent) };
          return [{ bytes: canonicalJson(state), path }];
        }
        const tasks = await readTaskState(taskPath);
        const acceptedAt = now().toISOString();
        result = { duplicate: false, ...queueTaskTrigger(tasks, taskId, acceptedAt) };
        if (!result.accepted) return [{ bytes: canonicalJson(state), path }];
        if (state.dispatchPending.length >= MAX_ENTRIES || state.deliveries.length >= MAX_ENTRIES) fail("WEBHOOK_DELIVERY_CAPACITY");
        const intent = { createdAt: acceptedAt, deliveryId, dispatchId: uuid(), generation: 1, kind, taskId };
        if (!validIntent(intent) || state.deliveries.some(({ dispatchId }) => dispatchId === intent.dispatchId)) fail("WEBHOOK_DELIVERY_INVALID");
        tasks.revision += 1;
        if (!validTaskState(tasks)) fail("TASK_STATE_INVALID");
        state.deliveries.push({ acceptedAt, deliveryId, dispatchId: intent.dispatchId, kind, taskId });
        state.dispatchPending.push(intent);
        result.intent = structuredClone(intent);
        return [{ bytes: canonicalJson(state), path }, { bytes: canonicalJson(tasks), path: taskPath }];
      } });
      break;
    } catch (error) {
      if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error;
      await new Promise((done) => setTimeout(done, 10));
    }
    return result;
  }
  async function listPending() {
    await ensureAgentDirectory(agentDir);
    if (await inspectRegular(path) === null) return [];
    for (let attempt = 0; attempt < 100; attempt += 1) try {
      await recoverTransactions(agentDir);
      break;
    } catch (error) {
      if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error;
      await new Promise((done) => setTimeout(done, 10));
    }
    return structuredClone((await readState(path, taskPath)).dispatchPending);
  }
  async function claimPending({ ownerId, generation, taskId = null }) {
    if (!UUID.test(ownerId) || !Number.isSafeInteger(generation) || generation < 1) fail("WEBHOOK_DISPATCH_OWNER_INVALID");
    if (taskId !== null && !ID.test(taskId)) fail("WEBHOOK_DISPATCH_TASK_INVALID");
    let claimed = [];
    for (let attempt = 0; attempt < 100; attempt += 1) try {
      await applyStateTransaction({ agentDir, operations: async () => {
        const state = await readState(path, taskPath);
        claimed = state.dispatchPending.filter((intent) => taskId === null || intent.taskId === taskId).map((intent) => ({ ...intent, generation, ownerId }));
        const ids = new Set(claimed.map(({ dispatchId }) => dispatchId));
        state.dispatchPending = state.dispatchPending.map((intent) => ids.has(intent.dispatchId) ? claimed.find(({ dispatchId }) => dispatchId === intent.dispatchId) : intent);
        return [{ bytes: canonicalJson(state), path }];
      } });
      break;
    } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
    return structuredClone(claimed);
  }
  async function acknowledgePending({ ownerId, generation, dispatchIds = [] }) {
    if (!UUID.test(ownerId) || !Number.isSafeInteger(generation) || generation < 1 || !Array.isArray(dispatchIds) || !dispatchIds.every((id) => UUID.test(id))) fail("WEBHOOK_DISPATCH_ACK_INVALID");
    let acknowledged = [];
    for (let attempt = 0; attempt < 100; attempt += 1) try {
      await applyStateTransaction({ agentDir, operations: async () => {
        const state = await readState(path, taskPath), ids = new Set(dispatchIds);
        acknowledged = state.dispatchPending.filter((intent) => ids.has(intent.dispatchId) && intent.generation === generation && intent.ownerId === ownerId);
        state.dispatchPending = state.dispatchPending.filter((intent) => !(ids.has(intent.dispatchId) && intent.generation === generation && intent.ownerId === ownerId));
        return [{ bytes: canonicalJson(state), path }];
      } });
      break;
    } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
    return structuredClone(acknowledged);
  }
  async function disposeAttemptLimited({ taskId }) {
    if (!ID.test(taskId)) fail("WEBHOOK_DISPATCH_TASK_INVALID");
    let disposed = [];
    for (let attempt = 0; attempt < 100; attempt += 1) try {
      await applyStateTransaction({ agentDir, operations: async () => {
        const tasks = await readTaskState(taskPath), task = tasks.tasks.find(({ id }) => id === taskId);
        if (!task || !["queued", "provisioning"].includes(task.status) || task.attempts < 1000 || task.activeRunId !== null) fail("WEBHOOK_DISPATCH_ATTEMPT_LIMIT_INVALID");
        const state = await readState(path, taskPath);
        disposed = state.dispatchPending.filter((intent) => intent.taskId === taskId);
        if (disposed.length === 0) fail("WEBHOOK_DISPATCH_ATTEMPT_LIMIT_INVALID");
        const at = now().toISOString(); task.status = "failed"; task.finishedAt = at; task.updatedAt = at; task.lastError = "TASK_ATTEMPT_LIMIT_REACHED"; task.schedule = null; task.provisioning = null; tasks.revision += 1;
        if (!validTaskState(tasks)) fail("TASK_STATE_INVALID");
        state.dispatchPending = state.dispatchPending.filter((intent) => intent.taskId !== taskId);
        return [{ bytes: canonicalJson(state), path }, { bytes: canonicalJson(tasks), path: taskPath }];
      } });
      break;
    } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
    return structuredClone(disposed);
  }
  async function disposeCancelled({ taskId }) {
    if (!ID.test(taskId)) fail("WEBHOOK_DISPATCH_TASK_INVALID");
    let disposed = [];
    for (let attempt = 0; attempt < 100; attempt += 1) try {
      await applyStateTransaction({ agentDir, operations: async () => {
        const tasks = await readTaskState(taskPath), task = tasks.tasks.find(({ id }) => id === taskId);
        if (!task || task.status !== "cancelled" || task.activeRunId !== null) fail("WEBHOOK_DISPATCH_CANCEL_INVALID");
        const state = await readState(path, taskPath);
        disposed = state.dispatchPending.filter((intent) => intent.taskId === taskId);
        state.dispatchPending = state.dispatchPending.filter((intent) => intent.taskId !== taskId);
        return [{ bytes: canonicalJson(state), path }];
      } });
      break;
    } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
    return structuredClone(disposed);
  }
  async function cancelPendingTask({ taskId }) {
    if (!ID.test(taskId)) fail("WEBHOOK_DISPATCH_TASK_INVALID");
    let cancelled = null;
    for (let attempt = 0; attempt < 100; attempt += 1) try {
      await applyStateTransaction({ agentDir, operations: async () => {
        const tasks = await readTaskState(taskPath), task = tasks.tasks.find(({ id }) => id === taskId), state = await readState(path, taskPath);
        if (!task || task.status !== "queued" || task.activeRunId !== null || !state.dispatchPending.some((intent) => intent.taskId === taskId)) fail("WEBHOOK_DISPATCH_CANCEL_INVALID");
        const at = now().toISOString(); task.status = "cancelled"; task.finishedAt = at; task.heartbeatAt = null; task.updatedAt = at; task.lastError = "TERMINATED_BY_USER"; task.provisioning = null; task.cancelPending = false; task.pid = null; task.processIdentity = null; task.launchPending = false;
        state.dispatchPending = state.dispatchPending.filter((intent) => intent.taskId !== taskId); tasks.revision += 1;
        if (!validTaskState(tasks)) fail("TASK_STATE_INVALID");
        cancelled = structuredClone(task);
        return [{ bytes: canonicalJson(state), path }, { bytes: canonicalJson(tasks), path: taskPath }];
      } });
      break;
    } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
    return cancelled;
  }
  return { accept, acknowledgePending, cancelPendingTask, claimPending, disposeAttemptLimited, disposeCancelled, listPending, path };
}
