import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";
import { queueTaskTrigger, readTaskState, validTaskState } from "./task-state.mjs";
import { readFile } from "node:fs/promises";

const ID = /^[A-Za-z0-9._:-]{1,200}$/;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
function fail(code) { throw new StateError(code); }
function valid(value) {
  return value && value.schemaVersion === 1 && Array.isArray(value.deliveries) && value.deliveries.length <= 10000
    && value.deliveries.every((entry) => entry && ID.test(entry.taskId) && ID.test(entry.deliveryId) && ["github", "generic"].includes(entry.kind) && typeof entry.acceptedAt === "string" && Number.isFinite(Date.parse(entry.acceptedAt)))
    && new Set(value.deliveries.map((entry) => `${entry.taskId}\0${entry.kind}\0${entry.deliveryId}`)).size === value.deliveries.length;
}
export function createWebhookDeliveryStore({ agentDir } = {}) {
  const path = statePaths(agentDir).webhookDeliveries;
  const taskPath = statePaths(agentDir).tasks;
  async function accept({ taskId, deliveryId, kind }) {
    if (!ID.test(taskId) || !ID.test(deliveryId) || !["github", "generic"].includes(kind)) fail("WEBHOOK_DELIVERY_INVALID");
    let result;
    await ensureAgentDirectory(agentDir);
    for (let attempt = 0; attempt < 100; attempt += 1) try {
      await applyStateTransaction({ agentDir, operations: async () => {
        let state = { deliveries: [], schemaVersion: 1 };
        if (await inspectRegular(path) !== null) { try { state = JSON.parse(await readFile(path, "utf8")); } catch { fail("WEBHOOK_DELIVERY_CORRUPT"); } }
        if (!valid(state)) fail("WEBHOOK_DELIVERY_CORRUPT");
        const cutoff = Date.now() - RETENTION_MS; state.deliveries = state.deliveries.filter((entry) => Date.parse(entry.acceptedAt) >= cutoff);
        const duplicate = state.deliveries.some((entry) => entry.taskId === taskId && entry.deliveryId === deliveryId && entry.kind === kind);
        if (duplicate) { result = { accepted: false, duplicate: true }; return [{ bytes: canonicalJson(state), path }]; }
        const tasks = await readTaskState(taskPath);
        const acceptedAt = new Date().toISOString();
        result = { duplicate: false, ...queueTaskTrigger(tasks, taskId, acceptedAt) };
        if (!result.accepted) return [{ bytes: canonicalJson(state), path }];
        tasks.revision += 1;
        if (!validTaskState(tasks)) fail("TASK_STATE_INVALID");
        state.deliveries.push({ acceptedAt, deliveryId, kind, taskId });
        if (state.deliveries.length > 10000) state.deliveries.shift();
        return [{ bytes: canonicalJson(state), path }, { bytes: canonicalJson(tasks), path: taskPath }];
      } });
      break;
    } catch (error) {
      if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error;
      await new Promise((done) => setTimeout(done, 10));
    }
    return result;
  }
  return { accept, path };
}
