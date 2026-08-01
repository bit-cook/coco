const { createHash } = require("node:crypto");
const { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { dirname, join, relative, resolve, sep } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = resolve(dirname(__filename), "..");
const manifestPath = join(root, "resources", "runtime-integrity-manifest.v1.json");
const sidecarPath = `${manifestPath}.sha256`;
const agentDir = process.env.COCO_CODING_AGENT_DIR || join(homedir(), ".coco", "agent");
const cachePath = join(agentDir, ".runtime-integrity-cache.json");

const EXCLUDED_COMPONENTS = new Set([".bin", ".package-lock.json", "coverage", "node-gyp-bin", "npm", "src", "test", "tests"]);
const PACKAGE_EXCLUDED = new Set([
  "scripts/bootstrap-final-verification.mjs", "scripts/bootstrap-npm.mjs", "scripts/canonical-json.mjs", "scripts/dev-provider-sync.mjs", "scripts/egress-node-guard.cjs",
  "scripts/final-quality-review.mjs", "scripts/final-scope-redaction.mjs", "scripts/final-verifier-manifest.partial.v1.json", "scripts/generate-final-verifier-manifest.mjs", "scripts/print-final-env.mjs",
  "scripts/run-egress-allowlist.mjs", "scripts/run-final-f3.mjs", "scripts/run-tests-preserving-receipts.mjs",
  "scripts/run-with-timeout.mjs", "scripts/validate-protected-baseline.mjs", "scripts/verify-baseline-authorization.mjs", "scripts/verify-final-verifier-manifest.mjs",
  "scripts/verify-plan-evidence.mjs", "scripts/verify-protected-baseline.mjs",
]);
for (let task = 1; task <= 16; task += 1) PACKAGE_EXCLUDED.add(`scripts/qa-task-${task}.mjs`);
const TRUST_ANCHORS = new Set(["bin/coco", "scripts/coco-bootstrap.cjs"]);
const ROOTS = ["bin", "dist", "docs", "examples", "resources", "scripts", "CHANGELOG.md", "README.md", "package.json"];

const MANIFEST_ENTRY = "resources/runtime-integrity-manifest.v1.json";
const SIDECAR_ENTRY = "resources/runtime-integrity-manifest.v1.json.sha256";
const CACHE_SCHEMA_VERSION = 1;

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
function reject(code) { process.stderr.write(`coco: ${code}\n`); process.exitCode = 1; }
function mode(info) { return (info.mode & 0o111) === 0 ? 0o644 : 0o755; }
function pathOf(absolute) { return relative(root, absolute).split(sep).join("/"); }
function snapshot(info) { return { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, mode: info.mode & 0o7777, dev: info.dev, ino: info.ino }; }
function sameSnapshot(left, right) { return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode && left.dev === right.dev && left.ino === right.ino; }
const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
function expectedType(info, type) { return type === "directory" ? info.isDirectory() && !info.isSymbolicLink() : info.isFile() && !info.isSymbolicLink(); }
function openVerified(path, type) {
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
    return { descriptor, before: snapshot(before), type };
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
  return fields.length === 3 && fields.every((field) => ["schemaVersion", "manifestHash", "entries"].includes(field))
    && cached.schemaVersion === CACHE_SCHEMA_VERSION && typeof cached.manifestHash === "string" && /^[a-f0-9]{64}$/.test(cached.manifestHash)
    && cached.entries && typeof cached.entries === "object" && !Array.isArray(cached.entries);
}

function readCache() {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
    if (cacheValid(parsed)) return parsed;
  } catch { /* cache absent or corrupt - fall through to full verification */ }
  return undefined;
}

function writeCache(manifestHash, snapshots) {
  try {
    for (const [path, value] of Object.entries(snapshots)) {
      if (!snapshotValid(value)) return;
    }
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ schemaVersion: CACHE_SCHEMA_VERSION, manifestHash, entries: snapshots }), { encoding: "utf8", mode: 0o600 });
    chmodSync(cachePath, 0o600);
  } catch { /* cache write is best-effort */ }
}

/** Walk a runtime root with readdir only (no per-file stat), returning file
 * paths relative to root. Scope matches manifest generation: ROOTS +
 * dependency roots only. Returns null on unexpected entry types. */
function walkPaths(absolute, output = []) {
  const rootInfo = lstatSync(absolute);
  if (rootInfo.isSymbolicLink() || (!rootInfo.isFile() && !rootInfo.isDirectory())) return null;
  if (rootInfo.isFile()) {
    const filePath = pathOf(absolute);
    if (!PACKAGE_EXCLUDED.has(filePath)) output.push(filePath);
    return output;
  }
  const entries = readdirSync(absolute, { withFileTypes: true, recursive: true });
  for (const dirent of entries) {
    if (EXCLUDED_COMPONENTS.has(dirent.name) || dirent.parentPath.split(sep).some((component) => EXCLUDED_COMPONENTS.has(component))) continue;
    if (dirent.isSymbolicLink()) return null;
    if (!dirent.isFile() && !dirent.isDirectory()) return null;
    if (!dirent.isFile()) continue;
    const filePath = pathOf(join(dirent.parentPath, dirent.name));
    if (!PACKAGE_EXCLUDED.has(filePath)) output.push(filePath);
  }
  return output;
}

