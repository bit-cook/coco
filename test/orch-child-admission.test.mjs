import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchChildAdmission } from "../scripts/orch-child-admission.mjs";

const policy = { maxChildren: 2, maxTimeMs: 1000, maxTokens: 1000, maxTurns: 10 };
const cost = { timeMs: 100, tokens: 100, turns: 1 };

test("child admission reserves, commits, survives restart, and deduplicates", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-child-admission-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const first = createOrchChildAdmission({ agentDir });
  await first.configure("parent", policy); assert.equal((await first.reserve("parent", "child-1", cost)).admitted, true); await first.commit("parent", "child-1");
  const second = createOrchChildAdmission({ agentDir }); assert.equal((await second.reserve("parent", "child-1", cost)).reason, "duplicate"); assert.equal((await second.get("parent")).children[0].status, "committed");
});

test("child admission rejects over-budget or unconfigured parents", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-child-budget-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const admission = createOrchChildAdmission({ agentDir });
  await assert.rejects(admission.reserve("missing", "child", cost), { code: "ORCH_PARENT_NOT_CONFIGURED" }); await admission.configure("parent", { ...policy, maxChildren: 1, maxTokens: 100 }); await admission.reserve("parent", "child-1", cost); await assert.rejects(admission.reserve("parent", "child-2", cost), { code: "ORCH_CHILD_LIMIT_EXCEEDED" });
});
