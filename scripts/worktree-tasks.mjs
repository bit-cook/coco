import { mkdir, realpath } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

import { execCommand } from "../dist/core/exec.js";
import { StateError } from "./state-schema.mjs";

function fail(code) { throw new StateError(code); }
async function git(args, cwd) {
  const result = await execCommand("git", args, cwd, { timeout: 30000 });
  if (result.code !== 0) fail("GIT_WORKTREE_FAILED");
  return result.stdout.trim();
}

export async function repositoryRoot(cwd) {
  const root = await git(["rev-parse", "--show-toplevel"], cwd);
  return realpath(root);
}

export function taskBranch(id) { return `coco/task-${id}`; }

export async function createTaskWorktree({ agentDir, cwd, id }) {
  const repo = await repositoryRoot(cwd);
  const root = resolve(agentDir, "worktrees");
  const path = resolve(root, `${basename(repo)}-${id}`);
  if (!path.startsWith(`${root}${sep}`)) fail("WORKTREE_PATH_INVALID");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const branch = taskBranch(id);
  await git(["worktree", "add", "-b", branch, path, "HEAD"], repo);
  return { branch, path, repo };
}

export async function removeTaskWorktree({ cwd, path }) {
  const repo = await repositoryRoot(cwd);
  const status = await git(["-C", path, "status", "--porcelain"], repo);
  if (status !== "") fail("WORKTREE_DIRTY");
  await git(["worktree", "remove", path], repo);
}
