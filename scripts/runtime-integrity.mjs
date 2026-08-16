import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const MANIFEST = "resources/runtime-integrity-manifest.v1.json";
const SIDECAR = "resources/runtime-integrity-manifest.v1.json.sha256";
const MAP = "scripts/package-asset-map.v1.json";
const ROOTS = ["bin", "control", "dist", "docs", "examples", "resources", "scripts", "CHANGELOG.md", "README.md", "package.json"];
const TRUST_ANCHORS = new Set(["bin/coco", "scripts/coco-bootstrap.cjs"]);
const CACHE_SCHEMA_VERSION = 2;
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
const METADATA = new Set(["license", "package.json", "npm-shrinkwrap.json"]);
const RUNTIME_EXTENSIONS = new Set([".cjs", ".d.ts", ".js", ".json", ".map", ".mjs", ".node", ".wasm"]);
const VERIFY_CONCURRENCY = 32;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function canonicalJson(value) { return `${JSON.stringify(canonicalize(value))}\n`; }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

/** Run tasks with bounded concurrency, preserving input order. */
async function mapConcurrent(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function rejected(code) { return { code, status: "rejected" }; }
function pathOf(root, absolute) { return relative(root, absolute).split(sep).join("/"); }
function safePath(path) { return path !== "" && !path.startsWith("/") && !path.startsWith("../") && !path.includes("/../") && path === path.normalize("NFC"); }
function mode(info) { return (info.mode & 0o111) === 0 ? 0o644 : 0o755; }
function runtimeRootsFor(entries) { return [...new Set(entries.map((item) => item.path.split("/", 1)[0]))]; }

async function readVerifiedFile(path, code = "RUNTIME_INTEGRITY_REVALIDATION_FAILED") {
  if (typeof constants.O_NOFOLLOW !== "number") throw new Error(code);
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(code);
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || !sameSnapshot(snapshotOf(before), snapshotOf(opened))) throw new Error(code);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const current = await lstat(path);
    if (!current.isFile() || current.isSymbolicLink() || !sameSnapshot(snapshotOf(opened), snapshotOf(after)) || !sameSnapshot(snapshotOf(opened), snapshotOf(current))) throw new Error(code);
    return { bytes, info: after };
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function readCanonicalVerified(path, code) {
  const { bytes } = await readVerifiedFile(path, code);
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(code); }
  if (bytes.toString("utf8") !== canonicalJson(parsed)) throw new Error(code);
  return { bytes, parsed };
}

function classFor(path) {
  const parts = path.split("/");
  const name = parts.at(-1).toLowerCase();
  if (METADATA.has(name)) return "package-metadata";
  if (name.startsWith("readme") || name.startsWith("changelog") || parts.includes("docs") || parts.includes("examples")) return "runtime-asset";
  return [...RUNTIME_EXTENSIONS].some((extension) => name.endsWith(extension)) || path.startsWith("bin/") || path.startsWith("dist/") ? "runtime-code" : "runtime-asset";
}

async function files(root, absolute = root) {
  const info = await lstat(absolute);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
  if (info.isFile()) {
    const filePath = pathOf(root, absolute);
    if (PACKAGE_EXCLUDED.has(filePath)) return [];
    return [{ mode: mode(info), path: filePath, size: info.size, mtimeMs: info.mtimeMs }];
  }
  const names = (await readdir(absolute)).sort((left, right) => left.localeCompare(right));
  const result = [];
  for (const name of names) {
    if (EXCLUDED_COMPONENTS.has(name)) continue;
    result.push(...await files(root, join(absolute, name)));
  }
  return result;
}

/** Walk a runtime root with readdir only (no per-file stat), returning file
 * paths relative to root. Scope matches manifest generation: ROOTS +
 * dependency roots only. Symlinks and special entries are integrity violations. */
