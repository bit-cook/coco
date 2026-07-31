import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { canonicalJson, readCanonicalJson, sha256 } from "./canonical-json.mjs";

const MANIFEST = "resources/runtime-integrity-manifest.v1.json";
const SIDECAR = "resources/runtime-integrity-manifest.v1.json.sha256";
const MAP = "scripts/package-asset-map.v1.json";
const ROOTS = ["bin", "dist", "docs", "examples", "resources", "scripts", "CHANGELOG.md", "README.md", "package.json"];
const TRUST_ANCHORS = new Set(["bin/coco", "scripts/coco-bootstrap.cjs"]);
const EXCLUDED_COMPONENTS = new Set([".bin", ".package-lock.json", "coverage", "node-gyp-bin", "npm", "src", "test", "tests"]);
const PACKAGE_EXCLUDED = new Set([
  "scripts/bootstrap-final-verification.mjs", "scripts/bootstrap-npm.mjs", "scripts/canonical-json.mjs", "scripts/dev-provider-sync.mjs", "scripts/egress-node-guard.cjs",
  "scripts/final-quality-review.mjs", "scripts/final-scope-redaction.mjs", "scripts/final-verifier-manifest.partial.v1.json", "scripts/generate-final-verifier-manifest.mjs", "scripts/print-final-env.mjs",
  "scripts/run-egress-allowlist.mjs", "scripts/run-final-f3.mjs", "scripts/run-tests-preserving-receipts.mjs",
  "scripts/run-with-timeout.mjs", "scripts/validate-protected-baseline.mjs", "scripts/verify-baseline-authorization.mjs", "scripts/verify-final-verifier-manifest.mjs",
  "scripts/verify-plan-evidence.mjs", "scripts/verify-protected-baseline.mjs",
]);
for (let task = 1; task <= 16; task += 1) PACKAGE_EXCLUDED.add(`scripts/qa-task-${task}.mjs`);
const METADATA = new Set(["license", "package.json", "npm-shrinkwrap.json"]);
const RUNTIME_EXTENSIONS = new Set([".cjs", ".d.ts", ".js", ".json", ".map", ".mjs", ".node", ".wasm"]);
const VERIFY_CONCURRENCY = 32;

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
  const info = await lstat(absolute);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
  if (info.isFile()) {
    const filePath = pathOf(root, absolute);
    if (!PACKAGE_EXCLUDED.has(filePath)) output.push(filePath);
    return output;
  }
  const entries = await readdir(absolute, { withFileTypes: true });
  for (const dirent of entries) {
    if (EXCLUDED_COMPONENTS.has(dirent.name)) continue;
    const child = join(absolute, dirent.name);
    if (dirent.isSymbolicLink() || (!dirent.isFile() && !dirent.isDirectory())) throw new Error("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
    if (dirent.isFile()) {
      const filePath = pathOf(root, child);
      if (!PACKAGE_EXCLUDED.has(filePath)) output.push(filePath);
    } else {
      await walkPaths(root, child, output);
    }
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

/** Compare a manifest entry against a cached stat snapshot (size + mtime + mode). */
async function lstatSnapshotMatches(root, intended, snapshot) {
  try {
    const info = await lstat(join(root, intended.path));
    return info.isFile() && !info.isSymbolicLink() && info.size === snapshot.size && info.mtimeMs === snapshot.mtimeMs && mode(info) === snapshot.mode && mode(info) === intended.mode;
  } catch {
    return false;
  }
}

async function expectedMap(root) {
  const { bytes, parsed } = await readCanonicalJson(join(root, MAP), "RUNTIME_INTEGRITY_MAP_INVALID");
  if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.entries) || !parsed.entries.every((entry) => entry && typeof entry.path === "string" && safePath(entry.path) && typeof entry.class === "string" && (typeof entry.sha256 === "string" || entry.sha256 === null))) throw new Error("RUNTIME_INTEGRITY_MAP_INVALID");
  const paths = new Set(parsed.entries.map((entry) => entry.path));
  if (paths.size !== parsed.entries.length) throw new Error("RUNTIME_INTEGRITY_MAP_INVALID");
  return { entries: parsed.entries, sha256: sha256(bytes) };
}

async function entry(root, path) {
  const bytes = await readFile(join(root, path));
  const info = await lstat(join(root, path));
  return { class: classFor(path), mode: mode(info), path, sha256: sha256(bytes), size: info.size };
}

