import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BackupStoreError, assertBackupStore, backupStoreId } from "../scripts/backup-store-contract.mjs";
import { createFilesystemBackupStore } from "../scripts/backup-filesystem-store.mjs";

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), "coco-backup-store-"));
  const root = join(temporary, "store"), source = join(temporary, "source");
  await mkdir(join(source, "nested"), { recursive: true });
  await mkdir(join(source, "empty"));
  await mkdir(root);
  await writeFile(join(source, "manifest.json"), "{}\n");
  await writeFile(join(source, "nested", "artifact"), "backup bytes\n");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  return { root, source, store: createFilesystemBackupStore({ root }), temporary };
}

test("backup store contract is credential-free and validates implementations and IDs", () => {
  const methods = { publish() {}, fetch() {}, list() {}, remove() {} };
  assert.equal(assertBackupStore(methods), methods);
  assert.throws(() => assertBackupStore({}), { code: "BACKUP_STORE_INVALID" });
  for (const id of ["", ".hidden", "..", "a/b", "a\\b", "/absolute"]) {
    assert.throws(() => backupStoreId(id), { code: "BACKUP_STORE_ID_INVALID" });
  }
  assert.throws(() => createFilesystemBackupStore({ root: "/tmp/store", key: "secret" }), { code: "BACKUP_STORE_CONFIG_INVALID" });
});

test("filesystem publish is immutable and fetch requires a nonexistent destination", async (t) => {
  const fixtureValue = await fixture(t);
  assert.deepEqual(await fixtureValue.store.publish({ id: "backup-20260819", sourceDir: fixtureValue.source }), { id: "backup-20260819" });
  assert.deepEqual(await fixtureValue.store.list(), ["backup-20260819"]);
  await assert.rejects(() => fixtureValue.store.publish({ id: "backup-20260819", sourceDir: fixtureValue.source }), { code: "BACKUP_STORE_EXISTS" });
  await assert.rejects(() => fixtureValue.store.publish({ id: "other", sourceDir: fixtureValue.source, key: "secret" }), { code: "BACKUP_STORE_REQUEST_INVALID" });

  const destination = join(fixtureValue.temporary, "restore");
  await fixtureValue.store.fetch({ id: "backup-20260819", destinationDir: destination });
  assert.equal(await readFile(join(destination, "nested", "artifact"), "utf8"), "backup bytes\n");
  assert.equal((await lstat(join(destination, "empty"))).isDirectory(), true);
  await assert.rejects(() => fixtureValue.store.fetch({ id: "backup-20260819", destinationDir: destination }), { code: "BACKUP_STORE_DESTINATION_EXISTS" });
  assert.deepEqual(await fixtureValue.store.remove({ id: "backup-20260819" }), { id: "backup-20260819", removed: true });
  assert.deepEqual(await fixtureValue.store.list(), []);
  await assert.rejects(() => fixtureValue.store.fetch({ id: "backup-20260819", destinationDir: join(fixtureValue.temporary, "other") }), { code: "BACKUP_STORE_NOT_FOUND" });
});

test("partial objects are not listed and unsafe filesystem entries fail closed", async (t) => {
  const fixtureValue = await fixture(t);
  await mkdir(join(fixtureValue.root, "partial", "content"), { recursive: true });
  assert.deepEqual(await fixtureValue.store.list(), []);
  await symlink(fixtureValue.source, join(fixtureValue.root, "unsafe"));
  await assert.rejects(() => fixtureValue.store.list(), (error) => error instanceof BackupStoreError && error.code === "BACKUP_STORE_OBJECT_INVALID");
  await rm(join(fixtureValue.root, "unsafe"));
  await symlink(join(fixtureValue.source, "manifest.json"), join(fixtureValue.source, "link"));
  await assert.rejects(() => fixtureValue.store.publish({ id: "with-link", sourceDir: fixtureValue.source }), { code: "BACKUP_STORE_SOURCE_INVALID" });
  assert.deepEqual(await fixtureValue.store.list(), []);
});
