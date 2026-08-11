import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { controlStatus, runControlServer } from "../scripts/control-service.mjs";
import { statePaths } from "../scripts/state-paths.mjs";
import { createTaskEventStore } from "../scripts/task-events.mjs";
import { createTaskLogStore } from "../scripts/task-logs.mjs";
import { createTaskReceiptStore } from "../scripts/task-receipts.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

const root = new URL("..", import.meta.url).pathname;

test("control plane authenticates task projections", async () => {
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
    assert.deepEqual(await response.json(), { tasks: [] });
    assert.equal((await fetch(base)).status, 200);
    controller.abort();
    await running;
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("legacy control state remains visible and IPv6 loopback URLs are valid", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-legacy-"));
  try {
    await writeFile(statePaths(agentDir).control, `${JSON.stringify({ host: "::1", pid: process.pid, port: 3210, schemaVersion: 1, startedAt: new Date().toISOString(), token: "legacy" })}\n`, { mode: 0o600 });
    const status = await controlStatus(agentDir);
    assert.equal(status.status, "running"); assert.equal(status.legacyIdentity, true); assert.equal(status.url, "http://[::1]:3210");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("control plane replaces stale state and remains loopback-only", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-stale-")); const controller = new AbortController();
  try {
    await writeFile(statePaths(agentDir).control, `${JSON.stringify({ host: "127.0.0.1", pid: 99999999, port: 3210, processIdentity: "linux:1", schemaVersion: 1, startedAt: new Date().toISOString(), token: "stale" })}\n`, { mode: 0o600 });
    const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
    let current; for (let attempt = 0; attempt < 100; attempt += 1) { current = JSON.parse(await readFile(statePaths(agentDir).control)); if (current.pid === process.pid) break; await new Promise((done) => setTimeout(done, 10)); }
    assert.equal(current.pid, process.pid); assert.notEqual(current.token, "stale"); controller.abort(); await running;
    await assert.rejects(import("../scripts/control-service.mjs").then(({ startDetachedControl }) => startDetachedControl({ agentDir, host: "0.0.0.0", port: 0, root })), /CONTROL_LOOPBACK_REQUIRED/);
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

test("control plane exposes authenticated paginated events and logs only for the bound task", async () => {
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
    await createTaskReceiptStore({ agentDir }).write({ endedAt: "2026-08-11T12:00:01.000Z", exitCode: 0, log: await logs.describe({ taskId: task.id, runId }), runId, startedAt: "2026-08-11T12:00:00.000Z", taskId: task.id });
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
