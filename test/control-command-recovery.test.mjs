import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCommandRecoveryJournal } from "../scripts/command-recovery-journal.mjs";
import { runControlServer } from "../scripts/control-service.mjs";
import { statePaths } from "../scripts/state-paths.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

const root = new URL("..", import.meta.url).pathname;
const journalDirectory = (agentDir) => join(agentDir, "command-recovery", "control");

async function start(agentDir) {
  const controller = new AbortController();
  const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
  let control;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { control = JSON.parse(await readFile(statePaths(agentDir).control)); break; }
    catch { await new Promise((done) => setTimeout(done, 10)); }
  }
  assert.ok(control);
  return { auth: { authorization: `Bearer ${control.token}`, "content-type": "application/json" }, base: `http://127.0.0.1:${control.port}`, close: async () => { controller.abort(); await running; } };
}

test("Control task creation durably replays an idempotent result and rejects digest reuse", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-command-"));
  let server;
  try {
    server = await start(agentDir);
    const input = { approved: false, cwd: process.cwd(), prompt: "create once", worktree: false };
    const headers = { ...server.auth, "idempotency-key": "create-command-1" };
    const first = await fetch(`${server.base}/v1/tasks`, { body: JSON.stringify(input), headers, method: "POST" });
    assert.equal(first.status, 201);
    const result = await first.json();
    const record = await createCommandRecoveryJournal({ directory: journalDirectory(agentDir) }).read("create-command-1");
    assert.equal(record.status, "result");
    assert.deepEqual(record.response, { body: result, status: 201 });

    const duplicate = await fetch(`${server.base}/v1/tasks`, { body: JSON.stringify(input), headers, method: "POST" });
    assert.equal(duplicate.status, 201);
    assert.deepEqual(await duplicate.json(), result);
    assert.equal((await createTaskStore({ agentDir }).load()).tasks.length, 1);

    const conflict = await fetch(`${server.base}/v1/tasks`, { body: JSON.stringify({ ...input, prompt: "different" }), headers, method: "POST" });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { error: "IDEMPOTENCY_KEY_CONFLICT" });

    const compatible = await fetch(`${server.base}/v1/tasks`, { body: JSON.stringify({ ...input, prompt: "legacy caller" }), headers: server.auth, method: "POST" });
    assert.equal(compatible.status, 201);
    assert.equal((await createTaskStore({ agentDir }).load()).tasks.length, 2);
  } finally { await server?.close(); await rm(agentDir, { recursive: true, force: true }); }
});

test("Control restart marks an effect without a result uncertain and never repeats it", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-command-restart-"));
  let server;
  try {
    const input = { approved: false, cwd: process.cwd(), prompt: "unknown outcome", worktree: false };
    const journal = createCommandRecoveryJournal({ directory: journalDirectory(agentDir) });
    await journal.receive({ commandId: "create-command-uncertain", effectGeneration: 1, operationId: "control.tasks.create", request: { input, method: "POST", path: "/v1/tasks" } });
    await journal.beginExecution("create-command-uncertain");
    const existing = await createTaskStore({ agentDir }).create({ cwd: input.cwd, initialStatus: "blocked", prompt: input.prompt, trigger: "manual", worktree: false });

    server = await start(agentDir);
    const response = await fetch(`${server.base}/v1/tasks`, { body: JSON.stringify(input), headers: { ...server.auth, "idempotency-key": "create-command-uncertain" }, method: "POST" });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "COMMAND_OUTCOME_UNCERTAIN", status: "uncertain" });
    assert.equal((await journal.read("create-command-uncertain")).uncertainReason, "process-restarted");
    assert.deepEqual((await createTaskStore({ agentDir }).load()).tasks.map(({ id }) => id), [existing.id]);
  } finally { await server?.close(); await rm(agentDir, { recursive: true, force: true }); }
});

test("Control restart safely executes a command that crashed before its effect", { timeout: 10_000 }, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-command-received-"));
  let server;
  try {
    const input = { approved: false, cwd: process.cwd(), prompt: "not executed yet", worktree: false };
    const journal = createCommandRecoveryJournal({ directory: journalDirectory(agentDir) });
    await journal.receive({ commandId: "create-command-received", effectGeneration: 1, operationId: "control.tasks.create", request: { input, method: "POST", path: "/v1/tasks" } });

    server = await start(agentDir);
    const response = await fetch(`${server.base}/v1/tasks`, { body: JSON.stringify(input), headers: { ...server.auth, "idempotency-key": "create-command-received" }, method: "POST" });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.task.status, "blocked");
    assert.equal((await journal.read("create-command-received")).status, "result");
    assert.deepEqual((await createTaskStore({ agentDir }).load()).tasks.map(({ id }) => id), [result.task.id]);
  } finally { await server?.close(); await rm(agentDir, { recursive: true, force: true }); }
});
