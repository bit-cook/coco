import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchChildAdmission } from "../scripts/orch-child-admission.mjs";

const policy = { maxChildren: 2, maxCostMicros: 1000, maxTimeMs: 1000, maxTokens: 1000, maxTurns: 10 };
const cost = { costMicros: 100, timeMs: 100, tokens: 100, turns: 1 };

test("child admission reserves, commits, survives restart, and deduplicates", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-child-admission-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const first = createOrchChildAdmission({ agentDir });
  await first.configure("parent", policy); assert.equal((await first.reserve("parent", "child-1", cost)).admitted, true); await first.commit("parent", "child-1");
  const second = createOrchChildAdmission({ agentDir }); assert.equal((await second.reserve("parent", "child-1", cost)).reason, "duplicate"); assert.equal((await second.get("parent")).children[0].status, "committed");
});

test("child admission rejects over-budget or unconfigured parents", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-child-budget-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const admission = createOrchChildAdmission({ agentDir });
  await assert.rejects(admission.reserve("missing", "child", cost), { code: "ORCH_PARENT_NOT_CONFIGURED" }); await admission.configure("parent", { ...policy, maxChildren: 1, maxTokens: 100 }); await admission.reserve("parent", "child-1", cost); await assert.rejects(admission.reserve("parent", "child-2", cost), { code: "ORCH_CHILD_LIMIT_EXCEEDED" });
});

test("actual child usage is idempotent and can exhaust the parent", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-child-usage-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const admission = createOrchChildAdmission({ agentDir });
  await admission.configure("parent", { ...policy, maxTimeMs: 100 }); await admission.reserve("parent", "child", { ...cost, timeMs: 50 }); await admission.commit("parent", "child");
  assert.equal((await admission.recordUsage("parent", "child", { costMicros: 100, timeMs: 150, tokens: 100, turns: 1 })).exhausted, true); assert.equal((await admission.recordUsage("parent", "child", { costMicros: 100, timeMs: 150, tokens: 100, turns: 1 })).exhausted, true);
  await assert.rejects(admission.recordUsage("parent", "child", { costMicros: 100, timeMs: 151, tokens: 100, turns: 1 }), { code: "ORCH_CHILD_USAGE_CONFLICT" }); await assert.rejects(admission.reserve("parent", "next", cost), { code: "ORCH_PARENT_BUDGET_EXHAUSTED" });
});
