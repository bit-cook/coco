import { spawn } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

import { canonicalJson } from "./canonical-json.mjs";
import { BootstrapError, downloadArchive, executeNode, extractArchive, readRegular, regular, rejectLinks, sha256, sri, installWithTimeout } from "./npm-bootstrap-runtime.mjs";

const ABI_SHA256 = "92d2991c2b39e6c6099c61fe8a876ad0106b2d8204cbb7756bbf85be70091083";
const NPM_SRI = "sha512-T67M4L5wNm0cZ7EBLErcEkY1SmzEW/WJ+SADBzsFUY1UdAPfFHXFQtZ6SEXiK0+vzXysCvAsepbMaBTwnrAD+w==";
const NPM_URL = "https://registry.npmjs.org/npm/-/npm-11.18.0.tgz";
const NPM_CLI_SHA256 = "8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7";
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function rejected(code) { return { code, status: "rejected" }; }
function errorCode(error, fallback) { return error instanceof BootstrapError ? error.code : fallback; }
function phase(operation, code) {
  return async (...args) => {
    try { return await operation(...args); } catch (error) { throw new BootstrapError(errorCode(error, code)); }
  };
}
function defaultDependencies() {
  return {
    download: downloadArchive,
    extract: extractArchive,
    install: installWithTimeout,
    kill: process.kill,
    request: https.get,
    run: executeNode,
    spawn,
  };
}
function withDependencies(dependencies) { return { ...defaultDependencies(), ...dependencies }; }
async function cleanGenerated(root, removeModules) {
  await rm(join(root, "package-lock.json"), { force: true });
  if (removeModules) await rm(join(root, "node_modules"), { force: true, recursive: true });
}
async function exactVersion(run, cli, root) {
  const result = await run(cli, ["--version"], root);
  return result.code === 0 && result.stdout === "11.18.0\n";
}
function expectedLock(lock) {
  const npm = lock.packages?.["node_modules/npm"];
  const pi = lock.packages?.["node_modules/@earendil-works/pi-coding-agent"];
  return lock.lockfileVersion === 3 && npm?.version === "11.18.0" && npm?.resolved === NPM_URL && npm?.integrity === NPM_SRI && pi?.version === "0.82.1";
}

export function localNpmCli(root) { return join(root, ".coco-tools", "npm-11.18.0", "package", "bin", "npm-cli.js"); }

export async function bootstrapLocalNpm({ root, dependencies }) {
  let temporary = "";
  const deps = withDependencies(dependencies);
  try {
    if (root !== PACKAGE_ROOT) throw new BootstrapError("NPM_BOOTSTRAP_SPAWN");
    const cli = localNpmCli(root);
    if (await regular(cli) && sha256(await readFile(cli)) === NPM_CLI_SHA256 && await exactVersion(deps.run, cli, root)) return { cliSha256: NPM_CLI_SHA256, status: "approved" };
    temporary = await mkdtemp(join(tmpdir(), "coco-npm-tool-"));
    const archive = join(temporary, "npm.tgz");
    await phase((archivePath, url) => deps.download(archivePath, url, deps.request), "NPM_BOOTSTRAP_DOWNLOAD")(archive, NPM_URL);
    if (sri(await readFile(archive)) !== NPM_SRI) throw new BootstrapError("NPM_BOOTSTRAP_SRI");
    await phase((archivePath, directory) => deps.extract(archivePath, directory, deps.spawn), "NPM_BOOTSTRAP_EXTRACT")(archive, temporary);
    const extracted = join(temporary, "package", "bin", "npm-cli.js");
    if (!(await regular(extracted)) || sha256(await readFile(extracted)) !== NPM_CLI_SHA256) throw new BootstrapError("NPM_BOOTSTRAP_EXTRACT");
    const installed = dirname(dirname(dirname(cli)));
    const stage = `${installed}.stage-${process.pid}`;
    await rm(stage, { force: true, recursive: true });
    await mkdir(dirname(installed), { recursive: true });
    await cp(join(temporary, "package"), stage, { recursive: true, verbatimSymlinks: true });
    await rejectLinks(stage);
    await rm(installed, { force: true, recursive: true });
    await rename(stage, installed);
    temporary = "";
    if (!(await exactVersion(deps.run, cli, root))) throw new BootstrapError("NPM_BOOTSTRAP_EXTRACT");
    return { cliSha256: NPM_CLI_SHA256, status: "approved" };
  } catch (error) {
    return rejected(errorCode(error, "NPM_BOOTSTRAP_SPAWN"));
  } finally { if (temporary) await rm(temporary, { force: true, recursive: true }); }
}

export async function bootstrapWindowsAbi({ destination, source = "/tmp/windows-native-adapter-abi.v1.json" }) {
  try {
    if (!(await regular(source))) return rejected("WINDOWS_ABI_BOOTSTRAP_INVALID");
    const bytes = await readFile(source);
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (sha256(bytes) !== ABI_SHA256 || canonicalJson(parsed) !== bytes.toString("utf8")) return rejected("WINDOWS_ABI_BOOTSTRAP_INVALID");
    await writeFile(destination, bytes, { flag: "wx", mode: 0o644 });
    return { sha256: ABI_SHA256, status: "approved" };
  } catch { return rejected("WINDOWS_ABI_BOOTSTRAP_INVALID"); }
}

export async function bootstrapNpm({ root, tarball = NPM_URL, timeoutMs = 120_000, dependencies }) {
  const deps = withDependencies(dependencies);
  const lock = join(root, "package-lock.json");
  const modules = join(root, "node_modules");
  let installStarted = false;
  let modulesWerePresent = false;
  let temporary = "";
  try {
    try { await lstat(lock); return rejected("BOOTSTRAP_LOCK_CONFLICT"); } catch (error) { if (error?.code !== "ENOENT") throw new BootstrapError("NPM_BOOTSTRAP_SPAWN"); }
    try { await lstat(modules); modulesWerePresent = true; } catch (error) { if (error?.code !== "ENOENT") throw new BootstrapError("NPM_BOOTSTRAP_SPAWN"); }
    temporary = await mkdtemp(join(tmpdir(), "coco-npm-"));
    const archive = join(temporary, "npm.tgz");
    await phase((archivePath, url) => deps.download(archivePath, url, deps.request), "NPM_BOOTSTRAP_DOWNLOAD")(archive, tarball);
    if (sri(await readFile(archive)) !== (dependencies?.expectedSri ?? NPM_SRI)) throw new BootstrapError("NPM_BOOTSTRAP_SRI");
    await phase((archivePath, directory) => deps.extract(archivePath, directory, deps.spawn), "NPM_BOOTSTRAP_EXTRACT")(archive, temporary);
    const cli = join(temporary, "package", "bin", "npm-cli.js");
    const cliSha256 = sha256(await readRegular(cli));
    installStarted = true;
    const code = await phase((npmCli, directory, limit) => deps.install(npmCli, directory, limit, deps.spawn, deps.kill), "NPM_BOOTSTRAP_SPAWN")(cli, root, timeoutMs);
    if (code !== 0 || !(expectedLock(JSON.parse(await readFile(lock, "utf8"))))) throw new BootstrapError("NPM_BOOTSTRAP_INSTALL");
    return { cliSha256, status: "approved" };
  } catch (error) {
    if (installStarted) await cleanGenerated(root, !modulesWerePresent);
    return rejected(errorCode(error, "NPM_BOOTSTRAP_SPAWN"));
  } finally { if (temporary) await rm(temporary, { force: true, recursive: true }); }
}

export { NPM_SRI, NPM_URL };
