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
    const prepared = await store.prepare({ cwd: process.cwd(), prompt, runId, taskId });
    child = spawn(process.execPath, [join(new URL("..", import.meta.url).pathname, "scripts", "task-run-supervisor-main.mjs"), "--task-id", taskId, "--run-id", runId, "--generation", String(prepared.generation), "--owner-id", prepared.ownerId], { detached: process.platform !== "win32", env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: "ignore" });
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
    await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, taskId, runId });
    await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 });
    const startedAt = "2026-08-15T00:00:00.000Z", endedAt = "2026-08-15T00:00:01.000Z";
    const outcome = await store.writeOutcome({ endedAt, exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, runId, specSha256: prepared.specSha256, startedAt, taskId });
    assert.deepEqual((await store.inspect({ taskId, runId })).outcome, outcome);
    await assert.rejects(store.writeOutcome({ endedAt, exitCode: 1, generation: prepared.generation, ownerId: prepared.ownerId, runId, specSha256: prepared.specSha256, startedAt, taskId }), /TASK_RUN_OUTCOME_CONFLICT/);
  } finally {
    if (child?.pid) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("every successful durable transition is idempotent after response loss", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-replay-"));
  const store = createTaskRunSupervisorStore({ agentDir });
  try {
    const taskId = "replaytask01", runId = "00000000-0000-4000-8000-000000000001";
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "replay", taskId, runId });
    const registered = await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId });
    assert.deepEqual(await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: registered.pid, processIdentity: registered.processIdentity, taskId, runId }), registered);
    const authorized = await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 });
    assert.deepEqual(await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 }), authorized);
    const outcomeInput = { endedAt: "2026-08-17T00:00:01.000Z", exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, pid: registered.pid, processIdentity: registered.processIdentity, runId, specSha256: prepared.specSha256, startedAt: "2026-08-17T00:00:00.000Z", taskId };
    const outcome = await store.writeOutcome(outcomeInput);
    assert.deepEqual(await store.writeOutcome(outcomeInput), outcome);

    const revokedRunId = "00000000-0000-4000-8000-000000000002";
    const revokedPrepared = await store.prepare({ cwd: process.cwd(), prompt: "revoke replay", taskId: "replaytask02", runId: revokedRunId });
    const revoked = await store.revoke({ generation: revokedPrepared.generation, ownerId: revokedPrepared.ownerId, taskId: "replaytask02", runId: revokedRunId, specSha256: revokedPrepared.specSha256 });
    assert.deepEqual(await store.revoke({ generation: revokedPrepared.generation, ownerId: revokedPrepared.ownerId, taskId: "replaytask02", runId: revokedRunId, specSha256: revokedPrepared.specSha256 }), revoked);

    const abandonedRunId = "00000000-0000-4000-8000-000000000003";
    const abandonedPrepared = await store.prepare({ cwd: process.cwd(), prompt: "abandon replay", taskId: "replaytask03", runId: abandonedRunId });
    const abandoned = await store.abandon({ generation: abandonedPrepared.generation, ownerId: abandonedPrepared.ownerId, taskId: "replaytask03", runId: abandonedRunId, specSha256: abandonedPrepared.specSha256 });
    assert.equal(await store.abandon({ generation: abandonedPrepared.generation, ownerId: abandonedPrepared.ownerId, taskId: "replaytask03", runId: abandonedRunId, specSha256: abandonedPrepared.specSha256 }), abandoned);
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("concurrent registrations elect one authorization identity", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-election-"));
  const store = createTaskRunSupervisorStore({ agentDir }); const children = [];
  try {
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "bounded", runId, taskId });
    for (let index = 0; index < 2; index += 1) children.push(spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" }));
    const identities = await Promise.all(children.map(({ pid }) => processIdentity(pid))); assert.ok(identities.every(Boolean));
    const attempts = await Promise.allSettled(children.map((child, index) => store.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identities[index], taskId, runId })));
    assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(attempts.filter(({ reason, status }) => status === "rejected" && reason?.code === "TASK_RUN_REGISTRATION_CONFLICT").length, 1);
    const authorization = await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 });
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
    const identity = await processIdentity(child.pid); await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, taskId, runId }); await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 });
    const results = await Promise.allSettled([
      store.writeOutcome({ endedAt: "2026-08-15T00:00:01.000Z", exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, runId, specSha256: prepared.specSha256, startedAt: "2026-08-15T00:00:00.000Z", taskId }),
      store.revoke({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 }),
    ]);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    const terminal = await createTaskRunSupervisorStore({ agentDir }).inspect({ taskId, runId });
    assert.equal(Number(terminal.outcome !== null) + Number(terminal.revocation !== null), 1);
    assert.ok(["outcome", "revoked"].includes(terminal.phase));
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
    child = spawn(process.execPath, [join(new URL("..", import.meta.url).pathname, "scripts", "task-run-supervisor-main.mjs"), "--task-id", taskId, "--run-id", runId, "--generation", String(prepared.generation), "--owner-id", prepared.ownerId], { detached: process.platform !== "win32", env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", stdout.fd, stderr.fd] });
    await stdout.close(); await stderr.close();
    const closed = new Promise((done) => child.once("close", done));
    let state;
    for (let attempt = 0; attempt < 500; attempt += 1) { state = await store.inspect({ taskId, runId }); if (state.registration) break; await new Promise((done) => setTimeout(done, 10)); }
    assert.ok(state.registration);
    if (process.platform === "linux") assert.doesNotMatch(await readFile(`/proc/${child.pid}/cmdline`, "utf8"), /--version/);
    await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 });
    for (let attempt = 0; attempt < 3000; attempt += 1) { state = await store.inspect({ taskId, runId }); if (state.outcome) break; await new Promise((done) => setTimeout(done, 10)); }
    assert.ok(state.outcome, await readFile(prepared.paths.stderr, "utf8")); assert.ok([0, 1, 2].includes(state.outcome.exitCode));
    const terminated = await store.terminateContainment({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId });
    if (terminated.status !== "terminated" || terminated.containment?.status !== "cleaned") await terminateProcessTree(child.pid, { graceMs: 50, identity: state.registration.processIdentity });
    await closed;
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

