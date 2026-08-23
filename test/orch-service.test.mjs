import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchService } from "../scripts/orch-service.mjs";

const item = (id, category = "follow-up", priority = 1) => ({ category, createdAt: "2026-08-23T00:00:00.000Z", id, priority, source: "test" });
const policy = { maxTimeMs: 60000, maxTokens: 100, maxTurns: 2 };

test("service exposes one durable orchestration API", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-service-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const service = createOrchService({ agentDir });
  assert.equal((await service.admit(item("follow-up"))).admitted, true); assert.equal((await service.next()).id, "follow-up"); assert.equal((await service.pop()).id, "follow-up");
  await service.startContinuation("session", policy); await service.recordTurn("session", 10); await service.completeContinuation("session");
  await service.registerChild("root", "child"); await service.completeChild("child");
  assert.deepEqual(await service.status(), { activeContinuations: 0, inboxSize: 0, lineageSize: 1, schemaVersion: 1 });
});

test("service can be composed with injected stores", async () => {
  const calls = [], inbox = { async admit(item) { calls.push(["admit", item.id]); return { admitted: true }; }, async peek() { return null; }, async pop() { return null; }, async size() { return 0; } };
  const continuation = { async complete() {}, async list() { return []; }, async recordTurn() {}, async start() {} }, lineage = { async cancel() {}, async complete() {}, async fail() {}, async list() { return []; }, async register() {} };
  const service = createOrchService({ continuation, inbox, lineage }); await service.admit(item("injected")); assert.deepEqual(calls, [["admit", "injected"]]);
});
