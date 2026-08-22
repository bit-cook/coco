import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchContinuation } from "../scripts/orch-continuation.mjs";

const policy = { maxTurns: 3, maxTokens: 1000, maxTimeMs: 60000 };

test("continuation tracks turns and tokens within bounds", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-continuation-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const cont = createOrchContinuation({ agentDir });
  const started = await cont.start("session-1", policy);
  assert.equal(started.started, true);
  const turn1 = await cont.recordTurn("session-1", 100);
  assert.equal(turn1.session.turns, 1); assert.equal(turn1.session.tokens, 100); assert.equal(turn1.limits.exceeded, false);
  const turn2 = await cont.recordTurn("session-1", 200);
  assert.equal(turn2.session.turns, 2); assert.equal(turn2.session.tokens, 300);
  const completed = await cont.complete("session-1");
  assert.equal(completed.session.status, "completed");
});

test("continuation exhausts on turn, token, and time limits", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-continuation-exhaust-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const cont = createOrchContinuation({ agentDir });
  await cont.start("turns", { maxTurns: 2, maxTokens: 999999, maxTimeMs: 999999 });
  await cont.recordTurn("turns", 0); const exhausted = await cont.recordTurn("turns", 0);
  assert.equal(exhausted.session.status, "exhausted"); assert.equal(exhausted.limits.reason, "maxTurns");
  assert.equal(await cont.recordTurn("turns", 0), null);
  await cont.start("tokens", { maxTurns: 999, maxTokens: 100, maxTimeMs: 999999 });
  await cont.recordTurn("tokens", 50); const tokenExhausted = await cont.recordTurn("tokens", 60);
  assert.equal(tokenExhausted.session.status, "exhausted"); assert.equal(tokenExhausted.limits.reason, "maxTokens");
});

test("continuation rejects duplicates and invalid policies", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-continuation-reject-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const cont = createOrchContinuation({ agentDir });
  await cont.start("dup", policy);
  assert.deepEqual(await cont.start("dup", policy), { started: false, reason: "duplicate" });
  await assert.rejects(cont.start("bad", { maxTurns: 0, maxTokens: 100, maxTimeMs: 100 }), { code: "ORCH_POLICY_INVALID" });
});

test("continuation survives restart", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-continuation-restart-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const first = createOrchContinuation({ agentDir });
  await first.start("persist", policy); await first.recordTurn("persist", 50);
  const second = createOrchContinuation({ agentDir });
  const status = await second.status("persist");
  assert.equal(status.session.turns, 1); assert.equal(status.session.tokens, 50);
});
