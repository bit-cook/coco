import { execFile } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { localNpmCli } from "./bootstrap-npm.mjs";

const exec = promisify(execFile);
const maxBuffer = 64 * 1024 * 1024;
function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }
function options(argv) { if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_3_QA_USAGE"); return resolve(argv[3]); }
async function command(file, args, cwd, env) { try { const output = await exec(file, args, { cwd, env, maxBuffer }); return { code: 0, stderr: output.stderr, stdout: output.stdout }; } catch (error) { return { code: typeof error.code === "number" ? error.code : -1, stderr: error.stderr ?? "", stdout: error.stdout ?? "" }; } }

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const temp = await mkdtemp(join(tmpdir(), "coco-task-3-"));
  const tarball = join(root, "coco-0.1.0.tgz");
  const cases = [];
  try {
    const npm = localNpmCli(root);
    const env = { ...process.env, PI_OFFLINE: "1", TMPDIR: "/root/.cache/coco-tmp" };
    cases.push(result("build-runtime-manifest", 0, (await command(process.execPath, [npm, "run", "build"], root, env)).code));
    cases.push(result("source-integrity", 0, (await command(join(root, "bin", "coco"), ["--version"], root, env)).code));
    const sourceOutput = await command(join(root, "bin", "coco"), ["--help"], root, env);
    cases.push(result("source-coco-identity", true, sourceOutput.stdout.includes("coco") && !sourceOutput.stdout.includes("pi.dev")));
    const copy = join(temp, "coco");
    await cp(root, copy, { filter: (path) => !path.includes("/.coco-tools/") && !path.includes("/test/") && !path.endsWith(".tgz"), recursive: true });
    const config = join(copy, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "config.js");
    const configBytes = await readFile(config);
    await writeFile(config, "mutated\n");
    const mutated = await command(join(copy, "bin", "coco"), ["--version"], copy, env);
    cases.push(result("mutated-pi-rejects-before-import", true, mutated.code !== 0 && mutated.stderr.includes("RUNTIME_INTEGRITY_MISMATCH")));
    await writeFile(config, configBytes);
    const guardPath = join(copy, "resources", "coco-guard.mjs");
    const guardBytes = await readFile(guardPath);
    await writeFile(guardPath, "mutated\n");
    const guard = await command(join(copy, "bin", "coco"), ["--version"], copy, env);
    cases.push(result("mutated-guard-rejects-before-import", true, guard.code !== 0 && guard.stderr.includes("RUNTIME_INTEGRITY_MISMATCH")));
    await writeFile(guardPath, guardBytes);
    await writeFile(join(copy, "resources", "unexpected.json"), "{}\n");
    const asset = await command(join(copy, "bin", "coco"), ["--version"], copy, env);
    cases.push(result("unexpected-mapped-resource-rejects", true, asset.code !== 0 && asset.stderr.includes("RUNTIME_INTEGRITY_UNEXPECTED_ENTRY")));
    await rm(tarball, { force: true });
    cases.push(result("pack", 0, (await command(process.execPath, [npm, "pack", "--json"], root, env)).code));
    const prefix = join(temp, "prefix with spaces");
    const cache = join(temp, "empty-cache");
    await mkdir(cache);
    const installEnv = { HOME: join(temp, "home"), NODE_PATH: "", PATH: "/usr/local/bin:/usr/bin:/bin", TMPDIR: "/root/.cache/coco-tmp", npm_config_cache: cache, npm_config_offline: "true" };
    cases.push(result("offline-packed-install", 0, (await command(process.execPath, [npm, "install", "--offline", "--ignore-scripts", "--omit=dev", "--cache", cache, "--prefix", prefix, tarball], root, installEnv)).code));
    const installed = join(prefix, "node_modules", "coco", "bin", "coco");
    cases.push(result("packed-identity-spaces", 0, (await command(installed, ["--version"], prefix, { ...installEnv, PI_OFFLINE: "1" })).code));
    const manifest = join(root, "resources", "runtime-integrity-manifest.v1.json");
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { manifestEntries: JSON.parse(await readFile(manifest, "utf8")).entries.length, manifestSha256: sha256(await readFile(manifest)), manifestSidecarSha256: sha256(await readFile(`${manifest}.sha256`)), tarballSha256: sha256(await readFile(tarball)) }, cases, schemaVersion: 1, status, task: 3 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally { await rm(tarball, { force: true }); await rm(temp, { force: true, recursive: true }); }
}
void main();
