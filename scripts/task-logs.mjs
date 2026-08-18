import { createHash } from "node:crypto";
import { access, constants, lstat, mkdir, open, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { acquireStateLock, applyStateTransaction, atomicReplace } from "./state-transaction.mjs";
import { ensureAgentDirectory, fsyncDirectory, inspectRegular, statePaths } from "./state-paths.mjs";

const ID = /^[a-z0-9_-]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STREAMS = new Set(["stdout", "stderr", "diagnostic"]);
const MAX_RECORD = 16 * 1024, MAX_RECORDS = 4096, MAX_BYTES = 4 * 1024 * 1024;
const MAX_ENCODED_RECORD = MAX_RECORD * 6 + 2048;
const LOCK_RETRIES = 100, LOCK_DELAY_MS = 10;
const fail = (code) => { throw new StateError(code); };
const iso = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;

function sameFile(left, right) { return left.dev === right.dev && left.ino === right.ino; }

async function stableOpen(path, code = "TASK_LOG_CORRUPT", flags = constants.O_RDONLY) {
  let before;
  try { before = await lstat(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  if (!before.isFile() || before.isSymbolicLink() || (process.platform !== "win32" && (before.mode & 0o077) !== 0)) fail(code);
  let fd;
  try {
    fd = await open(path, flags | constants.O_NOFOLLOW, 0o600);
    const current = await fd.stat();
    let after;
    try { after = await lstat(path); } catch (error) { throw error; }
    if (!current.isFile() || (process.platform !== "win32" && (current.mode & 0o077) !== 0) || !sameFile(before, current) || !sameFile(current, after)) fail(code);
    return fd;
  } catch (error) { await fd?.close().catch(() => {}); throw error; }
}

async function readStable(path, code = "TASK_LOG_CORRUPT") {
  const fd = await stableOpen(path, code);
  if (!fd) return null;
  try {
    const opened = await fd.stat(), bytes = await fd.readFile(), final = await fd.stat(), current = await lstat(path);
    if (final.size !== opened.size || final.mtimeNs !== opened.mtimeNs || final.ctimeNs !== opened.ctimeNs || !sameFile(final, current)) fail(code);
    return bytes;
  } finally { await fd.close(); }
}

async function regularOrMissing(path, code) {
  let info;
  try { info = await lstat(path); } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) fail(code);
  return true;
}

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

function indexPath(root, taskId, runId) {
  return join(root, taskId, `${runId.toLowerCase()}.idx`);
}

function sealPath(root, taskId, runId) {
  return join(root, taskId, `${runId.toLowerCase()}.seal.json`);
}

function validSeal(value, identity) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Number.isSafeInteger(value.bytes) && value.bytes >= 0
    && Number.isSafeInteger(value.records) && value.records >= 0
    && (value.latestAt === null || iso(value.latestAt))
    && /^[a-f0-9]{64}$/.test(value.sha256)
    && value.ref === `task-logs/${identity.taskId}/${identity.runId}.jsonl`
    && Object.keys(value).sort().join(",") === "bytes,latestAt,records,ref,sha256";
}

async function ensureDirectory(root, taskId) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(join(root, taskId), { recursive: true, mode: 0o700 });
  for (const path of [root, join(root, taskId)]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) fail("TASK_LOG_DIRECTORY_INVALID");
  }
}

