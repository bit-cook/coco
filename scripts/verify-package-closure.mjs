import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const PI = "@earendil-works/pi-coding-agent";
const TUI = "@earendil-works/pi-tui";
const MCP = "@modelcontextprotocol/sdk";
const exec = promisify(execFile);
function rejected(code) { return { code, status: "rejected" }; }
async function manifests(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) result.push(...await manifests(root, path));
    if (entry.isFile() && entry.name === "package.json") {
      const value = JSON.parse(await readFile(path, "utf8"));
      result.push(`${relative(root, current)}:${value.name}@${value.version}`);
    }
  }
  return result.sort();
}
async function metadata(root) {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (packageJson.packageManager !== "npm@11.18.0" || packageJson.dependencies?.[PI] !== "0.82.1" || packageJson.dependencies?.[TUI] !== "0.82.1" || packageJson.dependencies?.[MCP] !== "1.30.0" || packageJson.devDependencies?.npm !== "11.18.0" || JSON.stringify(packageJson.bundledDependencies) !== JSON.stringify([PI, TUI, MCP])) throw new Error("PACKAGE_METADATA_INVALID");
  try {
    const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
    if (lock.lockfileVersion !== 3 || lock.packages?.[""]?.dependencies?.[PI] !== "0.82.1" || lock.packages?.[""]?.dependencies?.[TUI] !== "0.82.1" || lock.packages?.[""]?.dependencies?.[MCP] !== "1.30.0") throw new Error("PACKAGE_LOCK_INVALID");
  } catch (error) { if (!(error instanceof Error && error.code === "ENOENT")) throw error; }
}
export async function verifyTarballClosure({ root, tarball }) {
  try {
    await metadata(root);
    const piRoot = join(root, "node_modules", PI);
    const expected = await manifests(piRoot);
    const { stdout } = await exec("tar", ["-tzf", tarball], { maxBuffer: 64 * 1024 * 1024 });
    const paths = new Set(stdout.trim().split("\n"));
    const prefix = "package/node_modules/@earendil-works/pi-coding-agent";
    if (!paths.has(`${prefix}/package.json`) || !paths.has(`${prefix}/dist/cli.js`) || !paths.has("package/node_modules/@earendil-works/pi-tui/package.json") || !paths.has("package/node_modules/@modelcontextprotocol/sdk/package.json")) return rejected("PACKAGE_TARBALL_CLOSURE_INVALID");
    const extracted = await mkdtemp(join(tmpdir(), "coco-tar-"));
    await exec("tar", ["-xzf", tarball, "-C", extracted]);
    const actual = await manifests(join(extracted, "package", "node_modules", PI));
    await rm(extracted, { force: true, recursive: true });
    if (JSON.stringify(expected) !== JSON.stringify(actual)) return rejected("PACKAGE_TARBALL_CLOSURE_INVALID");
    return { packages: actual.length, status: "approved" };
  } catch { return rejected("PACKAGE_TARBALL_CLOSURE_INVALID"); }
}
export async function verifyPackageClosure({ root }) {
  try {
    await metadata(root);
    const pi = join(root, "node_modules", PI);
    const manifest = JSON.parse(await readFile(join(pi, "package.json"), "utf8"));
    if (manifest.version !== "0.82.1") return rejected("PACKAGE_CORE_VERSION_MISMATCH");
    if (!(await lstat(join(pi, "dist", "cli.js"))).isFile()) return rejected("PACKAGE_CLOSURE_INVALID");
    const mcp = JSON.parse(await readFile(join(root, "node_modules", MCP, "package.json"), "utf8"));
    if (mcp.version !== "1.30.0") return rejected("PACKAGE_MCP_VERSION_MISMATCH");
    return { packages: (await manifests(pi)).length, status: "approved" };
  } catch (error) { return rejected(error instanceof Error ? error.message : "PACKAGE_CLOSURE_INVALID"); }
}
