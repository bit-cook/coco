import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const MANIFEST = "manifest.json";
const AUTH = "manifest.auth.json";
const STATE = "operational-state.enc";

function canonical(value) {
  return JSON.stringify(value);
}

function keyBytes(key, name) {
  if (!Buffer.isBuffer(key) && !(key instanceof Uint8Array)) throw new TypeError(`${name} must be a key buffer`);
  if (key.length < 16) throw new Error(`${name} is too short`);
  return Buffer.from(key);
}

function stateKeyBytes(key) {
  const value = keyBytes(key, "stateKey");
  if (value.length !== 32) throw new Error("stateKey must be exactly 32 bytes");
  return value;
}

async function filesIn(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symlink is not supported: ${relative(root, path)}`);
    if (entry.isDirectory()) result.push(...await filesIn(root, path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`special file is not supported: ${relative(root, path)}`);
  }
  return result.sort();
}

export function createBackupManifest(files, createdAt = new Date().toISOString()) {
  return { version: 1, createdAt, files: [...files].sort((a, b) => a.path.localeCompare(b.path)) };
}

export function authenticateManifest(manifest, authKey) {
  const key = keyBytes(authKey, "authKey");
  return createHmac("sha256", key).update(canonical(manifest)).digest("hex");
}

export function verifyManifest(manifest, signature, authKey) {
  const expected = authenticateManifest(manifest, authKey);
  if (typeof signature !== "string" || !/^[0-9a-f]+$/.test(signature) || signature.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")); } catch { return false; }
}

export function encryptOperationalState(value, stateKey) {
  const key = stateKeyBytes(stateKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.subarray(0, 32), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), "utf8")), cipher.final()]);
  return Buffer.from(JSON.stringify({ version: 1, algorithm: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }));
}

export function decryptOperationalState(encoded, stateKey) {
  const key = stateKeyBytes(stateKey);
  const envelope = JSON.parse(Buffer.from(encoded).toString("utf8"));
  if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") throw new Error("unsupported state envelope");
  const decipher = createDecipheriv("aes-256-gcm", key.subarray(0, 32), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}

export async function rotateBackup({ sourceDir, offsiteDir, authKey, stateKey, operationalState, now = new Date(), retentionDays = 30 }) {
  keyBytes(authKey, "authKey");
  stateKeyBytes(stateKey);
  const source = resolve(sourceDir);
  const id = `backup-${now.toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z")}`;
  const target = join(resolve(offsiteDir), id);
  await mkdir(target, { recursive: false }); // Existing IDs are immutable and cannot be overwritten.
  const entries = [];
  for (const file of await filesIn(source)) {
    const path = relative(source, file).split("\\").join("/");
    const bytes = await readFile(file);
    entries.push({ path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
    const destination = join(target, path);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, bytes);
  }
  const manifest = createBackupManifest(entries, now.toISOString());
  await writeFile(join(target, MANIFEST), canonical(manifest));
  await writeFile(join(target, AUTH), canonical({ algorithm: "hmac-sha256", signature: authenticateManifest(manifest, authKey) }));
  await writeFile(join(target, STATE), encryptOperationalState(operationalState, stateKey), { mode: 0o600 });
  await pruneBackups({ offsiteDir, now, retentionDays });
  return { id, directory: target, manifest };
}

export async function verifyBackup({ backupDir, authKey }) {
  const manifest = JSON.parse(await readFile(join(backupDir, MANIFEST), "utf8"));
  const proof = JSON.parse(await readFile(join(backupDir, AUTH), "utf8"));
  if (proof.algorithm !== "hmac-sha256" || !verifyManifest(manifest, proof.signature, authKey)) throw new Error("backup authentication failed");
  for (const file of manifest.files) {
    const bytes = await readFile(join(backupDir, file.path));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== file.sha256 || bytes.length !== file.bytes) throw new Error(`backup artifact mismatch: ${file.path}`);
  }
  return manifest;
}

export async function restoreDrill({ backupDir, destinationDir, authKey, stateKey, expectedPaths = [] }) {
  const manifest = await verifyBackup({ backupDir, authKey });
  const state = decryptOperationalState(await readFile(join(backupDir, STATE)), stateKey);
  await mkdir(destinationDir, { recursive: false });
  for (const file of manifest.files) {
    const destination = join(destinationDir, file.path);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, await readFile(join(backupDir, file.path)));
  }
  for (const path of expectedPaths) await stat(join(destinationDir, path));
  return { manifest, state, restoredFiles: manifest.files.length };
}

export async function pruneBackups({ offsiteDir, now = new Date(), retentionDays }) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new Error("retentionDays must be a positive integer");
  const cutoff = now.getTime() - retentionDays * 86400000;
  for (const entry of await readdir(offsiteDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("backup-")) continue;
    const directory = join(offsiteDir, entry.name);
    const manifestPath = join(directory, MANIFEST);
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (Date.parse(manifest.createdAt) < cutoff) await rm(directory, { recursive: true, force: true });
    } catch {
      // An incomplete or unreadable set is never silently treated as expired.
    }
  }
}
