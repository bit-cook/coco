import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

test("external research report preserves fixed sources and explicit adoption boundaries", async () => {
  const [english, chinese, snapshot, plan, items] = await Promise.all([
    readFile(join(root, "documentation/en/docs/external-agent-research.md"), "utf8"),
    readFile(join(root, "documentation/zh-CN/docs/external-agent-research.md"), "utf8"),
    readFile(join(root, "development/research/prime-agent-deepseek-harness-snapshot.md"), "utf8"),
    readFile(join(root, "DEVELOPMENT_PLAN.md"), "utf8"),
    readdir(join(root, "development/work-items/0.7.0"), { withFileTypes: true }),
  ]);
  for (const report of [english, chinese]) {
    for (const evidence of ["849c92114b0b4372fa272281b87cdbe8f7c9ed8d", "99f6f02fecdb7dff40c3fbc9470f5907c29f74ca", "0.6.2", "0.7.0", "Cordis", "durability", "lineage"]) assert.match(report, new RegExp(evidence, "i"), evidence);
    assert.match(report, /No external runtime|本文不授权/);
    assert.match(report, /wholesale|整体迁移|整体嵌入/);
  }
  assert.match(snapshot, /license: MIT/);
  assert.match(snapshot, /prime-agent-research/);
  assert.match(snapshot, /deepseek-harness-research/);
  assert.match(plan, /EVID-001/); assert.match(plan, /CFG-001/); assert.match(plan, /External Research/);
  assert.deepEqual(items.filter((entry) => entry.isFile()).map((entry) => entry.name).toSorted(), ["CFG-001-provider-mcp-generations.md", "EVID-001-model-input-ledger.md", "EVID-002-durability-fence.md", "ORCH-001-lineage-and-continuation.md", "TOOL-001-ordered-tool-pool.md"]);
});

test("research-derived work items remain pending and do not authorize external runtime adoption", async () => {
  const directory = join(root, "development/work-items/0.7.0");
  for (const name of await readdir(directory)) {
    const value = await readFile(join(directory, name), "utf8");
    assert.match(value, /Status: pending/); assert.match(value, /Research only|研究/);
    for (const section of ["Problem", "Required Invariants", "Scope", "Out of Scope", "Design", "Acceptance Tests", "Verification", "Rollback", "Evidence"]) assert.match(value, new RegExp(`^## ${section}$`, "m"), name);
  }
});
