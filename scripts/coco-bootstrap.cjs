const { createHash, randomBytes } = require("node:crypto");
const { closeSync, constants, fchmodSync, fsyncSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } = require("node:fs");
const { mkdir: mkdirAsync, open: openAsync } = require("node:fs/promises");
const { homedir } = require("node:os");
const { basename, dirname, join, relative, resolve, sep } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = resolve(dirname(__filename), "..");
const manifestPath = join(root, "resources", "runtime-integrity-manifest.v1.json");
const sidecarPath = `${manifestPath}.sha256`;
const agentDir = process.env.COCO_CODING_AGENT_DIR || join(homedir(), ".coco", "agent");
const cachePath = join(agentDir, ".runtime-integrity-cache.json");
const runtimeCachePath = join(agentDir, ".runtime-cas-integrity-cache.json");
const runtimeStore = join(agentDir, "runtime");

const EXCLUDED_COMPONENTS = new Set([".bin", ".package-lock.json", "coverage", "node-gyp-bin", "npm", "src", "test", "tests"]);
const PACKAGE_EXCLUDED = new Set([
  "scripts/bootstrap-final-verification.mjs", "scripts/bootstrap-npm.mjs", "scripts/dev-provider-sync.mjs", "scripts/egress-node-guard.cjs",
  "scripts/final-quality-review.mjs", "scripts/final-scope-redaction.mjs", "scripts/final-verifier-manifest.partial.v1.json", "scripts/generate-final-verifier-manifest.mjs", "scripts/print-final-env.mjs",
  "scripts/run-egress-allowlist.mjs", "scripts/run-final-f3.mjs", "scripts/run-tests-preserving-receipts.mjs",
  "scripts/run-with-timeout.mjs", "scripts/validate-protected-baseline.mjs", "scripts/verify-baseline-authorization.mjs", "scripts/verify-final-verifier-manifest.mjs",
  "scripts/verify-plan-evidence.mjs", "scripts/verify-protected-baseline.mjs",
  "node_modules/@earendil-works/pi-coding-agent/node_modules/proper-lockfile/CHANGELOG.md",
  "node_modules/@earendil-works/pi-coding-agent/node_modules/which/CHANGELOG.md",
  "node_modules/proper-lockfile/CHANGELOG.md",
  "node_modules/which/CHANGELOG.md",
  "node_modules/@earendil-works/pi-coding-agent/.runtime-integrity-cache.json",
]);
for (let task = 1; task <= 16; task += 1) PACKAGE_EXCLUDED.add(`scripts/qa-task-${task}.mjs`);
const TRUST_ANCHORS = new Set(["bin/coco", "scripts/coco-bootstrap.cjs"]);
const MANIFEST_ENTRY = "resources/runtime-integrity-manifest.v1.json";
const SIDECAR_ENTRY = "resources/runtime-integrity-manifest.v1.json.sha256";
const ASSET_MAP_ENTRY = "scripts/package-asset-map.v1.json";
const CACHE_SCHEMA_VERSION = 3;

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
function reject(code) { process.stderr.write(`coco: ${code}\n`); process.exitCode = 1; }
function mode(info) { return (info.mode & 0o111) === 0 ? 0o644 : 0o755; }
function pathOf(absolute, base = root) { return relative(base, absolute).split(sep).join("/"); }
function safePath(path) { return typeof path === "string" && path !== "" && !path.startsWith("/") && !path.startsWith("../") && !path.includes("/../") && path === path.normalize("NFC"); }
function runtimeRootsFor(entries) { return [...new Set(entries.map((entry) => entry.path.split("/", 1)[0]))]; }
function snapshot(info) { return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, mode: info.mode & 0o7777, dev: info.dev, ino: info.ino }; }
function sameSnapshot(left, right) { return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode && left.dev === right.dev && left.ino === right.ino; }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : undefined;
function expectedType(info, type) { return type === "directory" ? info.isDirectory() && !info.isSymbolicLink() : info.isFile() && !info.isSymbolicLink(); }
function openVerified(path, type) {
  if (noFollow === undefined) return undefined;
  const before = lstatSync(path);
  if (!expectedType(before, type)) return undefined;
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | noFollow);
    const opened = fstatSync(descriptor);
    if (!expectedType(opened, type) || !sameSnapshot(snapshot(before), snapshot(opened))) {
      closeQuietly(descriptor);
      return undefined;
    }
    return { descriptor, before: snapshot(before), opened: snapshot(opened), type };
  } catch (error) {
    closeQuietly(descriptor);
    throw error;
  }
}
function revalidatePath(path, verified) {
  const opened = fstatSync(verified.descriptor);
  const current = lstatSync(path);
  return expectedType(opened, verified.type) && expectedType(current, verified.type)
    && sameSnapshot(verified.before, snapshot(opened)) && sameSnapshot(verified.before, snapshot(current));
}
function revalidateCurrentPath(path, verified) {
  const opened = fstatSync(verified.descriptor);
  const current = lstatSync(path);
  return expectedType(opened, verified.type) && expectedType(current, verified.type)
    && sameSnapshot(snapshot(opened), snapshot(current));
}
function closeQuietly(descriptor) { if (descriptor !== undefined) try { closeSync(descriptor); } catch { /* cleanup cannot recover from a close failure */ } }
function safeInteger(value) { return typeof value === "number" && Number.isSafeInteger(value); }
function snapshotValid(value) {
  if (!value || typeof value !== "object") return false;
  const fields = Object.keys(value);
  return fields.length === 6 && fields.every((field) => ["size", "mtimeMs", "ctimeMs", "mode", "dev", "ino"].includes(field))
    && safeInteger(value.size) && value.size >= 0 && Number.isFinite(value.mtimeMs) && Number.isFinite(value.ctimeMs)
    && safeInteger(value.mode) && value.mode >= 0 && value.mode <= 0o7777 && safeInteger(value.dev) && safeInteger(value.ino);
}

