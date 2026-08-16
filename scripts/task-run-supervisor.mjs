import { createHash, randomUUID } from "node:crypto";
import { constants, lstat, mkdir, open, link, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, atomicReplace } from "./state-transaction.mjs";
import { processIdentity, processMatches } from "./task-process.mjs";

const TASK_ID = /^[a-z0-9_-]{12}$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const iso = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (code) => { throw new StateError(code); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function identity(taskId, runId) {
  if (!TASK_ID.test(taskId ?? "") || !RUN_ID.test(runId ?? "")) fail("TASK_RUN_ID_INVALID");
  return { runId: runId.toLowerCase(), taskId };
}

function paths(agentDir, taskId, runId) {
  const id = identity(taskId, runId);
  const directory = join(statePaths(agentDir).taskRuns, id.taskId, id.runId);
  return { ...id, authorization: join(directory, "authorization.json"), directory, outcome: join(directory, "outcome.json"), registration: join(directory, "registration.json"), revocation: join(directory, "revocation.json"), spec: join(directory, "spec.json"), stderr: join(directory, "stderr.log"), stdout: join(directory, "stdout.log") };
}

function validSpec(value, id) {
  return object(value) && value.schemaVersion === 1 && value.taskId === id.taskId && value.runId === id.runId
    && typeof value.prompt === "string" && value.prompt.length > 0 && Buffer.byteLength(value.prompt) <= 1024 * 1024
    && typeof value.cwd === "string" && isAbsolute(value.cwd) && Buffer.byteLength(value.cwd) <= 4096
    && iso(value.preparedAt) && SHA256.test(value.launchToken)
    && Object.keys(value).sort().join(",") === "cwd,launchToken,preparedAt,prompt,runId,schemaVersion,taskId";
}

function validAuthorization(value, id, specSha256) {
  return object(value) && value.schemaVersion === 1 && value.taskId === id.taskId && value.runId === id.runId && value.specSha256 === specSha256
    && Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.processIdentity === "string" && value.processIdentity.length > 0 && value.processIdentity.length <= 200
    && iso(value.authorizedAt) && Object.keys(value).sort().join(",") === "authorizedAt,pid,processIdentity,runId,schemaVersion,specSha256,taskId";
}

function validOutcome(value, id, specSha256) {
  return object(value) && value.schemaVersion === 1 && value.taskId === id.taskId && value.runId === id.runId && value.specSha256 === specSha256
    && iso(value.startedAt) && iso(value.endedAt) && value.endedAt >= value.startedAt
    && Number.isSafeInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255
    && typeof value.stdoutTruncated === "boolean" && typeof value.stderrTruncated === "boolean"
    && Object.keys(value).sort().join(",") === "endedAt,exitCode,runId,schemaVersion,specSha256,startedAt,stderrTruncated,stdoutTruncated,taskId";
}

function validRegistration(value, id, specSha256) {
  return object(value) && value.schemaVersion === 1 && value.taskId === id.taskId && value.runId === id.runId && value.specSha256 === specSha256
    && Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.processIdentity === "string" && value.processIdentity.length > 0 && value.processIdentity.length <= 200
    && iso(value.registeredAt) && Object.keys(value).sort().join(",") === "pid,processIdentity,registeredAt,runId,schemaVersion,specSha256,taskId";
}

async function ensureRunDirectory(agentDir, path) {
  await ensureAgentDirectory(agentDir);
  const root = statePaths(agentDir).taskRuns;
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(join(root, path.taskId), { recursive: true, mode: 0o700 });
  await mkdir(path.directory, { recursive: true, mode: 0o700 });
  for (const entry of [root, join(root, path.taskId), path.directory]) {
    const info = await lstat(entry);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) fail("TASK_RUN_DIRECTORY_INVALID");
  }
}

