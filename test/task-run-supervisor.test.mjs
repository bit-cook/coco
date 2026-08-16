import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { processIdentity, terminateProcessTree } from "../scripts/task-process.mjs";
import { writeAll } from "../scripts/task-runner.mjs";
import { createTaskRunSupervisorStore } from "../scripts/task-run-supervisor.mjs";

const taskId = "supervisor01";
const runId = "018f47a0-7b20-7cc5-8a33-010101010101";

test("bounded pipe capture writes all bytes after short writes", async () => {
  const persisted = [];
  const handle = { write: async (bytes) => { const bytesWritten = Math.min(3, bytes.length); persisted.push(bytes.subarray(0, bytesWritten)); return { bytesWritten }; } };
  await writeAll(handle, Buffer.from("complete-output"));
  assert.equal(Buffer.concat(persisted).toString("utf8"), "complete-output");
});

test("bounded pipe capture rejects a zero-progress short write", async () => {
  await assert.rejects(writeAll({ write: async () => ({ bytesWritten: 0 }) }, Buffer.from("output")), /TASK_LOG_CAPTURE_WRITE_FAILED/);
});

test("supervisor keeps private prompt out of argv and blocks before authorization", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-gate-"));
  const store = createTaskRunSupervisorStore({ agentDir });
  const prompt = "private-prompt-sentinel";
  let child;
  try {
    await store.prepare({ cwd: process.cwd(), prompt, runId, taskId });
    child = spawn(process.execPath, [join(new URL("..", import.meta.url).pathname, "scripts", "task-run-supervisor-main.mjs"), "--task-id", taskId, "--run-id", runId], { detached: process.platform !== "win32", env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: "ignore" });
    let state;
    for (let attempt = 0; attempt < 200; attempt += 1) { state = await store.inspect({ taskId, runId }); if (state.registration) break; await new Promise((done) => setTimeout(done, 10)); }
    assert.ok(state.registration);
    if (process.platform === "linux") assert.doesNotMatch(await readFile(`/proc/${child.pid}/cmdline`, "utf8"), /private-prompt-sentinel/);
    assert.equal(state.authorization, null); assert.equal(state.outcome, null);
  } finally {
    if (child?.pid) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("supervisor outcome is canonical, durable, and conflict rejecting", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-outcome-"));
  const store = createTaskRunSupervisorStore({ agentDir });
  let child;
  try {
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "bounded", runId, taskId });
    child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
    const identity = await processIdentity(child.pid); assert.ok(identity);
    await store.register({ pid: child.pid, processIdentity: identity, taskId, runId });
    await store.authorize({ taskId, runId, specSha256: prepared.specSha256 });
    const startedAt = "2026-08-15T00:00:00.000Z", endedAt = "2026-08-15T00:00:01.000Z";
    const outcome = await store.writeOutcome({ endedAt, exitCode: 0, runId, specSha256: prepared.specSha256, startedAt, taskId });
    assert.deepEqual((await store.inspect({ taskId, runId })).outcome, outcome);
    await assert.rejects(store.writeOutcome({ endedAt, exitCode: 1, runId, specSha256: prepared.specSha256, startedAt, taskId }), /TASK_RUN_OUTCOME_CONFLICT/);
  } finally {
    if (child?.pid) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("concurrent registrations elect one authorization identity", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-election-"));
  const store = createTaskRunSupervisorStore({ agentDir }); const children = [];
  try {
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "bounded", runId, taskId });
    for (let index = 0; index < 2; index += 1) children.push(spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" }));
    const identities = await Promise.all(children.map(({ pid }) => processIdentity(pid))); assert.ok(identities.every(Boolean));
    const attempts = await Promise.allSettled(children.map((child, index) => store.register({ pid: child.pid, processIdentity: identities[index], taskId, runId })));
    assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(attempts.filter(({ reason, status }) => status === "rejected" && reason?.code === "TASK_RUN_REGISTRATION_CONFLICT").length, 1);
    const authorization = await store.authorize({ taskId, runId, specSha256: prepared.specSha256 });
    const registration = (await store.inspect({ taskId, runId })).registration;
    assert.equal(authorization.pid, registration.pid); assert.equal(authorization.processIdentity, registration.processIdentity);
  } finally {
    for (const child of children) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("outcome and revocation are mutually exclusive", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-revoke-")); const store = createTaskRunSupervisorStore({ agentDir }); let child;
  try {
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "bounded", runId, taskId });
    child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
    const identity = await processIdentity(child.pid); await store.register({ pid: child.pid, processIdentity: identity, taskId, runId }); await store.authorize({ taskId, runId, specSha256: prepared.specSha256 });
    const results = await Promise.allSettled([
      store.writeOutcome({ endedAt: "2026-08-15T00:00:01.000Z", exitCode: 0, runId, specSha256: prepared.specSha256, startedAt: "2026-08-15T00:00:00.000Z", taskId }),
      store.revoke({ taskId, runId, specSha256: prepared.specSha256 }),
    ]);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  } finally {
    if (child?.pid) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("authorized supervisor executes the real offline entry and persists outcome before exit", { timeout: 30_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-real-"));
  const store = createTaskRunSupervisorStore({ agentDir }); let child;
  try {
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "--version", runId, taskId });
    const stdout = await import("node:fs/promises").then(({ open }) => open(prepared.paths.stdout, "a", 0o600));
    const stderr = await import("node:fs/promises").then(({ open }) => open(prepared.paths.stderr, "a", 0o600));
    child = spawn(process.execPath, [join(new URL("..", import.meta.url).pathname, "scripts", "task-run-supervisor-main.mjs"), "--task-id", taskId, "--run-id", runId], { detached: process.platform !== "win32", env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", stdout.fd, stderr.fd] });
    await stdout.close(); await stderr.close();
    const closed = new Promise((done) => child.once("close", done));
    let state;
    for (let attempt = 0; attempt < 500; attempt += 1) { state = await store.inspect({ taskId, runId }); if (state.registration) break; await new Promise((done) => setTimeout(done, 10)); }
    assert.ok(state.registration);
    if (process.platform === "linux") assert.doesNotMatch(await readFile(`/proc/${child.pid}/cmdline`, "utf8"), /--version/);
    await store.authorize({ taskId, runId, specSha256: prepared.specSha256 });
    await closed;
    state = await store.inspect({ taskId, runId }); assert.ok(state.outcome, await readFile(prepared.paths.stderr, "utf8")); assert.ok([0, 1, 2].includes(state.outcome.exitCode));
    assert.ok((await readFile(prepared.paths.stdout)).length <= 4_000_000); assert.ok((await readFile(prepared.paths.stderr)).length <= 1_000_000);
  } finally {
    if (child?.pid) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("supervisor canonical reads reject replacement symlinks", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-symlink-"));
  const store = createTaskRunSupervisorStore({ agentDir });
  try {
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "bounded", runId, taskId });
    const outside = join(agentDir, "outside.json");
    await writeFile(outside, await readFile(prepared.paths.spec), { mode: 0o600 });
    await rm(prepared.paths.spec);
    await symlink(outside, prepared.paths.spec);
    await assert.rejects(store.inspect({ taskId, runId }), /TASK_RUN_SPEC_CORRUPT/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