function cacheValid(cached) {
  if (!cached || typeof cached !== "object" || Array.isArray(cached)) return false;
  const fields = Object.keys(cached);
  return fields.length === 5 && fields.every((field) => ["schemaVersion", "manifestHash", "entries", "directories", "directoryCount"].includes(field))
    && cached.schemaVersion === CACHE_SCHEMA_VERSION && typeof cached.manifestHash === "string" && /^[a-f0-9]{64}$/.test(cached.manifestHash)
    && cached.entries && typeof cached.entries === "object" && !Array.isArray(cached.entries)
    && cached.directories && typeof cached.directories === "object" && !Array.isArray(cached.directories)
    && Number.isSafeInteger(cached.directoryCount) && cached.directoryCount === Object.keys(cached.directories).length;
}

function readCache(path = cachePath) {
  let descriptor;
  try {
    const verified = openVerified(path, "file");
    if (!verified) return undefined;
    descriptor = verified.descriptor;
    const parsed = JSON.parse(readFileSync(descriptor, "utf8"));
    if (!revalidatePath(path, verified)) return undefined;
    if (cacheValid(parsed)) return parsed;
  } catch { /* cache absent or corrupt - fall through to full verification */ }
  finally { closeQuietly(descriptor); }
  return undefined;
}

function writeCache(manifestHash, snapshots, directories, path = cachePath) {
  let directoryDescriptor;
  let temporaryDescriptor;
  let temporary;
  try {
    for (const value of Object.values(snapshots)) if (!snapshotValid(value)) return;
    for (const value of Object.values(directories)) if (!snapshotValid(value)) return;
    if (typeof constants.O_NOFOLLOW !== "number") return;
    const directory = dirname(path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const directoryInfo = lstatSync(directory);
    if (!expectedType(directoryInfo, "directory")) return;
    directoryDescriptor = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const openedDirectory = fstatSync(directoryDescriptor);
    if (!expectedType(openedDirectory, "directory") || !sameSnapshot(snapshot(directoryInfo), snapshot(openedDirectory))) return;
    try { if (lstatSync(path).isSymbolicLink()) return; } catch (error) { if (error.code !== "ENOENT") throw error; }
    temporary = join(directory, `.${randomBytes(16).toString("hex")}.tmp`);
    temporaryDescriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(temporaryDescriptor, JSON.stringify({ schemaVersion: CACHE_SCHEMA_VERSION, manifestHash, entries: snapshots, directories, directoryCount: Object.keys(directories).length }), "utf8");
    fchmodSync(temporaryDescriptor, 0o600);
    fsyncSync(temporaryDescriptor);
    closeSync(temporaryDescriptor); temporaryDescriptor = undefined;
    const currentDirectory = lstatSync(directory);
    if (!expectedType(currentDirectory, "directory") || !sameIdentity(snapshot(openedDirectory), snapshot(currentDirectory))) return;
    try { if (lstatSync(path).isSymbolicLink()) return; } catch (error) { if (error.code !== "ENOENT") throw error; }
    renameSync(temporary, path); temporary = undefined;
    fsyncSync(directoryDescriptor);
  } catch { /* cache write is best-effort */ }
  finally {
    closeQuietly(temporaryDescriptor);
    if (temporary) try { rmSync(temporary, { force: true }); } catch { /* best-effort cleanup */ }
    closeQuietly(directoryDescriptor);
  }
}

function directorySnapshots(runtimeRoots, base = root) {
  const directories = {};
  for (const directory of runtimeRoots) {
    const absolute = join(base, directory);
    let info;
    try { info = lstatSync(absolute); } catch { return null; }
    if (info.isFile() && !info.isSymbolicLink()) continue;
    if (!info.isDirectory() || info.isSymbolicLink()) return null;
    directories[directory] = snapshot(info);
    for (const dirent of readdirSync(absolute, { withFileTypes: true, recursive: true })) {
      if (!dirent.isDirectory() || EXCLUDED_COMPONENTS.has(dirent.name) || dirent.parentPath.split(sep).some((component) => EXCLUDED_COMPONENTS.has(component))) continue;
      const path = pathOf(join(dirent.parentPath, dirent.name), base);
      const child = lstatSync(join(base, path));
      if (!child.isDirectory() || child.isSymbolicLink()) return null;
      directories[path] = snapshot(child);
    }
  }
  return directories;
}

function directorySnapshotsMatch(directories, runtimeRoots, base = root) {
  if (Object.keys(directories).length === 0) return false;
  const allowedRoots = new Set(runtimeRoots);
  try {
    return Object.entries(directories).every(([path, cachedSnapshot]) => {
      if (!snapshotValid(cachedSnapshot) || ![...allowedRoots].some((directory) => path === directory || path.startsWith(`${directory}/`))) return false;
      const info = lstatSync(join(base, path));
      return expectedType(info, "directory") && sameSnapshot(snapshot(info), cachedSnapshot);
    });
  } catch { return false; }
}

function entrySnapshotsMatch(cached, manifest, base) {
  if (!cached || Object.keys(cached).length !== manifest.entries.length) return false;
  try {
    return manifest.entries.every((entry) => {
      const expected = cached[entry.path];
      if (!snapshotValid(expected)) return false;
      const info = lstatSync(join(base, entry.path));
      return expectedType(info, "file") && mode(info) === entry.mode && sameSnapshot(snapshot(info), expected);
    });
  } catch { return false; }
}

/** Walk a runtime root with readdir only (no per-file stat), returning file
 * paths relative to root. Scope matches manifest generation: ROOTS +
 * dependency roots only. Returns null on unexpected entry types. */
function walkPaths(absolute, output = [], base = root) {
  const rootInfo = lstatSync(absolute);
  if (rootInfo.isSymbolicLink() || (!rootInfo.isFile() && !rootInfo.isDirectory())) return null;
  if (rootInfo.isFile()) {
    const filePath = pathOf(absolute, base);
    if (!PACKAGE_EXCLUDED.has(filePath)) output.push(filePath);
    return output;
  }
  const entries = readdirSync(absolute, { withFileTypes: true, recursive: true });
  for (const dirent of entries) {
    if (EXCLUDED_COMPONENTS.has(dirent.name) || dirent.parentPath.split(sep).some((component) => EXCLUDED_COMPONENTS.has(component))) continue;
    if (dirent.isSymbolicLink()) return null;
    if (!dirent.isFile() && !dirent.isDirectory()) return null;
    if (!dirent.isFile()) continue;
    const filePath = pathOf(join(dirent.parentPath, dirent.name), base);
    if (!PACKAGE_EXCLUDED.has(filePath)) output.push(filePath);
  }
  return output;
}

/** Cheap structural check: the file path set on disk must exactly match the
 * manifest's entry path set. No content hashing. */
function structureCheck(expected, runtimeRoots, base = root) {
  const walked = [];
  for (const directory of runtimeRoots) {
    const result = walkPaths(join(base, directory), [], base);
    if (result === null) return false;
    walked.push(...result);
  }
  const filtered = walked.filter((path) => path !== MANIFEST_ENTRY && path !== SIDECAR_ENTRY && !TRUST_ANCHORS.has(path));
  const expectedRuntime = new Set([...expected].filter((path) => runtimeRoots.some((directory) => path === directory || path.startsWith(`${directory}/`))));
  if (filtered.length !== expectedRuntime.size) return false;
  for (const path of filtered) if (!expectedRuntime.has(path)) return false;
  return true;
}

function readVerifiedBytes(path, code) {
  let descriptor;
  try {
    const verified = openVerified(path, "file");
    if (!verified) throw new Error(code);
    descriptor = verified.descriptor;
    const bytes = readFileSync(descriptor);
    if (!revalidatePath(path, verified)) throw new Error(code);
    return bytes;
  } finally {
    closeQuietly(descriptor);
  }
}

function verifyAssetMap(manifest) {
  const bytes = readVerifiedBytes(join(root, ASSET_MAP_ENTRY), "RUNTIME_INTEGRITY_MAP_INVALID");
  let map;
  try { map = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("RUNTIME_INTEGRITY_MAP_INVALID"); }
  if (bytes.toString("utf8") !== `${JSON.stringify(canonical(map))}\n` || hash(bytes) !== manifest.assetMapSha256
    || map.schemaVersion !== 2 || !Array.isArray(map.entries)) throw new Error("RUNTIME_INTEGRITY_MAP_INVALID");
  const paths = new Set();
  for (const entry of map.entries) {
    if (!entry || !safePath(entry.path) || typeof entry.class !== "string" || (typeof entry.sha256 !== "string" && entry.sha256 !== null) || paths.has(entry.path)) throw new Error("RUNTIME_INTEGRITY_MAP_INVALID");
    paths.add(entry.path);
  }
  const manifestPaths = new Set(manifest.entries.map((entry) => entry.path));
  for (const entry of map.entries) {
    if (entry.path === ASSET_MAP_ENTRY || entry.path === MANIFEST_ENTRY || entry.path === SIDECAR_ENTRY || TRUST_ANCHORS.has(entry.path) || PACKAGE_EXCLUDED.has(entry.path) || entry.sha256 === null || manifestPaths.has(entry.path)) continue;
    if (hash(readVerifiedBytes(join(root, entry.path), "RUNTIME_INTEGRITY_REVALIDATION_FAILED")) !== entry.sha256) return false;
  }
  return true;
}

function rehashEntry(entry, base = root, snapshots) {
  const path = join(base, entry.path);
  let descriptor;
  try {
    const verified = openVerified(path, "file");
    if (!verified) throw new Error("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    descriptor = verified.descriptor;
    const bytes = readFileSync(descriptor);
    if (!revalidatePath(path, verified) || bytes.length !== entry.size || hash(bytes) !== entry.sha256 || mode(verified.opened) !== entry.mode) return undefined;
    closeSync(descriptor); descriptor = undefined;
    const current = lstatSync(path);
    if (!expectedType(current, "file") || !sameSnapshot(verified.opened, snapshot(current))) return undefined;
    if (snapshots) snapshots[entry.path] = snapshot(current);
    return bytes;
  } finally {
    closeQuietly(descriptor);
  }
}

function writeSnapshotFile(snapshotRoot, path, bytes, fileMode) {
  const absolute = join(snapshotRoot, path);
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(descriptor, bytes);
    fchmodSync(descriptor, fileMode);
  } finally {
    closeQuietly(descriptor);
  }
}

async function writeSnapshotEntries(snapshotRoot, entries, verifiedBytes) {
  for (let start = 0; start < entries.length; start += 64) {
    await Promise.all(entries.slice(start, start + 64).map(async (entry) => {
      const bytes = verifiedBytes.get(entry.path); if (!bytes) throw new Error("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
      const absolute = join(snapshotRoot, entry.path); await mkdirAsync(dirname(absolute), { recursive: true, mode: 0o700 });
      const descriptor = await openAsync(absolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await descriptor.writeFile(bytes); await descriptor.chmod(entry.mode); } finally { await descriptor.close(); }
    }));
  }
}

function runtimeKey(manifestBytes) { return `${hash(manifestBytes)}-node${process.versions.modules}-${process.platform}-${process.arch}`; }
const runtimeKeyPattern = /^[a-f0-9]{64}-node[0-9]+-[a-z0-9]+-[a-z0-9]+$/;
function processIdentitySync(pid) {
  try {
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8"), end = stat.lastIndexOf(")"), fields = stat.slice(end + 2).split(" ");
      return `linux:${fields[19]}`;
    }
    process.kill(pid, 0); return `${process.platform}:${pid}`;
  } catch { return null; }
}
function runtimeReferences() {
  const references = new Set();
  for (const statePath of [join(agentDir, "runner.json"), join(agentDir, "control.json")]) {
    try { const state = JSON.parse(readFileSync(statePath, "utf8")); if (typeof state.runtimeRoot === "string" && state.runtimeRoot.startsWith(`${runtimeStore}${sep}`)) references.add(resolve(state.runtimeRoot)); } catch {}
  }
  return references;
}
function collectRuntimeGarbage(currentKey, policy) {
  mkdirSync(runtimeStore, { recursive: true, mode: 0o700 });
  const now = Date.now(), references = runtimeReferences();
  const leaseStore = join(runtimeStore, ".leases"); mkdirSync(leaseStore, { recursive: true, mode: 0o700 });
  const activeLeases = new Set();
  for (const lease of readdirSync(leaseStore)) {
    try { const value = JSON.parse(readFileSync(join(leaseStore, lease), "utf8")); const alive = Number.isSafeInteger(value.pid) && processIdentitySync(value.pid) === value.processIdentity; if (alive && typeof value.key === "string") activeLeases.add(value.key); else rmSync(join(leaseStore, lease), { force: true }); } catch { rmSync(join(leaseStore, lease), { force: true }); }
  }
  const entries = readdirSync(runtimeStore).map((name) => { const path = join(runtimeStore, name); let info; try { info = lstatSync(path); } catch { return null; } return { directory: info.isDirectory() && !info.isSymbolicLink(), mtimeMs: info.mtimeMs, name, path: resolve(path) }; }).filter(Boolean);
  for (const path of policy.collectRuntimeNames({ activeKeys: activeLeases, currentKey, entries, now, references })) {
    rmSync(path, { force: true, recursive: true });
  }
  for (const name of readdirSync(runtimeStore)) {
    const path = join(runtimeStore, name);
    let info; try { info = statSync(path); } catch { continue; }
    if (!info.isDirectory()) continue;
    if (name === currentKey || !runtimeKeyPattern.test(name) || references.has(resolve(path)) || activeLeases.has(name)) continue;
  }
  const fs = statfsSync(runtimeStore);
  if (!policy.storageBudgetValid({ availableBytes: fs.bavail * fs.bsize, availableInodes: fs.ffree })) throw new Error("RUNTIME_STORAGE_BUDGET_EXCEEDED");
}
function lockOwnerAlive(owner) {
  return owner && Number.isSafeInteger(owner.pid) && typeof owner.processIdentity === "string" && processIdentitySync(owner.pid) === owner.processIdentity;
}
function readRuntimeLock(lockPath) {
  try { return JSON.parse(readFileSync(lockPath, "utf8")); } catch { return null; }
}
function waitForRuntimeLock(lockPath) {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const configuredTimeout = Number(process.env.COCO_RUNTIME_LOCK_TIMEOUT_MS);
  const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0 ? Math.min(configuredTimeout, 30_000) : 10_000;
  const owner = { ownerId: randomBytes(16).toString("hex"), pid: process.pid, processIdentity: processIdentitySync(process.pid), schemaVersion: 1 };
  if (typeof owner.processIdentity !== "string") throw new Error("RUNTIME_LOCK_IDENTITY_UNAVAILABLE");
  const prefix = `${basename(lockPath)}-`, directory = dirname(lockPath);
  const existingTickets = readdirSync(directory).filter((name) => name.startsWith(prefix)).map((name) => Number(name.slice(prefix.length).split("-", 1)[0])).filter(Number.isSafeInteger);
  const ticket = Math.max(Date.now(), ...existingTickets.map((value) => value + 1));
  const ownerPath = join(directory, `${prefix}${ticket}-${owner.ownerId}`), temporaryPath = `${ownerPath}.pending`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(descriptor, JSON.stringify(owner) + "\n"); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    renameSync(temporaryPath, ownerPath);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const active = [];
      for (const name of readdirSync(directory).filter((entry) => entry.startsWith(prefix) && !entry.endsWith(".pending")).sort()) {
        const contenderPath = join(directory, name), contender = readRuntimeLock(contenderPath);
        if (lockOwnerAlive(contender)) active.push(contenderPath);
        else rmSync(contenderPath, { force: true });
      }
      if (active[0] === ownerPath) return { owner, ownerPath };
      Atomics.wait(sleeper, 0, 0, 25);
    }
    throw new Error("RUNTIME_LOCK_TIMEOUT");
  } catch (error) {
    closeQuietly(descriptor);
    rmSync(temporaryPath, { force: true });
    rmSync(ownerPath, { force: true });
    throw error;
  }
}
function releaseRuntimeLock(lockPath, owner) {
  const current = readRuntimeLock(lockPath);
  if (current?.ownerId === owner.ownerId && current.pid === owner.pid && current.processIdentity === owner.processIdentity) rmSync(lockPath, { force: true });
}
function snapshotValidForManifest(snapshotRoot, manifest, manifestBytes, sidecarBytes, runtimeRoots, expected, policy, key, verifiedState) {
  try {
    const directories = directorySnapshots(runtimeRoots, snapshotRoot);
    const entries = {};
    if (!directories) return false;
    const complete = JSON.parse(readFileSync(join(snapshotRoot, ".runtime-complete.json"), "utf8"));
    if (!policy.completionValid(complete, key, hash(manifestBytes)) || !structureCheck(expected, runtimeRoots, snapshotRoot)) return false;
    for (const entry of manifest.entries) if (!rehashEntry(entry, snapshotRoot, entries)) return false;
    const storedManifest = readVerifiedBytes(join(snapshotRoot, MANIFEST_ENTRY), "RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    const storedSidecar = readVerifiedBytes(join(snapshotRoot, SIDECAR_ENTRY), "RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    const manifestInfo = lstatSync(join(snapshotRoot, MANIFEST_ENTRY)), sidecarInfo = lstatSync(join(snapshotRoot, SIDECAR_ENTRY));
    const valid = storedManifest.equals(manifestBytes) && storedSidecar.equals(sidecarBytes) && mode(manifestInfo) === 0o644 && mode(sidecarInfo) === 0o644
      && directorySnapshotsMatch(directories, runtimeRoots, snapshotRoot, manifest.entries);
    if (valid && verifiedState) Object.assign(verifiedState, { directories, entries });
    return valid;
  } catch { return false; }
}

function criticalSnapshotValid(snapshotRoot, manifest, manifestBytes, sidecarBytes, policy, key) {
  try {
    const complete = JSON.parse(readFileSync(join(snapshotRoot, ".runtime-complete.json"), "utf8"));
    if (!policy.completionValid(complete, key, hash(manifestBytes))) return false;
    for (const path of ["scripts/coco-launcher.mjs", "scripts/runtime-store-policy.cjs"]) {
      const entry = manifest.entries.find((candidate) => candidate.path === path);
      if (!entry || !rehashEntry(entry, snapshotRoot)) return false;
    }
    const storedManifest = readVerifiedBytes(join(snapshotRoot, MANIFEST_ENTRY), "RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    const storedSidecar = readVerifiedBytes(join(snapshotRoot, SIDECAR_ENTRY), "RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    return hash(storedManifest) === hash(manifestBytes) && storedManifest.equals(manifestBytes)
      && hash(storedSidecar) === hash(sidecarBytes) && storedSidecar.equals(sidecarBytes)
      && mode(lstatSync(join(snapshotRoot, MANIFEST_ENTRY))) === 0o644 && mode(lstatSync(join(snapshotRoot, SIDECAR_ENTRY))) === 0o644;
  } catch { return false; }
}

function cachedSnapshotValid(snapshotRoot, manifest, manifestBytes, sidecarBytes, runtimeRoots, policy, key) {
  const cached = readCache(runtimeCachePath);
  return cached?.manifestHash === hash(manifestBytes)
    && directorySnapshotsMatch(cached.directories, runtimeRoots, snapshotRoot)
    && entrySnapshotsMatch(cached.entries, manifest, snapshotRoot)
    && criticalSnapshotValid(snapshotRoot, manifest, manifestBytes, sidecarBytes, policy, key);
}

function cacheRuntimeSnapshot(manifestBytes, verifiedState) {
  if (verifiedState.entries && verifiedState.directories) writeCache(hash(manifestBytes), verifiedState.entries, verifiedState.directories, runtimeCachePath);
}

async function createRuntimeSnapshot(manifest, manifestBytes, sidecarBytes, sourceBytes, runtimeRoots, expected, policy) {
  mkdirSync(runtimeStore, { recursive: true, mode: 0o700 });
  const key = runtimeKey(manifestBytes), snapshotRoot = join(runtimeStore, key), leaseStore = join(runtimeStore, ".leases"), leasePath = join(leaseStore, `${key}-${process.pid}`), lockPath = join(runtimeStore, `.${key}.lock`);
  collectRuntimeGarbage(key, policy);
  const lock = waitForRuntimeLock(lockPath);
  let stagingRoot;
  let rootDescriptor;
  let validated = false;
  let cacheHit = false;
  const verifiedState = {};
  let verifiedBytes;
  const createStaging = () => {
    verifiedBytes = sourceBytes();
    stagingRoot = mkdtempSync(join(runtimeStore, `.staging-${key}-`));
    rootDescriptor = openSync(stagingRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  };
  try {
    mkdirSync(runtimeStore, { recursive: true, mode: 0o700 });
    try {
      rootDescriptor = openSync(snapshotRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try {
        cacheHit = cachedSnapshotValid(snapshotRoot, manifest, manifestBytes, sidecarBytes, runtimeRoots, policy, key);
        if (!cacheHit && !snapshotValidForManifest(snapshotRoot, manifest, manifestBytes, sidecarBytes, runtimeRoots, expected, policy, key, verifiedState)) throw new Error("RUNTIME_INTEGRITY_COMPLETION_INVALID");
        validated = true;
      } catch {
        closeSync(rootDescriptor); rootDescriptor = undefined; rmSync(snapshotRoot, { force: true, recursive: true });
        createStaging();
      }
    } catch (error) { if (error?.code !== "ENOENT") throw error; createStaging(); }
    fchmodSync(rootDescriptor, 0o700);
    if (stagingRoot) {
      await writeSnapshotEntries(stagingRoot, manifest.entries, verifiedBytes);
      writeSnapshotFile(stagingRoot, MANIFEST_ENTRY, manifestBytes, 0o644);
      writeSnapshotFile(stagingRoot, SIDECAR_ENTRY, sidecarBytes, 0o644);
      writeSnapshotFile(stagingRoot, ".runtime-complete.json", Buffer.from(JSON.stringify(canonical({ key, manifestHash: hash(manifestBytes), schemaVersion: 1 })) + "\n"), 0o600);
      if (!structureCheck(expected, runtimeRoots, stagingRoot)) throw new Error("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
      closeSync(rootDescriptor); rootDescriptor = undefined;
      renameSync(stagingRoot, snapshotRoot); stagingRoot = undefined;
      rootDescriptor = openSync(snapshotRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    }
    if (!validated && !snapshotValidForManifest(snapshotRoot, manifest, manifestBytes, sidecarBytes, runtimeRoots, expected, policy, key, verifiedState)) throw new Error("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    if (!cacheHit) cacheRuntimeSnapshot(manifestBytes, verifiedState);
    closeSync(rootDescriptor); rootDescriptor = undefined;
    mkdirSync(leaseStore, { recursive: true, mode: 0o700 });
    writeFileSync(leasePath, JSON.stringify({ key, pid: process.pid, processIdentity: processIdentitySync(process.pid), startedAt: new Date().toISOString(), schemaVersion: 1 }) + "\n", { mode: 0o600 });
    return snapshotRoot;
  } catch (error) {
    if (stagingRoot) rmSync(stagingRoot, { force: true, recursive: true });
    throw error;
  } finally {
    closeQuietly(rootDescriptor);
    releaseRuntimeLock(lock.ownerPath, lock.owner);
  }
}

async function main() {
  let rootDescriptor;
  let manifestDescriptor;
  let sidecarDescriptor;
  let runtimeSnapshot;
  try {
    const verifiedRoot = openVerified(root, "directory");
    if (!verifiedRoot) return reject("RUNTIME_INTEGRITY_MANIFEST_MISSING");
    rootDescriptor = verifiedRoot.descriptor;
    const verifiedManifest = openVerified(manifestPath, "file");
    if (!verifiedManifest) return reject("RUNTIME_INTEGRITY_MANIFEST_MISSING");
    manifestDescriptor = verifiedManifest.descriptor;
    const verifiedSidecar = openVerified(sidecarPath, "file");
    if (!verifiedSidecar) return reject("RUNTIME_INTEGRITY_MANIFEST_MISSING");
    sidecarDescriptor = verifiedSidecar.descriptor;
    const bytes = readFileSync(manifestDescriptor);
    if (!revalidatePath(manifestPath, verifiedManifest)) return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    const manifestText = bytes.toString("utf8");
    const manifest = JSON.parse(manifestText);
    const sidecarBytes = readFileSync(sidecarDescriptor);
    if (!revalidatePath(sidecarPath, verifiedSidecar)) return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    const manifestHash = hash(bytes);
    const expectedSidecar = `${manifestHash}  runtime-integrity-manifest.v1.json\n`;
    if (sidecarBytes.toString("utf8") !== expectedSidecar) {
      console.error("SIDECAR_MISMATCH", sidecarBytes.toString("utf8"), expectedSidecar);
      return reject("RUNTIME_INTEGRITY_SIDECAR_INVALID");
    }
    const cached = process.env.COCO_INTEGRITY_FULL === "1" ? undefined : readCache();
    const canonicalBytes = `${JSON.stringify(canonical(manifest))}\n`;
    if (canonicalBytes !== manifestText) {
      console.error("CANONICAL_MISMATCH", canonicalBytes.length, bytes.length);
      return reject("RUNTIME_INTEGRITY_MANIFEST_CANONICAL");
    }
    if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.assetMapSha256) || !Array.isArray(manifest.entries)) return reject("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const entriesValid = manifest.entries.every((entry) => entry && safePath(entry.path) && typeof entry.class === "string" && Number.isInteger(entry.mode) && Number.isInteger(entry.size) && /^[a-f0-9]{64}$/.test(entry.sha256));
    if (!entriesValid) return reject("RUNTIME_INTEGRITY_MANIFEST_ENTRY_INVALID");
    const expected = new Set(manifest.entries.map((entry) => entry.path));
    if (expected.size !== manifest.entries.length) return reject("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const entryPaths = manifest.entries.map((entry) => entry.path);
    const startupPaths = manifest.startupClosure === undefined ? entryPaths : manifest.startupClosure;
    if (!Array.isArray(startupPaths) || startupPaths.length !== entryPaths.length || new Set(startupPaths).size !== startupPaths.length || !startupPaths.every((path) => typeof path === "string" && expected.has(path))) return reject("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const startupSet = new Set(startupPaths);
    const runtimeRoots = runtimeRootsFor(manifest.entries);
    if (!verifyAssetMap(manifest)) return reject("RUNTIME_INTEGRITY_MISMATCH");
    // Fast path: cached directory topology + trusted-local file metadata.
    // Set COCO_INTEGRITY_FULL=1 (or delete the cache) to force full hashing.
    let verified = false;
    if (process.env.COCO_INTEGRITY_FULL !== "1") {
      if (cached?.manifestHash === manifestHash && directorySnapshotsMatch(cached.directories, runtimeRoots)) {
        const cachedPaths = Object.keys(cached.entries);
        const fastEntries = manifest.entries.filter((entry) => startupSet.has(entry.path));
        verified = cachedPaths.length === fastEntries.length && cachedPaths.every((path) => startupSet.has(path))
          && entrySnapshotsMatch(cached.entries, { entries: fastEntries }, root);
      }
    }

    if (!verified) {
      let entryIndex = 0;
      const verifiedSnapshots = {};
      for (const entry of manifest.entries) {
        const path = join(root, entry.path);
        let entryDescriptor;
        try {
          const verifiedEntry = openVerified(path, "file");
          if (!verifiedEntry) return reject(`RUNTIME_INTEGRITY_MISMATCH_${entry.path}`);
          entryDescriptor = verifiedEntry.descriptor;
          const before = snapshot(fstatSync(entryDescriptor));
          if (!snapshotValid(before) || mode(before) !== entry.mode) {
            console.error("ENTRY_MISSING", entryIndex, entry.path);
            return reject(`RUNTIME_INTEGRITY_MISMATCH_${entry.path}`);
          }
          const bytes = readFileSync(entryDescriptor);
          const after = snapshot(fstatSync(entryDescriptor));
          if (!sameSnapshot(before, after)) {
            console.error("ENTRY_RACE", entryIndex, entry.path);
            return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
          }
          if (hash(bytes) !== entry.sha256) {
            console.error("ENTRY_HASH_MISMATCH", entryIndex, entry.path, entry.sha256, hash(bytes));
            return reject(`RUNTIME_INTEGRITY_MISMATCH_${entry.path}`);
          }
          if (!revalidatePath(path, verifiedEntry)) {
            console.error("ENTRY_RACE", entryIndex, entry.path);
            return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
          }
          if (startupSet.has(entry.path)) verifiedSnapshots[entry.path] = after;
        } finally {
          closeQuietly(entryDescriptor);
        }
        entryIndex++;
      }
      // Structural scope: reject files present on disk that the manifest does
      // not list (unexpected additions inside runtime roots). Reuse the same
      // runtimeRoots walk as the fast path; readdir-only, cheap vs full hashing.
      const walked = [];
      for (const directory of runtimeRoots) {
        const result = walkPaths(join(root, directory));
        if (result === null) return reject("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
        walked.push(...result);
      }
      for (const path of walked) {
        if (path === MANIFEST_ENTRY || path === SIDECAR_ENTRY || TRUST_ANCHORS.has(path)) continue;
        if (!expected.has(path)) {
          console.error("UNEXPECTED_ENTRY", path);
          return reject("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
        }
      }
      const verifiedDirectories = directorySnapshots(runtimeRoots);
      if (verifiedDirectories !== null && Object.keys(verifiedSnapshots).length === startupSet.size && structureCheck(expected, runtimeRoots) && directorySnapshotsMatch(verifiedDirectories, runtimeRoots)) {
        writeCache(manifestHash, verifiedSnapshots, verifiedDirectories);
      }
    }
    if (!revalidateCurrentPath(root, verifiedRoot)) {
      console.error("ROOT_RACE");
      return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    }
    if (!revalidatePath(manifestPath, verifiedManifest) || !revalidatePath(sidecarPath, verifiedSidecar)) {
      console.error("MANIFEST_RACE");
      return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    }
    closeSync(sidecarDescriptor); sidecarDescriptor = undefined;
    closeSync(manifestDescriptor); manifestDescriptor = undefined;
    closeSync(rootDescriptor); rootDescriptor = undefined;
    process.env.COCO_INTEGRITY_MODE = verified ? "fast" : "full";
    if (process.env.PI_OFFLINE === undefined) process.env.PI_OFFLINE = "1";
    if (process.argv.length === 3 && (process.argv[2] === "--version" || process.argv[2] === "-v")) {
      const packageEntry = manifest.entries.find((entry) => entry.path === "package.json");
      const packageBytes = packageEntry && rehashEntry(packageEntry);
      if (!packageBytes) return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
      process.stdout.write(`${JSON.parse(packageBytes.toString("utf8")).version}\n`);
      return;
    }
    const launcherEntry = manifest.entries.find((entry) => entry.path === "scripts/coco-launcher.mjs");
    const launcherBytes = launcherEntry && rehashEntry(launcherEntry);
    if (!launcherBytes) return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    const policyEntry = manifest.entries.find((entry) => entry.path === "scripts/runtime-store-policy.cjs");
    const policyBytes = policyEntry && rehashEntry(policyEntry);
    if (!policyBytes) return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    const policyModule = { exports: {} };
    new Function("module", "exports", policyBytes.toString("utf8"))(policyModule, policyModule.exports);
    if (typeof policyModule.exports.collectRuntimeNames !== "function" || typeof policyModule.exports.completionValid !== "function" || typeof policyModule.exports.storageBudgetValid !== "function") return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    runtimeSnapshot = await createRuntimeSnapshot(manifest, bytes, sidecarBytes, () => {
      const verifiedBytes = new Map();
      for (const entry of manifest.entries) {
        if (!startupSet.has(entry.path)) continue;
        const entryBytes = rehashEntry(entry);
        if (!entryBytes) throw new Error("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
        verifiedBytes.set(entry.path, entryBytes);
      }
      return verifiedBytes;
    }, runtimeRoots, expected, policyModule.exports);
    process.env.COCO_RUNTIME_INTEGRITY_CACHE_PATH = join(agentDir, ".runtime-integrity-runtime-cache.json");
    process.env.COCO_RUNTIME_KEY = runtimeKey(bytes);
    process.env.COCO_RUNTIME_ROOT = runtimeSnapshot;
    globalThis[Symbol.for("coco.runtime.integrity.v1")] = Object.freeze({ key: process.env.COCO_RUNTIME_KEY, root: runtimeSnapshot });
    await import(pathToFileURL(join(runtimeSnapshot, "scripts", "coco-launcher.mjs")).href);
  } catch (error) {
    console.error("BOOTSTRAP_ERROR", error);
    reject("RUNTIME_INTEGRITY_INVALID");
  } finally {
    closeQuietly(sidecarDescriptor);
    closeQuietly(manifestDescriptor);
    closeQuietly(rootDescriptor);
  }
}
module.exports = main();
