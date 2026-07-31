import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rmdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import https from "node:https";
import { join } from "node:path";

export const MAX_NPM_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 30_000;

export class BootstrapError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "BootstrapError";
  }
}

export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
export function sri(bytes) { return `sha512-${createHash("sha512").update(bytes).digest("base64")}`; }

export async function regular(path) {
  const info = await lstat(path);
  return info.isFile() && !info.isSymbolicLink();
}

export async function readRegular(path) {
  try {
    if (!(await regular(path))) throw new BootstrapError("NPM_BOOTSTRAP_EXTRACT");
    return readFile(path);
  } catch (error) {
    throw error instanceof BootstrapError ? error : new BootstrapError("NPM_BOOTSTRAP_EXTRACT");
  }
}

export async function downloadArchive(destination, url, requestGet = https.get) {
  const bytes = await new Promise((resolve, reject) => {
    const totalTimer = setTimeout(() => reject(new BootstrapError("NPM_BOOTSTRAP_DOWNLOAD")), REQUEST_TIMEOUT_MS);
    totalTimer.unref();
    const request = requestGet(url, { timeout: REQUEST_TIMEOUT_MS }, (response) => {
      if (response.statusCode !== 200 || response.headers.location) {
        response.resume();
        clearTimeout(totalTimer);
        reject(new BootstrapError("NPM_BOOTSTRAP_DOWNLOAD"));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_NPM_ARCHIVE_BYTES) {
          const error = new BootstrapError("NPM_BOOTSTRAP_DOWNLOAD");
          request.destroy(error);
          reject(error);
        }
        else chunks.push(chunk);
      });
      response.once("end", () => { clearTimeout(totalTimer); resolve(Buffer.concat(chunks)); });
      response.once("error", (error) => { clearTimeout(totalTimer); reject(error); });
    });
    request.once("timeout", () => request.destroy(new BootstrapError("NPM_BOOTSTRAP_DOWNLOAD")));
    request.once("error", (error) => { clearTimeout(totalTimer); reject(error); });
    request.once("close", () => clearTimeout(totalTimer));
  });
  await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
}

export async function rejectLinks(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new BootstrapError("NPM_BOOTSTRAP_EXTRACT");
  if (!info.isDirectory()) return;
  for (const name of await readdir(path)) await rejectLinks(join(path, name));
}

function waitForClose(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });
}

export async function extractArchive(archive, directory, spawnProcess = spawn) {
  const child = spawnProcess("tar", ["-xzf", archive, "--no-same-owner", "-C", directory], { stdio: "ignore" });
  if (await waitForClose(child) !== 0) throw new BootstrapError("NPM_BOOTSTRAP_EXTRACT");
  await rejectLinks(join(directory, "package"));
}

export async function executeNode(cli, args, cwd, spawnProcess = spawn) {
  const child = spawnProcess(process.execPath, [cli, ...args], { cwd, stdio: ["ignore", "pipe", "ignore"] });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  return { code: await waitForClose(child), stdout: Buffer.concat(chunks).toString("utf8") };
}

const CGROUP_ROOT = "/sys/fs/cgroup";
const TERM_GRACE_MS = 2_000;
const REAP_TIMEOUT_MS = 2_000;

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function signal(pid, kind, killProcess) {
  try { killProcess(pid, kind); } catch (error) { if (error?.code !== "ESRCH") throw error; }
}

async function cgroupPids(group) {
  return (await readFile(join(group, "cgroup.procs"), "utf8")).trim().split("\n").filter(Boolean).map(Number);
}

async function cgroup() {
  const group = join(CGROUP_ROOT, `coco-npm-${randomBytes(12).toString("hex")}`);
  try {
    if ((await readFile(join(CGROUP_ROOT, "cgroup.controllers"), "utf8")).trim() === "") throw new Error("cgroup unavailable");
    await mkdir(group);
    return group;
  } catch (error) {
    try { await rmdir(group); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    throw new BootstrapError("NPM_BOOTSTRAP_SPAWN");
  }
}

async function empty(group) {
  return (await cgroupPids(group)).length === 0;
}

async function waitForEmpty(group) {
  const deadline = Date.now() + REAP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await empty(group)) return;
    await delay(10);
  }
  if (!(await empty(group))) throw new BootstrapError("NPM_BOOTSTRAP_SPAWN");
}

async function removeCgroup(group) {
  await waitForEmpty(group);
  const deadline = Date.now() + REAP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try { await rmdir(group); return; } catch (error) { if (error?.code === "ENOENT") return; if (error?.code !== "EBUSY") throw error; }
    await delay(10);
  }
  await rmdir(group);
}

function childExit(child) {
  return new Promise((resolve) => {
    child.once("error", () => resolve({ kind: "error" }));
    child.once("close", (code) => resolve({ code: code ?? -1, kind: "close" }));
  });
}

async function terminate(group, exit, killProcess) {
  for (const pid of await cgroupPids(group)) signal(pid, "SIGTERM", killProcess);
  await Promise.race([exit, delay(TERM_GRACE_MS)]);
  await writeFile(join(group, "cgroup.kill"), "1");
  await Promise.race([exit, delay(REAP_TIMEOUT_MS)]);
  await waitForEmpty(group);
}

export async function installWithTimeout(cli, root, timeoutMs, spawnProcess = spawn, killProcess = process.kill) {
  const group = await cgroup();
  let child;
  let exit;
  let timer;
  try {
    const wrapper = 'printf "%s" "$$" > "$COCO_NPM_CGROUP/cgroup.procs"; unset COCO_NPM_CGROUP; exec "$@"';
    child = spawnProcess("/bin/sh", ["-c", wrapper, "coco-npm", process.execPath, cli, "install", "--ignore-scripts", "--package-lock=true", "--save-exact"], { cwd: root, detached: true, env: { ...process.env, COCO_NPM_CGROUP: group }, stdio: "ignore" });
    exit = childExit(child);
    const outcome = await new Promise((resolve) => {
      timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      exit.then(resolve);
    });
    clearTimeout(timer);
    timer = undefined;
    if (outcome.kind === "close") return outcome.code;
    if (outcome.kind === "error") throw new BootstrapError("NPM_BOOTSTRAP_SPAWN");
    await terminate(group, exit, killProcess);
    throw new BootstrapError("NPM_BOOTSTRAP_TIMEOUT");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (exit !== undefined && child !== undefined) {
      try { await writeFile(join(group, "cgroup.kill"), "1"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      await Promise.race([exit, delay(REAP_TIMEOUT_MS)]);
    }
    await removeCgroup(group);
  }
}
