import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const workItems = join(root, "development", "work-items", "0.6.2");

test("active development plan exposes complete, agent-ready 0.6.2 work packets", async () => {
  const [agents, plan, history, generated, leases, files] = await Promise.all([
    readFile(join(root, "AGENTS.md"), "utf8"),
    readFile(join(root, "DEVELOPMENT_PLAN.md"), "utf8"),
    readFile(join(root, "HISTORICAL_DOCUMENTS.md"), "utf8"),
    readFile(join(root, "development", "GENERATED_ASSETS.md"), "utf8"),
    readFile(join(root, ".opencode", "work-leases.json"), "utf8").then(JSON.parse),
    readdir(workItems),
  ]);

  assert.match(agents, /Current branch: `candidate\/v0\.6\.2`/);
  assert.match(agents, /DEVELOPMENT_PLAN\.md/);
  assert.match(agents, /HISTORICAL_DOCUMENTS\.md/);
  assert.match(plan, /Current target: 0\.6\.2/);
  assert.match(plan, /Next Executable Action/);
  assert.deepEqual(leases, { leases: [], schemaVersion: 1 });

  const expected = [
    "CON-001-linux-containment.md",
    "REL-001-release-permission-isolation.md",
    "REL-002-draft-immutable-release.md",
    "REL-003-offline-tarball-binding.md",
    "REL-004-package-offline-closure.md",
    "RUN-001-supervisor-launch-fsm.md",
    "RUN-002-stop-barrier-ownership.md",
    "RUN-003-webhook-dispatch-outbox.md",
    "RUN-004-invalid-task-isolation.md",
    "RUN-005-invalid-utf8-recovery.md",
  ];
  assert.deepEqual(files.toSorted(), expected);

  const ids = [];
  for (const file of files) {
    const value = await readFile(join(workItems, file), "utf8");
    const id = /^# ([A-Z]+-\d+):/m.exec(value)?.[1];
    assert.notEqual(id, undefined, file);
    ids.push(id);
    for (const section of ["Problem", "Reproduction", "Required Invariants", "Scope", "Out of Scope", "Design", "Acceptance Tests", "Verification", "Rollback", "Evidence"]) assert.match(value, new RegExp(`^## ${section}$`, "m"), `${file}: ${section}`);
    assert.match(plan, new RegExp(`\\| ${id} \\|`), `${id} appears in active plan`);
  }
  assert.equal(new Set(ids).size, ids.length, "work item IDs are unique");

  for (const preserved of [
    "documentation/en/docs/development-migration-journal.md",
    "documentation/zh-CN/docs/development-migration-journal.md",
    "site/roadmap.html",
    "site/roadmap-legacy.html",
    "site/landscape.html",
  ]) assert.ok(history.includes(preserved), preserved);
  assert.match(history, /backup\/pre-v0\.6\.2-20260816/);
  assert.match(history, /coco-pre-v0\.6\.2-20260816\.bundle/);
  assert.match(generated, /npm run build/);
  assert.match(generated, /Evidence Freshness/);
});

test("architecture decisions preserve runtime, supervision, release, and platform rationale", async () => {
  const directory = join(root, "documentation", "architecture", "decisions");
  const files = (await readdir(directory)).toSorted();
  assert.deepEqual(files, ["ADR-001-runtime-cas.md", "ADR-002-at-most-once-supervision.md", "ADR-003-release-isolation.md", "ADR-004-platform-policy.md"]);
  for (const file of files) {
    const value = await readFile(join(directory, file), "utf8");
    for (const section of ["Context", "Security Consequences", "Operational Consequences", "Alternatives Rejected", "Tests"]) assert.match(value, new RegExp(`^## ${section}$`, "m"), `${file}: ${section}`);
  }
});
