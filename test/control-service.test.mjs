import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { controlStatus, runControlServer, stopControl } from "../scripts/control-service.mjs";
import { statePaths } from "../scripts/state-paths.mjs";
import { createTaskEventStore } from "../scripts/task-events.mjs";
import { createTaskLogStore } from "../scripts/task-logs.mjs";
import { processIdentity } from "../scripts/task-process.mjs";
import { createTaskReceiptStore } from "../scripts/task-receipts.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

const root = new URL("..", import.meta.url).pathname;

test("control plane authenticates task projections", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-"));
  const controller = new AbortController();
  const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
  let state;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { state = JSON.parse(await readFile(statePaths(agentDir).control)); break; } catch { await new Promise((done) => setTimeout(done, 10)); }
    }
    assert.ok(state);
    const base = `http://127.0.0.1:${state.port}`;
    assert.equal((await fetch(`${base}/v1/tasks`)).status, 401);
    const response = await fetch(`${base}/v1/tasks`, { headers: { authorization: `Bearer ${state.token}` } });
    assert.equal(response.status, 200);
    assert.equal((await fetch(`${base}/v1/tasks`, { headers: { authorization: `bearer ${state.token}` } })).status, 200);
    for (const authorization of [state.token, `Bearer  ${state.token}`, `Bearer\t${state.token}`]) assert.equal((await fetch(`${base}/v1/tasks`, { headers: { authorization } })).status, 401);
    assert.deepEqual(await response.json(), { tasks: [] });
    assert.equal((await fetch(base)).status, 200);
    controller.abort();
    await running;
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("control task and agent DTOs expose only allowlisted fields", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-dto-"));
  const controller = new AbortController();
  try {
    const store = createTaskStore({ agentDir });
    const created = await store.create({ cwd: process.cwd(), prompt: "private prompt", worktree: false });
    const identity = await processIdentity(process.pid);
    await store.update((state) => {
      const task = state.tasks.find(({ id }) => id === created.id);
      task.activeRunId = "018f47a0-7b20-7cc5-8a33-111111111111"; task.lastError = "/private/path"; task.pid = process.pid;
      task.processIdentity = identity; task.result = "private result"; task.status = "running"; task.worktreePath = "/private/worktree";
      return state;
    });
    const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
    let control;
    for (let attempt = 0; attempt < 100; attempt += 1) { try { control = JSON.parse(await readFile(statePaths(agentDir).control)); break; } catch { await new Promise((done) => setTimeout(done, 10)); } }
    const headers = { authorization: `Bearer ${control.token}` }; const base = `http://127.0.0.1:${control.port}`;
    const tasks = await (await fetch(`${base}/v1/tasks`, { headers })).json();
    assert.deepEqual(Object.keys(tasks.tasks[0]).sort(), ["activeRunId", "attempts", "branch", "createdAt", "finishedAt", "github", "heartbeatAt", "id", "logsTruncated", "schedule", "startedAt", "status", "trigger", "updatedAt", "worktree"].sort());
    const agents = await (await fetch(`${base}/v1/agents`, { headers })).json();
    assert.deepEqual(Object.keys(agents.agents[0]).sort(), ["activeRunId", "alive", "heartbeatAt", "id", "observedAt", "startedAt", "status", "trigger", "updatedAt"].sort());
    assert.equal(agents.agents[0].alive, true); assert.ok(!Number.isNaN(Date.parse(agents.agents[0].observedAt)));
    for (const value of [tasks.tasks[0], agents.agents[0]]) for (const field of ["cwd", "lastError", "outbox", "pid", "processIdentity", "prompt", "result", "terminalEvidence", "worktreePath"]) assert.equal(field in value, false);
    const detail = await (await fetch(`${base}/v1/tasks/${created.id}`, { headers })).json();
    assert.equal(detail.task.prompt, "private prompt"); assert.equal(detail.task.cwd, process.cwd()); assert.equal(detail.task.result, "private result"); assert.equal(detail.task.lastError, "/private/path");
    for (const field of ["pid", "processIdentity", "provisioning", "terminalEvidence", "webhookSecret", "worktreePath"]) assert.equal(field in detail.task, false);
    controller.abort(); await running;
  } finally { controller.abort(); await rm(agentDir, { recursive: true, force: true }); }
});

