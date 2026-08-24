import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const PI = "@earendil-works/pi-coding-agent";
const PI_SOURCE = "https://github.com/bit-cook/pi-selective-fork/releases/download/coco-v0.82.1-coco.11/earendil-works-pi-coding-agent-0.82.1-coco.11.tgz";
const PI_DEPENDENCIES = new Set(["0.82.1", PI_SOURCE]);
const TUI = "@earendil-works/pi-tui";
const MCP = "@modelcontextprotocol/sdk";
const exec = promisify(execFile);
const BOUND_FILES = ["bin/coco", "scripts/coco-bootstrap.cjs", "scripts/package-asset-map.v1.json", "resources/runtime-integrity-manifest.v1.json", "resources/runtime-integrity-manifest.v1.json.sha256"];
const MAX_TARBALL_BYTES = 512 * 1024 * 1024;
const MAX_TARBALL_MEMBERS = 50_000;
const MAX_MEMBER_BYTES = 256 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}
async function physicalPath(root, path) {
  const physicalRoot = await realpath(root);
  const parts = relative(root, path).split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("PACKAGE_SOURCE_INVALID");
    current = join(current, part);
  }
  if ((await lstat(current)).isSymbolicLink()) throw new Error("PACKAGE_SOURCE_INVALID");
  const physical = await realpath(path);
  if (physical !== physicalRoot && !physical.startsWith(`${physicalRoot}/`)) throw new Error("PACKAGE_SOURCE_INVALID");
  return physical;
}
async function verifyPackagedManifest(root) {
  await physicalPath(root, root);
  const manifestBytes = await readFile(join(root, "resources", "runtime-integrity-manifest.v1.json"));
  if (await readFile(join(root, "resources", "runtime-integrity-manifest.v1.json.sha256"), "utf8") !== `${sha256(manifestBytes)}  runtime-integrity-manifest.v1.json\n`) return false;
  const manifest = JSON.parse(manifestBytes);
  const mapBytes = await readFile(join(root, "scripts", "package-asset-map.v1.json"));
  if (manifest.assetMapSha256 !== sha256(mapBytes) || !Array.isArray(manifest.entries)) return false;
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.path !== "string" || entry.path.startsWith("/") || entry.path.split("/").includes("..") || !/^[a-f0-9]{64}$/.test(entry.sha256)) return false;
    const path = join(root, entry.path); await physicalPath(root, path);
    const bytes = await readFile(path), info = await lstat(path);
    const mode = (info.mode & 0o111) === 0 ? 0o644 : 0o755;
    if (!info.isFile() || info.isSymbolicLink() || bytes.length !== entry.size || mode !== entry.mode || sha256(bytes) !== entry.sha256) return false;
  }
  return true;
}
function rejected(code) { return { code, status: "rejected" }; }
async function manifests(root, current = root) {
  const rootInfo = await lstat(current);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("PACKAGE_SOURCE_INVALID");
  const entries = await readdir(current, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      if ((await stat(path)).isDirectory()) throw new Error(`PACKAGE_SOURCE_INVALID:${path}`);
      continue;
    }
    if ((entry.isDirectory() !== info.isDirectory()) || (entry.isFile() !== info.isFile())) throw new Error(`PACKAGE_SOURCE_INVALID:${path}`);
    if (info.isDirectory()) result.push(...await manifests(root, path));
    if (info.isFile() && entry.name === "package.json") {
      const value = JSON.parse(await readFile(path, "utf8"));
      result.push(`${relative(root, current)}:${value.name}@${value.version}`);
    }
  }
  return result.sort();
}
async function metadata(root) {
  await physicalPath(root, root);
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (packageJson.packageManager !== "npm@11.18.0" || !PI_DEPENDENCIES.has(packageJson.dependencies?.[PI]) || packageJson.dependencies?.[TUI] !== "0.82.1" || packageJson.dependencies?.[MCP] !== "1.30.0" || packageJson.devDependencies?.npm !== "11.18.0" || JSON.stringify(packageJson.bundledDependencies) !== JSON.stringify([PI, TUI, MCP])) throw new Error("PACKAGE_METADATA_INVALID");
  let lockBytes;
  try {
    lockBytes = await readFile(join(root, "package-lock.json"), "utf8");
  } catch (error) {
    if (error instanceof Error && error.code === "ENOENT") throw new Error("PACKAGE_LOCK_MISSING");
    throw error;
  }
  let lock;
  try { lock = JSON.parse(lockBytes); } catch { throw new Error("PACKAGE_LOCK_INVALID"); }
  if (lock.lockfileVersion !== 3 || !PI_DEPENDENCIES.has(lock.packages?.[""]?.dependencies?.[PI]) || lock.packages?.[""]?.dependencies?.[TUI] !== "0.82.1" || lock.packages?.[""]?.dependencies?.[MCP] !== "1.30.0") throw new Error("PACKAGE_LOCK_INVALID");
  for (const [name, version, label] of [[PI, "0.82.1", "PI"], [TUI, "0.82.1", "TUI"], [MCP, "1.30.0", "MCP"]]) {
    const entry = lock.packages?.[`node_modules/${name}`];
    const resolved = name === PI ? entry?.resolved === PI_SOURCE || typeof entry?.resolved === "string" && entry.resolved.startsWith("https://registry.npmjs.org/") : typeof entry?.resolved === "string" && entry.resolved.startsWith("https://registry.npmjs.org/");
    if (entry?.version !== version || !resolved || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity ?? "")) throw new Error("PACKAGE_LOCK_INVALID");
    let installedBytes;
    try {
      const manifestPath = join(root, "node_modules", name, "package.json");
      await physicalPath(root, manifestPath);
      installedBytes = await readFile(manifestPath, "utf8");
    }
    catch (error) {
      if (error instanceof Error && error.code === "ENOENT") throw new Error(`PACKAGE_${label}_MANIFEST_MISSING`);
      throw error;
    }
    let installed;
    try { installed = JSON.parse(installedBytes); } catch { throw new Error(`PACKAGE_${label}_MANIFEST_INVALID`); }
    if (installed.version !== version) throw new Error("PACKAGE_INSTALLED_VERSION_INVALID");
  }
}