export async function generateRuntimeIntegrityManifest({ root }) {
  const absolute = resolve(root);
  const map = await expectedMap(absolute);
  const mappedPaths = map.entries.map((item) => item.path).filter((path) => path !== MAP && path !== MANIFEST && path !== SIDECAR && !TRUST_ANCHORS.has(path) && !PACKAGE_EXCLUDED.has(path));
  const runtimeRoots = [...ROOTS, "node_modules"];
  const runtimePaths = (await Promise.all(runtimeRoots.map(async (directory) => files(absolute, join(absolute, directory))))).flat().map((item) => item.path).filter((path) => path !== MANIFEST && path !== SIDECAR && !TRUST_ANCHORS.has(path));
  const paths = [...new Set([...mappedPaths, ...runtimePaths])].sort((left, right) => left.localeCompare(right));
  const entries = await Promise.all(paths.map((path) => entry(absolute, path)));
  const manifest = { assetMapSha256: map.sha256, entries, schemaVersion: 1 };
  const bytes = canonicalJson(manifest);
  await writeFile(join(absolute, MANIFEST), bytes, { encoding: "utf8", mode: 0o644 });
  await writeFile(join(absolute, SIDECAR), `${sha256(bytes)}  runtime-integrity-manifest.v1.json\n`, { encoding: "utf8", mode: 0o644 });
  return manifest;
}

async function verifySidecar(root, bytes) {
  const sidecar = await readFile(join(root, SIDECAR), "utf8");
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
    const actual = await readFile(join(root, item.path));
    if (sha256(actual) !== item.sha256) return false;
  }
  return true;
}

export async function verifyRuntimeIntegrity({ beforeEntry, root, cachePath }) {
  try {
    const absolute = resolve(root);
    const { bytes, parsed } = await readCanonicalJson(join(absolute, MANIFEST), "RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const sidecarHash = sha256(bytes);
    if (!await verifySidecar(absolute, bytes)) return rejected("RUNTIME_INTEGRITY_SIDECAR_INVALID");
    if (parsed.schemaVersion !== 1 || typeof parsed.assetMapSha256 !== "string" || !Array.isArray(parsed.entries)) return rejected("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const expected = new Map(parsed.entries.map((item) => [item.path, item]));
    if (expected.size !== parsed.entries.length || !parsed.entries.every((item) => item && safePath(item.path) && typeof item.class === "string" && Number.isInteger(item.mode) && Number.isInteger(item.size) && /^[a-f0-9]{64}$/.test(item.sha256))) return rejected("RUNTIME_INTEGRITY_MANIFEST_INVALID");
    const runtimeRoots = [...ROOTS, "node_modules"];
    const scanRuntime = async () => (await Promise.all(runtimeRoots.map(async (directory) => files(absolute, join(absolute, directory))))).flat().filter((item) => item.path !== MANIFEST && item.path !== SIDECAR && !TRUST_ANCHORS.has(item.path));

    // Fast path: readdir-only structural check (no per-file lstat, ~10x
    // cheaper than a full scan) + stat snapshot comparison for the top-level
    // runtime files. node_modules is verified structurally only. Set
    // COCO_INTEGRITY_FULL=1 (or delete the cache) to force full verification.
    if (cachePath && process.env.COCO_INTEGRITY_FULL !== "1") {
      const cached = await readCache(cachePath);
      if (cached?.manifestHash === sidecarHash) {
        const structural = await structureCheck(absolute, expected, runtimeRoots);
        if (structural === true) {
          const snapshotsMatch = parsed.entries.every((item) => {
            if (item.path.startsWith("node_modules/")) return true;
            const snapshot = cached.entries?.[item.path];
            if (!snapshot || typeof snapshot.size !== "number" || typeof snapshot.mtimeMs !== "number" || typeof snapshot.mode !== "number") return false;
            return lstatSnapshotMatches(absolute, item, snapshot);
          });
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
      const info = await lstat(join(absolute, path));
      return info.isFile() && !info.isSymbolicLink() && mode(info) === intended.mode && info.size === intended.size && sha256(await readFile(join(absolute, path))) === intended.sha256 && classFor(path) === intended.class;
    });
    if (verified.some((ok) => !ok)) return rejected("RUNTIME_INTEGRITY_MISMATCH");
    if (!await verifyMap(absolute, parsed)) return rejected("RUNTIME_INTEGRITY_MISMATCH");
    if (cachePath) {
      await writeCache(cachePath, sidecarHash, parsed.entries, absolute).catch(() => {});
    }
    return { entries: parsed.entries.length, status: "approved" };
  } catch (error) {
    return rejected(error instanceof Error && error.message.startsWith("RUNTIME_INTEGRITY_") ? error.message : "RUNTIME_INTEGRITY_INVALID");
  }
}

async function readCache(cachePath) {
  try {
    const content = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.manifestHash === "string" && parsed.entries && typeof parsed.entries === "object") return parsed;
    return undefined;
  } catch {
    return undefined;
  }
}

async function writeCache(cachePath, manifestHash, entries, root) {
  const snapshots = {};
  for (const entry of entries) {
    if (entry.path.startsWith("node_modules/")) continue; // node_modules verified structurally only
    try {
      const info = await lstat(join(root, entry.path));
      snapshots[entry.path] = { size: info.size, mtimeMs: info.mtimeMs, mode: mode(info) };
    } catch { /* skip unreadable entries */ }
  }
  await mkdir(dirname(cachePath), { recursive: true }).catch(() => {});
  await writeFile(cachePath, JSON.stringify({ manifestHash, entries: snapshots }), { encoding: "utf8", mode: 0o600 });
}

export const runtimeIntegrityPaths = { manifest: MANIFEST, sidecar: SIDECAR };
