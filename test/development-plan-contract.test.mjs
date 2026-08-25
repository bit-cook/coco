import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const workItems = join(root, "development", "work-items", "0.6.3");

test("active development plan preserves history and the focused 0.7.2 release target", async () => {
  const [agents, plan, history, generated, leases, files] = await Promise.all([
    readFile(join(root, "AGENTS.md"), "utf8"),
    readFile(join(root, "DEVELOPMENT_PLAN.md"), "utf8"),
    readFile(join(root, "HISTORICAL_DOCUMENTS.md"), "utf8"),
    readFile(join(root, "development", "GENERATED_ASSETS.md"), "utf8"),
    readFile(join(root, ".opencode", "work-leases.json"), "utf8").then(JSON.parse),
    readdir(workItems),
  ]);

  assert.match(agents, /Current branch: `release\/v0\.7\.2`/);
  assert.match(agents, /DEVELOPMENT_PLAN\.md/);
  assert.match(agents, /HISTORICAL_DOCUMENTS\.md/);
  assert.match(agents, /Released version: `0\.7\.1`/);
  assert.match(plan, /Next target: publish `v0.7.2`; performance, i18n completion, and the redesigned mark/);
  assert.match(plan, /Completed 0\.6\.3 Wave/);
  assert.equal(leases.schemaVersion, 1);
  assert.equal(Array.isArray(leases.leases), true);

  const expected = ["BKP-001-offsite-authenticated-backup.md", "CFG-000-mcp-atomic-publication.md", "REC-001-command-recovery-journal.md"];
  assert.deepEqual(files.toSorted(), expected);

  const ids = [];
  for (const file of files) {
    const value = await readFile(join(workItems, file), "utf8");
    const id = /^# ([A-Z]+-\d+):/m.exec(value)?.[1];
    assert.notEqual(id, undefined, file);
    ids.push(id);
    for (const section of ["Problem", "Required Invariants", "Scope", "Out of Scope", "Design", "Acceptance Tests", "Verification", "Rollback", "Evidence"]) assert.match(value, new RegExp(`^## ${section}$`, "m"), `${file}: ${section}`);
    assert.ok(plan.includes(`| \`${id}\` |`), `${id} appears in active plan`);
  }
  assert.equal(new Set(ids).size, ids.length, "work item IDs are unique");
  const byName = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(join(workItems, file), "utf8")])));
  assert.match(byName["REC-001-command-recovery-journal.md"], /Status: completed/);
  assert.match(byName["CFG-000-mcp-atomic-publication.md"], /Status: completed/);
  assert.match(byName["BKP-001-offsite-authenticated-backup.md"], /Status: completed/);

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
  assert.deepEqual(files, ["ADR-001-runtime-cas.md", "ADR-002-at-most-once-supervision.md", "ADR-003-release-isolation.md", "ADR-004-platform-policy.md", "ADR-005-differential-integrity-verification.md", "ADR-005-differential-integrity-verification.zh-CN.md", "ADR-006-frame-safe-localization-cache.md", "ADR-006-frame-safe-localization-cache.zh-CN.md"]);
  for (const file of files) {
    const value = await readFile(join(directory, file), "utf8");
    const sections = file.endsWith(".zh-CN.md") ? ["背景", "决策", "安全后果", "运维后果", "已否决的替代方案", "测试"] : ["Context", "Security Consequences", "Operational Consequences", "Alternatives Rejected", "Tests"];
    for (const section of sections) assert.match(value, new RegExp(`^## ${section}$`, "m"), `${file}: ${section}`);
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
  assert.match(value, /Status: completed/);
  assert.match(value, /Depends on: RUN-001, RUN-003/);
  assert.match(value, /uncertain/);
  assert.match(value, /no external code was copied/i);
});

test("generated documentation inventory proves current completeness", async () => {
  const manifest = JSON.parse(await readFile(join(root, "documentation", "completeness-manifest.json"), "utf8"));
  assert.equal(manifest.schema, "coco-documentation-completeness-v2");
  assert.equal(manifest.complete, true);
  assert.equal(manifest.status, "complete");
  assert.deepEqual(manifest.links.unclassified, []);
});
