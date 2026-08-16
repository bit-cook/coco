import { access, lstat, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";

const ID = /^[a-z0-9_-]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["run.started", "run.heartbeat", "run.output", "run.diagnostic", "run.finished", "run.abandoned"]);
const ACTORS = new Set(["runner"]);
const OUTCOMES = new Set([null, "completed", "failed", "abandoned"]);
const MAX_EVENT_BYTES = 16 * 1024, MAX_EVENTS = 4096, MAX_STREAM_BYTES = 4 * 1024 * 1024;
const TERMINAL_RESERVE_EVENTS = 2, TERMINAL_RESERVE_BYTES = 2 * MAX_EVENT_BYTES;
const INPUT_KEYS = new Set(["actor", "at", "eventId", "outcome", "runId", "taskId", "type"]);

function fail(code) { throw new StateError(code); }
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const iso = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;

function validEvent(event, { runId, taskId } = {}) {
  return object(event) && event.schemaVersion === 1 && UUID.test(event.eventId)
    && Number.isSafeInteger(event.seq) && event.seq > 0
    && ID.test(event.taskId) && (taskId === undefined || event.taskId === taskId)
    && UUID.test(event.runId) && (runId === undefined || event.runId === runId)
    && TYPES.has(event.type) && iso(event.at) && ACTORS.has(event.actor) && OUTCOMES.has(event.outcome)
    && ((event.type === "run.finished" && ["completed", "failed"].includes(event.outcome)) || (event.type === "run.abandoned" && event.outcome === "abandoned") || (!["run.finished", "run.abandoned"].includes(event.type) && event.outcome === null))
    && event.payloadRef === null && event.payloadDigest === null
    && Object.keys(event).sort().join(",") === ["actor", "at", "eventId", "outcome", "payloadDigest", "payloadRef", "runId", "schemaVersion", "seq", "taskId", "type"].sort().join(",")
    && Buffer.byteLength(canonicalJson(event)) <= MAX_EVENT_BYTES;
}

function parseStream(bytes, identity) {
  if (bytes.length > MAX_STREAM_BYTES) fail("TASK_EVENT_LIMIT_EXCEEDED");
  const finalNewline = bytes.lastIndexOf(0x0a), prefixBytes = bytes.subarray(0, finalNewline + 1);
  let complete;
  try { complete = new TextDecoder("utf-8", { fatal: true }).decode(prefixBytes); } catch { fail("TASK_EVENT_CORRUPT"); }
  const events = [], ids = new Map(), lines = complete.length === 0 ? [] : complete.slice(0, -1).split("\n");
  for (const line of lines) {
    if (line.length === 0) fail("TASK_EVENT_CORRUPT");
    const event = parseStrictJson(line, "TASK_EVENT_CORRUPT");
    if (!validEvent(event, identity) || canonicalJson(event) !== `${line}\n` || event.seq !== events.length + 1 || ids.has(event.eventId)) fail("TASK_EVENT_CORRUPT");
    ids.set(event.eventId, event); events.push(event);
  }
  if (events.length > MAX_EVENTS) fail("TASK_EVENT_LIMIT_EXCEEDED");
  const tail = bytes.subarray(finalNewline + 1); let repaired = Buffer.from(prefixBytes);
  if (tail.length > 0) {
    let text = null; try { text = new TextDecoder("utf-8", { fatal: true }).decode(tail); } catch {}
    if (text !== null) {
      try {
        const event = parseStrictJson(text, "TASK_EVENT_TAIL_PARTIAL");
        if (!validEvent(event, identity) || canonicalJson(event) !== `${text}\n` || event.seq !== events.length + 1 || ids.has(event.eventId)) fail("TASK_EVENT_CORRUPT");
        events.push(event); ids.set(event.eventId, event); repaired = Buffer.concat([repaired, Buffer.from(`${text}\n`)]);
      } catch (error) { if (error?.code !== "TASK_EVENT_TAIL_PARTIAL") throw error; }
    }
  }
  if (events.length > MAX_EVENTS || repaired.length > MAX_STREAM_BYTES) fail("TASK_EVENT_LIMIT_EXCEEDED");
  return { bytes: repaired, events, ids };
}

async function readStream(path, identity) {
  if (await inspectRegular(path) === null) return { bytes: Buffer.alloc(0), events: [], ids: new Map() };
  try { return parseStream(await readFile(path), identity); } catch (error) { if (error instanceof StateError) throw error; fail("TASK_EVENT_CORRUPT"); }
}

function eventPath(directory, taskId, runId) {
  if (!ID.test(taskId) || !UUID.test(runId)) fail("TASK_EVENT_ID_INVALID");
  return join(directory, taskId, `${runId.toLowerCase()}.jsonl`);
}

async function ensureEventDirectory(root, taskId) {
  const taskDirectory = join(root, taskId);
  await mkdir(taskDirectory, { recursive: true, mode: 0o700 });
  for (const path of [root, taskDirectory]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) fail("TASK_EVENT_DIRECTORY_INVALID");
  }
}

