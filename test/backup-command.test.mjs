import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { backupCommand, main } from "../scripts/backup-command.mjs";
import { createFilesystemBackupStore } from "../scripts/backup-filesystem-store.mjs";

const authKey = Buffer.alloc(32, 7);
const stateKey = Buffer.alloc(32, 8);
const environment = { COCO_BACKUP_AUTH_KEY: authKey.toString("base64"), COCO_BACKUP_STATE_KEY: stateKey.toString("base64") };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-backup-command-"));
  const sourceDir = join(root, "source");
  const offsiteDir = join(root, "offsite");
  await mkdir(sourceDir);
  await mkdir(offsiteDir);
  await writeFile(join(sourceDir, "package.json"), '{"name":"coco"}');
  return { root, sourceDir, offsiteDir };
}

test("command API creates and verifies with environment keys without returning them", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const created = await backupCommand({ operation: "create", ...f, operationalState: { provider: "private" }, now: "2026-08-18T00:00:00Z" }, environment);
  assert.deepEqual(Object.keys(created), ["ok", "operation", "result"]);
  assert.equal(created.ok, true);
  assert.equal(JSON.stringify(created).includes(authKey.toString("base64")), false);
  const verified = await backupCommand({ operation: "verify", backupDir: created.result.directory }, environment);
  assert.deepEqual(Object.keys(verified), ["ok", "operation", "result"]);
  assert.equal(verified.result.manifest.files[0].path, "package.json");
});

test("restore-drill and prune return stable results", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const created = await backupCommand({ operation: "create", ...f, operationalState: { ready: true }, now: "2026-08-18T00:00:00Z" }, environment);
  const restored = await backupCommand({ operation: "restore-drill", backupDir: created.result.directory, destinationDir: join(f.root, "restore"), expectedPaths: ["package.json"] }, environment);
  assert.deepEqual(Object.keys(restored.result), ["manifest", "state", "restoredFiles"]);
  assert.deepEqual(restored.result.state, { ready: true });
  await readFile(join(f.root, "restore", "package.json"));
  const pruned = await backupCommand({ operation: "prune", offsiteDir: f.offsiteDir, retentionDays: 30, now: "2026-08-18T00:00:00Z" }, environment);
  assert.deepEqual(pruned, { ok: true, operation: "prune", result: { pruned: true } });
});

test("errors use stable codes and never accept missing or wrong keys", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const missing = await backupCommand({ operation: "verify", backupDir: f.offsiteDir }, {});
  assert.deepEqual(missing.error, { code: "AUTH_KEY_REQUIRED", message: "AUTH_KEY_REQUIRED" });
  const created = await backupCommand({ operation: "create", ...f, operationalState: {}, now: "2026-08-18T00:00:00Z" }, environment);
  const wrong = await backupCommand({ operation: "verify", backupDir: created.result.directory, authKey: Buffer.alloc(32, 9) });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error.code, "BACKUP_OPERATION_FAILED");
  await assert.rejects(() => stat(join(f.offsiteDir, "not-a-key")), { code: "ENOENT" });
});

test("command API publishes and fetches through a credential-free store adapter", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "coco-backup-command-store-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, "source"), storeRoot = join(temporary, "store"), destination = join(temporary, "fetched");
  await mkdir(source); await mkdir(storeRoot); await writeFile(join(source, "manifest.json"), "{}\n");
  const dependencies = { store: createFilesystemBackupStore({ root: storeRoot }) };
  assert.equal((await backupCommand({ operation: "store-publish", id: "backup-command", sourceDir: source }, {}, dependencies)).ok, true);
  assert.deepEqual((await backupCommand({ operation: "store-list" }, {}, dependencies)).result.ids, ["backup-command"]);
  assert.equal((await backupCommand({ operation: "store-fetch", id: "backup-command", destinationDir: destination }, {}, dependencies)).ok, true);
  assert.equal(await readFile(join(destination, "manifest.json"), "utf8"), "{}\n");
  assert.equal((await backupCommand({ operation: "store-remove", id: "backup-command" }, {}, dependencies)).ok, true);
  const missing = await backupCommand({ operation: "store-list" }, {}, {});
  assert.equal(missing.ok, false); assert.equal(missing.error.code, "BACKUP_STORE_INVALID");
});

test("CLI main constructs a mounted filesystem store without key arguments", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "coco-backup-cli-store-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, "source"), storeRoot = join(temporary, "store"); await mkdir(source); await mkdir(storeRoot); await writeFile(join(source, "manifest.json"), "{}\n");
  let output = "";
  assert.equal(await main(["store-publish", "--store-root", storeRoot, "--id", "backup-cli", "--source-dir", source], {}, { write(value) { output += value; return true; } }), 0);
  assert.equal(JSON.parse(output).ok, true);
  assert.equal((await lstat(join(storeRoot, "backup-cli"))).isDirectory(), true);
});

test("CLI main parses retention and operational state types", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "coco-backup-cli-create-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, "source"), offsite = join(temporary, "offsite"); await mkdir(source); await mkdir(offsite); await writeFile(join(source, "file"), "data\n");
  let output = "";
  const code = await main(["create", "--source-dir", source, "--offsite-dir", offsite, "--operational-state", '{"scope":"test"}', "--retention-days", "30"], environment, { write(value) { output += value; return true; } });
  assert.equal(code, 0); assert.equal(JSON.parse(output).ok, true);
});
