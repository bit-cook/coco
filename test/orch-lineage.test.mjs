import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchLineage } from "../scripts/orch-lineage.mjs";

test("lineage registers parent-child relations and prevents cycles", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-lineage-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const lineage = createOrchLineage({ agentDir });
  assert.deepEqual(await lineage.register("parent", "child-1"), { registered: true, relation: { childId: "child-1", createdAt: (await lineage.list())[0].createdAt, parentId: "parent", status: "active" } });
  assert.deepEqual(await lineage.register("parent", "child-1"), { registered: false, reason: "duplicate" });
  await assert.rejects(lineage.register("same", "same"), { code: "ORCH_LINEAGE_CYCLE" });
  assert.equal((await lineage.children("parent")).length, 1);
  assert.equal((await lineage.parent("child-1")).parentId, "parent");
});

test("lineage transitions child status and survives restart", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-lineage-transition-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const first = createOrchLineage({ agentDir });
  await first.register("root", "child"); await first.complete("child");
  const second = createOrchLineage({ agentDir });
  assert.equal((await second.parent("child")).status, "completed");
  assert.equal(await second.complete("child"), null);
});
