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
  assert.equal(leases.schemaVersion, 1);
  assert.equal(Array.isArray(leases.leases), true);

  const expected = [
    "CON-001-linux-containment.md",
    "CON-002-linux-containment-implementation.md",
    "DOC-001-documentation-completeness.md",
    "INT-001-launcher-canonical-root.md",
    "INT-002-runtime-topology-fallback.md",
    "PERF-001-startup-runtime-performance.md",
    "PERF-002-model-list-equivalence.md",
    "PERF-003-startup-release-budget.md",
    "REL-001-release-permission-isolation.md",
    "REL-002-draft-immutable-release.md",
    "REL-003-offline-tarball-binding.md",
    "REL-004-package-offline-closure.md",
    "REL-005-exact-release-artifact-contract.md",
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
  const byName = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(join(workItems, file), "utf8")])));
  assert.match(byName["REL-001-release-permission-isolation.md"], /Depends on: REL-005/);
  assert.match(byName["REL-002-draft-immutable-release.md"], /Depends on: REL-001, REL-005/);
  assert.match(byName["REL-003-offline-tarball-binding.md"], /Depends on: REL-004/);
  assert.match(byName["CON-001-linux-containment.md"], /Status: completed/);
  assert.match(byName["CON-002-linux-containment-implementation.md"], /Depends on: RUN-001, RUN-002, CON-001/);
  assert.equal((plan.match(/The coordinator owns/g) ?? []).length, 1);

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
  const release = await readFile(join(directory, "ADR-003-release-isolation.md"), "utf8");
  assert.match(release, /REL-004, REL-005/);
  assert.match(release, /four-stage model/);
});

test("research-derived recovery backlog remains explicit and blocked", async () => {
  const directory = join(root, "development", "work-items", "0.6.3");
  const files = (await readdir(directory)).toSorted();
  assert.deepEqual(files, ["BKP-001-offsite-authenticated-backup.md", "CFG-000-mcp-atomic-publication.md", "REC-001-command-recovery-journal.md"]);
  const value = await readFile(join(directory, "REC-001-command-recovery-journal.md"), "utf8");
  assert.match(value, /Status: pending/);
  assert.match(value, /Depends on: RUN-001, RUN-003/);
  assert.match(value, /uncertain/);
  assert.match(value, /no external code copied/i);
});

test("generated documentation inventory proves current completeness", async () => {
  const manifest = JSON.parse(await readFile(join(root, "documentation", "completeness-manifest.json"), "utf8"));
  assert.equal(manifest.schema, "coco-documentation-completeness-v2");
  assert.equal(manifest.complete, true);
  assert.equal(manifest.status, "complete");
  assert.deepEqual(manifest.links.unclassified, []);
});