test("concurrent control starts publish only one port-zero owner", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-owner-"));
  const controllers = [new AbortController(), new AbortController()];
  try {
    const starts = controllers.map(({ signal }) => runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal }));
    const rejection = await Promise.any(starts.map((start) => start.then(() => Promise.reject(new Error("CONTROL_STOPPED")), (error) => error)));
    assert.match(rejection.message, /CONTROL_ALREADY_RUNNING/);
    const control = JSON.parse(await readFile(statePaths(agentDir).control)); assert.ok(control.port > 0); assert.equal(typeof control.ownerId, "string");
    controllers.forEach((controller) => controller.abort());
    const settled = await Promise.allSettled(starts); assert.deepEqual(settled.map(({ status }) => status).sort(), ["fulfilled", "rejected"]);
  } finally { controllers.forEach((controller) => controller.abort()); await rm(agentDir, { recursive: true, force: true }); }
});

test("control HTTP errors use stable allowlisted codes", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-errors-")); const controller = new AbortController();
  try {
    const store = createTaskStore({ agentDir }); const secret = "a".repeat(64), webhookSecret = "b".repeat(64);
    const task = await store.create({ cwd: process.cwd(), github: { event: "push", repository: "owner/repo" }, prompt: "hook", webhookSecret: secret, worktree: false });
    const webhook = await store.create({ cwd: process.cwd(), prompt: "webhook", webhookSecret, worktree: false });
    const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
    let control; for (let attempt = 0; attempt < 100; attempt += 1) { try { control = JSON.parse(await readFile(statePaths(agentDir).control)); break; } catch { await new Promise((done) => setTimeout(done, 10)); } }
    const base = `http://127.0.0.1:${control.port}`; const malformed = Buffer.from("{not-json");
    const hook = await fetch(`${base}/v1/hooks/${task.id}`, { method: "POST", headers: { "x-github-event": "push", "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(malformed).digest("hex")}` }, body: malformed });
    assert.equal(hook.status, 400); assert.deepEqual(await hook.json(), { error: "WEBHOOK_PAYLOAD_INVALID" });
    assert.equal((await fetch(`${base}/v1/hooks/${task.id}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: malformed })).status, 401);
    assert.equal((await fetch(`${base}/v1/hooks/${task.id}`, { method: "POST", headers: { authorization: secret }, body: malformed })).status, 401);
    const bearerHook = await fetch(`${base}/v1/hooks/${webhook.id}`, { method: "POST", headers: { authorization: `bEaReR ${webhookSecret}` }, body: malformed });
    assert.equal(bearerHook.status, 400); assert.deepEqual(await bearerHook.json(), { error: "WEBHOOK_PAYLOAD_INVALID" });
    assert.equal((await fetch(`${base}/v1/hooks/${webhook.id}`, { method: "POST", headers: { authorization: webhookSecret }, body: malformed })).status, 401);
    assert.equal((await fetch(`${base}/v1/hooks/${webhook.id}`, { method: "POST", headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", webhookSecret).update(malformed).digest("hex")}` }, body: malformed })).status, 401);
    const payload = await fetch(`${base}/v1/tasks`, { method: "POST", headers: { authorization: `Bearer ${control.token}`, "content-type": "application/json" }, body: "{" });
    assert.equal(payload.status, 400); assert.deepEqual(await payload.json(), { error: "REQUEST_PAYLOAD_INVALID" });
    await writeFile(statePaths(agentDir).tasks, "not-json\n", { mode: 0o600 });
    const internal = await fetch(`${base}/v1/tasks`, { headers: { authorization: `Bearer ${control.token}` } });
    assert.equal(internal.status, 500); assert.deepEqual(await internal.json(), { error: "CONTROL_INTERNAL_ERROR" });
    controller.abort(); await running;
  } finally { controller.abort(); await rm(agentDir, { recursive: true, force: true }); }
});

test("control webhook does not accept or consume a delivery while its task is running", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-running-hook-")); const controller = new AbortController();
  try {
    const store = createTaskStore({ agentDir }); const secret = "c".repeat(64);
    const task = await store.create({ cwd: process.cwd(), initialStatus: "blocked", prompt: "hook", trigger: "webhook", webhookSecret: secret, worktree: false });
    await store.update((state) => { const target = state.tasks[0]; target.activeRunId = "018f47a0-7b20-7cc5-8a33-666666666666"; target.status = "running"; return state; });
    const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
    let control; for (let attempt = 0; attempt < 100; attempt += 1) { try { control = JSON.parse(await readFile(statePaths(agentDir).control)); break; } catch { await new Promise((done) => setTimeout(done, 10)); } }
    const response = await fetch(`http://127.0.0.1:${control.port}/v1/hooks/${task.id}`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "idempotency-key": "running-delivery" }, body: "{}" });
    assert.equal(response.status, 202); assert.deepEqual(await response.json(), { accepted: false, reason: "running", taskId: task.id });
    assert.deepEqual(JSON.parse(await readFile(statePaths(agentDir).webhookDeliveries, "utf8")).deliveries, []);
    controller.abort(); await running;
  } finally { controller.abort(); await rm(agentDir, { recursive: true, force: true }); }
});