function canonicalMembers(members, types) {
  if (members.length !== types.length || members.length > MAX_TARBALL_MEMBERS) return null;
  const normalized = [];
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index], directory = types[index] === "d";
    const components = member.split("/"); if (member.endsWith("/")) components.pop();
    if (!["-", "d"].includes(types[index]) || components.length === 0 || components.some((part) => part === "" || part === "." || part === "..") || member.startsWith("/") || member.includes("\\")) return null;
    const path = directory && member.endsWith("/") ? member.slice(0, -1) : member;
    normalized.push({ directory, path });
  }
  normalized.sort((left, right) => left.path.localeCompare(right.path));
  for (let index = 0; index < normalized.length; index += 1) { const current = normalized[index], previous = normalized[index - 1]; if (previous && (previous.path === current.path || (!previous.directory && current.path.startsWith(`${previous.path}/`)))) return null; }
  return new Map(normalized.map(({ directory, path }) => [path, directory]));
}

async function expectedPackageFiles(root) {
  const npm = join(root, "node_modules", "npm", "bin", "npm-cli.js");
  const { stdout } = await exec(process.execPath, [npm, "pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  const result = JSON.parse(stdout);
  if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0].files)) throw new Error("PACKAGE_SOURCE_INVENTORY_INVALID");
  const files = result[0].files.map(({ path }) => path);
  if (files.some((path) => typeof path !== "string" || path === "" || path.startsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === "..")) || new Set(files).size !== files.length) throw new Error("PACKAGE_SOURCE_INVENTORY_INVALID");
  return new Set(files);
}

async function stableRead(path) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("PACKAGE_SOURCE_INVALID");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat(), bytes = await handle.readFile(), after = await handle.stat(), current = await lstat(path);
    for (const info of [opened, after, current]) if (!info.isFile() || info.isSymbolicLink() || info.dev !== before.dev || info.ino !== before.ino || info.size !== before.size || info.mtimeMs !== before.mtimeMs || info.ctimeMs !== before.ctimeMs) throw new Error("PACKAGE_SOURCE_RACE");
    return { bytes, mode: (opened.mode & 0o111) === 0 ? 0o644 : 0o755 };
  } finally { await handle.close(); }
}

