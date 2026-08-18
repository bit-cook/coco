import { createHash, randomUUID } from "node:crypto";
import { constants, lstat, mkdir, open } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError, parseStrictJson } from "./state-schema.mjs";
import { ensureAgentDirectory, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";
import { processIdentity, processMatches } from "./task-process.mjs";
import { createLinuxContainment, linuxContainmentDescriptor, validLinuxContainment } from "./linux-containment.mjs";

const TASK_ID = /^[a-z0-9_-]{12}$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const PHASES = new Set(["prepared", "registered", "authorized", "outcome", "revoked", "abandoned"]);
const iso = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (code) => { throw new StateError(code); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

function identity(taskId, runId) {
  if (!TASK_ID.test(taskId ?? "") || !RUN_ID.test(runId ?? "")) fail("TASK_RUN_ID_INVALID");
  return { runId: runId.toLowerCase(), taskId };
}

function paths(agentDir, taskId, runId) {
  const id = identity(taskId, runId);
  const directory = join(statePaths(agentDir).taskRuns, id.taskId, id.runId);
  return { ...id, authorization: join(directory, "authorization.json"), directory, launch: join(directory, "launch.json"), outcome: join(directory, "outcome.json"), registration: join(directory, "registration.json"), revocation: join(directory, "revocation.json"), spec: join(directory, "spec.json"), stderr: join(directory, "stderr.log"), stdout: join(directory, "stdout.log") };
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

function validRevocation(value, id, specSha256) {
  return object(value) && value.schemaVersion === 1 && value.taskId === id.taskId && value.runId === id.runId && value.specSha256 === specSha256
    && iso(value.revokedAt) && Object.keys(value).sort().join(",") === "revokedAt,runId,schemaVersion,specSha256,taskId";
}

function validLaunch(value, id, specSha256) {
  if (!object(value) || value.schemaVersion !== 2 || value.taskId !== id.taskId || value.runId !== id.runId || value.specSha256 !== specSha256 || !PHASES.has(value.phase)) return false;
  if (!Number.isSafeInteger(value.generation) || value.generation < 1 || !iso(value.preparedAt) || !iso(value.updatedAt)) return false;
  if (value.ownerId !== null && (typeof value.ownerId !== "string" || value.ownerId.length < 1 || value.ownerId.length > 200)) return false;
  if (value.ownerPid !== null && (!Number.isSafeInteger(value.ownerPid) || value.ownerPid < 1)) return false;
  if (value.ownerProcessIdentity !== null && (typeof value.ownerProcessIdentity !== "string" || value.ownerProcessIdentity.length < 1 || value.ownerProcessIdentity.length > 200)) return false;
  if ((value.leaseAcquiredAt === null) !== (value.leaseExpiresAt === null) || (value.leaseAcquiredAt !== null && (!iso(value.leaseAcquiredAt) || !iso(value.leaseExpiresAt) || value.leaseExpiresAt < value.leaseAcquiredAt))) return false;
  if (value.registration !== null && !validRegistration(value.registration, id, specSha256)) return false;
  if (value.authorization !== null && !validAuthorization(value.authorization, id, specSha256)) return false;
  if (value.outcome !== null && !validOutcome(value.outcome, id, specSha256)) return false;
  if (value.revocation !== null && !validRevocation(value.revocation, id, specSha256)) return false;
  if (value.abandonedAt !== null && !iso(value.abandonedAt)) return false;
  if (value.containment !== undefined && !validLinuxContainment(value.containment, { generation: value.generation, ownerId: value.ownerId ?? undefined })) return false;
  if (value.phase === "prepared" && (value.registration || value.authorization || value.outcome || value.revocation || value.abandonedAt)) return false;
  if (value.phase === "registered" && (!value.registration || value.authorization || value.outcome || value.revocation || value.abandonedAt)) return false;
  if (value.phase === "authorized" && (!value.registration || !value.authorization || value.outcome || value.revocation || value.abandonedAt)) return false;
  if (value.phase === "outcome" && (!value.registration || !value.authorization || !value.outcome || value.revocation || value.abandonedAt)) return false;
  if (value.phase === "revoked" && (!value.revocation || value.outcome || value.abandonedAt)) return false;
  if (value.phase === "abandoned" && (!value.abandonedAt || value.authorization || value.outcome || value.revocation)) return false;
  const keys = Object.keys(value).sort().join(",");
  const current = ["abandonedAt", "authorization", "containment", "generation", "leaseAcquiredAt", "leaseExpiresAt", "outcome", "ownerId", "ownerPid", "ownerProcessIdentity", "phase", "preparedAt", "registration", "revocation", "runId", "schemaVersion", "specSha256", "taskId", "updatedAt"].sort().join(",");
  return keys === current || keys === current.replace("containment,", "");
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
    const opened = await handle.stat(), after = await lstat(path);
    if (!opened.isFile() || (process.platform !== "win32" && (opened.mode & 0o077) !== 0) || opened.dev !== before.dev || opened.ino !== before.ino || opened.dev !== after.dev || opened.ino !== after.ino) fail(code);
    const bytes = await handle.readFile(), final = await handle.stat();
    if (final.size !== opened.size || final.mtimeNs !== opened.mtimeNs || final.ctimeNs !== opened.ctimeNs) fail(code);
    const value = parseStrictJson(bytes, code);
    if (!validate(value) || canonicalJson(value) !== bytes.toString("utf8")) fail(code);
    return { bytes, value };
  } finally { await handle?.close(); }
}

export function createTaskRunSupervisorStore({ agentDir, containment = createLinuxContainment(), leaseMs = 60_000, now = () => new Date() } = {}) {
  const root = resolve(agentDir);
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) fail("TASK_RUN_LEASE_INVALID");
  const timestamp = () => now().toISOString();

  async function transaction(operations) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { let result; await applyStateTransaction({ agentDir: root, operations: async () => { const value = await operations(); result = value.result; return value.writes; } }); return result; }
      catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await delay(10); }
    }
  }

  async function readBase(path) {
    const spec = await readCanonical(path.spec, "TASK_RUN_SPEC_CORRUPT", (value) => validSpec(value, path));
    if (!spec) return null;
    const specSha256 = hash(spec.bytes);
    const launch = await readCanonical(path.launch, "TASK_RUN_LAUNCH_CORRUPT", (value) => validLaunch(value, path, specSha256));
    if (launch) {
      const value = launch.value;
      if (!value.containment) value.containment = { ...linuxContainmentDescriptor({ generation: value.generation, ownerId: value.ownerId ?? "legacy", runId: path.runId, taskId: path.taskId }), reason: "LEGACY_CONTAINMENT_UNAVAILABLE", status: "unsupported" };
      return { launch: value, spec, specSha256 };
    }
    const registration = await readCanonical(path.registration, "TASK_RUN_REGISTRATION_CORRUPT", (value) => validRegistration(value, path, specSha256));
    const authorization = await readCanonical(path.authorization, "TASK_RUN_AUTHORIZATION_CORRUPT", (value) => validAuthorization(value, path, specSha256));
    const outcome = await readCanonical(path.outcome, "TASK_RUN_OUTCOME_CORRUPT", (value) => validOutcome(value, path, specSha256));
    const revocation = await readCanonical(path.revocation, "TASK_RUN_REVOCATION_CORRUPT", (value) => validRevocation(value, path, specSha256));
    const phase = outcome ? "outcome" : revocation ? "revoked" : authorization ? "authorized" : registration ? "registered" : "prepared";
    const owner = authorization?.value ?? registration?.value ?? null;
    const ownerId = owner ? `legacy-${hash(Buffer.from(`${owner.pid}:${owner.processIdentity}`)).slice(0, 32)}` : null;
    return { launch: { abandonedAt: null, authorization: authorization?.value ?? null, containment: { ...linuxContainmentDescriptor({ generation: 1, ownerId: ownerId ?? "legacy", runId: path.runId, taskId: path.taskId }), reason: "LEGACY_CONTAINMENT_UNAVAILABLE", status: "unsupported" }, generation: 1, leaseAcquiredAt: null, leaseExpiresAt: null, outcome: outcome?.value ?? null, ownerId, ownerPid: owner?.pid ?? null, ownerProcessIdentity: owner?.processIdentity ?? null, phase, preparedAt: spec.value.preparedAt, registration: registration?.value ?? null, revocation: revocation?.value ?? null, runId: path.runId, schemaVersion: 2, specSha256, taskId: path.taskId, updatedAt: outcome?.value.endedAt ?? revocation?.value.revokedAt ?? authorization?.value.authorizedAt ?? registration?.value.registeredAt ?? spec.value.preparedAt }, spec, specSha256 };
  }

  async function ownerIsStale(launch, at = timestamp()) {
    if (!launch.ownerPid || !launch.ownerProcessIdentity) return true;
    if (launch.leaseExpiresAt !== null && launch.leaseExpiresAt <= at) return true;
    return !await processMatches(launch.ownerPid, launch.ownerProcessIdentity);
  }

  function assertGeneration(launch, generation) {
    if (generation !== undefined && generation !== launch.generation) fail("TASK_RUN_STALE_GENERATION");
  }

  function assertOwner(launch, ownerId, generation) {
    if (ownerId === undefined || generation === undefined) fail("TASK_RUN_OWNER_REQUIRED");
    assertGeneration(launch, generation);
    if (ownerId !== launch.ownerId) fail("TASK_RUN_STALE_OWNER");
  }

  async function prepare({ cwd, prompt, runId, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    const existing = await readBase(path);
    if (existing) {
      if (existing.spec.value.cwd !== resolve(cwd) || existing.spec.value.prompt !== prompt) fail("TASK_RUN_SPEC_CONFLICT");
      return { generation: existing.launch.generation, ownerId: existing.launch.ownerId, paths: path, spec: existing.spec.value, specSha256: existing.specSha256 };
    }
    const ownerProcessIdentity = await processIdentity(process.pid);
    if (!ownerProcessIdentity) fail("TASK_PROCESS_IDENTITY_REQUIRED");
    const preparedAt = timestamp(), ownerId = randomUUID();
    const spec = { cwd: resolve(cwd), launchToken: hash(Buffer.from(`${randomUUID()}:${Date.now()}:${process.pid}`)), preparedAt, prompt, runId: path.runId, schemaVersion: 1, taskId: path.taskId };
    if (!validSpec(spec, path)) fail("TASK_RUN_SPEC_INVALID");
    const specBytes = Buffer.from(canonicalJson(spec)), specSha256 = hash(specBytes);
    const launch = { abandonedAt: null, authorization: null, containment: linuxContainmentDescriptor({ generation: 1, ownerId, runId: path.runId, taskId: path.taskId }), generation: 1, leaseAcquiredAt: preparedAt, leaseExpiresAt: new Date(Date.parse(preparedAt) + leaseMs).toISOString(), outcome: null, ownerId, ownerPid: process.pid, ownerProcessIdentity, phase: "prepared", preparedAt, registration: null, revocation: null, runId: path.runId, schemaVersion: 2, specSha256, taskId: path.taskId, updatedAt: preparedAt };
    await transaction(async () => {
      if (await readBase(path)) fail("TASK_RUN_SPEC_CONFLICT");
      return { result: null, writes: [{ bytes: specBytes, containsSecret: true, path: path.spec }, { bytes: Buffer.alloc(0), containsSecret: true, path: path.stdout }, { bytes: Buffer.alloc(0), containsSecret: true, path: path.stderr }, { bytes: canonicalJson(launch), path: path.launch }] };
    });
    return { generation: 1, ownerId, paths: path, spec, specSha256 };
  }

  async function inspect({ runId, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    let state;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { state = await readBase(path); break; }
      catch (error) {
        if (!String(error?.code).endsWith("_CORRUPT") || attempt === 99) throw error;
        await delay(5);
      }
    }
    if (!state) return { abandonedAt: null, authorization: null, containment: null, generation: null, lease: null, outcome: null, owner: null, paths: path, phase: null, registration: null, revocation: null, spec: null, specSha256: null, stale: null };
    const launch = state.launch;
    return { abandonedAt: launch.abandonedAt, authorization: launch.authorization, containment: launch.containment, generation: launch.generation, lease: launch.leaseAcquiredAt === null ? null : { acquiredAt: launch.leaseAcquiredAt, expiresAt: launch.leaseExpiresAt }, outcome: launch.outcome, owner: launch.ownerId === null ? null : { ownerId: launch.ownerId, pid: launch.ownerPid, processIdentity: launch.ownerProcessIdentity }, paths: path, phase: launch.phase, registration: launch.registration, revocation: launch.revocation, spec: state.spec.value, specSha256: state.specSha256, stale: await ownerIsStale(launch) };
  }

  async function register({ generation, ownerId, pid = process.pid, processIdentity: suppliedIdentity, runId, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    const identityValue = suppliedIdentity ?? await processIdentity(pid);
    if (!identityValue || !await processMatches(pid, identityValue)) fail("TASK_PROCESS_IDENTITY_REQUIRED");
    return transaction(async () => {
      const state = await readBase(path); if (!state) fail("TASK_RUN_SPEC_UNAVAILABLE");
      assertOwner(state.launch, ownerId, generation);
      const value = { pid, processIdentity: identityValue, registeredAt: timestamp(), runId: path.runId, schemaVersion: 1, specSha256: state.specSha256, taskId: path.taskId };
      if (state.launch.registration) {
        if (state.launch.registration.pid !== pid || state.launch.registration.processIdentity !== identityValue) fail("TASK_RUN_REGISTRATION_CONFLICT");
        return { result: { ...state.launch.registration, generation: state.launch.generation }, writes: [{ bytes: canonicalJson(state.launch), path: path.launch }] };
      }
      if (state.launch.phase !== "prepared") fail("TASK_RUN_REGISTRATION_CONFLICT");
      const launch = { ...state.launch, phase: "registered", registration: value, updatedAt: value.registeredAt };
      return { result: { ...value, generation: launch.generation }, writes: [{ bytes: canonicalJson(value), path: path.registration }, { bytes: canonicalJson(launch), path: path.launch }] };
    });
  }

  async function authorize({ generation, ownerId, runId, specSha256, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    return transaction(async () => {
      const state = await readBase(path); if (!state || state.specSha256 !== specSha256) fail("TASK_RUN_SPEC_MISMATCH");
      assertOwner(state.launch, ownerId, generation);
      if (state.launch.revocation || state.launch.abandonedAt) fail("TASK_RUN_REVOKED");
      if (state.launch.authorization) return { result: state.launch.authorization, writes: [{ bytes: canonicalJson(state.launch), path: path.launch }] };
      const registration = state.launch.registration;
      if (!registration || !await processMatches(registration.pid, registration.processIdentity)) fail("TASK_RUN_REGISTRATION_INVALID");
      const attached = await containment.attach(state.launch.containment, registration.pid, () => processMatches(registration.pid, registration.processIdentity));
      const value = { authorizedAt: timestamp(), pid: registration.pid, processIdentity: registration.processIdentity, runId: path.runId, schemaVersion: 1, specSha256, taskId: path.taskId };
      const launch = { ...state.launch, authorization: value, containment: attached, phase: "authorized", updatedAt: value.authorizedAt };
      return { result: value, writes: [{ bytes: canonicalJson(value), path: path.authorization }, { bytes: canonicalJson(launch), path: path.launch }] };
    });
  }

  async function writeOutcome({ endedAt, exitCode, generation, ownerId, processIdentity: writerIdentity, pid: writerPid, runId, specSha256, startedAt, stderrTruncated = false, stdoutTruncated = false, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    return transaction(async () => {
      const state = await readBase(path); if (!state || state.specSha256 !== specSha256) fail("TASK_RUN_NOT_AUTHORIZED");
      assertOwner(state.launch, ownerId, generation);
      if (!state.launch.authorization) fail("TASK_RUN_NOT_AUTHORIZED");
      if (state.launch.revocation) fail("TASK_RUN_REVOKED");
      if (writerPid !== undefined && (state.launch.registration?.pid !== writerPid || state.launch.registration.processIdentity !== writerIdentity)) fail("TASK_RUN_STALE_OWNER");
      const value = { endedAt, exitCode, runId: path.runId, schemaVersion: 1, specSha256, startedAt, stderrTruncated, stdoutTruncated, taskId: path.taskId };
      if (!validOutcome(value, path, specSha256)) fail("TASK_RUN_OUTCOME_INVALID");
      if (state.launch.outcome) { if (canonicalJson(state.launch.outcome) !== canonicalJson(value)) fail("TASK_RUN_OUTCOME_CONFLICT"); return { result: state.launch.outcome, writes: [{ bytes: canonicalJson(state.launch), path: path.launch }] }; }
      const launch = { ...state.launch, outcome: value, phase: "outcome", updatedAt: endedAt };
      return { result: value, writes: [{ bytes: canonicalJson(value), path: path.outcome }, { bytes: canonicalJson(launch), path: path.launch }] };
    });
  }

  async function revoke({ generation, ownerId, runId, specSha256, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    return transaction(async () => {
      const state = await readBase(path); if (!state || state.specSha256 !== specSha256) fail("TASK_RUN_SPEC_MISMATCH");
      assertOwner(state.launch, ownerId, generation);
      if (state.launch.outcome) fail("TASK_RUN_OUTCOME_EXISTS");
      if (state.launch.abandonedAt) fail("TASK_RUN_ABANDONED");
      if (state.launch.revocation) return { result: state.launch.revocation, writes: [{ bytes: canonicalJson(state.launch), path: path.launch }] };
      const value = { revokedAt: timestamp(), runId: path.runId, schemaVersion: 1, specSha256, taskId: path.taskId };
      const launch = { ...state.launch, phase: "revoked", revocation: value, updatedAt: value.revokedAt };
      return { result: value, writes: [{ bytes: canonicalJson(value), path: path.revocation }, { bytes: canonicalJson(launch), path: path.launch }] };
    });
  }

  async function takeover({ expectedGeneration, runId, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    const newIdentity = await processIdentity(process.pid); if (!newIdentity) fail("TASK_PROCESS_IDENTITY_REQUIRED");
    return transaction(async () => {
      const state = await readBase(path); if (!state) fail("TASK_RUN_SPEC_UNAVAILABLE");
      if (state.launch.generation !== expectedGeneration) fail("TASK_RUN_TAKEOVER_CAS_FAILED");
      if (["authorized", "outcome", "revoked", "abandoned"].includes(state.launch.phase)) fail("TASK_RUN_TAKEOVER_FORBIDDEN");
      const at = timestamp(); if (!await ownerIsStale(state.launch, at)) fail("TASK_RUN_OWNER_ACTIVE");
      const ownerId = randomUUID();
      const generation = state.launch.generation + 1;
      const launch = { ...state.launch, containment: linuxContainmentDescriptor({ generation, ownerId, runId: path.runId, taskId: path.taskId }), generation, leaseAcquiredAt: at, leaseExpiresAt: new Date(Date.parse(at) + leaseMs).toISOString(), ownerId, ownerPid: process.pid, ownerProcessIdentity: newIdentity, registration: null, phase: "prepared", updatedAt: at };
      return { result: { generation: launch.generation, ownerId }, writes: [{ bytes: canonicalJson(launch), path: path.launch }] };
    });
  }

  async function abandon({ generation, ownerId, runId, specSha256, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    return transaction(async () => {
      const state = await readBase(path); if (!state || state.specSha256 !== specSha256) fail("TASK_RUN_SPEC_MISMATCH");
      assertOwner(state.launch, ownerId, generation);
      if (state.launch.authorization || state.launch.outcome) fail("TASK_RUN_ABANDON_FORBIDDEN");
      if (state.launch.revocation) fail("TASK_RUN_REVOKED");
      if (state.launch.abandonedAt) return { result: state.launch.abandonedAt, writes: [{ bytes: canonicalJson(state.launch), path: path.launch }] };
      const abandonedAt = timestamp(), launch = { ...state.launch, abandonedAt, phase: "abandoned", registration: null, updatedAt: abandonedAt };
      return { result: abandonedAt, writes: [{ bytes: canonicalJson(launch), path: path.launch }] };
    });
  }

  async function terminateContainment({ generation, ownerId, runId, taskId }) {
    const path = paths(root, taskId, runId); await ensureRunDirectory(root, path);
    return transaction(async () => {
      const state = await readBase(path); if (!state) fail("TASK_RUN_SPEC_UNAVAILABLE");
      assertOwner(state.launch, ownerId, generation);
      const result = await containment.terminate(state.launch.containment);
      const launch = { ...state.launch, containment: result.descriptor ?? state.launch.containment, updatedAt: timestamp() };
      return { result: { containment: launch.containment, reason: result.reason ?? null, status: result.status }, writes: [{ bytes: canonicalJson(launch), path: path.launch }] };
    });
  }

  return { abandon, authorize, inspect, prepare, register, revoke, takeover, terminateContainment, writeOutcome };
}

export { validAuthorization as validTaskRunAuthorization, validOutcome as validTaskRunOutcome, validRegistration as validTaskRunRegistration, validSpec as validTaskRunSpec };