test("launch FSM persists every pre-terminal phase across store restarts", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-phases-")); let child;
  try {
    let store = createTaskRunSupervisorStore({ agentDir });
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "phase recovery", runId, taskId });
    assert.equal((await createTaskRunSupervisorStore({ agentDir }).inspect({ taskId, runId })).phase, "prepared");
    child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
    const identity = await processIdentity(child.pid); assert.ok(identity);
    await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, taskId, runId });
    store = createTaskRunSupervisorStore({ agentDir });
    assert.equal((await store.inspect({ taskId, runId })).phase, "registered");
    await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 });
    assert.equal((await createTaskRunSupervisorStore({ agentDir }).inspect({ taskId, runId })).phase, "authorized");
    await store.writeOutcome({ endedAt: "2026-08-15T00:00:01.000Z", exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, runId, specSha256: prepared.specSha256, startedAt: "2026-08-15T00:00:00.000Z", taskId });
    assert.equal((await createTaskRunSupervisorStore({ agentDir }).inspect({ taskId, runId })).phase, "outcome");
  } finally {
    if (child?.pid) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("expired launch lease has one CAS takeover and rejects the old owner", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-takeover-"));
  let clock = new Date("2026-08-15T00:00:00.000Z");
  try {
    const store = createTaskRunSupervisorStore({ agentDir, leaseMs: 10, now: () => clock });
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "take over", runId, taskId });
    clock = new Date("2026-08-15T00:00:01.000Z");
    const attempts = await Promise.allSettled([
      store.takeover({ expectedGeneration: prepared.generation, taskId, runId }),
      store.takeover({ expectedGeneration: prepared.generation, taskId, runId }),
    ]);
    assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(attempts.filter(({ reason, status }) => status === "rejected" && reason?.code === "TASK_RUN_TAKEOVER_CAS_FAILED").length, 1);
    const winner = attempts.find(({ status }) => status === "fulfilled").value;
    await assert.rejects(store.abandon({ generation: prepared.generation, ownerId: prepared.ownerId, runId, specSha256: prepared.specSha256, taskId }), /TASK_RUN_STALE_GENERATION/);
    await store.abandon({ ...winner, runId, specSha256: prepared.specSha256, taskId });
    const abandoned = await createTaskRunSupervisorStore({ agentDir }).inspect({ taskId, runId });
    assert.equal(abandoned.phase, "abandoned"); assert.ok(abandoned.abandonedAt);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("authorization, outcome, and revocation serialize to one terminal decision", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-three-way-")); let child;
  try {
    const store = createTaskRunSupervisorStore({ agentDir });
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "three way", runId, taskId });
    child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
    const processIdentityValue = await processIdentity(child.pid);
    await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: processIdentityValue, taskId, runId });
    await Promise.allSettled([
      store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 }),
      store.writeOutcome({ endedAt: "2026-08-15T00:00:01.000Z", exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, runId, specSha256: prepared.specSha256, startedAt: "2026-08-15T00:00:00.000Z", taskId }),
      store.revoke({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 }),
    ]);
    const state = await store.inspect({ taskId, runId });
    assert.equal(Number(state.outcome !== null) + Number(state.revocation !== null), 1);
    assert.ok(["outcome", "revoked"].includes(state.phase));
  } finally {
    if (child?.pid) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("legacy split supervisor state migrates on the next guarded transition", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-supervisor-legacy-")); let child;
  try {
    const store = createTaskRunSupervisorStore({ agentDir });
    const prepared = await store.prepare({ cwd: process.cwd(), prompt: "legacy split state", runId, taskId });
    child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
    const identity = await processIdentity(child.pid);
    await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, pid: child.pid, processIdentity: identity, taskId, runId });
    await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, taskId, runId, specSha256: prepared.specSha256 });
    await rm(prepared.paths.launch);
    const legacy = await createTaskRunSupervisorStore({ agentDir }).inspect({ taskId, runId });
    assert.equal(legacy.phase, "authorized"); assert.match(legacy.owner.ownerId, /^legacy-/);
    await store.writeOutcome({ endedAt: "2026-08-15T00:00:01.000Z", exitCode: 0, generation: legacy.generation, ownerId: legacy.owner.ownerId, runId, specSha256: legacy.specSha256, startedAt: "2026-08-15T00:00:00.000Z", taskId });
    const migrated = await createTaskRunSupervisorStore({ agentDir }).inspect({ taskId, runId });
    assert.equal(migrated.phase, "outcome"); assert.equal(migrated.owner.ownerId, legacy.owner.ownerId);
  } finally {
    if (child?.pid) { const identity = await processIdentity(child.pid); if (identity) await terminateProcessTree(child.pid, { graceMs: 50, identity }); }
    await rm(agentDir, { recursive: true, force: true });
  }
});

