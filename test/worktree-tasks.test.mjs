import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { createTaskWorktree, removeTaskWorktree, repositoryRoot, taskBranch } from "../scripts/worktree-tasks.mjs";

const exec = promisify(execFile);

test("task worktrees isolate a branch and refuse dirty removal", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-worktree-"));
  const repo = join(sandbox, "repo"); const agentDir = join(sandbox, "agent");
  try {
    await exec("git", ["init", repo]);
    await exec("git", ["-C", repo, "config", "user.email", "test@example.com"]);
    await exec("git", ["-C", repo, "config", "user.name", "CoCo Test"]);
    await writeFile(join(repo, "README.md"), "test\n");
    await exec("git", ["-C", repo, "add", "README.md"]); await exec("git", ["-C", repo, "commit", "-m", "initial"]);
    assert.equal(await repositoryRoot(repo), repo);
    const worktree = await createTaskWorktree({ agentDir, cwd: repo, id: "abcdefghijkl" });
    assert.equal(worktree.branch, taskBranch("abcdefghijkl"));
    await writeFile(join(worktree.path, "new.txt"), "dirty\n");
    await assert.rejects(removeTaskWorktree({ cwd: repo, path: worktree.path }), /WORKTREE_DIRTY/);
    await rm(join(worktree.path, "new.txt"));
    await removeTaskWorktree({ cwd: repo, path: worktree.path });
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});
