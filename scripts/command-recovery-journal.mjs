import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";

const STATES = new Set(["received", "executing", "result", "uncertain"]);
const MAX_RESPONSE_BYTES = 1024 * 1024;
const digest = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const fail = (code) => { throw new Error(code); };

async function durableWrite(path, value) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  const descriptor = await open(temporary, "wx", 0o600);
  try {
    await descriptor.writeFile(canonicalJson(value), "utf8");
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
  await rename(temporary, path);
  const directory = await open(dirname(path), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function validRecord(record) {
  if (!(record && typeof record === "object" && !Array.isArray(record)
    && record.schemaVersion === 1 && validId(record.commandId) && validId(record.operationId)
    && /^[0-9a-f]{64}$/.test(record.requestDigest) && validId(String(record.effectGeneration))
    && STATES.has(record.status) && Object.keys(record).every((key) => [
      "commandId", "effectGeneration", "operationId", "requestDigest", "response", "schemaVersion", "status", "uncertainReason",
    ].includes(key)))) return false;
  if (record.status === "result") {
    try { return Object.hasOwn(record, "response") && !Object.hasOwn(record, "uncertainReason") && Buffer.byteLength(canonicalJson(record.response)) <= MAX_RESPONSE_BYTES; } catch { return false; }
  }
  if (record.status === "uncertain") return !Object.hasOwn(record, "response") && typeof record.uncertainReason === "string" && record.uncertainReason.length > 0 && record.uncertainReason.length <= 256;
  return !Object.hasOwn(record, "response") && !Object.hasOwn(record, "uncertainReason");
}

export function requestDigest(request) {
  return digest(request);
}

export function createCommandRecoveryJournal({ directory } = {}) {
  if (!directory) fail("COMMAND_JOURNAL_DIRECTORY_REQUIRED");
  const root = resolve(directory);
  let queue = Promise.resolve();
  const serialized = (operation) => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  };
  const pathFor = (commandId) => {
    if (!validId(commandId)) fail("COMMAND_ID_INVALID");
    return join(root, `${encodeURIComponent(commandId)}.json`);
  };
  async function load(commandId) {
    let value;
    try { value = JSON.parse(await readFile(pathFor(commandId), "utf8")); } catch (error) {
      if (error?.code === "ENOENT") return null;
      fail("COMMAND_JOURNAL_CORRUPT");
    }
    if (!validRecord(value) || canonicalJson(value) !== await readFile(pathFor(commandId), "utf8")) fail("COMMAND_JOURNAL_CORRUPT");
    return value;
  }
  async function save(record) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await stat(root)).mode & 0o077) fail("COMMAND_JOURNAL_DIRECTORY_INVALID");
    await durableWrite(pathFor(record.commandId), record);
    return structuredClone(record);
  }
  async function receive(input = {}) {
    return serialized(async () => {
      const { commandId, operationId, effectGeneration } = input;
      if (!validId(commandId) || !validId(operationId) || !validId(String(effectGeneration))) fail("COMMAND_RECEIPT_INVALID");
      const record = await load(commandId);
      const requestDigestValue = input.requestDigest ?? digest(input.request);
      if (!/^[0-9a-f]{64}$/.test(requestDigestValue)) fail("COMMAND_DIGEST_INVALID");
      if (record) {
        if (record.requestDigest !== requestDigestValue
          || record.operationId !== operationId
          || record.effectGeneration !== String(effectGeneration)) fail("COMMAND_DIGEST_CONFLICT");
        return structuredClone(record);
      }
      return save({ commandId, effectGeneration: String(effectGeneration), operationId, requestDigest: requestDigestValue, schemaVersion: 1, status: "received" });
    });
  }
  async function transition(commandId, status, response, uncertainReason) {
    return serialized(async () => {
      const record = await load(commandId);
      if (!record) fail("COMMAND_NOT_FOUND");
      if (record.status === "result" || record.status === "uncertain") return structuredClone(record);
      if (status === "executing" && record.status !== "received") fail("COMMAND_STATE_INVALID");
      if (status === "result" && record.status !== "executing") fail("COMMAND_STATE_INVALID");
      if (status === "result") { try { if (Buffer.byteLength(canonicalJson(response)) > MAX_RESPONSE_BYTES) fail("COMMAND_RESPONSE_INVALID"); } catch (error) { if (error?.message === "COMMAND_RESPONSE_INVALID") throw error; fail("COMMAND_RESPONSE_INVALID"); } }
      if (status === "uncertain" && (typeof uncertainReason !== "string" || uncertainReason.length === 0 || uncertainReason.length > 256)) fail("COMMAND_UNCERTAIN_REASON_INVALID");
      return save({ ...record, ...(response === undefined ? {} : { response }), ...(uncertainReason === undefined ? {} : { uncertainReason }), status });
    });
  }
  async function recover() {
    return serialized(async () => {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const recovered = [];
      for (const name of (await readdir(root)).filter((entry) => entry.endsWith(".json")).sort()) {
        const record = await load(decodeURIComponent(name.slice(0, -5)));
        if (record?.status === "executing") recovered.push(await save({ ...record, status: "uncertain", uncertainReason: "process-restarted" }));
        else if (record) recovered.push(structuredClone(record));
      }
      return recovered;
    });
  }
  return {
    beginExecution: (commandId) => transition(commandId, "executing"),
    markUncertain: (commandId, reason = "unknown-effect") => transition(commandId, "uncertain", undefined, reason),
    pathFor,
    read: (commandId) => serialized(() => load(commandId)),
    receive,
    recover,
    recordResult: (commandId, response) => transition(commandId, "result", response),
    root,
  };
}