test("control queue mutations reject while runner stopping without accepted stalled work", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-stopping-")); const controller = new AbortController();
  try {
    const store = createTaskStore({ agentDir }); const secret = "d".repeat(64);
    const hook = await store.create({ cwd: process.cwd(), initialStatus: "blocked", prompt: "hook", trigger: "webhook", webhookSecret: secret, worktree: false });
    const manual = await store.create({ cwd: process.cwd(), initialStatus: "blocked", prompt: "manual", worktree: false });
    const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
    let control; for (let attempt = 0; attempt < 100; attempt += 1) { try { control = JSON.parse(await readFile(statePaths(agentDir).control)); break; } catch { await new Promise((done) => setTimeout(done, 10)); } }
    await writeFile(`${statePaths(agentDir).runner}.stopping`, JSON.stringify({ operationId: "018f47a0-7b20-7cc5-8a33-080808080808", ownerIdentity: await processIdentity(process.pid), ownerPid: process.pid, phase: "stopping", predecessor: null, schemaVersion: 1, stopping: true, stoppingAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
    const base = `http://127.0.0.1:${control.port}`;
    const delivery = await fetch(`${base}/v1/hooks/${hook.id}`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "idempotency-key": "stopping-delivery" }, body: "{}" });
    assert.deepEqual(await delivery.json(), { accepted: false, reason: "runner-stopping", taskId: hook.id });
    const auth = { authorization: `Bearer ${control.token}` };
    assert.equal((await fetch(`${base}/v1/tasks`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ cwd: process.cwd(), prompt: "create race" }) })).status, 503);
    assert.equal((await fetch(`${base}/v1/tasks/${manual.id}/approve`, { method: "POST", headers: auth })).status, 503);
    assert.deepEqual((await store.load()).tasks.map(({ status }) => status), ["blocked", "blocked"]);
    assert.deepEqual(JSON.parse(await readFile(statePaths(agentDir).webhookDeliveries, "utf8")).deliveries, []);
    controller.abort(); await running;
  } finally { controller.abort(); await rm(agentDir, { recursive: true, force: true }); }
});

test("legacy control state without identity fails closed", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-legacy-"));
  try {
    await writeFile(statePaths(agentDir).control, `${JSON.stringify({ host: "::1", pid: process.pid, port: 3210, schemaVersion: 1, startedAt: new Date().toISOString(), token: "legacy" })}\n`, { mode: 0o600 });
    const status = await controlStatus(agentDir);
    assert.deepEqual(status, { reason: "identity-unavailable", status: "stale" });
    assert.deepEqual(await stopControl(agentDir), { status: "identity-unavailable" });
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("control plane replaces stale state and remains loopback-only", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-stale-")); const controller = new AbortController();
  try {
    await writeFile(statePaths(agentDir).control, `${JSON.stringify({ host: "127.0.0.1", pid: 99999999, port: 3210, processIdentity: "linux:1", schemaVersion: 1, startedAt: new Date().toISOString(), token: "stale" })}\n`, { mode: 0o600 });
    const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
    let current; for (let attempt = 0; attempt < 100; attempt += 1) { current = JSON.parse(await readFile(statePaths(agentDir).control)); if (current.pid === process.pid) break; await new Promise((done) => setTimeout(done, 10)); }
    assert.equal(current.pid, process.pid); assert.notEqual(current.token, "stale"); controller.abort(); await running;
    await assert.rejects(import("../scripts/control-service.mjs").then(({ startDetachedControl }) => startDetachedControl({ agentDir, host: "0.0.0.0", port: 0, root })), /CONTROL_LOOPBACK_REQUIRED/);
  } finally { controller.abort(); await rm(agentDir, { recursive: true, force: true }); }
});

test("control plane safely replaces identity-less legacy state", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-legacy-replace-")); const controller = new AbortController();
  try {
    await writeFile(statePaths(agentDir).control, `${JSON.stringify({ host: "127.0.0.1", pid: process.pid, port: 3210, schemaVersion: 1, startedAt: new Date().toISOString(), token: "legacy" })}\n`, { mode: 0o600 });
    const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
    let current; for (let attempt = 0; attempt < 100; attempt += 1) { current = JSON.parse(await readFile(statePaths(agentDir).control)); if (current.processIdentity) break; await new Promise((done) => setTimeout(done, 10)); }
    assert.equal(current.pid, process.pid); assert.equal(typeof current.processIdentity, "string"); assert.notEqual(current.token, "legacy");
    controller.abort(); await running;
  } finally { controller.abort(); await rm(agentDir, { recursive: true, force: true }); }
});