/** Cheap structural check: the file path set on disk must exactly match the
 * manifest's entry path set. No content hashing. */
function structureCheck(expected, runtimeRoots) {
  const walked = [];
  for (const directory of runtimeRoots) {
    const result = walkPaths(join(root, directory));
    if (result === null) return false;
    walked.push(...result);
  }
  const filtered = walked.filter((path) => path !== MANIFEST_ENTRY && path !== SIDECAR_ENTRY && !TRUST_ANCHORS.has(path));
  const expectedRuntime = new Set([...expected].filter((path) => runtimeRoots.some((directory) => path === directory || path.startsWith(`${directory}/`))));
  if (filtered.length !== expectedRuntime.size) return false;
  for (const path of filtered) if (!expectedRuntime.has(path)) return false;
  return true;
}

async function main() {
  let rootDescriptor;
  let manifestDescriptor;
  let sidecarDescriptor;
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
    const manifest = JSON.parse(bytes.toString("utf8"));
    const canonicalBytes = `${JSON.stringify(canonical(manifest))}\n`;
    if (canonicalBytes !== bytes.toString("utf8")) {
      console.error("CANONICAL_MISMATCH", canonicalBytes.length, bytes.length);
      return reject("RUNTIME_INTEGRITY_MANIFEST_CANONICAL");
    }
    const sidecarBytes = readFileSync(sidecarDescriptor, "utf8");
    if (!revalidatePath(sidecarPath, verifiedSidecar)) return reject("RUNTIME_INTEGRITY_REVALIDATION_FAILED");
    const manifestHash = hash(bytes);
    const expectedSidecar = `${manifestHash}  runtime-integrity-manifest.v1.json\n`;
    if (sidecarBytes !== expectedSidecar) {
      console.error("SIDECAR_MISMATCH", sidecarBytes, expectedSidecar);
      return reject("RUNTIME_INTEGRITY_SIDECAR_INVALID");
    }
    if (!Array.isArray(manifest.entries)) return reject("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const entriesValid = manifest.entries.every((entry) => entry && typeof entry.path === "string" && !entry.path.startsWith("/") && !entry.path.includes("..") && /^[a-f0-9]{64}$/.test(entry.sha256));
    if (!entriesValid) return reject("RUNTIME_INTEGRITY_MANIFEST_ENTRY_INVALID");
    const expected = new Set(manifest.entries.map((entry) => entry.path));
    const runtimeRoots = [...ROOTS, "node_modules"];

    // Fast path: readdir-only structural check + trusted-local metadata cache.
    // Set COCO_INTEGRITY_FULL=1 (or delete the cache) to force full hashing.
    let verified = false;
    if (process.env.COCO_INTEGRITY_FULL !== "1") {
      const cached = readCache();
      if (cached?.manifestHash === manifestHash && structureCheck(expected, runtimeRoots)) {
        const cachedPaths = Object.keys(cached.entries);
        verified = cachedPaths.length === expected.size && cachedPaths.every((path) => expected.has(path)) && manifest.entries.every((entry) => {
          const cachedSnapshot = cached.entries?.[entry.path];
          if (!snapshotValid(cachedSnapshot)) return false;
          try {
            const verifiedEntry = openVerified(join(root, entry.path), "file");
            if (!verifiedEntry) return false;
            try {
              const info = fstatSync(verifiedEntry.descriptor);
              return revalidatePath(join(root, entry.path), verifiedEntry) && sameSnapshot(snapshot(info), cachedSnapshot) && mode(info) === entry.mode;
            } finally {
              closeQuietly(verifiedEntry.descriptor);
            }
          } catch {
            return false;
          }
        });
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
          verifiedSnapshots[entry.path] = after;
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
      writeCache(manifestHash, verifiedSnapshots);
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
    process.env.COCO_INTEGRITY_VERIFIED = "1";
    process.env.COCO_INTEGRITY_MODE = verified ? "fast" : "full";
    if (process.env.PI_OFFLINE === undefined) process.env.PI_OFFLINE = "1";
    if (process.argv.length === 3 && (process.argv[2] === "--version" || process.argv[2] === "-v")) {
      process.stdout.write(`${JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version}\n`);
      return;
    }
    await import(pathToFileURL(join(root, "scripts", "coco-launcher.mjs")).href);
  } catch (error) {
    console.error("BOOTSTRAP_ERROR", error);
    reject("RUNTIME_INTEGRITY_INVALID");
  } finally {
    closeQuietly(sidecarDescriptor);
    closeQuietly(manifestDescriptor);
    closeQuietly(rootDescriptor);
  }
}
void main();
