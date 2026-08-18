import { lstat, mkdir, realpath } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

import { execCommand } from "../dist/core/exec.js";
import { StateError } from "./state-schema.mjs";

function fail(code) { throw new StateError(code); }
export function isUnrecoverableWorktreeError(error) { return ["GIT_WORKTREE_FAILED", "TASK_CWD_INVALID", "WORKTREE_CONFLICT", "WORKTREE_REPOSITORY_INVALID"].includes(error?.code); }
export function isRetryableWorktreeError(error) { return ["WORKTREE_GIT_LOCKED", "WORKTREE_GIT_RETRYABLE"].includes(error?.code); }
async function git(args, cwd) {
  let result; try { result = await execCommand("git", args, cwd, { timeout: 30000 }); } catch { fail("WORKTREE_GIT_RETRYABLE"); }
  if (result.code !== 0) fail(/(?:index\.lock|locked by another process|Unable to create .*\.lock)/i.test(result.stderr) ? "WORKTREE_GIT_LOCKED" : "WORKTREE_GIT_RETRYABLE");
  return result.stdout.trim();
}
async function gitOptional(args, cwd) {
  let result; try { result = await execCommand("git", args, cwd, { timeout: 30000 }); } catch { fail("WORKTREE_GIT_RETRYABLE"); }
  if (result.code === 0) return result.stdout.trim();
  if (/(?:unknown revision|Needed a single revision|not a valid object name|ambiguous argument)/i.test(result.stderr)) return null;
  fail(/(?:index\.lock|locked by another process|Unable to create .*\.lock)/i.test(result.stderr) ? "WORKTREE_GIT_LOCKED" : "WORKTREE_GIT_RETRYABLE");
}

export async function repositoryRoot(cwd) {
  let info; try { info = await lstat(cwd); } catch { fail("TASK_CWD_INVALID"); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("TASK_CWD_INVALID");
  let result; try { result = await execCommand("git", ["rev-parse", "--show-toplevel"], cwd, { timeout: 30000 }); }
  catch { fail("WORKTREE_GIT_RETRYABLE"); }
  if (result.code !== 0) fail(/(?:index\.lock|locked by another process|Unable to create .*\.lock)/i.test(result.stderr) ? "WORKTREE_GIT_LOCKED" : "WORKTREE_REPOSITORY_INVALID");
  return realpath(result.stdout.trim());
}

export function taskBranch(id) { return `coco/task-${id}`; }

export async function planTaskWorktree({ agentDir, cwd, id }) {
  const repo = await repositoryRoot(cwd);
  const root = resolve(agentDir, "worktrees");
  const path = resolve(root, `${basename(repo)}-${id}`);
  if (!path.startsWith(`${root}${sep}`)) fail("WORKTREE_PATH_INVALID");
  const branch = taskBranch(id);
  const baseCommit = await git(["rev-parse", "HEAD"], repo);
  return { branch, path, repo, baseCommit };
}

async function inspectWorktrees(repo) {
  const lines = (await git(["worktree", "list", "--porcelain"], repo)).split("\n");
  const entries = [];
  for (let index = 0; index < lines.length;) {
    if (!lines[index].startsWith("worktree ")) { index += 1; continue; }
    const entry = { path: lines[index].slice(9), branch: null, commit: null }; index += 1;
    while (index < lines.length && lines[index] !== "") { if (lines[index].startsWith("HEAD ")) entry.commit = lines[index].slice(5); if (lines[index].startsWith("branch ")) entry.branch = lines[index].slice(7).replace(/^refs\/heads\//, ""); index += 1; }
    entries.push(entry); index += 1;
  }
  return entries;
}

export async function ensureTaskWorktree({ agentDir, cwd, id, planned }) {
  const worktree = planned ?? await planTaskWorktree({ agentDir, cwd, id });
  const entries = await inspectWorktrees(worktree.repo);
  const atPath = entries.find((entry) => resolve(entry.path) === worktree.path);
  const atBranch = entries.find((entry) => entry.branch === worktree.branch);
  if (atPath || atBranch) {
    if (atPath?.path === worktree.path && atPath.branch === worktree.branch && atPath.commit === worktree.baseCommit && (!atBranch || atBranch.path === worktree.path)) return worktree;
    fail("WORKTREE_CONFLICT");
  }
  const branchCommit = await gitOptional(["rev-parse", worktree.branch], worktree.repo);
  if (branchCommit) {
    if (branchCommit !== worktree.baseCommit) fail("WORKTREE_CONFLICT");
    await mkdir(resolve(worktree.path, ".."), { recursive: true, mode: 0o700 });
    await git(["worktree", "add", worktree.path, worktree.branch], worktree.repo);
    return worktree;
  }
  await mkdir(resolve(worktree.path, ".."), { recursive: true, mode: 0o700 });
  await git(["worktree", "add", "-b", worktree.branch, worktree.path, worktree.baseCommit], worktree.repo);
  return worktree;
}

export async function createTaskWorktree(options) {
  return ensureTaskWorktree(options);
}

export async function removeTaskWorktree({ cwd, path }) {
  const repo = await repositoryRoot(cwd);
  const status = await git(["-C", path, "status", "--porcelain"], repo);
  if (status !== "") fail("WORKTREE_DIRTY");
  await git(["worktree", "remove", path], repo);
}
