import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { lstat, mkdir, open } from "node:fs/promises";

import { StateError } from "./state-schema.mjs";

export function agentDirectory(environment = process.env) {
  const home = environment.COCO_CODING_AGENT_DIR || environment.HOME || homedir();
  if (!home) throw new StateError("HOME_UNAVAILABLE");
  return environment.COCO_CODING_AGENT_DIR ? resolve(home) : join(resolve(home), ".coco", "agent");
}

export function statePaths(agentDir) {
  const root = resolve(agentDir);
  return Object.freeze({
    agentDir: root,
    auth: join(root, "auth.json"),
    catalogs: join(root, "catalogs"),
    control: join(root, "control.json"),
    journal: join(root, "transactions"),
    mcp: join(root, "mcp.json"),
    models: join(root, "models.json"),
    ownership: join(root, "ownership.json"),
    runner: join(root, "runner.json"),
    settings: join(root, "settings.json"),
    taskEvents: join(root, "task-events"),
    taskExecutionBindings: join(root, "task-execution-bindings"),
    taskLogs: join(root, "task-logs"),
    taskReceipts: join(root, "task-receipts"),
    taskRuns: join(root, "task-runs"),
    tasks: join(root, "tasks.json"),
    worktrees: join(root, "worktrees"),
    webhookDeliveries: join(root, "webhook-deliveries.json"),
  });
}

export function safeStatePath(agentDir, path) {
  const root = resolve(agentDir);
  const absolute = resolve(path);
  if (!isAbsolute(path) || (absolute !== root && !absolute.startsWith(`${root}${sep}`))) throw new StateError("STATE_PATH_INVALID");
  return absolute;
}

export async function ensureAgentDirectory(agentDir) {
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    const info = await lstat(agentDir);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new StateError("STATE_PERMISSION_INVALID");
  }
}

export async function inspectRegular(path, required = false) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new StateError("STATE_ENTRY_INVALID");
    if (process.platform !== "win32" && (info.mode & 0o200) === 0) throw new StateError("STATE_PERMISSION_INVALID");
    return info;
  } catch (error) {
    if (error && error.code === "ENOENT" && !required) return null;
    if (error instanceof StateError) throw error;
    throw new StateError("STATE_ENTRY_INVALID");
  }
}

export async function fsyncDirectory(path) {
  if (process.platform === "win32") return;
  const descriptor = await open(dirname(path), "r");
  try { await descriptor.sync(); } finally { await descriptor.close(); }
}
