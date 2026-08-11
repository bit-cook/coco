import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { applyStateTransaction } from "./state-transaction.mjs";
import { canonicalJson } from "./canonical-json.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";

const ID = /^[a-z0-9_-]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STREAMS = new Set(["stdout", "stderr", "diagnostic"]);
const MAX_RECORD = 16 * 1024, MAX_RECORDS = 4096, MAX_BYTES = 4 * 1024 * 1024;
const fail = (code) => { throw new StateError(code); };
const iso = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;

function valid(record, identity) {
  return record && typeof record === "object" && !Array.isArray(record)
    && record.schemaVersion === 1
    && Number.isSafeInteger(record.seq) && record.seq > 0
    && ID.test(record.taskId) && UUID.test(record.runId)
    && (!identity || (record.taskId === identity.taskId && record.runId === identity.runId))
    && STREAMS.has(record.stream) && iso(record.at)
    && typeof record.data === "string" && Buffer.byteLength(record.data) <= MAX_RECORD
    && Object.keys(record).sort().join(",") === "at,data,runId,schemaVersion,seq,stream,taskId";
}

function pathFor(root, taskId, runId) {
  if (!ID.test(taskId) || !UUID.test(runId)) fail("TASK_LOG_ID_INVALID");
  return join(root, taskId, `${runId.toLowerCase()}.jsonl`);
}

async function ensureDirectory(root, taskId) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(join(root, taskId), { recursive: true, mode: 0o700 });
  for (const path of [root, join(root, taskId)]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) fail("TASK_LOG_DIRECTORY_INVALID");
  }
}

async function readStream(path, identity) {
  if (await inspectRegular(path) === null) return { bytes: Buffer.alloc(0), records: [] };
  const bytes = await readFile(path);
  if (bytes.length > MAX_BYTES) fail("TASK_LOG_LIMIT_EXCEEDED");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const lines = text ? text.split("\n") : [];
  if (lines.at(-1) === "") lines.pop(); else fail("TASK_LOG_TAIL_PARTIAL");
  const records = lines.map((line, index) => {
    const record = parseStrictJson(line, "TASK_LOG_CORRUPT");
    if (!valid(record, identity) || canonicalJson(record) !== `${line}\n` || record.seq !== index + 1) fail("TASK_LOG_CORRUPT");
    return record;
  });
  if (records.length > MAX_RECORDS) fail("TASK_LOG_LIMIT_EXCEEDED");
  return { bytes, records };
}

export function createTaskLogStore({ agentDir, now = () => new Date() } = {}) {
  const directoryRoot = resolve(agentDir), root = statePaths(directoryRoot).taskLogs;
  let queue = Promise.resolve();
  const serialized = (operation) => { const result = queue.then(operation, operation); queue = result.catch(() => {}); return result; };

  async function append({ taskId, runId, stream, data, at = now().toISOString() }) {
    return serialized(async () => {
      if (!STREAMS.has(stream) || typeof data !== "string" || Buffer.byteLength(data) > MAX_RECORD) fail("TASK_LOG_RECORD_INVALID");
      await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
      const path = pathFor(root, taskId, runId); let output;
      await applyStateTransaction({ agentDir: directoryRoot, operations: async () => {
        const current = await readStream(path, { taskId, runId: runId.toLowerCase() });
        output = { at, data, runId: runId.toLowerCase(), schemaVersion: 1, seq: current.records.length + 1, stream, taskId };
        if (current.records.length >= MAX_RECORDS || current.bytes.length + Buffer.byteLength(canonicalJson(output)) > MAX_BYTES) fail("TASK_LOG_LIMIT_EXCEEDED");
        return [{ path, bytes: Buffer.concat([current.bytes, Buffer.from(canonicalJson(output))]) }];
      } });
      return output;
    });
  }

  async function read({ taskId, runId, cursor = 0, limit = 256 }) {
    return serialized(async () => {
      if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 256) fail("TASK_LOG_QUERY_INVALID");
      await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
      const all = (await readStream(pathFor(root, taskId, runId), { taskId, runId: runId.toLowerCase() })).records;
      const records = all.filter((record) => record.seq > cursor).slice(0, limit);
      const nextCursor = records.at(-1)?.seq ?? cursor;
      return { records, nextCursor, hasMore: all.some((record) => record.seq > nextCursor) };
    });
  }

  async function describe({ taskId, runId }) {
    return serialized(async () => {
      await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
      const path = pathFor(root, taskId, runId);
      if (await inspectRegular(path) === null) return null;
      const current = await readStream(path, { taskId, runId: runId.toLowerCase() });
      return { bytes: current.bytes.length, records: current.records.length, ref: `task-logs/${taskId}/${runId.toLowerCase()}.jsonl`, sha256: createHash("sha256").update(current.bytes).digest("hex") };
    });
  }

  async function exists({ taskId, runId }) { try { await access(pathFor(root, taskId, runId)); return true; } catch { return false; } }
  return { append, describe, exists, read, pathFor: (taskId, runId) => pathFor(root, taskId, runId), root };
}
