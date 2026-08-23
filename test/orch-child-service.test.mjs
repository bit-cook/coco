import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchChildService } from "../scripts/orch-child-service.mjs";
import { createOrchService } from "../scripts/orch-service.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";
import { createTaskRunner } from "../scripts/task-runner.mjs";

const budget = { maxChildren: 1, maxTimeMs: 1000, maxTokens: 1000, maxTurns: 10 }, cost = { timeMs: 100, tokens: 100, turns: 1 };

test("child saga creates blocked task, lineage, inbox, budget commit, then queues", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-child-service-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const taskStore = createTaskStore({ agentDir }), orchestration = createOrchService({ agentDir });
  await orchestration.configureParent("root", budget); const service = createOrchChildService({ agentDir, orchestration, taskStore });
  const result = await service.createChild({ cost, cwd: process.cwd(), parentId: "root", prompt: "child work" });
  assert.equal(result.admitted, true); assert.equal(result.task.status, "queued"); assert.equal((await orchestration.next()).source, result.task.id); assert.equal((await orchestration.parent(result.task.id)).status, "active");
});

test("child saga does not create a runnable child after budget rejection", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-child-budget-service-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const taskStore = createTaskStore({ agentDir }), orchestration = createOrchService({ agentDir });
  await orchestration.configureParent("root", budget); const service = createOrchChildService({ agentDir, orchestration, taskStore });
  assert.equal((await service.createChild({ cost, cwd: process.cwd(), parentId: "root", prompt: "first" })).admitted, true);
  const rejected = await service.createChild({ cost, cwd: process.cwd(), parentId: "root", prompt: "second" }); assert.equal(rejected.admitted, false); assert.equal(rejected.task.status, "blocked"); assert.equal((await orchestration.next()).source, (await taskStore.load()).tasks[0].id);
});

test("child execution uses the normal runner and closes lineage", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-child-runner-service-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const taskStore = createTaskStore({ agentDir }), orchestration = createOrchService({ agentDir });
  await orchestration.configureParent("root", budget); const service = createOrchChildService({ agentDir, orchestration, taskStore }); const child = await service.createChild({ cost, cwd: process.cwd(), parentId: "root", prompt: "child execution" });
  await createTaskRunner({ agentDir, root: process.cwd(), spawnTask: async () => ({ code: 0, output: "done" }) }).run({ once: true });
  assert.equal((await taskStore.load()).tasks.find(({ id }) => id === child.task.id).status, "completed"); assert.equal((await orchestration.parent(child.task.id)).status, "completed");
});
