import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decryptOperationalState, encryptOperationalState, restoreDrill, rotateBackup, verifyBackup } from "../scripts/backup-rotation.mjs";

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 8);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-backup-"));
  const source = join(root, "source");
  const offsite = join(root, "offsite");
  await mkdir(join(source, "dist"), { recursive: true });
  await mkdir(offsite);
  await writeFile(join(source, "package.json"), '{"name":"coco"}');
  await writeFile(join(source, "dist", "asset.txt"), "committed asset\n");
  return { root, source, offsite };
}

test("rotation authenticates manifest and artifacts independently", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const backup = await rotateBackup({ sourceDir: f.source, offsiteDir: f.offsite, authKey: key, stateKey: key, operationalState: { token: "not beside ciphertext" }, now: new Date("2026-08-18T00:00:00Z") });
  await verifyBackup({ backupDir: backup.directory, authKey: key });
  await writeFile(join(backup.directory, "dist", "asset.txt"), "tampered\n");
  await assert.rejects(() => verifyBackup({ backupDir: backup.directory, authKey: key }), /mismatch/);
  await assert.rejects(() => verifyBackup({ backupDir: backup.directory, authKey: otherKey }), /authentication/);
});

test("missing off-host copy and partial restore fail closed", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const backup = await rotateBackup({ sourceDir: f.source, offsiteDir: f.offsite, authKey: key, stateKey: key, operationalState: { ready: true }, now: new Date("2026-08-18T00:00:00Z") });
  await rm(join(backup.directory, "package.json"));
  await assert.rejects(() => restoreDrill({ backupDir: backup.directory, destinationDir: join(f.root, "restore"), authKey: key, stateKey: key, expectedPaths: ["package.json"] }));
  await assert.rejects(() => restoreDrill({ backupDir: join(f.offsite, "missing"), destinationDir: join(f.root, "missing-restore"), authKey: key, stateKey: key }));
});

test("operational state requires the separately managed key", () => {
  const encrypted = encryptOperationalState({ provider: "private" }, key);
  assert.deepEqual(decryptOperationalState(encrypted, key), { provider: "private" });
  assert.throws(() => decryptOperationalState(encrypted, otherKey));
  assert.equal(encrypted.includes("private"), false);
});

test("retention expires old sets but preserves current sets", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  await rotateBackup({ sourceDir: f.source, offsiteDir: f.offsite, authKey: key, stateKey: key, operationalState: {}, now: new Date("2026-08-01T00:00:00Z"), retentionDays: 30 });
  const current = await rotateBackup({ sourceDir: f.source, offsiteDir: f.offsite, authKey: key, stateKey: key, operationalState: {}, now: new Date("2026-08-18T00:00:00Z"), retentionDays: 30 });
  await assert.rejects(() => readFile(join(f.offsite, "backup-20260801T000000Z", "manifest.json")));
  await readFile(join(current.directory, "manifest.json"));
});
