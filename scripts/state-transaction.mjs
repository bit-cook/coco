import { createHash, randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { parseStrictJson, StateError, validateJournal } from "./state-schema.mjs";
import { ensureAgentDirectory, fsyncDirectory, inspectRegular, safeStatePath } from "./state-paths.mjs";
import { processAlive, processIdentity } from "./task-process.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const secretNames = new Set(["auth.json"]);
function fail(code) { throw new StateError(code); }

async function writeSynced(path, bytes, mode) {
  const descriptor = await open(path, "wx", mode);
  try { await descriptor.writeFile(bytes); await descriptor.sync(); } finally { await descriptor.close(); }
}

async function writeJournal(path, journal) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeSynced(temporary, canonicalJson(journal), 0o600);
  await rename(temporary, path);
  await fsyncDirectory(path);
}

async function operationState(operation) {
  try { return digest(await readFile(operation.path)); } catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
}

function validLockOwner(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && typeof value.ownerId === "string" && value.ownerId.length > 0
    && Number.isSafeInteger(value.pid) && value.pid > 0
    && (value.processIdentity === null || typeof value.processIdentity === "string")
    && value.schemaVersion === 1
    && Object.keys(value).sort().join(",") === ["ownerId", "pid", "processIdentity", "schemaVersion"].sort().join(",");
}

async function staleLock(path, staleMs, now) {
  let info;
  try { info = await lstat(path); } catch (error) { if (error?.code === "ENOENT") return true; throw error; }
  if (!info.isFile() || info.isSymbolicLink()) fail("STATE_LOCK_INVALID");
  let owner;
  try { owner = JSON.parse(await readFile(path, "utf8")); } catch {
    if (now() - info.mtimeMs < staleMs) return false;
    return true;
  }
  if (!validLockOwner(owner)) {
    if (now() - info.mtimeMs < staleMs) return false;
    return true;
  }
  if (!await processAlive(owner.pid)) return true;
  if (!owner.processIdentity) return false;
  const identity = await processIdentity(owner.pid);
  return identity === null ? false : identity !== owner.processIdentity;
}

export async function acquireStateLock(agentDir, { now = Date.now, staleMs = 5000 } = {}) {
  await ensureAgentDirectory(agentDir);
  const path = join(agentDir, ".state.lock");
  const ownerId = randomUUID();
  const temporary = join(agentDir, `.state.lock.${ownerId}.tmp`);
  const owner = { ownerId, pid: process.pid, processIdentity: await processIdentity(process.pid), schemaVersion: 1 };
  await writeSynced(temporary, canonicalJson(owner), 0o600);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await link(temporary, path);
      await rm(temporary, { force: true });
      await fsyncDirectory(path);
      return Object.freeze({
        async release() {
          let current;
          try { current = JSON.parse(await readFile(path, "utf8")); } catch { return; }
          if (current?.ownerId === ownerId) await rm(path, { force: true });
        },
        ownerId,
        path,
      });
    } catch (error) {
      if (error?.code !== "EEXIST") { await rm(temporary, { force: true }); throw error; }
      if (attempt === 0 && await staleLock(path, staleMs, now)) {
        const abandoned = `${path}.${randomUUID()}.abandoned`;
        try { await rename(path, abandoned); } catch (renameError) { if (renameError?.code === "ENOENT") continue; throw renameError; }
        await rm(abandoned, { force: true });
        continue;
      }
      await rm(temporary, { force: true });
      fail("STATE_LOCKED");
    }
  }
  await rm(temporary, { force: true });
  fail("STATE_LOCKED");
}

export async function atomicReplace({ agentDir, path, bytes, containsSecret = false }) {
  await ensureAgentDirectory(agentDir);
  const target = safeStatePath(agentDir, path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await inspectRegular(target);
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  await writeSynced(temporary, bytes, containsSecret ? 0o600 : 0o600);
  await rename(temporary, target);
  if (process.platform !== "win32") await chmod(target, containsSecret ? 0o600 : 0o600);
  await fsyncDirectory(target);
}

async function recoverTransactionsLocked(agentDir) {
  await ensureAgentDirectory(agentDir);
  const directory = join(agentDir, "transactions");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { readdir } = await import("node:fs/promises");
  for (const entry of (await readdir(directory)).filter((name) => name.endsWith(".json")).sort()) {
    const path = join(directory, entry);
    const journal = validateJournal(parseStrictJson(await readFile(path), "JOURNAL_SCHEMA_INVALID"));
    for (let index = journal.nextIndex; index < journal.operations.length; index += 1) {
      const operation = journal.operations[index];
      operation.path = safeStatePath(agentDir, operation.path);
      operation.tempPath = safeStatePath(agentDir, operation.tempPath);
      const current = await operationState(operation);
      if (current === operation.afterSha256) { journal.nextIndex = index + 1; continue; }
      if (current !== operation.beforeSha256) fail("TRANSACTION_CONFLICT");
      await inspectRegular(operation.tempPath, true);
      await rename(operation.tempPath, operation.path);
      await fsyncDirectory(operation.path);
      journal.nextIndex = index + 1;
      journal.phase = "applying";
      await writeJournal(path, journal);
    }
    journal.phase = "committed";
    await writeJournal(path, journal);
    await rm(path, { force: true });
  }
}

export async function recoverTransactions(agentDir) {
  const lock = await acquireStateLock(agentDir);
  try { await recoverTransactionsLocked(agentDir); } finally { await lock.release(); }
}

export async function applyStateTransaction({ agentDir, operations, transactionId = randomUUID() }) {
  if (typeof operations !== "function" && (!Array.isArray(operations) || operations.length === 0)) fail("TRANSACTION_INVALID");
  const lock = await acquireStateLock(agentDir);
  try {
    await recoverTransactionsLocked(agentDir);
    const inputs = typeof operations === "function" ? await operations() : operations;
    if (!Array.isArray(inputs) || inputs.length === 0) fail("TRANSACTION_INVALID");
    const directory = join(agentDir, "transactions");
    const prepared = [];
    for (const input of inputs) {
      const path = safeStatePath(agentDir, input.path);
      const bytes = Buffer.from(input.bytes);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await inspectRegular(path);
      const before = await operationState({ path });
      const temporary = join(dirname(path), `.${basename(path)}.${transactionId}.tmp`);
      await writeSynced(temporary, bytes, 0o600);
      prepared.push({ afterSha256: digest(bytes), beforeSha256: before, containsSecret: input.containsSecret === true || secretNames.has(basename(path)), path, redactedBackupPath: null, tempPath: temporary });
    }
    const journalPath = join(directory, `${transactionId}.json`);
    const journal = { nextIndex: 0, operations: prepared, phase: "prepared", schemaVersion: 1, transactionId };
    await writeJournal(journalPath, journal);
    await recoverTransactionsLocked(agentDir);
  } finally { await lock.release(); }
}
