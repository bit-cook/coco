import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runnerCommand, taskCommand } from "../scripts/task-commands.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";

const root = new URL("..", import.meta.url).pathname;

async function fixture() {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-command-"));
  const ids = [Buffer.alloc(9), Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 1])];
  const store = createTaskStore({ agentDir, random: () => ids.shift() });
  const first = await store.create({ cwd: root, prompt: "private prompt", worktree: false });
  const second = await store.create({ cwd: root, prompt: "another private prompt", worktree: false });
  await store.update((state) => {
    const task = state.tasks[0]; task.lastError = "private raw error"; task.pid = process.pid; task.processIdentity = "private identity"; task.result = "private result";
    return state;
  });
  return { agentDir, first, second, store };
}

test("destructive task commands reject missing, empty, and ambiguous IDs", async () => {
  const setup = await fixture(); const previous = process.env.COCO_CODING_AGENT_DIR;
  process.env.COCO_CODING_AGENT_DIR = setup.agentDir;
  try {
    await assert.rejects(taskCommand(["cancel"], root), (error) => error.code === "TASK_ID_REQUIRED");
    await assert.rejects(taskCommand(["cancel", ""], root), (error) => error.code === "TASK_ID_REQUIRED");
    await assert.rejects(taskCommand(["cancel", "aaaaaaaaaaa"], root), (error) => error.code === "TASK_ID_AMBIGUOUS");
    assert.deepEqual((await setup.store.load()).tasks.map(({ status }) => status), ["queued", "queued"]);
  } finally {
    if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous;
    await rm(setup.agentDir, { recursive: true, force: true });
  }
});

test("CLI task DTOs expose only allowlisted fields", async () => {
  const setup = await fixture(); const previous = process.env.COCO_CODING_AGENT_DIR; const write = process.stdout.write; let stdout = "";
  process.env.COCO_CODING_AGENT_DIR = setup.agentDir; process.stdout.write = (chunk) => { stdout += chunk; return true; };
  try {
    await taskCommand(["show", setup.first.id], root);
    const task = JSON.parse(stdout);
    assert.deepEqual(Object.keys(task).sort(), ["activeRunId", "attempts", "branch", "createdAt", "finishedAt", "github", "heartbeatAt", "id", "logsTruncated", "schedule", "startedAt", "status", "trigger", "updatedAt", "worktree"].sort());
    for (const field of ["cwd", "lastError", "ownerId", "pid", "processIdentity", "prompt", "result", "terminalEvidence"]) assert.equal(field in task, false);
    stdout = ""; await taskCommand(["active"], root);
    const active = JSON.parse(stdout); assert.deepEqual(active.runner, { status: "stopped" });
    for (const field of ["ownerId", "pid", "processIdentity"]) assert.equal(field in active.runner, false);
    stdout = ""; await runnerCommand(["status"], root);
    assert.deepEqual(JSON.parse(stdout), { status: "stopped" });
  } finally {
    process.stdout.write = write; if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous;
    await rm(setup.agentDir, { recursive: true, force: true });
  }
});
