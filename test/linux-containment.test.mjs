import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, constants, mkdir, mkdtemp, readFile, rename, rmdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLinuxContainment, linuxContainmentDescriptor, resolveLinuxContainmentRoot } from "../scripts/linux-containment.mjs";
import { processAlive, processIdentity } from "../scripts/task-process.mjs";
import { createTaskRunSupervisorStore } from "../scripts/task-run-supervisor.mjs";
import { cancelTask, createTaskRunner } from "../scripts/task-runner.mjs";
import { createTaskEventStore } from "../scripts/task-events.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

const taskId = "containment1";
const runId = "018f47a0-7b20-7cc5-8a33-111111111111";

test("containment identifiers bind run owner generation and reject stale owners", async () => {
  const first = linuxContainmentDescriptor({ generation: 1, ownerId: "owner-one", runId, taskId });
  const second = linuxContainmentDescriptor({ generation: 2, ownerId: "owner-two", runId, taskId });
  assert.match(first.identifier, /^coco-run-[a-f0-9]{32}$/);
  assert.notEqual(first.identifier, second.identifier);
  assert.equal(first.ownerGeneration, 1); assert.equal(first.ownerId, "owner-one");
  const root = await mkdtemp(join(tmpdir(), "coco-cgroup-id-"));
  try {
    const containment = createLinuxContainment({ root });
    const invalid = await containment.terminate({ ...first, identifier: "../escape" });
    assert.equal(invalid.status, "degraded"); assert.equal(invalid.reason, "CGROUP_IDENTIFIER_INVALID");
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("production cgroup root follows the unified delegated membership subtree", () => {
  assert.equal(resolveLinuxContainmentRoot({ membership: "0::/user.slice/user-1000.slice/session-7.scope\n", mount: "/sys/fs/cgroup" }), "/sys/fs/cgroup/user.slice/user-1000.slice/session-7.scope");
  assert.throws(() => resolveLinuxContainmentRoot({ membership: "1:name=legacy:/legacy\n", mount: "/sys/fs/cgroup" }), /CGROUP_DELEGATION_UNAVAILABLE/);
});

test("missing cgroup v2 delegation is stable unsupported and never full termination", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-cgroup-unsupported-"));
  const descriptor = linuxContainmentDescriptor({ generation: 1, ownerId: "owner", runId, taskId });
  try {
    await writeFile(join(root, "cgroup.controllers"), "");
    const containment = createLinuxContainment({ root });
    const attached = await containment.attach(descriptor, process.pid, async () => true);
    assert.equal(attached.status, "unsupported"); assert.equal(attached.reason, "CGROUP_DELEGATION_UNAVAILABLE");
    const result = await containment.terminate(attached);
    assert.equal(result.status, "unsupported"); assert.notEqual(result.status, "terminated");
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("containment rejects a symlinked per-run directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-cgroup-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "coco-cgroup-outside-"));
  const descriptor = linuxContainmentDescriptor({ generation: 1, ownerId: "owner", runId, taskId });
  try {
    await writeFile(join(root, "cgroup.controllers"), "cpu");
    await symlink(outside, join(root, descriptor.identifier));
    const attached = await createLinuxContainment({ root }).attach(descriptor, process.pid, async () => true);
    assert.equal(attached.status, "degraded");
    await assert.rejects(access(join(outside, "cgroup.procs"), constants.F_OK));
  } finally { await rm(root, { force: true, recursive: true }); await rm(outside, { force: true, recursive: true }); }
});

test("attach rejects PID identity change across the cgroup move", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-cgroup-pid-reuse-"));
  const descriptor = linuxContainmentDescriptor({ generation: 1, ownerId: "owner", runId, taskId });
  let checks = 0;
  try {
    await writeFile(join(root, "cgroup.controllers"), "cpu");
    const group = join(root, descriptor.identifier);
    await mkdir(group);
    await writeFile(join(group, "cgroup.procs"), "");
    const attached = await createLinuxContainment({ root }).attach(descriptor, 42, async () => ++checks === 1);
    assert.equal(checks, 2); assert.equal(attached.status, "degraded"); assert.equal(attached.reason, "CGROUP_PROCESS_IDENTITY_MISMATCH");
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("persisted cgroup inode prevents same-name replacement after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-cgroup-replaced-"));
  const descriptor = linuxContainmentDescriptor({ generation: 1, ownerId: "owner", runId, taskId });
  const group = join(root, descriptor.identifier);
  try {
    await writeFile(join(root, "cgroup.controllers"), "cpu"); await mkdir(group);
    for (const name of ["cgroup.procs", "cgroup.kill"]) await writeFile(join(group, name), "");
    const active = await createLinuxContainment({ root }).attach(descriptor, 42, async () => true);
    assert.equal(active.status, "active");
    await rename(group, `${group}-old`); await mkdir(group);
    for (const name of ["cgroup.procs", "cgroup.kill"]) await writeFile(join(group, name), "");
    const result = await createLinuxContainment({ root }).terminate(active);
    assert.equal(result.status, "degraded"); assert.equal(result.reason, "CGROUP_PATH_REPLACED");
    assert.equal(await readFile(join(group, "cgroup.kill"), "utf8"), "");
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("supervisor persists attach-before-authorization containment and resolves it after restart", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-containment-restart-"));
  const calls = [];
  const fixture = {
    attach: async (descriptor, pid, matches) => { calls.push("attach"); assert.equal(await matches(pid), true); return { ...descriptor, status: "active" }; },
    terminate: async (descriptor) => { calls.push("kill"); return { descriptor: { ...descriptor, status: "cleaned" }, status: "terminated" }; },
  };
  let child;
  try {
    let store = createTaskRunSupervisorStore({ agentDir, containment: fixture });
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "restart", runId, taskId });
    child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
    const identity = await processIdentity(child.pid);
    await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, runId, taskId });
    await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, runId, specSha256: prepared.specSha256, taskId });
    assert.deepEqual(calls, ["attach"]);
    const identifier = (await store.inspect({ runId, taskId })).containment.identifier;
    store = createTaskRunSupervisorStore({ agentDir, containment: fixture });
    const recovered = await store.inspect({ runId, taskId });
    assert.equal(recovered.containment.identifier, identifier);
    assert.equal(recovered.containment.ownerGeneration, prepared.generation); assert.equal(recovered.containment.status, "active");
    const killed = await store.terminateContainment({ generation: recovered.generation, ownerId: recovered.owner.ownerId, runId, taskId });
    assert.equal(killed.status, "terminated"); assert.equal((await store.inspect({ runId, taskId })).containment.status, "cleaned");
    await assert.rejects(store.terminateContainment({ generation: recovered.generation + 1, ownerId: recovered.owner.ownerId, runId, taskId }), /TASK_RUN_STALE_GENERATION/);
  } finally {
    if (child?.pid && await processAlive(child.pid)) try { process.kill(child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { force: true, recursive: true });
  }
});

