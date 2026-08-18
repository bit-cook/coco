import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { constants, lstat, mkdir, open, readFile, realpath, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const IDENTIFIER = /^coco-run-[a-f0-9]{32}$/;
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

function reason(error) {
  if (["EACCES", "EPERM", "EROFS", "ENOENT", "ENODEV", "ENOSYS", "EOPNOTSUPP"].includes(error?.code)) return "CGROUP_DELEGATION_UNAVAILABLE";
  if (["CGROUP_IDENTIFIER_INVALID", "CGROUP_PATH_INVALID", "CGROUP_PATH_RACE", "CGROUP_PATH_REPLACED", "CGROUP_PROCESS_IDENTITY_MISMATCH", "CGROUP_PROCS_INVALID"].includes(error?.code)) return error.code;
  return "CGROUP_OPERATION_FAILED";
}

function validDescriptor(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && value.schemaVersion === 1 && value.platform === "linux" && IDENTIFIER.test(value.identifier ?? "")
    && Number.isSafeInteger(value.ownerGeneration) && value.ownerGeneration > 0
    && typeof value.ownerId === "string" && value.ownerId.length > 0 && value.ownerId.length <= 200
    && (value.groupDevice === null || (Number.isSafeInteger(value.groupDevice) && value.groupDevice >= 0))
    && (value.groupInode === null || (Number.isSafeInteger(value.groupInode) && value.groupInode > 0))
    && (value.groupDevice === null) === (value.groupInode === null)
    && ["pending", "active", "cleanup-pending", "cleaned", "unsupported", "degraded"].includes(value.status)
    && (value.reason === null || (typeof value.reason === "string" && value.reason.length > 0 && value.reason.length <= 100));
}

export function linuxContainmentDescriptor({ generation, ownerId, runId, taskId }) {
  const identifier = `coco-run-${createHash("sha256").update(`${taskId}\0${runId}\0${generation}\0${ownerId}`).digest("hex").slice(0, 32)}`;
  return process.platform === "linux"
    ? { groupDevice: null, groupInode: null, identifier, ownerGeneration: generation, ownerId, platform: "linux", reason: null, schemaVersion: 1, status: "pending" }
    : { groupDevice: null, groupInode: null, identifier, ownerGeneration: generation, ownerId, platform: "linux", reason: "PLATFORM_UNSUPPORTED", schemaVersion: 1, status: "unsupported" };
}

export function validLinuxContainment(value, { generation, ownerId } = {}) {
  return validDescriptor(value) && (generation === undefined || value.ownerGeneration === generation) && (ownerId === undefined || value.ownerId === ownerId);
}

export function resolveLinuxContainmentRoot({ membership, mount = "/sys/fs/cgroup" } = {}) {
  const value = membership ?? readFileSync("/proc/self/cgroup", "utf8");
  const unified = value.split("\n").map((line) => /^0::(\/[^\0\\]*)$/.exec(line)?.[1]).find(Boolean);
  if (!unified || unified.split("/").some((part) => part === "..")) throw Object.assign(new Error("CGROUP_DELEGATION_UNAVAILABLE"), { code: "ENODEV" });
  const base = resolve(mount), root = resolve(base, `.${unified}`);
  if (root !== base && !root.startsWith(`${base}/`)) throw Object.assign(new Error("CGROUP_PATH_INVALID"), { code: "CGROUP_PATH_INVALID" });
  return root;
}

function defaultContainmentRoot() {
  if (process.platform !== "linux") return "/sys/fs/cgroup";
  try { return resolveLinuxContainmentRoot(); }
  catch { return "/sys/fs/cgroup"; }
}

export function createLinuxContainment({ root = defaultContainmentRoot(), waitAttempts = 100, waitMs = 10 } = {}) {
  const containmentRoot = resolve(root);
  if (!Number.isSafeInteger(waitAttempts) || waitAttempts < 1 || !Number.isSafeInteger(waitMs) || waitMs < 0) throw new Error("CGROUP_OPTIONS_INVALID");

  function groupPath(descriptor) {
    if (!validDescriptor(descriptor)) throw Object.assign(new Error("CGROUP_IDENTIFIER_INVALID"), { code: "CGROUP_IDENTIFIER_INVALID" });
    return join(containmentRoot, descriptor.identifier);
  }

  async function directory(path, expectedRoot = false, descriptor = null) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Object.assign(new Error("CGROUP_PATH_INVALID"), { code: "CGROUP_PATH_INVALID" });
    const actual = await realpath(path);
    if ((expectedRoot && actual !== containmentRoot) || (!expectedRoot && resolve(actual, "..") !== containmentRoot)) throw Object.assign(new Error("CGROUP_PATH_INVALID"), { code: "CGROUP_PATH_INVALID" });
    if (descriptor && descriptor.groupInode !== null && (info.dev !== descriptor.groupDevice || info.ino !== descriptor.groupInode)) throw Object.assign(new Error("CGROUP_PATH_REPLACED"), { code: "CGROUP_PATH_REPLACED" });
    return info;
  }

  async function ensureRoot() {
    await directory(containmentRoot, true);
    const controllers = await readFile(join(containmentRoot, "cgroup.controllers"), "utf8");
    if (controllers.trim() === "") throw Object.assign(new Error("CGROUP_DELEGATION_UNAVAILABLE"), { code: "ENODEV" });
  }

  async function openControl(group, name, flags, descriptor = null) {
    await directory(group, false, descriptor);
    const parentBefore = await lstat(group);
    const path = join(group, name);
    const before = await lstat(path);
    if (before.isSymbolicLink()) throw Object.assign(new Error("CGROUP_PATH_INVALID"), { code: "CGROUP_PATH_INVALID" });
    const handle = await open(path, flags | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    const after = await lstat(path), parentAfter = await lstat(group);
    if (parentBefore.dev !== parentAfter.dev || parentBefore.ino !== parentAfter.ino || opened.dev !== before.dev || opened.ino !== before.ino || opened.dev !== after.dev || opened.ino !== after.ino) {
      await handle.close();
      throw Object.assign(new Error("CGROUP_PATH_RACE"), { code: "CGROUP_PATH_RACE" });
    }
    return handle;
  }

  async function pids(descriptor) {
    const group = groupPath(descriptor);
    let handle;
    try {
      handle = await openControl(group, "cgroup.procs", constants.O_RDONLY, descriptor);
      const value = (await handle.readFile("utf8")).trim();
      if (value === "") return [];
      const result = value.split("\n").map(Number);
      if (result.some((pid) => !Number.isSafeInteger(pid) || pid < 1)) throw Object.assign(new Error("CGROUP_PROCS_INVALID"), { code: "CGROUP_PROCS_INVALID" });
      return result;
    } finally { await handle?.close(); }
  }

  async function attach(descriptor, pid, matches) {
    if (descriptor.status === "unsupported") return descriptor;
    const group = groupPath(descriptor);
    try {
      await ensureRoot();
      try { await mkdir(group, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") throw error; }
      const groupInfo = await directory(group, false, descriptor);
      if (!await matches(pid)) throw Object.assign(new Error("CGROUP_PROCESS_IDENTITY_MISMATCH"), { code: "CGROUP_PROCESS_IDENTITY_MISMATCH" });
      let handle;
      try { handle = await openControl(group, "cgroup.procs", constants.O_WRONLY, descriptor); await handle.writeFile(String(pid)); }
      finally { await handle?.close(); }
      if (!await matches(pid) || !(await pids(descriptor)).includes(pid)) throw Object.assign(new Error("CGROUP_PROCESS_IDENTITY_MISMATCH"), { code: "CGROUP_PROCESS_IDENTITY_MISMATCH" });
      return { ...descriptor, groupDevice: groupInfo.dev, groupInode: groupInfo.ino, reason: null, status: "active" };
    } catch (error) {
      return { ...descriptor, reason: reason(error), status: reason(error) === "CGROUP_DELEGATION_UNAVAILABLE" ? "unsupported" : "degraded" };
    }
  }

  async function remove(group) {
    for (let attempt = 0; attempt < waitAttempts; attempt += 1) {
      try { await rmdir(group); return true; }
      catch (error) {
        if (error?.code === "ENOENT") return true;
        if (error?.code !== "EBUSY" || attempt === waitAttempts - 1) return false;
        await delay(waitMs);
      }
    }
    return false;
  }

  async function terminate(descriptor) {
    if (!validDescriptor(descriptor)) return { descriptor, reason: "CGROUP_IDENTIFIER_INVALID", status: "degraded" };
    if (descriptor.status === "unsupported") return { descriptor, reason: descriptor.reason, status: "unsupported" };
    if (descriptor.status === "cleaned") return { descriptor, status: "terminated" };
    const group = groupPath(descriptor);
    try {
      await ensureRoot();
      try { await directory(group, false, descriptor); } catch (error) {
        if (error?.code === "ENOENT") return { descriptor: { ...descriptor, reason: null, status: "cleaned" }, status: "terminated" };
        throw error;
      }
      let handle;
      try { handle = await openControl(group, "cgroup.kill", constants.O_WRONLY, descriptor); await handle.writeFile("1"); }
      finally { await handle?.close(); }
      for (let attempt = 0; attempt < waitAttempts && (await pids(descriptor)).length > 0; attempt += 1) await delay(waitMs);
      if ((await pids(descriptor)).length > 0) return { descriptor: { ...descriptor, reason: "CGROUP_NOT_EMPTY", status: "degraded" }, reason: "CGROUP_NOT_EMPTY", status: "degraded" };
      const cleaned = await remove(group);
      return { descriptor: { ...descriptor, reason: cleaned ? null : "CGROUP_CLEANUP_PENDING", status: cleaned ? "cleaned" : "cleanup-pending" }, status: "terminated" };
    } catch (error) {
      const why = reason(error);
      return { descriptor: { ...descriptor, reason: why, status: why === "CGROUP_DELEGATION_UNAVAILABLE" ? "unsupported" : "degraded" }, reason: why, status: why === "CGROUP_DELEGATION_UNAVAILABLE" ? "unsupported" : "degraded" };
    }
  }

  return { attach, pids, terminate };
}