async function readCanonical(path, code, validate) {
  let before;
  try { before = await lstat(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  if (!before.isFile() || before.isSymbolicLink() || (process.platform !== "win32" && (before.mode & 0o077) !== 0)) fail(code);
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    const after = await lstat(path);
    if (!opened.isFile() || (process.platform !== "win32" && (opened.mode & 0o077) !== 0)
      || opened.dev !== before.dev || opened.ino !== before.ino || opened.dev !== after.dev || opened.ino !== after.ino) fail(code);
    const bytes = await handle.readFile();
    const final = await handle.stat();
    if (final.size !== opened.size || final.mtimeNs !== opened.mtimeNs || final.ctimeNs !== opened.ctimeNs) fail(code);
    const value = parseStrictJson(bytes, code);
    if (!validate(value) || canonicalJson(value) !== bytes.toString("utf8")) fail(code);
    return { bytes, value };
  } finally { await handle?.close(); }
}

async function createExclusive(path, bytes) {
  const temporary = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  let handle;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes); await handle.sync();
    try { await link(temporary, path); return true; }
    catch (error) { if (error?.code === "EEXIST") return false; throw error; }
  } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
}

export function createTaskRunSupervisorStore({ agentDir } = {}) {
  const root = resolve(agentDir);

  async function prepare({ cwd, prompt, runId, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    const spec = { cwd: resolve(cwd), launchToken: hash(Buffer.from(`${randomUUID()}:${Date.now()}:${process.pid}`)), preparedAt: new Date().toISOString(), prompt, runId: path.runId, schemaVersion: 1, taskId: path.taskId };
    if (!validSpec(spec, path)) fail("TASK_RUN_SPEC_INVALID");
    const existing = await readCanonical(path.spec, "TASK_RUN_SPEC_CORRUPT", (value) => validSpec(value, path));
    if (existing) {
      const comparable = { ...existing.value, launchToken: spec.launchToken, preparedAt: spec.preparedAt };
      if (comparable.cwd !== spec.cwd || comparable.prompt !== spec.prompt) fail("TASK_RUN_SPEC_CONFLICT");
      return { paths: path, spec: existing.value, specSha256: hash(existing.bytes) };
    }
    const bytes = Buffer.from(canonicalJson(spec)); await atomicReplace({ agentDir: root, containsSecret: true, path: path.spec, bytes });
    await atomicReplace({ agentDir: root, containsSecret: true, path: path.stdout, bytes: Buffer.alloc(0) });
    await atomicReplace({ agentDir: root, containsSecret: true, path: path.stderr, bytes: Buffer.alloc(0) });
    return { paths: path, spec, specSha256: hash(bytes) };
  }

  async function authorize({ runId, specSha256, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    const spec = await readCanonical(path.spec, "TASK_RUN_SPEC_CORRUPT", (value) => validSpec(value, path));
    if (!spec || hash(spec.bytes) !== specSha256) fail("TASK_RUN_SPEC_MISMATCH");
    const registration = await readCanonical(path.registration, "TASK_RUN_REGISTRATION_CORRUPT", (entry) => validRegistration(entry, path, specSha256));
    if (!registration || !await processMatches(registration.value.pid, registration.value.processIdentity)) fail("TASK_RUN_REGISTRATION_INVALID");
    const value = { authorizedAt: new Date().toISOString(), pid: registration.value.pid, processIdentity: registration.value.processIdentity, runId: path.runId, schemaVersion: 1, specSha256, taskId: path.taskId };
    const existing = await readCanonical(path.authorization, "TASK_RUN_AUTHORIZATION_CORRUPT", (entry) => validAuthorization(entry, path, specSha256));
    if (existing) return existing.value;
    await atomicReplace({ agentDir: root, path: path.authorization, bytes: canonicalJson(value) }); return value;
  }

  async function inspect({ runId, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    const spec = await readCanonical(path.spec, "TASK_RUN_SPEC_CORRUPT", (value) => validSpec(value, path));
    if (!spec) return { authorization: null, outcome: null, paths: path, registration: null, spec: null, specSha256: null };
    const specSha256 = hash(spec.bytes);
    const registration = await readCanonical(path.registration, "TASK_RUN_REGISTRATION_CORRUPT", (value) => validRegistration(value, path, specSha256));
    const authorization = await readCanonical(path.authorization, "TASK_RUN_AUTHORIZATION_CORRUPT", (value) => validAuthorization(value, path, specSha256));
    const outcome = await readCanonical(path.outcome, "TASK_RUN_OUTCOME_CORRUPT", (value) => validOutcome(value, path, specSha256));
    return { authorization: authorization?.value ?? null, outcome: outcome?.value ?? null, paths: path, registration: registration?.value ?? null, spec: spec.value, specSha256 };
  }

  async function register({ pid = process.pid, processIdentity: suppliedIdentity, runId, taskId }) {
    const state = await inspect({ runId, taskId });
    if (!state.spec) fail("TASK_RUN_SPEC_UNAVAILABLE");
    const identityValue = suppliedIdentity ?? await processIdentity(pid);
    if (!identityValue || !await processMatches(pid, identityValue)) fail("TASK_PROCESS_IDENTITY_REQUIRED");
    const value = { pid, processIdentity: identityValue, registeredAt: new Date().toISOString(), runId: state.paths.runId, schemaVersion: 1, specSha256: state.specSha256, taskId: state.paths.taskId };
    const existing = await readCanonical(state.paths.registration, "TASK_RUN_REGISTRATION_CORRUPT", (entry) => validRegistration(entry, state.paths, state.specSha256));
    if (existing) { if (canonicalJson(existing.value) !== canonicalJson(value)) fail("TASK_RUN_REGISTRATION_CONFLICT"); return existing.value; }
    if (await createExclusive(state.paths.registration, canonicalJson(value))) return value;
    const winner = await readCanonical(state.paths.registration, "TASK_RUN_REGISTRATION_CORRUPT", (entry) => validRegistration(entry, state.paths, state.specSha256));
    if (!winner || canonicalJson(winner.value) !== canonicalJson(value)) fail("TASK_RUN_REGISTRATION_CONFLICT");
    return winner.value;
  }

  async function writeOutcome({ endedAt, exitCode, runId, specSha256, startedAt, stderrTruncated = false, stdoutTruncated = false, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    const state = await inspect({ runId, taskId });
    if (!state.authorization || state.specSha256 !== specSha256) fail("TASK_RUN_NOT_AUTHORIZED");
    const value = { endedAt, exitCode, runId: path.runId, schemaVersion: 1, specSha256, startedAt, stderrTruncated, stdoutTruncated, taskId: path.taskId };
    if (!validOutcome(value, path, specSha256)) fail("TASK_RUN_OUTCOME_INVALID");
    const existing = await readCanonical(path.outcome, "TASK_RUN_OUTCOME_CORRUPT", (entry) => validOutcome(entry, path, specSha256));
    if (existing) { if (canonicalJson(existing.value) !== canonicalJson(value)) fail("TASK_RUN_OUTCOME_CONFLICT"); return existing.value; }
    await applyStateTransaction({ agentDir: root, operations: async () => {
      if (await inspectRegular(path.revocation) !== null) fail("TASK_RUN_REVOKED");
      return [{ bytes: canonicalJson(value), path: path.outcome }];
    } }); return value;
  }

  async function revoke({ runId, specSha256, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    const value = { revokedAt: new Date().toISOString(), runId: path.runId, schemaVersion: 1, specSha256, taskId: path.taskId };
    await applyStateTransaction({ agentDir: root, operations: async () => {
      if (await inspectRegular(path.outcome) !== null) fail("TASK_RUN_OUTCOME_EXISTS");
      return [{ bytes: canonicalJson(value), path: path.revocation }];
    } }); return value;
  }

  return { authorize, inspect, prepare, register, revoke, writeOutcome };
}

export { validAuthorization as validTaskRunAuthorization, validOutcome as validTaskRunOutcome, validRegistration as validTaskRunRegistration, validSpec as validTaskRunSpec };