test("cleanup-pending containment is durable and retryable after store restart", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-containment-cleanup-"));
  let attempts = 0;
  const fixture = {
    attach: async (descriptor) => ({ ...descriptor, status: "active" }),
    terminate: async (descriptor) => ++attempts === 1
      ? { descriptor: { ...descriptor, reason: "CGROUP_CLEANUP_PENDING", status: "cleanup-pending" }, status: "terminated" }
      : { descriptor: { ...descriptor, reason: null, status: "cleaned" }, status: "terminated" },
  };
  try {
    let store = createTaskRunSupervisorStore({ agentDir, containment: fixture });
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "cleanup", runId, taskId });
    let result = await store.terminateContainment({ generation: prepared.generation, ownerId: prepared.ownerId, runId, taskId });
    assert.equal(result.status, "terminated"); assert.equal(result.containment.status, "cleanup-pending");
    store = createTaskRunSupervisorStore({ agentDir, containment: fixture });
    result = await store.terminateContainment({ generation: prepared.generation, ownerId: prepared.ownerId, runId, taskId });
    assert.equal(result.containment.status, "cleaned"); assert.equal(attempts, 2);
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("cancel retains cleanup-pending tracking until a later retry cleans containment", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-containment-cancel-retry-"));
  const taskStore = createTaskStore({ agentDir }); let attempts = 0;
  const containment = {
    attach: async (descriptor) => ({ ...descriptor, status: "active" }),
    terminate: async (descriptor) => {
      attempts += 1;
      return attempts === 1
        ? { descriptor: { ...descriptor, reason: "CGROUP_CLEANUP_PENDING", status: "cleanup-pending" }, reason: null, status: "terminated" }
        : { descriptor: { ...descriptor, cleanedAt: new Date().toISOString(), status: "cleaned" }, reason: null, status: "terminated" };
    },
  };
  const supervisors = createTaskRunSupervisorStore({ agentDir, containment });
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  try {
    const task = await taskStore.create({ cwd: process.cwd(), prompt: "cancel retry", worktree: false });
    const activeRunId = "018f47a0-7b20-7cc5-8a33-161616161616";
    await taskStore.update((state) => { Object.assign(state.tasks[0], { activeRunId, startedAt: "2026-08-17T00:00:00.000Z", status: "running" }); return state; });
    await createTaskEventStore({ agentDir }).append({ at: "2026-08-17T00:00:00.000Z", eventId: "018f47a0-7b20-7cc5-8a33-171717171717", runId: activeRunId, taskId: task.id, type: "run.started" });
    const prepared = await supervisors.prepare({ cwd: process.cwd(), prompt: "cancel retry", runId: activeRunId, taskId: task.id });
    const identity = await processIdentity(child.pid);
    await supervisors.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, runId: activeRunId, taskId: task.id });
    await supervisors.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, runId: activeRunId, specSha256: prepared.specSha256, taskId: task.id });
    await taskStore.update((state) => { Object.assign(state.tasks[0], { pid: child.pid, processIdentity: identity }); return state; });
    await assert.rejects(cancelTask(taskStore, task.id, { supervisorStore: supervisors }), /TASK_CONTAINMENT_DEGRADED/);
    const retained = (await taskStore.load()).tasks[0];
    assert.equal(retained.status, "running"); assert.equal(retained.cancelPending, true); assert.equal(retained.activeRunId, activeRunId);
    const cancelled = await cancelTask(taskStore, task.id, { supervisorStore: supervisors });
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.activeRunId, null); assert.equal(attempts, 2);
  } finally {
    if (await processAlive(child.pid)) try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { force: true, recursive: true });
  }
});

