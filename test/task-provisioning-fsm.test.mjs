import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { cancelTask, createTaskRunner } from "../scripts/task-runner.mjs";
import { createTaskStore, selectRunnableTask } from "../scripts/task-state.mjs";
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

for (const code of ["WORKTREE_GIT_LOCKED", "WORKTREE_GIT_RETRYABLE"]) test(`${code} retries with backoff and succeeds after recovery`, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-retry-"));
  try {
    const repo = await repository(sandbox), agentDir = join(sandbox, "agent"), store = createTaskStore({ agentDir }); await store.create({ cwd: repo, prompt: "retry", worktree: true }); let calls = 0;
    const operations = { repositoryRoot: async () => repo, plan: async () => { calls += 1; if (calls === 1) { const error = new Error(code); error.code = code; throw error; } return planTaskWorktree({ agentDir, cwd: repo, id: (await store.load()).tasks[0].id }); } };
    const runner = createTaskRunner({ agentDir, root, spawnTask: async () => ({ code: 0, output: "" }), worktreeOperations: operations });
    await runner.run({ once: true }); let task = (await store.load()).tasks[0]; assert.equal(task.status, "queued"); assert.equal(task.lastError, code); assert.equal(selectRunnableTask(await store.load()), null);
    await store.update((state) => { state.tasks[0].updatedAt = new Date(Date.now() - 2000).toISOString(); return state; }); await runner.run({ once: true }); task = (await store.load()).tasks[0]; assert.equal(task.status, "completed"); assert.equal(calls, 2);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test("fifth transient provisioning failure becomes observable exhaustion", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-exhausted-"));
  try {
    const repo = await repository(sandbox), agentDir = join(sandbox, "agent"), store = createTaskStore({ agentDir }); await store.create({ cwd: repo, prompt: "exhaust", worktree: true });
    const runner = createTaskRunner({ agentDir, root, worktreeOperations: { repositoryRoot: async () => repo, plan: async () => { const error = new Error("retry"); error.code = "WORKTREE_GIT_RETRYABLE"; throw error; } } });
    for (let attempt = 0; attempt < 5; attempt += 1) { await runner.run({ once: true }); if (attempt < 4) await store.update((state) => { state.tasks[0].updatedAt = new Date(Date.now() - 2000).toISOString(); return state; }); }
    const task = (await store.load()).tasks[0]; assert.equal(task.status, "blocked"); assert.equal(task.lastError, "WORKTREE_RETRY_EXHAUSTED"); assert.equal(task.attempts, 5);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test("unexpected provisioning failure blocks only its task", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-unexpected-"));
  try {
    const repo = await repository(sandbox), agentDir = join(sandbox, "agent"), store = createTaskStore({ agentDir }); const poisoned = await store.create({ cwd: repo, prompt: "unexpected", worktree: true }); const following = await store.create({ cwd: repo, prompt: "following", worktree: false });
    const executed = []; await createTaskRunner({ agentDir, root, spawnTask: async (task) => { executed.push(task.id); return { code: 0, output: "" }; }, worktreeOperations: { repositoryRoot: async () => { throw new Error("unexpected"); } } }).run({ once: true });
    const state = await store.load(); assert.equal(state.tasks.find(({ id }) => id === poisoned.id).lastError, "TASK_PROVISIONING_FAILED"); assert.equal(state.tasks.find(({ id }) => id === following.id).status, "completed"); assert.deepEqual(executed, [following.id]);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

for (const controlCode of ["RUNNER_STOPPING", "STATE_LOCKED"]) test(`${controlCode} after durable provisioning preserves work for restart`, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provisioning-stopping-"));
  try {
    const repo = await repository(sandbox), agentDir = join(sandbox, "agent"), store = createTaskStore({ agentDir }); const task = await store.create({ cwd: repo, prompt: "stopping", worktree: true });
    const operations = { repositoryRoot: async () => repo, plan: async () => planTaskWorktree({ agentDir, cwd: repo, id: task.id }), ensure: async () => { const error = new Error(controlCode); error.code = controlCode; throw error; } };
    await assert.rejects(createTaskRunner({ agentDir, root, worktreeOperations: operations }).run({ once: true }), (error) => error.code === controlCode);
    let current = (await store.load()).tasks[0]; assert.equal(current.status, "provisioning"); assert.ok(current.provisioning);
    await createTaskRunner({ agentDir, root, spawnTask: async () => ({ code: 0, output: "" }) }).run({ once: true }); current = (await store.load()).tasks[0]; assert.equal(current.status, "completed");
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

for (const fixture of ["missing", "non-git"]) test(`${fixture} cwd blocks only its task and the queue continues`, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), `coco-provisioning-${fixture}-`));
  try {
    const repo = await repository(sandbox), agentDir = join(sandbox, "agent"), invalid = fixture === "missing" ? join(sandbox, "absent") : join(sandbox, "plain");
    if (fixture === "non-git") await import("node:fs/promises").then(async ({ mkdir, writeFile: write }) => { await mkdir(invalid); await write(join(invalid, ".git"), "gitdir: /nonexistent-coco-test-repository\n"); });
    const store = createTaskStore({ agentDir });
    const poisoned = await store.create({ cwd: invalid, prompt: fixture, worktree: true });
    const following = await store.create({ cwd: repo, prompt: "following", worktree: false });
    const executed = [];
    await createTaskRunner({ agentDir, root, spawnTask: async (task) => { executed.push(task.id); return { code: 0, output: "" }; } }).run({ once: true });
    const state = await store.load(), blocked = state.tasks.find(({ id }) => id === poisoned.id);
    assert.equal(blocked.status, "blocked"); assert.equal(blocked.lastError, fixture === "missing" ? "TASK_CWD_INVALID" : "WORKTREE_REPOSITORY_INVALID");
    assert.equal(state.tasks.find(({ id }) => id === following.id).status, "completed"); assert.deepEqual(executed, [following.id]);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

for (const fixture of ["file", "symlink"]) test(`${fixture} cwd is rejected without poisoning the queue`, async () => {
  const sandbox = await mkdtemp(join(tmpdir(), `coco-provisioning-${fixture}-`));
  try {
    const repo = await repository(sandbox), invalid = join(sandbox, fixture), agentDir = join(sandbox, "agent");
    if (fixture === "file") await writeFile(invalid, "not a directory\n"); else await symlink(repo, invalid);
    const store = createTaskStore({ agentDir }); const poisoned = await store.create({ cwd: invalid, prompt: fixture, worktree: true }); const following = await store.create({ cwd: repo, prompt: "following", worktree: false });
    const executed = []; await createTaskRunner({ agentDir, root, spawnTask: async (task) => { executed.push(task.id); return { code: 0, output: "" }; } }).run({ once: true });
    const state = await store.load(); assert.equal(state.tasks.find(({ id }) => id === poisoned.id).lastError, "TASK_CWD_INVALID"); assert.equal(state.tasks.find(({ id }) => id === following.id).status, "completed"); assert.deepEqual(executed, [following.id]);
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});