async function walkPaths(root, absolute, output = []) {
  const rootInfo = await lstat(absolute);
  if (rootInfo.isSymbolicLink() || (!rootInfo.isFile() && !rootInfo.isDirectory())) throw new Error("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
  if (rootInfo.isFile()) {
    const filePath = pathOf(root, absolute);
    if (!PACKAGE_EXCLUDED.has(filePath)) output.push(filePath);
    return output;
  }
  const entries = await readdir(absolute, { withFileTypes: true, recursive: true });
  for (const dirent of entries) {
    if (EXCLUDED_COMPONENTS.has(dirent.name) || dirent.parentPath.split(sep).some((component) => EXCLUDED_COMPONENTS.has(component))) continue;
    if (dirent.isSymbolicLink()) throw new Error("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
    if (!dirent.isFile() && !dirent.isDirectory()) throw new Error("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
    if (!dirent.isFile()) continue;
    const filePath = pathOf(root, join(dirent.parentPath, dirent.name));
    if (!PACKAGE_EXCLUDED.has(filePath)) output.push(filePath);
  }
  return output;
}

/** Cheap structural check: the file path set on disk must exactly match the
 * manifest's entry path set (catches add/remove/rename). No content hashing. */
async function structureCheck(root, expected, runtimeRoots) {
  try {
    const walked = await Promise.all(runtimeRoots.map((directory) => walkPaths(root, join(root, directory))));
    const actual = walked.flat().filter((path) => path !== MANIFEST && path !== SIDECAR && !TRUST_ANCHORS.has(path));
    if (actual.length !== expected.size) return false;
    for (const path of actual) if (!expected.has(path)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Compare a manifest entry against a cached six-field stat snapshot. */
async function lstatSnapshotMatches(root, intended, snapshot) {
  let handle;
  try {
    if (typeof constants.O_NOFOLLOW !== "number" || !snapshotValid(snapshot)) return false;
    const path = join(root, intended.path);
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink()) return false;
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    const current = await lstat(path);
    return opened.isFile() && current.isFile() && !current.isSymbolicLink()
      && sameSnapshot(snapshotOf(before), snapshotOf(opened)) && sameSnapshot(snapshotOf(opened), snapshotOf(current))
      && sameSnapshot(snapshot, snapshotOf(opened)) && mode(opened) === intended.mode;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function expectedMap(root) {
  const { bytes, parsed } = await readCanonicalVerified(join(root, MAP), "RUNTIME_INTEGRITY_MAP_INVALID");
  if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.entries) || !parsed.entries.every((entry) => entry && typeof entry.path === "string" && safePath(entry.path) && typeof entry.class === "string" && (typeof entry.sha256 === "string" || entry.sha256 === null))) throw new Error("RUNTIME_INTEGRITY_MAP_INVALID");
  const paths = new Set(parsed.entries.map((entry) => entry.path));
  if (paths.size !== parsed.entries.length) throw new Error("RUNTIME_INTEGRITY_MAP_INVALID");
  return { entries: parsed.entries, sha256: sha256(bytes) };
}

async function entry(root, path) {
  const { bytes, info } = await readVerifiedFile(join(root, path));
  return { class: classFor(path), mode: mode(info), path, sha256: sha256(bytes), size: info.size };
}

export async function generateRuntimeIntegrityManifest({ root }) {
  const absolute = resolve(root);
  const map = await expectedMap(absolute);
  const mappedPaths = map.entries.map((item) => item.path).filter((path) => path !== MAP && path !== MANIFEST && path !== SIDECAR && !TRUST_ANCHORS.has(path) && !PACKAGE_EXCLUDED.has(path));
  const runtimeRoots = [...new Set([...ROOTS, ...mappedPaths.map((path) => path.split("/", 1)[0]), "node_modules"])];
  const runtimePaths = (await Promise.all(runtimeRoots.map(async (directory) => files(absolute, join(absolute, directory))))).flat().map((item) => item.path).filter((path) => path !== MANIFEST && path !== SIDECAR && !TRUST_ANCHORS.has(path));
  const paths = [...new Set([...mappedPaths, ...runtimePaths])].sort((left, right) => left.localeCompare(right));
  const entries = await mapConcurrent(paths, VERIFY_CONCURRENCY, (path) => entry(absolute, path));
  // Until generation has a proven module-graph closure, every manifest entry
  // is startup-sensitive. This is safe for new and transitive dependencies.
  const manifest = { assetMapSha256: map.sha256, entries, schemaVersion: 1, startupClosure: entries.map((item) => item.path) };
  const bytes = canonicalJson(manifest);
  await writeFile(join(absolute, MANIFEST), bytes, { encoding: "utf8", mode: 0o644 });
  await writeFile(join(absolute, SIDECAR), `${sha256(bytes)}  runtime-integrity-manifest.v1.json\n`, { encoding: "utf8", mode: 0o644 });
  return manifest;
}

async function verifySidecar(root, bytes) {
  const sidecar = (await readVerifiedFile(join(root, SIDECAR))).bytes.toString("utf8");
  return sidecar === `${sha256(bytes)}  runtime-integrity-manifest.v1.json\n`;
}

async function verifyMap(root, manifest) {
  const map = await expectedMap(root);
  if (map.sha256 !== manifest.assetMapSha256) return false;
  // Most asset-map entries are already covered by the runtime manifest above
  // (same file, same hash). Only re-hash entries the manifest did not cover.
  const manifestPaths = new Set(manifest.entries.map((item) => item.path));
  const remainder = map.entries.filter((item) =>
    item.path !== MAP && item.path !== MANIFEST && item.path !== SIDECAR && !TRUST_ANCHORS.has(item.path) && !PACKAGE_EXCLUDED.has(item.path) && item.sha256 !== null && !manifestPaths.has(item.path)
  );
  for (const item of remainder) {
    const actual = (await readVerifiedFile(join(root, item.path))).bytes;
    if (sha256(actual) !== item.sha256) return false;
  }
  return true;
}

export async function verifyRuntimeIntegrity({ beforeEntry, root, cachePath }) {
  try {
    const absolute = resolve(root);
    const { bytes, parsed } = await readCanonicalVerified(join(absolute, MANIFEST), "RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const sidecarHash = sha256(bytes);
    if (!await verifySidecar(absolute, bytes)) return rejected("RUNTIME_INTEGRITY_SIDECAR_INVALID");
    if (parsed.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(parsed.assetMapSha256) || !Array.isArray(parsed.entries)) return rejected("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const expected = new Map(parsed.entries.map((item) => [item.path, item]));
    if (expected.size !== parsed.entries.length || !parsed.entries.every((item) => item && safePath(item.path) && typeof item.class === "string" && Number.isInteger(item.mode) && Number.isInteger(item.size) && /^[a-f0-9]{64}$/.test(item.sha256))) return rejected("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const entryPaths = parsed.entries.map((item) => item.path);
    const startupPaths = parsed.startupClosure === undefined ? entryPaths : parsed.startupClosure;
    if (!Array.isArray(startupPaths) || startupPaths.length !== entryPaths.length || new Set(startupPaths).size !== startupPaths.length || !startupPaths.every((path) => typeof path === "string" && expected.has(path))) return rejected("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const startupSet = new Set(startupPaths);
    const runtimeRoots = runtimeRootsFor(parsed.entries);
    const scanRuntime = async () => (await Promise.all(runtimeRoots.map(async (directory) => files(absolute, join(absolute, directory))))).flat().filter((item) => item.path !== MANIFEST && item.path !== SIDECAR && !TRUST_ANCHORS.has(item.path));

    // Warm verification checks cached directory topology plus the bounded
    // startup closure. Set COCO_INTEGRITY_FULL=1 to force full verification.
    if (cachePath && process.env.COCO_INTEGRITY_FULL !== "1") {
      const cached = await readCache(cachePath);
      if (cached?.manifestHash === sidecarHash) {
        const directoryCheck = await directorySnapshotsMatch(absolute, cached.directories, runtimeRoots);
        if (directoryCheck === true) {
          const cachedPaths = Object.keys(cached.entries);
          const fastEntries = parsed.entries.filter((item) => startupSet.has(item.path));
          const snapshotsMatch = cachedPaths.length === fastEntries.length
            && cachedPaths.every((path) => startupSet.has(path))
            && (await Promise.all(fastEntries.map((item) => lstatSnapshotMatches(absolute, item, cached.entries[item.path])))).every(Boolean);
          if (snapshotsMatch && await verifyMap(absolute, parsed)) {
            return { entries: parsed.entries.length, status: "approved", fast: true };
          }
        }
      }
    }

    const actualRuntime = await scanRuntime();
    if (actualRuntime.some((item) => !expected.has(item.path))) return rejected("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");

    const verified = await mapConcurrent(parsed.entries, VERIFY_CONCURRENCY, async (intended) => {
      const path = intended.path;
      if (beforeEntry) await beforeEntry(path);
      const { bytes, info } = await readVerifiedFile(join(absolute, path));
      return mode(info) === intended.mode && info.size === intended.size && sha256(bytes) === intended.sha256 && classFor(path) === intended.class;
    });
    if (verified.some((ok) => !ok)) return rejected("RUNTIME_INTEGRITY_MISMATCH");
    if (!await verifyMap(absolute, parsed)) return rejected("RUNTIME_INTEGRITY_MISMATCH");
    if (cachePath) {
      await writeCache(cachePath, sidecarHash, parsed.entries, startupSet, absolute, runtimeRoots).catch(() => {});
    }
    return { entries: parsed.entries.length, status: "approved" };
  } catch (error) {
    return rejected(error instanceof Error && error.message.startsWith("RUNTIME_INTEGRITY_") ? error.message : "RUNTIME_INTEGRITY_INVALID");
  }
}

async function readCache(cachePath) {
  try {
    const content = (await readVerifiedFile(cachePath)).bytes.toString("utf8");
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && Object.keys(parsed).sort().join(",") === "directories,entries,manifestHash,schemaVersion"
      && parsed.schemaVersion === CACHE_SCHEMA_VERSION && /^[a-f0-9]{64}$/.test(parsed.manifestHash)
      && parsed.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries)
      && parsed.directories && typeof parsed.directories === "object" && !Array.isArray(parsed.directories)) return parsed;
    return undefined;
  } catch {
    return undefined;
  }
}

function snapshotOf(info) {
  return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, mode: info.mode & 0o7777, dev: info.dev, ino: info.ino };
}

function sameSnapshot(left, right) {
  return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
    && left.mode === right.mode && left.dev === right.dev && left.ino === right.ino;
}

function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }

function snapshotValid(value) {
  if (!value || typeof value !== "object") return false;
  const fields = Object.keys(value);
  return fields.length === 6 && fields.every((field) => ["size", "mtimeMs", "ctimeMs", "mode", "dev", "ino"].includes(field))
    && Number.isSafeInteger(value.size) && value.size >= 0 && Number.isFinite(value.mtimeMs) && Number.isFinite(value.ctimeMs)
    && Number.isSafeInteger(value.mode) && value.mode >= 0 && value.mode <= 0o7777 && Number.isSafeInteger(value.dev) && Number.isSafeInteger(value.ino);
}

async function directorySnapshots(root, runtimeRoots) {
  const directories = {};
  for (const directory of runtimeRoots) {
    const absolute = join(root, directory);
    let info;
    try { info = await lstat(absolute); } catch { return null; }
    if (info.isFile() && !info.isSymbolicLink()) continue;
    if (!info.isDirectory() || info.isSymbolicLink()) return null;
    directories[directory] = snapshotOf(info);
    for (const dirent of await readdir(absolute, { withFileTypes: true, recursive: true })) {
      if (!dirent.isDirectory() || EXCLUDED_COMPONENTS.has(dirent.name) || dirent.parentPath.split(sep).some((component) => EXCLUDED_COMPONENTS.has(component))) continue;
      const path = pathOf(root, join(dirent.parentPath, dirent.name));
      const child = await lstat(join(root, path));
      if (!child.isDirectory() || child.isSymbolicLink()) return null;
      directories[path] = snapshotOf(child);
    }
  }
  return directories;
}

async function directorySnapshotsMatch(root, directories, runtimeRoots) {
  if (!directories || Object.keys(directories).length === 0) return false;
  const current = await directorySnapshots(root, runtimeRoots).catch(() => null);
  if (!current || Object.keys(current).length !== Object.keys(directories).length) return false;
  for (const [path, cachedSnapshot] of Object.entries(directories)) {
    if (!snapshotValid(cachedSnapshot)) return false;
    if (!Object.hasOwn(current, path) || !sameSnapshot(current[path], cachedSnapshot)) return false;
  }
  return true;
}

async function writeCache(cachePath, manifestHash, entries, startupSet, root, runtimeRoots) {
  const snapshots = {};
  for (const entry of entries) {
    if (!startupSet.has(entry.path)) continue;
    try {
      const info = await lstat(join(root, entry.path));
      if (!info.isFile() || info.isSymbolicLink()) return;
      snapshots[entry.path] = snapshotOf(info);
    } catch { return; }
  }
  const directories = await directorySnapshots(root, runtimeRoots).catch(() => null);
  if (!directories || Object.keys(snapshots).length !== startupSet.size) return;
  const directory = dirname(cachePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (typeof constants.O_NOFOLLOW !== "number") return;
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) return;
  const directoryHandle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const temporary = join(directory, `.${randomBytes(16).toString("hex")}.tmp`);
  let temporaryHandle;
  try {
    const openedDirectory = await directoryHandle.stat();
    if (!openedDirectory.isDirectory() || !sameSnapshot(snapshotOf(directoryInfo), snapshotOf(openedDirectory))) return;
    try {
      const target = await lstat(cachePath);
      if (target.isSymbolicLink()) return;
    } catch (error) { if (error?.code !== "ENOENT") throw error; }
    temporaryHandle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await temporaryHandle.writeFile(JSON.stringify({ schemaVersion: CACHE_SCHEMA_VERSION, manifestHash, entries: snapshots, directories }), "utf8");
    await temporaryHandle.chmod(0o600);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    const currentDirectory = await lstat(directory);
    if (!currentDirectory.isDirectory() || currentDirectory.isSymbolicLink() || !sameIdentity(snapshotOf(openedDirectory), snapshotOf(currentDirectory))) return;
    try { if ((await lstat(cachePath)).isSymbolicLink()) return; } catch (error) { if (error?.code !== "ENOENT") throw error; }
    await rename(temporary, cachePath);
    await directoryHandle.sync();
  } finally {
    await temporaryHandle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    await directoryHandle.close().catch(() => {});
  }
}

export const runtimeIntegrityPaths = { manifest: MANIFEST, sidecar: SIDECAR };