test("cancel during registration falls back to the verified process group", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-containment-cancel-registration-"));
  const taskStore = createTaskStore({ agentDir });
  const containment = {
    attach: async (descriptor) => ({ ...descriptor, status: "active" }),
    terminate: async (descriptor) => ({ descriptor: { ...descriptor, cleanedAt: new Date().toISOString(), status: "cleaned" }, reason: null, status: "terminated" }),
  };
  const supervisors = createTaskRunSupervisorStore({ agentDir, containment });
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  try {
    const task = await taskStore.create({ cwd: process.cwd(), prompt: "cancel registration", worktree: false });
    const activeRunId = "018f47a0-7b20-7cc5-8a33-181818181818";
    await taskStore.update((state) => { Object.assign(state.tasks[0], { activeRunId, pid: child.pid, processIdentity: null, startedAt: new Date().toISOString(), status: "running" }); return state; });
    const prepared = await supervisors.prepare({ cwd: process.cwd(), prompt: "cancel registration", runId: activeRunId, taskId: task.id });
    const identity = await processIdentity(child.pid);
    await supervisors.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, runId: activeRunId, taskId: task.id });
    await taskStore.update((state) => { state.tasks[0].processIdentity = identity; return state; });
    const cancelled = await cancelTask(taskStore, task.id, { supervisorStore: supervisors });
    assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.activeRunId, null); assert.equal(await processAlive(child.pid), false);
  } finally {
    if (await processAlive(child.pid)) try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { force: true, recursive: true });
  }
});