function parseStreamBytes(bytes, identity) {
  if (bytes.length > MAX_BYTES) fail("TASK_LOG_LIMIT_EXCEEDED");
  if (bytes.length === 0) return { bytes, records: [] };
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

async function readStreamFull(path, identity) {
  const bytes = await readStable(path);
  if (bytes === null) return { bytes: Buffer.alloc(0), records: [] };
  return parseStreamBytes(bytes, identity);
}

async function readIndex(path) {
  const bytes = await readStable(path, "TASK_LOG_INDEX_CORRUPT");
  if (bytes === null) return null;
  try {
    const raw = bytes.toString("utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object"
      && Number.isSafeInteger(parsed.recordCount) && parsed.recordCount >= 0
      && Number.isSafeInteger(parsed.bytesLength) && parsed.bytesLength >= 0
      && Object.keys(parsed).sort().join(",") === "bytesLength,recordCount") return parsed;
  } catch (error) { if (error?.code === "TASK_LOG_INDEX_CORRUPT") throw error; }
  return null;
}

async function writeIndex(agentDir, path, recordCount, bytesLength) {
  await atomicReplace({ agentDir, path, bytes: `${JSON.stringify({ recordCount, bytesLength })}\n` });
}

async function recoverState(agentDir, jsonlPath, idxPath, identity) {
  let bytes = await readStable(jsonlPath);
  if (bytes === null) bytes = Buffer.alloc(0);
  if (bytes.length > MAX_BYTES) fail("TASK_LOG_LIMIT_EXCEEDED");
  if (bytes.length > 0 && bytes.at(-1) !== 0x0a) {
    const newline = bytes.lastIndexOf(0x0a);
    const prefix = bytes.subarray(0, newline + 1);
    const prefixRecords = parseStreamBytes(prefix, identity).records;
    const tail = bytes.subarray(newline + 1);
    try {
      const line = new TextDecoder("utf-8", { fatal: true }).decode(tail);
      let parsed = false;
      try { JSON.parse(line); parsed = true; } catch { bytes = Buffer.from(prefix); }
      if (parsed) {
        const record = parseStrictJson(line, "TASK_LOG_CORRUPT");
        if (!valid(record, identity) || record.seq !== prefixRecords.length + 1 || canonicalJson(record) !== `${line}\n`) fail("TASK_LOG_CORRUPT");
        bytes = Buffer.concat([bytes, Buffer.from("\n")]);
      }
    } catch (error) {
      if (error instanceof StateError) throw error;
      bytes = Buffer.from(prefix);
    }
    await atomicReplace({ agentDir, path: jsonlPath, bytes });
  }
  const { records } = parseStreamBytes(bytes, identity);
  await writeIndex(agentDir, idxPath, records.length, bytes.length);
  return { bytesLength: bytes.length, recordCount: records.length };
}

async function appendToFile(path, recordBytes) {
  let before;
  try { before = await lstat(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (before && (!before.isFile() || before.isSymbolicLink())) fail("TASK_LOG_WRITE_FAILED");
  const fd = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const info = await fd.stat();
    if (!info.isFile() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) fail("TASK_LOG_WRITE_FAILED");
    const pathInfo = await lstat(path);
    if (!sameFile(info, pathInfo) || (before && !sameFile(before, info))) fail("TASK_LOG_WRITE_FAILED");
    let offset = 0;
    while (offset < recordBytes.length) {
      const { bytesWritten } = await fd.write(recordBytes, offset, recordBytes.length - offset);
      if (bytesWritten <= 0) fail("TASK_LOG_WRITE_FAILED");
      offset += bytesWritten;
    }
    await fd.datasync();
    const final = await fd.stat(), finalPath = await lstat(path);
    if (!sameFile(final, finalPath) || final.size !== info.size + recordBytes.length) fail("TASK_LOG_WRITE_FAILED");
  } finally { await fd.close(); }
  if (!before) await fsyncDirectory(path);
}

async function indexMatches(jsonlPath, index, identity) {
  if (!index) return false;
  let info;
  try { info = await stat(jsonlPath); } catch (error) { return error?.code === "ENOENT" && index.recordCount === 0 && index.bytesLength === 0; }
  if (!info.isFile() || info.size !== index.bytesLength || info.size > MAX_BYTES) return false;
   if (info.size === 0) {
     const fd = await stableOpen(jsonlPath);
     if (!fd) return false;
     await fd.close();
     return index.recordCount === 0;
   }
  const tailSize = Math.min(info.size, MAX_ENCODED_RECORD);
  const fd = await stableOpen(jsonlPath);
  if (!fd) return false;
  const tail = Buffer.alloc(tailSize);
   let offset = 0;
   while (offset < tail.length) {
      const { bytesRead } = await fd.read(tail, offset, tail.length - offset, info.size - tail.length + offset);
     if (bytesRead === 0) { await fd.close(); return false; }
     offset += bytesRead;
   }
   const final = await fd.stat();
   await fd.close();
   let current;
   try { current = await lstat(jsonlPath); } catch { return false; }
   if (!sameFile(final, current) || final.size !== info.size) return false;
  if (tail.at(-1) !== 0x0a) return false;
  const previous = tail.lastIndexOf(0x0a, tail.length - 2);
  const line = tail.subarray(previous + 1, tail.length - 1).toString("utf8");
  try {
    const record = parseStrictJson(line, "TASK_LOG_CORRUPT");
    return valid(record, identity) && record.seq === index.recordCount && canonicalJson(record) === `${line}\n`;
  } catch { return false; }
}

export function createTaskLogStore({ agentDir, now = () => new Date() } = {}) {
  const directoryRoot = resolve(agentDir);
  const root = statePaths(directoryRoot).taskLogs;

  async function lock(operation) {
    for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
      const held = await acquireStateLock(directoryRoot).catch((error) => error?.code === "STATE_LOCKED" ? null : Promise.reject(error));
      if (!held) { await new Promise((done) => setTimeout(done, LOCK_DELAY_MS)); continue; }
      try { return await operation(); } finally { await held.release(); }
    }
    fail("STATE_LOCKED");
  }

  async function append({ taskId, runId, stream, data, at = now().toISOString() }) {
    if (!STREAMS.has(stream) || typeof data !== "string" || Buffer.byteLength(data) > MAX_RECORD) fail("TASK_LOG_RECORD_INVALID");
    const jsonlPath = pathFor(root, taskId, runId), idxPath = indexPath(root, taskId, runId);
    const identity = { taskId, runId: runId.toLowerCase() };
    await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
    return lock(async () => {
      if (await regularOrMissing(sealPath(root, taskId, runId), "TASK_LOG_SEAL_CORRUPT")) fail("TASK_LOG_SEALED");
      let index = await readIndex(idxPath);
      if (!await indexMatches(jsonlPath, index, identity)) index = await recoverState(directoryRoot, jsonlPath, idxPath, identity);
      if (index.recordCount >= MAX_RECORDS) fail("TASK_LOG_LIMIT_EXCEEDED");
      const record = { at, data, runId: identity.runId, schemaVersion: 1, seq: index.recordCount + 1, stream, taskId };
      const recordBytes = Buffer.from(canonicalJson(record));
      if (index.bytesLength + recordBytes.length > MAX_BYTES) fail("TASK_LOG_LIMIT_EXCEEDED");
      await appendToFile(jsonlPath, recordBytes);
      await writeIndex(directoryRoot, idxPath, index.recordCount + 1, index.bytesLength + recordBytes.length);
      return record;
    });
  }

  async function read({ taskId, runId, cursor = 0, limit = 256 }) {
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 256) fail("TASK_LOG_QUERY_INVALID");
    const jsonlPath = pathFor(root, taskId, runId), idxPath = indexPath(root, taskId, runId);
    const identity = { taskId, runId: runId.toLowerCase() };
    await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
    return lock(async () => {
      let index = await readIndex(idxPath);
      if (!await indexMatches(jsonlPath, index, identity)) await recoverState(directoryRoot, jsonlPath, idxPath, identity);
      const all = (await readStreamFull(jsonlPath, identity)).records;
      const records = all.filter((record) => record.seq > cursor).slice(0, limit);
      const nextCursor = records.at(-1)?.seq ?? cursor;
      return { records, nextCursor, hasMore: all.some((record) => record.seq > nextCursor) };
    });
  }

  async function describe({ taskId, runId }) {
    const jsonlPath = pathFor(root, taskId, runId), idxPath = indexPath(root, taskId, runId);
    const identity = { taskId, runId: runId.toLowerCase() };
    await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
    return lock(async () => {
      if (await inspectRegular(jsonlPath) === null) return null;
      let index = await readIndex(idxPath);
      if (!await indexMatches(jsonlPath, index, identity)) index = await recoverState(directoryRoot, jsonlPath, idxPath, identity);
       const bytes = await readStable(jsonlPath);
      const current = parseStreamBytes(bytes, identity);
      if (current.records.length !== index.recordCount || bytes.length !== index.bytesLength) fail("TASK_LOG_CORRUPT");
      return { bytes: bytes.length, latestAt: current.records.at(-1)?.at ?? null, records: current.records.length, ref: `task-logs/${taskId}/${identity.runId}.jsonl`, sha256: createHash("sha256").update(bytes).digest("hex") };
    });
  }

  async function latestAt({ taskId, runId }) {
    const jsonlPath = pathFor(root, taskId, runId), idxPath = indexPath(root, taskId, runId), identity = { taskId, runId: runId.toLowerCase() };
    await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
    return lock(async () => {
      if (await inspectRegular(jsonlPath) === null) return null;
      let index = await readIndex(idxPath);
      if (!await indexMatches(jsonlPath, index, identity)) index = await recoverState(directoryRoot, jsonlPath, idxPath, identity);
      if (index.recordCount === 0) return null;
      const info = await stat(jsonlPath), tailSize = Math.min(info.size, MAX_ENCODED_RECORD);
      const fd = await open(jsonlPath, "r"), tail = Buffer.alloc(tailSize);
      try {
        let offset = 0;
        while (offset < tail.length) { const { bytesRead } = await fd.read(tail, offset, tail.length - offset, info.size - tail.length + offset); if (bytesRead === 0) fail("TASK_LOG_CORRUPT"); offset += bytesRead; }
      } finally { await fd.close(); }
      if (tail.at(-1) !== 0x0a) fail("TASK_LOG_CORRUPT");
      const previous = tail.lastIndexOf(0x0a, tail.length - 2), line = tail.subarray(previous + 1, tail.length - 1).toString("utf8");
      const record = parseStrictJson(line, "TASK_LOG_CORRUPT");
      if (!valid(record, identity) || record.seq !== index.recordCount || canonicalJson(record) !== `${line}\n`) fail("TASK_LOG_CORRUPT");
      return record.at;
    });
  }

  async function seal({ taskId, runId }) {
    const jsonlPath = pathFor(root, taskId, runId), idxPath = indexPath(root, taskId, runId), target = sealPath(root, taskId, runId);
    const identity = { taskId, runId: runId.toLowerCase() };
    await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
    return lock(async () => {
      if (await regularOrMissing(target, "TASK_LOG_SEAL_CORRUPT")) {
         const sealBytes = (await readStable(target, "TASK_LOG_SEAL_CORRUPT")).toString("utf8");
        const existing = parseStrictJson(sealBytes, "TASK_LOG_SEAL_CORRUPT");
        if (!validSeal(existing, identity) || canonicalJson(existing) !== sealBytes || await inspectRegular(jsonlPath) === null) fail("TASK_LOG_SEAL_CORRUPT");
         const logBytes = await readStable(jsonlPath, "TASK_LOG_SEAL_CORRUPT");
        const records = parseStreamBytes(logBytes, identity).records;
        if (existing.bytes !== logBytes.length || existing.records !== records.length || existing.latestAt !== (records.at(-1)?.at ?? null) || existing.sha256 !== createHash("sha256").update(logBytes).digest("hex")) fail("TASK_LOG_SEAL_CORRUPT");
        return structuredClone(existing);
      }
      let bytes = Buffer.alloc(0), records = [];
      if (await inspectRegular(jsonlPath) !== null) {
        let index = await readIndex(idxPath);
        if (!await indexMatches(jsonlPath, index, identity)) index = await recoverState(directoryRoot, jsonlPath, idxPath, identity);
         bytes = await readStable(jsonlPath, "TASK_LOG_CORRUPT");
        records = parseStreamBytes(bytes, identity).records;
        if (records.length !== index.recordCount || bytes.length !== index.bytesLength) fail("TASK_LOG_CORRUPT");
      } else {
        await atomicReplace({ agentDir: directoryRoot, path: jsonlPath, bytes });
        await writeIndex(directoryRoot, idxPath, 0, 0);
      }
      const value = { bytes: bytes.length, latestAt: records.at(-1)?.at ?? null, records: records.length, ref: `task-logs/${taskId}/${identity.runId}.jsonl`, sha256: createHash("sha256").update(bytes).digest("hex") };
      await atomicReplace({ agentDir: directoryRoot, path: target, bytes: canonicalJson(value) });
      return structuredClone(value);
    });
  }

  async function materializeSupervisorOutput({ at, runId, stderr = Buffer.alloc(0), stdout = Buffer.alloc(0), taskId }) {
    const jsonlPath = pathFor(root, taskId, runId), idxPath = indexPath(root, taskId, runId), target = sealPath(root, taskId, runId);
    const identity = { taskId, runId: runId.toLowerCase() };
    if (!iso(at) || !Buffer.isBuffer(stdout) || !Buffer.isBuffer(stderr) || stdout.length > 4_000_000 || stderr.length > 1_000_000) fail("TASK_LOG_IMPORT_INVALID");
    const records = [], encoded = []; let encodedBytes = 0, encodingLoss = false, logsTruncated = false;
    const addRecord = (record) => {
      const bytes = Buffer.from(canonicalJson(record));
      if (records.length >= MAX_RECORDS || encodedBytes + bytes.length > MAX_BYTES) { logsTruncated = true; return false; }
      records.push(record); encoded.push(bytes); encodedBytes += bytes.length; return true;
    };
    for (const [stream, bytes] of [["stdout", stdout], ["stderr", stderr]]) {
      const text = new TextDecoder("utf-8").decode(bytes);
      encodingLoss ||= !Buffer.from(text, "utf8").equals(bytes);
      let chunk = "", size = 0;
      for (const character of text) {
        const characterBytes = Buffer.byteLength(character);
        if (chunk && size + characterBytes > 12 * 1024) { if (!addRecord({ at, data: chunk, runId: identity.runId, schemaVersion: 1, seq: records.length + 1, stream, taskId })) break; chunk = ""; size = 0; }
        chunk += character; size += characterBytes;
      }
      if (chunk && !logsTruncated) addRecord({ at, data: chunk, runId: identity.runId, schemaVersion: 1, seq: records.length + 1, stream, taskId });
    }
    const bytes = Buffer.concat(encoded);
    if (records.some((record) => !valid(record, identity))) fail("TASK_LOG_LIMIT_EXCEEDED");
    const value = { bytes: bytes.length, latestAt: records.at(-1)?.at ?? null, records: records.length, ref: `task-logs/${taskId}/${identity.runId}.jsonl`, sha256: createHash("sha256").update(bytes).digest("hex") };
    await ensureAgentDirectory(directoryRoot); await ensureDirectory(root, taskId);
    if (await inspectRegular(target) !== null) {
      const existing = await seal({ taskId, runId });
      if (canonicalJson(existing) !== canonicalJson(value)) fail("TASK_LOG_SEAL_CONFLICT");
      return { ...existing, encodingLoss, logsTruncated };
    }
    await applyStateTransaction({ agentDir: directoryRoot, operations: async () => [
      { bytes, path: jsonlPath },
      { bytes: Buffer.from(`${JSON.stringify({ recordCount: records.length, bytesLength: bytes.length })}\n`), path: idxPath },
      { bytes: Buffer.from(canonicalJson(value)), path: target },
    ] });
    return { ...value, encodingLoss, logsTruncated };
  }

  async function exists({ taskId, runId }) { try { await access(pathFor(root, taskId, runId)); return true; } catch { return false; } }
  return { append, describe, exists, latestAt, materializeSupervisorOutput, read, seal, sealPathFor: (taskId, runId) => sealPath(root, taskId, runId), pathFor: (taskId, runId) => pathFor(root, taskId, runId), root };
}
