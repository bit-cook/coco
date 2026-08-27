import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, relative, resolve, sep } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";

const CORE = "@earendil-works/pi-coding-agent";
const RUNTIME_ROOTS = new Set(["bin", "coweb", "dist", "docs", "examples", "resources"]);
const RESOLVER_PATHS = ["CHANGELOG.md", "README.md", "docs", "examples", "package.json", "dist/core/export-html", "dist/modes/interactive/assets", "dist/modes/interactive/theme"];
const GENERATED_RUNTIME_ARTIFACTS = new Set(["scripts/package-asset-map.v1.json", "resources/runtime-integrity-manifest.v1.json", "resources/runtime-integrity-manifest.v1.json.sha256"]);
const REQUIRED_PROTECTED_PATHS = ["scripts/canonical-json.mjs", "scripts/coweb-native-service.mjs", "scripts/coweb.mjs", "scripts/coweb-proxy.mjs"];

class AssetMapError extends Error {
  constructor(code) { super(code); this.code = code; this.name = "AssetMapError"; }
}

function reject(code) { return { code, status: "rejected" }; }

function safePath(path) {
  const canonical = normalize(path).split(sep).join("/");
  return canonical !== "" && !canonical.startsWith("../") && !canonical.includes("/../") && !canonical.startsWith("/");
}

function selectorMatches(path, selector) {
  const expression = new RegExp(`^${selector.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}(?:/|$)`);
  return expression.test(path);
}

async function regularEntries(root, path) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new AssetMapError("ASSET_MAP_INVALID");
  if (path.split(sep).includes("__pycache__") || /\.(pyc|pyo)$/.test(path)) throw new AssetMapError("ASSET_MAP_INVALID");
  if (info.isFile()) return [relative(root, path).split(sep).join("/")];
  const names = await readdir(path);
  return (await Promise.all(names.sort().map((name) => regularEntries(root, join(path, name))))).flat();
}

async function requiredPaths(root) {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (packageJson.dependencies?.[CORE] === "0.82.0") throw new AssetMapError("PACKAGE_CORE_VERSION_MISMATCH");
  const installedCore = JSON.parse(await readFile(join(root, "node_modules", CORE, "package.json"), "utf8"));
  if (installedCore.version === "0.82.0") throw new AssetMapError("PACKAGE_CORE_VERSION_MISMATCH");
  if (!Array.isArray(packageJson.files)) throw new AssetMapError("ASSET_MAP_INVALID");
  const excluded = packageJson.files.filter((selector) => selector.startsWith("!")).map((selector) => selector.slice(1));
  if (excluded.some((selector) => !safePath(selector))) throw new AssetMapError("ASSET_MAP_INVALID");
  const isExcluded = (path) => excluded.some((selector) => selectorMatches(path, selector));
  const paths = new Set(["package.json", ...REQUIRED_PROTECTED_PATHS]);
  for (const selector of packageJson.files) {
    if (selector.startsWith("!")) continue;
    if (typeof selector !== "string" || !safePath(selector)) throw new AssetMapError("ASSET_MAP_INVALID");
    const absolute = join(root, selector);
    try { (await regularEntries(root, absolute)).filter((path) => !isExcluded(path)).forEach((path) => paths.add(path)); } catch (error) {
      if (error instanceof AssetMapError) throw error;
      throw new AssetMapError("ASSET_MAP_INVALID");
    }
  }
  const scripts = [...paths].filter((path) => path.startsWith("scripts/") && path.endsWith(".mjs"));
  for (const script of scripts) {
    const source = await readFile(join(root, script), "utf8");
    for (const match of source.matchAll(/from\s+["'](\.\/[^"']+)["']/g)) {
      const dependency = normalize(join("scripts", match[1])).split(sep).join("/");
      if (!safePath(dependency) || !(await lstat(join(root, dependency))).isFile()) throw new AssetMapError("ASSET_MAP_INVALID");
      if (!isExcluded(dependency)) paths.add(dependency);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

async function resolverProof(root) {
  let source;
  try { source = await readFile(join(root, "node_modules", CORE, "dist", "config.js"), "utf8"); } catch { throw new AssetMapError("ASSET_RESOLVER_UNRESOLVED"); }
  const expected = ["getReadmePath", "getDocsPath", "getExamplesPath", "getChangelogPath", "getPackageJsonPath", "getThemesDir", "getExportTemplateDir", "getInteractiveAssetsDir"];
  if (!expected.every((name) => source.includes(`function ${name}`))) throw new AssetMapError("ASSET_RESOLVER_UNRESOLVED");
  for (const path of RESOLVER_PATHS) {
    let info;
    try { info = await lstat(join(root, path)); } catch { throw new AssetMapError("ASSET_RESOLVER_UNRESOLVED"); }
    const directory = path.includes("/") || path === "docs" || path === "examples";
    if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new AssetMapError("ASSET_RESOLVER_UNRESOLVED");
  }
}

function classify(path) {
  const root = path.split("/", 1)[0];
  return RUNTIME_ROOTS.has(root) || RESOLVER_PATHS.some((entry) => path === entry || path.startsWith(`${entry}/`)) || path.startsWith("scripts/")
    ? { classification: "runtime-asset", source: root === "dist" || path.startsWith("scripts/") ? "static-import" : "static-and-runtime-resolver" }
    : { classification: "documentation", source: "static-import" };
}

function entryFor(path, bytes) {
  const proof = classify(path);
  return { class: proof.classification, path, proof: { source: proof.source }, sha256: GENERATED_RUNTIME_ARTIFACTS.has(path) ? null : sha256(bytes), type: "file" };
}

export function verifyAssetMap({ actual, map }) {
  if (!map || map.schemaVersion !== 2 || !Array.isArray(map.entries) || !Array.isArray(actual)) return reject("ASSET_MAP_INVALID");
  const expected = new Map(map.entries.map((entry) => [entry.path, entry]));
  for (const member of actual) {
    const supplied = typeof member === "string" ? { path: member } : member;
    const path = supplied?.path?.replace(/^package\//, "");
    if (!supplied || typeof path !== "string" || !safePath(path)) return reject("ASSET_MAP_RESOLUTION_ESCAPE");
    const intended = expected.get(path);
    if (!intended) return reject("ASSET_MAP_EXTRA");
    if (supplied.classification !== undefined && supplied.classification !== intended.class) return reject("ASSET_MAP_CLASS_MISMATCH");
    expected.delete(path);
  }
  return expected.size === 0 ? { status: "approved" } : reject("ASSET_MAP_MISSING");
}

export async function generateAssetMap({ output, root }) {
  const absolute = resolve(root);
  await resolverProof(absolute);
  const paths = await requiredPaths(absolute);
  const entries = await Promise.all(paths.map(async (path) => entryFor(path, await readFile(join(absolute, path)))));
  const map = { entries, resolverPaths: RESOLVER_PATHS, schemaVersion: 2 };
  await writeFile(output, canonicalJson(map), { encoding: "utf8", flag: "w", mode: 0o644 });
  return map;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await generateAssetMap({ output: "scripts/package-asset-map.v1.json", root: new URL("..", import.meta.url).pathname });
}
