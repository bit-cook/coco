import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { cancelTask, createTaskRunner } from "../scripts/task-runner.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";
import { ensureTaskWorktree, planTaskWorktree } from "../scripts/worktree-tasks.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

async function repository(sandbox) {
  const repo = join(sandbox, "repo");
  await exec("git", ["init", repo]);
  await exec("git", ["-C", repo, "config", "user.email", "test@example.com"]);
  await exec("git", ["-C", repo, "config", "user.name", "CoCo Test"]);
  await writeFile(join(repo, "README.md"), "test\n");
  await exec("git", ["-C", repo, "add", "README.md"]);
  await exec("git", ["-C", repo, "commit", "-m", "initial"]);
  return repo;
}

test("provisioning intent is durable before git and ensure is idempotent", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-fsm-"));
  try {
    const repo = await repository(sandbox);
    const agentDir = join(sandbox, "agent");
    const planned = await planTaskWorktree({ agentDir, cwd: repo, id: "abcdefghijkl" });
    const first = await ensureTaskWorktree({ agentDir, cwd: repo, id: "abcdefghijkl", planned });
    const second = await ensureTaskWorktree({ agentDir, cwd: repo, id: "abcdefghijkl", planned });
    assert.deepEqual(second, first);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test("worktree path or branch conflicts fail closed", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-conflict-"));
  try {
    const repo = await repository(sandbox);
    const agentDir = join(sandbox, "agent");
    const planned = await planTaskWorktree({ agentDir, cwd: repo, id: "abcdefghijkl" });
    const conflictingPath = join(sandbox, "other-worktree");
    await exec("git", ["-C", repo, "worktree", "add", "-b", planned.branch, conflictingPath, planned.baseCommit]);
    await assert.rejects(ensureTaskWorktree({ agentDir, cwd: repo, id: "abcdefghijkl", planned }), /WORKTREE_CONFLICT/);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test("branch-only provisioning residue is resumed idempotently", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-branch-residue-"));
  try {
    const repo = await repository(sandbox), agentDir = join(sandbox, "agent"), planned = await planTaskWorktree({ agentDir, cwd: repo, id: "abcdefghijkl" });
    await exec("git", ["-C", repo, "branch", planned.branch, planned.baseCommit]);
    const restored = await ensureTaskWorktree({ agentDir, cwd: repo, id: "abcdefghijkl", planned });
    assert.equal(restored.branch, planned.branch); assert.match((await exec("git", ["-C", repo, "worktree", "list"])).stdout, /repo-abcdefghijkl.*\[coco\/task-abcdefghijkl\]/s);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test("cancelling provisioning clears intent without executing", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-cancel-"));
  try {
    const repo = await repository(sandbox);
    const store = createTaskStore({ agentDir: join(sandbox, "agent") });
    const task = await store.create({ cwd: repo, prompt: "cancel", worktree: true });
    await store.update((state) => {
      const target = state.tasks[0];
      target.status = "provisioning";
      target.provisioning = { baseCommit: "a".repeat(40), branch: "coco/task-abcdefghijkl", worktreePath: join(sandbox, "agent", "worktrees", "repo-abcdefghijkl") };
      target.baseCommit = target.provisioning.baseCommit; target.branch = target.provisioning.branch; target.worktreePath = target.provisioning.worktreePath;
      return state;
    });
    const cancelled = await cancelTask(store, task.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.provisioning, null);
    assert.equal((await exec("git", ["-C", repo, "worktree", "list"])).stdout.trim().split("\n").length, 1);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test("runner resumes provisioning intent and only then starts the run", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-restart-"));
  try {
    const repo = await repository(sandbox);
    const agentDir = join(sandbox, "agent");
    const store = createTaskStore({ agentDir });
    const task = await store.create({ cwd: repo, prompt: "resume", worktree: true });
    const planned = await planTaskWorktree({ agentDir, cwd: repo, id: task.id });
    await store.update((state) => { const target = state.tasks[0]; target.status = "provisioning"; target.baseCommit = planned.baseCommit; target.branch = planned.branch; target.worktreePath = planned.path; target.provisioning = { baseCommit: planned.baseCommit, branch: planned.branch, worktreePath: planned.path }; return state; });
    let observed;
    await createTaskRunner({ agentDir, root, spawnTask: async (current) => { observed = (await store.load()).tasks[0]; assert.equal(observed.status, "running"); assert.equal(observed.provisioning, null); return { code: 0, output: "" }; } }).run({ once: true });
    assert.equal(observed.worktreePath, planned.path);
    assert.equal((await store.load()).tasks[0].status, "completed");
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test("a conflicting worktree blocks its task without poisoning the following queue", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-runner-conflict-"));
  try {
    const repo = await repository(sandbox);
    const agentDir = join(sandbox, "agent");
    const store = createTaskStore({ agentDir });
    const conflicting = await store.create({ cwd: repo, prompt: "conflict", worktree: true });
    const following = await store.create({ cwd: repo, prompt: "following", worktree: false });
    const planned = await planTaskWorktree({ agentDir, cwd: repo, id: conflicting.id });
    await exec("git", ["-C", repo, "worktree", "add", "-b", planned.branch, join(sandbox, "conflicting-worktree"), planned.baseCommit]);
    await store.update((state) => {
      const target = state.tasks.find(({ id }) => id === conflicting.id);
      target.status = "provisioning"; target.baseCommit = planned.baseCommit; target.branch = planned.branch; target.worktreePath = planned.path;
      target.provisioning = { baseCommit: planned.baseCommit, branch: planned.branch, worktreePath: planned.path };
      return state;
    });
    const executed = [];
    await createTaskRunner({ agentDir, root, spawnTask: async (task) => { executed.push(task.id); return { code: 0, output: "" }; } }).run({ once: true });
    const state = await store.load();
    const blocked = state.tasks.find(({ id }) => id === conflicting.id);
    assert.equal(blocked.status, "blocked"); assert.equal(blocked.lastError, "WORKTREE_CONFLICT"); assert.equal(blocked.provisioning, null); assert.equal(blocked.attempts, 0);
    assert.equal(state.tasks.find(({ id }) => id === following.id).status, "completed");
    assert.deepEqual(executed, [following.id]);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});
