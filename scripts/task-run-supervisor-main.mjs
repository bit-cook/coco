import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createTaskRunSupervisorStore } from "./task-run-supervisor.mjs";

function option(name) { const index = process.argv.indexOf(name); return index === -1 ? null : process.argv[index + 1]; }
const taskId = option("--task-id"), runId = option("--run-id"), ownerId = option("--owner-id"), generation = Number(option("--generation")), agentDir = process.env.COCO_CODING_AGENT_DIR;
if (!taskId || !runId || !ownerId || !Number.isSafeInteger(generation) || generation < 1 || !agentDir) throw new Error("TASK_RUN_SUPERVISOR_USAGE");

const store = createTaskRunSupervisorStore({ agentDir: resolve(agentDir) });
async function resolveAppRoot(local) {
  const candidates = [process.env.COCO_APP_ROOT];
  try { candidates.push(JSON.parse(await (await import("node:fs/promises")).readFile(resolve(local, ".runtime-complete.json"), "utf8")).appRoot); } catch { /* older snapshots carry no marker appRoot */ }
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    const root = resolve(candidate);
    if (await (await import("node:fs/promises")).stat(resolve(root, "bin", "coco")).then(() => true, () => false)) return root;
  }
  return local;
}
function normalizedExitCode(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  const integer = Math.trunc(value);
  return ((integer % 256) + 256) % 256;
}
const registered = await store.register({ generation, ownerId, taskId, runId });
let state;
for (let attempt = 0; attempt < 2400; attempt += 1) {
  state = await store.inspect({ taskId, runId });
  if (state.outcome) process.exitCode = normalizedExitCode(state.outcome.exitCode);
  if (state.outcome || state.authorization || state.revocation || state.phase === "abandoned" || state.containment?.status === "cleaned") break;
  await new Promise((done) => setTimeout(done, 25));
}
if (!state?.authorization && !state?.outcome && !state?.revocation && state?.phase !== "abandoned" && state?.containment?.status !== "cleaned") throw new Error("TASK_RUN_AUTHORIZATION_TIMEOUT");
if (state?.authorization && !state.outcome) {
  class ControlledExit extends Error { constructor(code) { super("TASK_RUN_CONTROLLED_EXIT"); this.code = code; } }
  const startedAt = new Date().toISOString();
  let exitCode = 1;
  let requestExit;
  const exitRequested = new Promise((resolveExit) => { requestExit = resolveExit; });
  let stdoutBytes = 0, stderrBytes = 0, stdoutTruncated = false, stderrTruncated = false;
  const originalStdout = process.stdout.write.bind(process.stdout), originalStderr = process.stderr.write.bind(process.stderr);
  const originalExit = process.exit.bind(process);
  const captureExit = (error) => {
    if (error instanceof ControlledExit) requestExit(error.code);
    else { process.stderr.write(`coco: ${typeof error?.code === "string" ? error.code : "TASK_RUN_EXECUTION_FAILED"}\n`); requestExit(1); }
  };
  const captureRejection = (reason) => captureExit(reason);
  const captureException = (error) => captureExit(error);
  const captureBeforeExit = (code) => requestExit(normalizedExitCode(code));
  process.stdout.write = (chunk, encoding, callback) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === "string" ? encoding : "utf8"), accepted = bytes.subarray(0, Math.max(0, 4_000_000 - stdoutBytes));
    stdoutBytes += accepted.length; if (accepted.length < bytes.length) stdoutTruncated = true;
    if (accepted.length === 0) { if (typeof encoding === "function") encoding(); else if (typeof callback === "function") callback(); return true; }
    return originalStdout(accepted, typeof encoding === "function" ? encoding : callback);
  };
  process.stderr.write = (chunk, encoding, callback) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === "string" ? encoding : "utf8"), accepted = bytes.subarray(0, Math.max(0, 1_000_000 - stderrBytes));
    stderrBytes += accepted.length; if (accepted.length < bytes.length) stderrTruncated = true;
    if (accepted.length === 0) { if (typeof encoding === "function") encoding(); else if (typeof callback === "function") callback(); return true; }
    return originalStderr(accepted, typeof encoding === "function" ? encoding : callback);
  };
  try {
    process.exit = (code = 0) => { throw new ControlledExit(normalizedExitCode(code)); };
    process.once("unhandledRejection", captureRejection);
    process.once("uncaughtException", captureException);
    process.once("beforeExit", captureBeforeExit);
    const registration = (await store.inspect({ taskId, runId })).registration;
    if (!registration || registration.pid !== process.pid || state.authorization.pid !== registration.pid || state.authorization.processIdentity !== registration.processIdentity) throw new Error("TASK_RUN_AUTHORIZATION_IDENTITY_MISMATCH");
    process.chdir(state.spec.cwd);
    const local = fileURLToPath(new URL("..", import.meta.url));
    const root = await resolveAppRoot(local);
    process.argv.splice(0, process.argv.length, process.execPath, resolve(root, "bin", "coco"), "--mode", "json", "--no-approve", state.spec.prompt);
    const bootstrap = await import(pathToFileURL(resolve(root, "scripts", "coco-bootstrap.cjs")).href);
    if (bootstrap.default && typeof bootstrap.default.then === "function") await bootstrap.default;
    exitCode = typeof process.exitCode === "number" && process.exitCode !== 0 ? normalizedExitCode(process.exitCode) : await exitRequested;
  } catch (error) {
    if (error instanceof ControlledExit) exitCode = normalizedExitCode(error.code);
    else { process.stderr.write(`coco: ${typeof error?.code === "string" ? error.code : "TASK_RUN_EXECUTION_FAILED"}\n`); exitCode = 1; }
  }
  process.removeListener("unhandledRejection", captureRejection);
  process.removeListener("uncaughtException", captureException);
  process.removeListener("beforeExit", captureBeforeExit);
  process.exit = originalExit;
  await store.writeOutcome({ endedAt: new Date().toISOString(), exitCode, generation, ownerId, pid: process.pid, processIdentity: registered.processIdentity, runId, specSha256: state.specSha256, startedAt, stderrTruncated, stdoutTruncated, taskId });
  process.exitCode = exitCode;
  // Keep the process-group leader alive until the runner performs the durable
  // containment handoff. This makes the unsupported process-group fallback real.
  for (;;) {
    const completed = await store.inspect({ taskId, runId });
    if (completed.containment?.status === "cleaned" || (completed.outcome && completed.containment?.status === "unsupported") || completed.revocation) break;
    await new Promise((done) => setTimeout(done, 25));
  }
}
