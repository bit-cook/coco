import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { localNpmCli } from "./bootstrap-npm.mjs";
import { generateAssetMap, verifyAssetMap } from "./generate-asset-map.mjs";
import { verifyTarballClosure } from "./verify-package-closure.mjs";

const exec = promisify(execFile);
const PLAN_SHA256 = "03966a1e794e6f766d381d429ac6a5a4197e349b0a9e80c7a34d60cbdfc7c9d6";
const MAX_BUFFER = 64 * 1024 * 1024;

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_2_QA_USAGE");
  return resolve(argv[3]);
}

async function command(file, args, cwd, env = process.env) {
  try {
    const result = await exec(file, args, { cwd, env, maxBuffer: MAX_BUFFER });
    return { code: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    return { code: typeof error.code === "number" ? error.code : -1, stderr: error.stderr ?? "", stdout: error.stdout ?? "" };
  }
}

function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }

async function tarMembers(tarball) {
  const listed = await command("tar", ["-tzf", tarball], resolve("."));
  if (listed.code !== 0) return [];
  return listed.stdout.trim().split("\n").filter(Boolean).map((member) => member.replace(/^package\//, ""));
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const npmCli = localNpmCli(root);
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-2-"));
  const tarball = join(fixture, "coco-0.1.1.tgz");
  const assetMap = join(root, "scripts", "package-asset-map.v1.json");
  const cases = [];
  const npmEnv = { ...process.env, TMPDIR: fixture };
  try {
    cases.push(result("local-npm-launcher-present", true, (await lstat(npmCli)).isFile()));
    for (const [name, args] of [
      ["npm-ci", [npmCli, "ci", "--ignore-scripts"]],
      ["typecheck", [npmCli, "run", "typecheck"]],
      ["tests-real-bootstrap-package-inputs-assets-abi", [npmCli, "test"]],
      ["build-map-deterministic", [npmCli, "run", "build"]],
      ["npm-ls-production", [npmCli, "ls", "--all", "--omit=dev", "--json", "--long"]],
      ["npm-pack", [npmCli, "pack", "--json", "--pack-destination", fixture]],
    ]) cases.push(result(name, 0, (await command(process.execPath, args, root, npmEnv)).code));
    cases.push(result("local-npm-launcher-survives-ci", true, (await lstat(npmCli)).isFile()));
    const map = JSON.parse(await readFile(assetMap, "utf8"));
    const members = await tarMembers(tarball);
    const ownMembers = members.filter((member) => !member.startsWith("node_modules/"));
    cases.push(result("tar-members-match-map-v2", "approved", verifyAssetMap({ actual: ownMembers, map }).status));
    cases.push(result("tar-excludes-local-tools-and-escapes", true, ownMembers.every((member) => !member.startsWith(".coco-tools/") && !member.startsWith("../") && !member.startsWith("/"))));
    const closure = await verifyTarballClosure({ root, tarball });
    cases.push(result("tarball-physical-recursive-closure", "approved", closure.status));
    const prefix = join(fixture, "prefix");
    const home = join(fixture, "home");
    const cache = join(fixture, "empty-cache");
    await mkdir(home); await mkdir(cache);
    const consumerEnv = { HOME: home, NODE_PATH: "", PATH: "/usr/local/bin:/usr/bin:/bin", TMPDIR: fixture, npm_config_cache: cache, npm_config_offline: "true" };
    cases.push(result("offline-empty-cache-install", 0, (await command(process.execPath, [npmCli, "install", "--offline", "--ignore-scripts", "--omit=dev", "--cache", cache, "--prefix", prefix, tarball], root, consumerEnv)).code));
    const bin = join(prefix, "node_modules", ".bin");
    const piBin = join(prefix, "node_modules", "coco", "node_modules", ".bin");
    const consumerRun = await command("bash", ["-ceu", 'test "$(realpath "$(command -v coco)")" = "$(realpath "$1/coco")"; test "$(realpath "$(command -v pi)")" = "$(realpath "$2/pi")"; coco --offline --version; pi --offline --version', "bash", bin, piBin], root, { ...consumerEnv, PATH: `${bin}:${piBin}:${consumerEnv.PATH}`, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1" });
    cases.push(result("consumer-prefix-coco-and-pi-execute", 0, consumerRun.code));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    const artifacts = {
      abiSha256: sha256(await readFile(join(root, "resources", "windows-native-adapter-abi.v1.json"))),
      assetMapSha256: sha256(await readFile(assetMap)),
      packageLockSha256: sha256(await readFile(join(root, "package-lock.json"))),
      tarballSha256: sha256(await readFile(tarball)),
      tarMembers: members.length,
      bundledPackages: closure.packages ?? 0,
    };
    await writeFile(evidence, canonicalJson({ artifacts, cases, planSha256: PLAN_SHA256, schemaVersion: 2, status, task: 2 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
}

void main();
