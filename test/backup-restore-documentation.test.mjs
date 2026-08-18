import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

test("backup documentation records complete layers, verification, restore, and secret exclusions", async () => {
  const [guide, english, chinese, history] = await Promise.all([
    readFile(join(root, "BACKUP_AND_RESTORE.md"), "utf8"),
    readFile(join(root, "documentation/en/docs/backup-and-restore.md"), "utf8"),
    readFile(join(root, "documentation/zh-CN/docs/backup-and-restore.md"), "utf8"),
    readFile(join(root, "HISTORICAL_DOCUMENTS.md"), "utf8"),
  ]);
  for (const value of [guide, english, chinese, history]) assert.match(value, /coco-full-20260817T190344Z/);
  for (const value of [guide, english, chinese]) {
    assert.match(value, /coco-all-refs\.bundle/);
    assert.match(value, /sha256sum --check SHA256SUMS/);
    assert.match(value, /git bundle verify/);
  }
  for (const required of ["coco-node_modules", "release-v0.6.1", "metadata", "restore", "/root/.coco", "/root/.config/opencode", "encrypted", "verify:closure"]) assert.match(guide, new RegExp(required.replace("/", "\\/"), "i"), required);
  assert.match(guide, /git[^\n]*fsck --full/);
  assert.match(guide, /Never reset or overwrite|Never reset|Do not run `git reset --hard`/i);
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(packageJson.files.includes("BACKUP_AND_RESTORE.md"), true);
});

test("current recovery headers supersede the historical migration checkpoints", async () => {
  const [journal, english, chinese] = await Promise.all([
    readFile(join(root, ".opencode/memory/DEVELOPMENT_JOURNAL.md"), "utf8"),
    readFile(join(root, "documentation/en/docs/development-migration-journal.md"), "utf8"),
    readFile(join(root, "documentation/zh-CN/docs/development-migration-journal.md"), "utf8"),
  ]);
  assert.match(journal, /^# CoCo Active Development Journal/m);
  assert.match(journal, /Current branch: candidate\/v0\.6\.2/);
  assert.match(journal, /Released product version: 0\.6\.1/);
  assert.match(english, /Current Handoff \(Supersedes Historical Checkpoints Below\)/);
  assert.match(chinese, /当前交接状态（覆盖下方历史检查点）/);
});

test("backup and migration documentation have generated completeness classifications", async () => {
  const manifest = JSON.parse(await readFile(join(root, "documentation/completeness-manifest.json"), "utf8"));
  const categories = new Map(manifest.inventory.map(({ path, category }) => [path, category]));
  assert.equal(categories.get("docs/backup-and-restore.md"), "current-product-translated");
  assert.equal(categories.get("docs/development-migration-journal.md"), "historical-inherited");
  assert.equal(manifest.complete, true);
  assert.deepEqual(manifest.links.unclassified, []);
});