test("control server and its direct entry point reject non-loopback hosts", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-host-"));
  try {
    await assert.rejects(runControlServer({ agentDir, host: "0.0.0.0", port: 0, root }), /CONTROL_LOOPBACK_REQUIRED/);
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [join(root, "scripts", "control-service-main.mjs"), "--agent-dir", agentDir, "--root", root, "--host", "0.0.0.0", "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; }); child.on("close", (code) => resolve({ code, stderr }));
    });
    assert.notEqual(result.code, 0); assert.match(result.stderr, /CONTROL_LOOPBACK_REQUIRED/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("control plane exposes authenticated paginated events and logs only for the bound task", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-observe-"));
  const controller = new AbortController();
  try {
    const store = createTaskStore({ agentDir });
    const task = await store.create({ cwd: process.cwd(), prompt: "observe", worktree: false });
    const runId = "018f47a0-7b20-7cc5-8a33-222222222222";
    const events = createTaskEventStore({ agentDir }); const logs = createTaskLogStore({ agentDir });
    await events.append({ taskId: task.id, runId, type: "run.started", eventId: "018f47a0-7b20-7cc5-8a33-333333333333" });
    await events.append({ taskId: task.id, runId, type: "run.heartbeat", eventId: "018f47a0-7b20-7cc5-8a33-444444444444" });
    await logs.append({ taskId: task.id, runId, stream: "stdout", data: "hello" });
    const descriptor = await logs.describe({ taskId: task.id, runId });
    await createTaskReceiptStore({ agentDir }).write({ endedAt: "2026-08-11T12:00:01.000Z", exitCode: 0, log: { bytes: descriptor.bytes, records: descriptor.records, ref: descriptor.ref, sha256: descriptor.sha256 }, runId, startedAt: "2026-08-11T12:00:00.000Z", taskId: task.id });
    const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
    let state;
    for (let attempt = 0; attempt < 100; attempt += 1) { try { state = JSON.parse(await readFile(statePaths(agentDir).control)); break; } catch { await new Promise((done) => setTimeout(done, 10)); } }
    const base = `http://127.0.0.1:${state.port}`; const auth = { authorization: `Bearer ${state.token}` };
    assert.equal((await fetch(`${base}/v1/tasks/${task.id}/runs/${runId}/events?cursor=1&limit=1`, { headers: auth })).status, 200);
    const eventPage = await (await fetch(`${base}/v1/tasks/${task.id}/runs/${runId}/events?cursor=1&limit=1`, { headers: auth })).json();
    assert.deepEqual(eventPage.events.map(({ seq }) => seq), [2]); assert.equal(eventPage.hasMore, false);
    const logPage = await (await fetch(`${base}/v1/tasks/${task.id}/runs/${runId}/logs`, { headers: auth })).json();
    assert.deepEqual(logPage.records.map(({ data }) => data), ["hello"]);
    assert.equal((await fetch(`${base}/v1/tasks/${task.id}/runs/${runId}/events`, { headers: auth })).status, 200);
    const receipt = await (await fetch(`${base}/v1/tasks/${task.id}/runs/${runId}/receipt`, { headers: auth })).json();
    assert.equal(receipt.receipt.verdict, "passed"); assert.equal(receipt.receipt.log.records, 1);
    assert.equal((await fetch(`${base}/v1/tasks/${task.id}/runs/${runId}/receipt`)).status, 401);
    assert.equal((await fetch(`${base}/v1/tasks/${task.id}/runs/not-a-run/logs`, { headers: auth })).status, 404);
    assert.equal((await fetch(`${base}/v1/tasks/${task.id}/runs/${runId}/logs?cursor=-1`, { headers: auth })).status, 400);
    assert.equal((await fetch(`${base}/v1/tasks/${task.id}/runs/${runId}/logs`)).status, 401);
    controller.abort(); await running;
  } finally { controller.abort(); await rm(agentDir, { recursive: true, force: true }); }
});