function eventInput(input) {
  if (!object(input) || Object.keys(input).some((key) => !INPUT_KEYS.has(key)) || typeof input.runId !== "string" || typeof input.eventId !== "string") fail("TASK_EVENT_INVALID");
  const event = { actor: input.actor ?? "runner", at: input.at, eventId: input.eventId.toLowerCase(), outcome: input.outcome ?? null, payloadDigest: null, payloadRef: null, runId: input.runId.toLowerCase(), schemaVersion: 1, seq: 1, taskId: input.taskId, type: input.type };
  if (!validEvent(event)) fail("TASK_EVENT_INVALID");
  return event;
}

export function createTaskEventStore({ agentDir, enforceLifecycle = false, maxEvents = MAX_EVENTS, now = () => new Date() } = {}) {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < TERMINAL_RESERVE_EVENTS + 1 || maxEvents > MAX_EVENTS) fail("TASK_EVENT_CONFIGURATION_INVALID");
  const directory = resolve(agentDir), root = statePaths(directory).taskEvents; let queue = Promise.resolve();
  const serialized = (operation) => { const result = queue.then(operation, operation); queue = result.catch(() => {}); return result; };
  async function recoverAndRead(path, identity) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { await recoverTransactions(directory); return await readStream(path, identity); }
      catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
    }
  }
  async function append(input) {
    const suppliedAt = object(input) && Object.hasOwn(input, "at");
    const snapshot = object(input) ? Object.fromEntries(Object.keys(input).map((key) => [key, input[key]])) : input;
    return serialized(async () => {
      await ensureAgentDirectory(directory);
      const base = eventInput({ ...snapshot, at: snapshot?.at ?? now().toISOString() });
      const path = eventPath(root, base.taskId, base.runId); await ensureEventDirectory(root, base.taskId); let output;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          await applyStateTransaction({ agentDir: directory, operations: async () => {
            const stream = await readStream(path, base), existing = stream.ids.get(base.eventId);
            if (existing) {
              if (existing.actor !== base.actor || existing.runId !== base.runId || existing.taskId !== base.taskId || existing.type !== base.type || existing.outcome !== base.outcome || (suppliedAt && existing.at !== base.at)) fail("TASK_EVENT_ID_CONFLICT");
              output = structuredClone(existing); return [{ bytes: stream.bytes, path }];
            }
            const last = stream.events.at(-1);
            if (enforceLifecycle && last && ["run.finished", "run.abandoned"].includes(last.type)) fail("TASK_EVENT_LIFECYCLE_INVALID");
            if (enforceLifecycle) {
              const started = stream.events.filter((event) => event.type === "run.started").length;
              if (base.type === "run.started" && stream.events.length !== 0) fail("TASK_EVENT_LIFECYCLE_INVALID");
              if (base.type === "run.finished" && started !== 1) fail("TASK_EVENT_LIFECYCLE_INVALID");
              if (!["run.started", "run.abandoned"].includes(base.type) && started !== 1) fail("TASK_EVENT_LIFECYCLE_INVALID");
              if (base.type === "run.abandoned" && stream.events.length > 0 && started !== 1) fail("TASK_EVENT_LIFECYCLE_INVALID");
            }
            output = { ...base, seq: stream.events.length + 1 };
            const terminal = ["run.finished", "run.abandoned"].includes(base.type);
            if (!terminal && (stream.events.length >= maxEvents - TERMINAL_RESERVE_EVENTS || stream.bytes.length + Buffer.byteLength(canonicalJson(output)) > MAX_STREAM_BYTES - TERMINAL_RESERVE_BYTES)) fail("TASK_EVENT_TELEMETRY_LIMIT_EXCEEDED");
            if (stream.events.length >= maxEvents || stream.bytes.length + Buffer.byteLength(canonicalJson(output)) > MAX_STREAM_BYTES) fail("TASK_EVENT_LIMIT_EXCEEDED");
            return [{ bytes: Buffer.concat([stream.bytes, Buffer.from(canonicalJson(output))]), path }];
          } });
          return output;
        } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      }
    });
  }
  async function readPage({ runId, taskId, cursor = 0, limit = MAX_EVENTS }) {
    return serialized(async () => {
      if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_EVENTS) fail("TASK_EVENT_QUERY_INVALID");
      const path = eventPath(root, taskId, runId); await ensureAgentDirectory(directory); await ensureEventDirectory(root, taskId);
      const events = (await recoverAndRead(path, { runId: runId.toLowerCase(), taskId })).events;
      const page = events.filter((event) => event.seq > cursor).slice(0, limit), nextCursor = page.at(-1)?.seq ?? cursor;
      return structuredClone({ events: page, nextCursor, hasMore: events.some((event) => event.seq > nextCursor) });
    });
  }
  async function read(input) { return (await readPage(input)).events; }
  async function exists({ taskId, runId }) { try { await access(eventPath(root, taskId, runId)); return true; } catch { return false; } }
  return { append, exists, pathFor: (taskId, runId) => eventPath(root, taskId, runId), read, readPage, root };
}

export { validEvent as validTaskEvent };
