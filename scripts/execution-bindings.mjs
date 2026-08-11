import { access, lstat, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";

const ID = /^[a-z0-9_-]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 16 * 1024;
const fail = (code) => { throw new StateError(code); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function bindingPath(root, taskId, runId) {
  if (!ID.test(taskId) || !UUID.test(runId)) fail("EXECUTION_BINDING_ID_INVALID");
  return join(root, taskId, `${runId.toLowerCase()}.json`);
}

function validBinding(value, { taskId, runId } = {}) {
  return object(value) && value.schemaVersion === 1 && ID.test(value.taskId) && UUID.test(value.runId)
    && (taskId === undefined || value.taskId === taskId) && (runId === undefined || value.runId === runId)
    && typeof value.providerId === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(value.providerId)
    && value.status === "approved" && SHA256.test(value.requestSha256)
    && Object.keys(value).sort().join(",") === "providerId,requestSha256,runId,schemaVersion,status,taskId"
    && Buffer.byteLength(canonicalJson(value)) <= MAX_BYTES;
}

async function ensureDirectory(root, taskId) {
  await mkdir(root, { recursive: true, mode: 0o700 }); await mkdir(join(root, taskId), { recursive: true, mode: 0o700 });
  for (const path of [root, join(root, taskId)]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) fail("EXECUTION_BINDING_DIRECTORY_INVALID");
  }
}

export function createExecutionBindingStore({ agentDir } = {}) {
  const directory = resolve(agentDir), root = statePaths(directory).taskExecutionBindings;
  let queue = Promise.resolve();
  const serialized = (operation) => { const result = queue.then(operation, operation); queue = result.catch(() => {}); return result; };

  async function read({ taskId, runId }) {
    return serialized(async () => {
      await ensureAgentDirectory(directory); await ensureDirectory(root, taskId);
      const path = bindingPath(root, taskId, runId); if (await inspectRegular(path) === null) return null;
      const bytes = await readFile(path, "utf8"); let value;
      try { value = parseStrictJson(bytes, "EXECUTION_BINDING_CORRUPT"); } catch (error) { if (error instanceof StateError) throw error; fail("EXECUTION_BINDING_CORRUPT"); }
      if (!validBinding(value, { taskId, runId: runId.toLowerCase() }) || canonicalJson(value) !== bytes) fail("EXECUTION_BINDING_CORRUPT");
      return structuredClone(value);
    });
  }

  async function write({ taskId, runId, providerId, requestSha256, status = "approved" }) {
    return serialized(async () => {
      const value = { providerId, requestSha256, runId: runId?.toLowerCase(), schemaVersion: 1, status, taskId };
      if (!validBinding(value)) fail("EXECUTION_BINDING_INVALID");
      await ensureAgentDirectory(directory); await ensureDirectory(root, taskId); const path = bindingPath(root, taskId, runId);
      await applyStateTransaction({ agentDir: directory, operations: async () => {
        if (await inspectRegular(path) !== null) { const existing = await readFile(path, "utf8"); if (existing !== canonicalJson(value)) fail("EXECUTION_BINDING_CONFLICT"); return [{ bytes: Buffer.from(existing), path }]; }
        return [{ bytes: Buffer.from(canonicalJson(value)), path }];
      } });
      return structuredClone(value);
    });
  }

  async function exists({ taskId, runId }) { try { await access(bindingPath(root, taskId, runId)); return true; } catch { return false; } }
  return { exists, pathFor: (taskId, runId) => bindingPath(root, taskId, runId), read, root, write };
}

export { validBinding as validExecutionBinding };