test("SIGKILL after each launch transition preserves the durable phase", { timeout: 30_000 }, async () => {
  const phases = ["prepared", "registered", "authorized", "outcome", "revoked", "abandoned"];
  const moduleUrl = new URL("../scripts/task-run-supervisor.mjs", import.meta.url).href;
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index], agentDir = await mkdtemp(join(tmpdir(), `coco-supervisor-kill-${phase}-`));
    const phaseRunId = `018f47a0-7b20-7cc5-8a33-${String(index + 20).repeat(12).slice(0, 12)}`;
    let child;
    try {
      const program = `
        import { createTaskRunSupervisorStore } from ${JSON.stringify(moduleUrl)};
        const store = createTaskRunSupervisorStore({ agentDir: process.env.AGENT_DIR });
        const prepared = await store.prepare({ cwd: process.cwd(), prompt: "kill phase", runId: process.env.RUN_ID, taskId: process.env.TASK_ID });
        if (["registered", "authorized", "outcome"].includes(process.env.PHASE)) await store.register({ generation: prepared.generation, ownerId: prepared.ownerId, runId: process.env.RUN_ID, taskId: process.env.TASK_ID });
        if (["authorized", "outcome"].includes(process.env.PHASE)) await store.authorize({ generation: prepared.generation, ownerId: prepared.ownerId, runId: process.env.RUN_ID, specSha256: prepared.specSha256, taskId: process.env.TASK_ID });
        if (process.env.PHASE === "outcome") { const startedAt = new Date().toISOString(); await store.writeOutcome({ endedAt: startedAt, exitCode: 0, generation: prepared.generation, ownerId: prepared.ownerId, pid: process.pid, processIdentity: (await store.inspect({ runId: process.env.RUN_ID, taskId: process.env.TASK_ID })).registration.processIdentity, runId: process.env.RUN_ID, specSha256: prepared.specSha256, startedAt, taskId: process.env.TASK_ID }); }
        if (process.env.PHASE === "revoked") await store.revoke({ generation: prepared.generation, ownerId: prepared.ownerId, runId: process.env.RUN_ID, specSha256: prepared.specSha256, taskId: process.env.TASK_ID });
        if (process.env.PHASE === "abandoned") await store.abandon({ generation: prepared.generation, ownerId: prepared.ownerId, runId: process.env.RUN_ID, specSha256: prepared.specSha256, taskId: process.env.TASK_ID });
        setInterval(() => {}, 1000);
      `;
      child = spawn(process.execPath, ["--input-type=module", "-e", program], { env: { ...process.env, AGENT_DIR: agentDir, PHASE: phase, RUN_ID: phaseRunId, TASK_ID: taskId }, stdio: "ignore" });
      const store = createTaskRunSupervisorStore({ agentDir }); let state;
      for (let attempt = 0; attempt < 500; attempt += 1) {
        state = await store.inspect({ taskId, runId: phaseRunId });
        if (state.phase === phase) break;
        if (child.exitCode !== null) break;
        await new Promise((done) => setTimeout(done, 10));
      }
      assert.equal(state?.phase, phase);
      process.kill(child.pid, "SIGKILL"); await new Promise((done) => child.once("close", done)); child = null;
      assert.equal((await createTaskRunSupervisorStore({ agentDir }).inspect({ taskId, runId: phaseRunId })).phase, phase);
    } finally {
      if (child?.pid) { try { process.kill(child.pid, "SIGKILL"); } catch {} }
      await rm(agentDir, { recursive: true, force: true });
    }
  }
});