test("degraded outcome cleanup cannot publish terminal evidence or lose tracking", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-containment-outcome-degraded-"));
  const taskStore = createTaskStore({ agentDir });
  let recovered = false;
  const containment = {
    attach: async (descriptor) => ({ ...descriptor, status: "active" }),
    terminate: async (descriptor) => recovered
      ? ({ descriptor: { ...descriptor, cleanedAt: new Date().toISOString(), reason: null, status: "cleaned" }, reason: null, status: "terminated" })
      : ({ descriptor: { ...descriptor, reason: "CGROUP_NOT_EMPTY", status: "degraded" }, reason: "CGROUP_NOT_EMPTY", status: "degraded" }),
  };
  const supervisors = createTaskRunSupervisorStore({ agentDir, containment });
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  try {
    const task = await taskStore.create({ cwd: process.cwd(), prompt: "containment outcome", worktree: false });
    const activeRunId = "018f47a0-7b20-7cc5-8a33-121212121212";
    await taskStore.update((state) => { Object.assign(state.tasks[0], { activeRunId, startedAt: "2026-08-17T00:00:00.000Z", status: "running" }); return state; });
    await createTaskEventStore({ agentDir }).append({ at: "2026-08-17T00:00:00.000Z", eventId: "018f47a0-7b20-7cc5-8a33-141414141414", runId: activeRunId, taskId: task.id, type: "run.started" });
    const prepared = await supervisors.prepare({ cwd: process.cwd(), prompt: "containment outcome", runId: activeRunId, taskId: task.id });
    const identity = await processIdentity(child.pid);
    await supervisors.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, runId: activeRunId, taskId: task.id });
    await supervisors.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, runId: activeRunId, specSha256: prepared.specSha256, taskId: task.id });
    await supervisors.writeOutcome({ endedAt: "2026-08-17T00:00:01.000Z", exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, runId: activeRunId, specSha256: prepared.specSha256, startedAt: "2026-08-17T00:00:00.000Z", taskId: task.id });
    const runner = createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, supervisorStore: supervisors });
    await assert.rejects(runner.run({ once: true }), /TASK_CONTAINMENT_DEGRADED/);
    const retained = (await taskStore.load()).tasks[0];
    assert.equal(retained.status, "running"); assert.equal(retained.activeRunId, activeRunId); assert.equal(retained.terminalEvidence, null);
    recovered = true;
    const handoff = await cancelTask(taskStore, task.id, { supervisorStore: supervisors });
    assert.equal(handoff.status, "running"); assert.equal(handoff.activeRunId, activeRunId);
    await runner.run({ once: true });
    const completed = (await taskStore.load()).tasks[0];
    assert.equal(completed.status, "completed"); assert.equal(completed.activeRunId, null);
  } finally {
    if (await processAlive(child.pid)) try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { force: true, recursive: true });
  }
});

test("unsupported containment converts a successful outcome to an explicit failed terminal result", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-containment-outcome-unsupported-"));
  const taskStore = createTaskStore({ agentDir });
  const containment = {
    attach: async (descriptor) => ({ ...descriptor, reason: "CGROUP_DELEGATION_UNAVAILABLE", status: "unsupported" }),
    terminate: async (descriptor) => ({ descriptor, reason: "CGROUP_DELEGATION_UNAVAILABLE", status: "unsupported" }),
  };
  const supervisors = createTaskRunSupervisorStore({ agentDir, containment });
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  try {
    const task = await taskStore.create({ cwd: process.cwd(), prompt: "unsupported outcome", worktree: false });
    const activeRunId = "018f47a0-7b20-7cc5-8a33-131313131313";
    await taskStore.update((state) => { Object.assign(state.tasks[0], { activeRunId, startedAt: "2026-08-17T00:00:00.000Z", status: "running" }); return state; });
    await createTaskEventStore({ agentDir }).append({ at: "2026-08-17T00:00:00.000Z", eventId: "018f47a0-7b20-7cc5-8a33-151515151515", runId: activeRunId, taskId: task.id, type: "run.started" });
    const prepared = await supervisors.prepare({ cwd: process.cwd(), prompt: "unsupported outcome", runId: activeRunId, taskId: task.id });
    const identity = await processIdentity(child.pid);
    await supervisors.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, runId: activeRunId, taskId: task.id });
    await supervisors.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, runId: activeRunId, specSha256: prepared.specSha256, taskId: task.id });
    await supervisors.writeOutcome({ endedAt: "2026-08-17T00:00:01.000Z", exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, runId: activeRunId, specSha256: prepared.specSha256, startedAt: "2026-08-17T00:00:00.000Z", taskId: task.id });
    await createTaskRunner({ agentDir, root: new URL("..", import.meta.url).pathname, supervisorStore: supervisors }).run({ once: true });
    const failed = (await taskStore.load()).tasks[0];
    assert.equal(failed.status, "failed"); assert.equal(failed.lastError, "TASK_CONTAINMENT_UNSUPPORTED"); assert.equal(failed.activeRunId, null);
  } finally {
    if (await processAlive(child.pid)) try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch {}
    await rm(agentDir, { force: true, recursive: true });
  }
});

