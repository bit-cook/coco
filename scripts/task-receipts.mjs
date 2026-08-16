import { access, lstat, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";
import { createTaskLogStore } from "./task-logs.mjs";

const ID = /^[a-z0-9_-]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_RECEIPT_BYTES = 16 * 1024;
const fail = (code) => { throw new StateError(code); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const iso = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;

function validLog(log, taskId, runId) {
  return log === null || (object(log) && Number.isSafeInteger(log.bytes) && log.bytes >= 0
    && Number.isSafeInteger(log.records) && log.records >= 0 && SHA256.test(log.sha256)
    && log.ref === `task-logs/${taskId}/${runId}.jsonl`
    && Object.keys(log).sort().join(",") === "bytes,records,ref,sha256");
}

function validReceipt(receipt, { taskId, runId } = {}) {
  return object(receipt) && receipt.schemaVersion === 1 && ID.test(receipt.taskId) && UUID.test(receipt.runId)
    && (taskId === undefined || receipt.taskId === taskId) && (runId === undefined || receipt.runId === runId)
    && receipt.executor === "coco.task-runner" && receipt.command === "coco --mode json --no-approve <task-prompt>"
    && Number.isSafeInteger(receipt.exitCode) && receipt.exitCode >= 0 && receipt.exitCode <= 255
    && ["passed", "failed"].includes(receipt.verdict) && receipt.verdict === (receipt.exitCode === 0 ? "passed" : "failed")
    && iso(receipt.startedAt) && iso(receipt.endedAt) && receipt.endedAt >= receipt.startedAt
    && validLog(receipt.log, receipt.taskId, receipt.runId)
    && Object.keys(receipt).sort().join(",") === "command,endedAt,executor,exitCode,log,runId,schemaVersion,startedAt,taskId,verdict"
    && Buffer.byteLength(canonicalJson(receipt)) <= MAX_RECEIPT_BYTES;
}

function receiptPath(root, taskId, runId) {
  if (!ID.test(taskId) || !UUID.test(runId)) fail("TASK_RECEIPT_ID_INVALID");
  return join(root, taskId, `${runId.toLowerCase()}.json`);
}

async function ensureDirectory(root, taskId) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(join(root, taskId), { recursive: true, mode: 0o700 });
  for (const path of [root, join(root, taskId)]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) fail("TASK_RECEIPT_DIRECTORY_INVALID");
  }
}

export function createTaskReceiptStore({ agentDir } = {}) {
  const directory = resolve(agentDir), root = statePaths(directory).taskReceipts;
  const logs = createTaskLogStore({ agentDir: directory });
  let queue = Promise.resolve();
  const serialized = (operation) => { const result = queue.then(operation, operation); queue = result.catch(() => {}); return result; };

  async function read({ taskId, runId }) {
    return serialized(async () => {
      const path = receiptPath(root, taskId, runId);
      await ensureAgentDirectory(directory); await ensureDirectory(root, taskId);
      if (await inspectRegular(path) === null) return null;
      let receipt;
      try { receipt = parseStrictJson(await readFile(path, "utf8"), "TASK_RECEIPT_CORRUPT"); } catch (error) { if (error instanceof StateError) throw error; fail("TASK_RECEIPT_CORRUPT"); }
      if (!validReceipt(receipt, { taskId, runId: runId.toLowerCase() }) || canonicalJson(receipt) !== await readFile(path, "utf8")) fail("TASK_RECEIPT_CORRUPT");
      return structuredClone(receipt);
    });
  }

  async function write(input) {
    return serialized(async () => {
      const receipt = { command: "coco --mode json --no-approve <task-prompt>", endedAt: input?.endedAt, executor: "coco.task-runner", exitCode: input?.exitCode, log: input?.log ?? null, runId: input?.runId?.toLowerCase(), schemaVersion: 1, startedAt: input?.startedAt, taskId: input?.taskId, verdict: input?.exitCode === 0 ? "passed" : "failed" };
      if (!validReceipt(receipt)) fail("TASK_RECEIPT_INVALID");
      const sealed = await logs.seal({ taskId: receipt.taskId, runId: receipt.runId });
      if (receipt.log === null || receipt.log.bytes !== sealed.bytes || receipt.log.records !== sealed.records || receipt.log.ref !== sealed.ref || receipt.log.sha256 !== sealed.sha256) fail("TASK_RECEIPT_LOG_SEAL_MISMATCH");
      await ensureAgentDirectory(directory); await ensureDirectory(root, receipt.taskId);
      const path = receiptPath(root, receipt.taskId, receipt.runId);
      await applyStateTransaction({ agentDir: directory, operations: async () => {
        if (await inspectRegular(path) !== null) {
          const existing = await readFile(path, "utf8");
          if (existing !== canonicalJson(receipt)) fail("TASK_RECEIPT_CONFLICT");
          return [{ bytes: Buffer.from(existing), path }];
        }
        return [{ bytes: Buffer.from(canonicalJson(receipt)), path }];
      } });
      return structuredClone(receipt);
    });
  }

  async function exists({ taskId, runId }) { try { await access(receiptPath(root, taskId, runId)); return true; } catch { return false; } }
  return { exists, pathFor: (taskId, runId) => receiptPath(root, taskId, runId), read, root, write };
}

export { validReceipt as validTaskReceipt };