async function snapshotSource(root, files) {
  const snapshot = new Map();
  for (const file of files) {
    const path = join(root, file);
    await physicalPath(root, path);
    snapshot.set(file, await stableRead(path));
  }
  return snapshot;
}

function requiredDirectories(files) {
  const directories = new Set(["package"]);
  for (const file of files) {
    let path = `package/${file}`;
    while (path.includes("/")) { path = path.slice(0, path.lastIndexOf("/")); directories.add(path); }
  }
  return directories;
}

async function snapshotTarball(tarball) {
  const directory = await mkdtemp(join(tmpdir(), "coco-tar-snapshot-")), path = join(directory, "candidate.tgz");
  let source, target;
  try {
    source = await open(tarball, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); target = await open(path, "wx", 0o600);
    let total = 0; const buffer = Buffer.alloc(64 * 1024);
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length); if (bytesRead === 0) break;
      total += bytesRead; if (total > MAX_TARBALL_BYTES) throw new Error("PACKAGE_TARBALL_TOO_LARGE");
      let offset = 0; while (offset < bytesRead) { const { bytesWritten } = await target.write(buffer, offset, bytesRead - offset); if (bytesWritten <= 0) throw new Error("PACKAGE_TARBALL_SNAPSHOT_FAILED"); offset += bytesWritten; }
    }
    await target.sync(); return { cleanup: () => rm(directory, { force: true, recursive: true }), path };
  } catch (error) { await rm(directory, { force: true, recursive: true }); throw error; }
  finally { await source?.close(); await target?.close(); }
}
export async function verifyTarballClosure({ root, tarball }) {
  let extracted, snapshot;
  try {
    await metadata(root);
    snapshot = await snapshotTarball(tarball);
    const piRoot = join(root, "node_modules", PI);
    const expected = await manifests(piRoot);
    const expectedFiles = await expectedPackageFiles(root);
    const sourceSnapshot = await snapshotSource(root, expectedFiles);
    const [{ stdout }, { stdout: details }] = await Promise.all([
      exec("tar", ["-tzf", snapshot.path], { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }),
      exec("tar", ["--numeric-owner", "-tvzf", snapshot.path], { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }),
    ]);
    const detailLines = details.trim().split("\n"), sizes = detailLines.map((line) => Number(/^\S+\s+\S+\s+(\d+)\s+/.exec(line)?.[1] ?? Number.NaN));
    if (sizes.some((size) => !Number.isSafeInteger(size) || size < 0 || size > MAX_MEMBER_BYTES) || sizes.reduce((total, size) => total + size, 0) > MAX_UNCOMPRESSED_BYTES) return rejected("PACKAGE_TARBALL_SIZE_INVALID");
    const inventory = canonicalMembers(stdout.trim().split("\n"), detailLines.map((line) => line[0]));
    if (!inventory) return rejected("PACKAGE_TARBALL_CLOSURE_INVALID");
    const paths = new Set(inventory.keys());
    const packagedFiles = new Set([...inventory].filter(([, directory]) => !directory).map(([path]) => path.startsWith("package/") ? path.slice(8) : path));
    const directories = requiredDirectories(expectedFiles);
    if ([...inventory].some(([path, directory]) => directory ? !directories.has(path) : !path.startsWith("package/"))) return rejected("PACKAGE_TARBALL_INVENTORY_MISMATCH");
    if (packagedFiles.size !== expectedFiles.size || [...expectedFiles].some((path) => !packagedFiles.has(path))) return rejected("PACKAGE_TARBALL_INVENTORY_MISMATCH");
    const prefix = "package/node_modules/@earendil-works/pi-coding-agent";
    if (!paths.has(`${prefix}/package.json`) || !paths.has(`${prefix}/dist/cli.js`) || !paths.has("package/node_modules/@earendil-works/pi-tui/package.json") || !paths.has("package/node_modules/@modelcontextprotocol/sdk/package.json")) return rejected("PACKAGE_TARBALL_CLOSURE_INVALID");
    extracted = await mkdtemp(join(tmpdir(), "coco-tar-"));
    await exec("tar", ["-xzf", snapshot.path, "--no-same-owner", "--no-same-permissions", "-C", extracted], { timeout: 60_000 });
    const packagedRoot = join(extracted, "package");
    for (const [member, directory] of inventory) {
      if (directory) continue;
      if (!member.startsWith("package/")) return rejected("PACKAGE_TARBALL_CLOSURE_INVALID");
      const path = member.slice("package/".length), sourcePath = join(root, path), packagedPath = join(packagedRoot, path);
      const source = sourceSnapshot.get(path), packaged = await readFile(packagedPath), packagedInfo = await lstat(packagedPath);
      const packagedMode = (packagedInfo.mode & 0o111) === 0 ? 0o644 : 0o755;
      if (!packagedInfo.isFile() || packagedInfo.isSymbolicLink() || source.mode !== packagedMode || !source.bytes.equals(packaged)) return rejected("PACKAGE_TARBALL_SOURCE_MISMATCH");
    }
    const actual = await manifests(join(packagedRoot, "node_modules", PI));
    const exactClosure = JSON.stringify(expected) === JSON.stringify(actual);
    const candidateClosure = JSON.parse(await readFile(join(root, "package.json"), "utf8")).dependencies?.[PI] === PI_SOURCE
      && actual.every((entry) => expected.includes(entry))
      && ["@earendil-works/pi-agent-core", "@earendil-works/pi-ai", "@earendil-works/pi-tui"].every((name) => paths.has(`${prefix}/node_modules/${name}/package.json`));
    if (!exactClosure && !candidateClosure) return rejected("PACKAGE_TARBALL_CLOSURE_INVALID");
    const finalExpectedFiles = await expectedPackageFiles(root);
    if (JSON.stringify([...finalExpectedFiles].sort()) !== JSON.stringify([...expectedFiles].sort())) return rejected("PACKAGE_SOURCE_RACE");
    for (const file of expectedFiles) {
      const current = await stableRead(join(root, file));
      const saved = sourceSnapshot.get(file);
      if (current.mode !== saved.mode || !current.bytes.equals(saved.bytes)) return rejected("PACKAGE_SOURCE_RACE");
    }
    for (const path of BOUND_FILES) if (!Buffer.from(await readFile(join(root, path))).equals(await readFile(join(packagedRoot, path)))) return rejected("PACKAGE_TARBALL_SOURCE_MISMATCH");
    if (!await verifyPackagedManifest(packagedRoot)) return rejected("PACKAGE_TARBALL_INTEGRITY_INVALID");
    return { packages: actual.length, status: "approved" };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return rejected(/^(?:PACKAGE_LOCK_MISSING|PACKAGE_(?:PI|TUI|MCP)_MANIFEST_(?:MISSING|INVALID))$/.test(code) ? code : "PACKAGE_TARBALL_CLOSURE_INVALID");
  }
  finally { if (extracted) await rm(extracted, { force: true, recursive: true }).catch(() => {}); if (snapshot) await snapshot.cleanup().catch(() => {}); }
}
export async function verifyPackageClosure({ root }) {
  try {
    const pi = join(root, "node_modules", PI);
    let manifestBytes;
    try {
      const manifestPath = join(pi, "package.json");
      await physicalPath(root, manifestPath);
      manifestBytes = await readFile(manifestPath, "utf8");
    }
    catch (error) {
      if (error instanceof Error && error.code === "ENOENT") return rejected("PACKAGE_PI_MANIFEST_MISSING");
      throw error;
    }
    let manifest;
    try { manifest = JSON.parse(manifestBytes); } catch { return rejected("PACKAGE_PI_MANIFEST_INVALID"); }
    if (manifest.version !== "0.82.1") return rejected("PACKAGE_CORE_VERSION_MISMATCH");
    await metadata(root);
    if (!(await lstat(join(pi, "dist", "cli.js"))).isFile()) return rejected("PACKAGE_CLOSURE_INVALID");
    return { packages: (await manifests(pi)).length, status: "approved" };
  } catch (error) { return rejected(error instanceof Error ? error.message : "PACKAGE_CLOSURE_INVALID"); }
}