async function delegated() {
  if (process.platform !== "linux") return false;
  let root; try { root = resolveLinuxContainmentRoot(); } catch { return false; }
  const probe = join(root, `coco-run-${"f".repeat(32)}`);
  try { await mkdir(probe); await writeFile(join(probe, "cgroup.kill"), "1"); await rmdir(probe); return true; }
  catch { try { await rmdir(probe); } catch {} return false; }
}

test("real cgroup contains detached setsid double-fork descendants after leader death", { skip: !await delegated(), timeout: 20_000 }, async () => {
  const descriptor = linuxContainmentDescriptor({ generation: 1, ownerId: "real-owner", runId, taskId });
  const containment = createLinuxContainment();
  const fixture = await mkdtemp(join(tmpdir(), "coco-containment-real-"));
  const pidsPath = join(fixture, "pids"), readyPath = join(fixture, "ready");
  const sleeper = "setInterval(()=>{},1000)";
  const fork = `const{spawn}=require('node:child_process'),fs=require('node:fs');const c=spawn(process.execPath,['-e',${JSON.stringify(sleeper)}],{detached:true,stdio:'ignore'});fs.appendFileSync(${JSON.stringify(pidsPath)},' '+c.pid);c.unref();process.exit(0)`;
  const program = `
    const {spawn}=require('node:child_process'),fs=require('node:fs');
    process.on('SIGUSR1',()=>{
      const detached=spawn(process.execPath,['-e',${JSON.stringify(sleeper)}],{detached:true,stdio:'ignore'}); detached.unref();
      const doubleFork=spawn(process.execPath,['-e',${JSON.stringify(fork)}],{stdio:'ignore'});
      fs.writeFileSync(${JSON.stringify(pidsPath)},String(detached.pid)+' '+doubleFork.pid); setTimeout(()=>process.exit(0),100);
    }); fs.writeFileSync(${JSON.stringify(readyPath)},'ready'); setInterval(()=>{},1000);
  `;
  const leader = spawn(process.execPath, ["-e", program], { detached: true, stdio: "ignore" });
  const leaderClosed = new Promise((done) => leader.once("close", done));
  try {
    const identity = await processIdentity(leader.pid);
    const active = await containment.attach(descriptor, leader.pid, async (pid) => await processIdentity(pid) === identity);
    assert.equal(active.status, "active");
    for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await readFile(readyPath, "utf8")) === "ready") break; } catch {} await new Promise((done) => setTimeout(done, 20)); }
    process.kill(leader.pid, "SIGUSR1");
    for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await readFile(pidsPath, "utf8")).trim().split(/\s+/).length >= 3) break; } catch {} await new Promise((done) => setTimeout(done, 20)); }
    await leaderClosed;
    const descendants = (await readFile(pidsPath, "utf8")).trim().split(/\s+/).map(Number);
    assert.ok(descendants.length >= 3); assert.ok(descendants.some((pid) => pid > 0 && pid !== leader.pid));
    const result = await containment.terminate(active); assert.equal(result.status, "terminated");
    for (let attempt = 0; attempt < 100 && (await Promise.all(descendants.map(processAlive))).some(Boolean); attempt += 1) await new Promise((done) => setTimeout(done, 20));
    for (const pid of descendants) assert.equal(await processAlive(pid), false);
  } finally {
    try { process.kill(-leader.pid, "SIGKILL"); } catch {}
    await containment.terminate(descriptor); await rm(fixture, { force: true, recursive: true });
  }
});
