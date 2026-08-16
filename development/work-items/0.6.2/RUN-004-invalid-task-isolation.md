# RUN-004: Invalid Task and Provisioning Isolation

```text
Status: pending
Priority: P0
Target: 0.6.2
Owner: unassigned
Depends on: RUN-001
Blocks: none
Last updated: 2026-08-16
```

## Problem

Missing/non-directory cwd and non-Git worktree requests can throw before claim, terminate the global runner, leave the task queued, and starve every later task.

## Reproduction

Create the oldest queued worktree task with a nonexistent or non-Git cwd, then add a valid task. Restart runner repeatedly; the invalid task is selected first and the valid task never runs.

## Required Invariants

- Permanent input errors block or fail only their task.
- Recoverable provisioning errors use per-task backoff.
- The global queue continues after every single-task error.

## Scope

- task creation validation
- `scripts/task-runner.mjs`
- `scripts/worktree-tasks.mjs`
- task/provisioning tests

## Out of Scope

- Worktree retention and cleanup
- Filesystem sandboxing

## Design

Validate cwd/type/Git/base commit before queueing when possible. Classify permanent, retryable, and internal errors. Persist per-task outcome/backoff without crashing the runner loop.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| cwd missing | task blocked/failed; next task runs |
| non-Git cwd | task blocked/failed; next task runs |
| transient Git lock | backoff current task; queue remains live |
| unexpected provisioning error | observable task failure; runner survives |

## Acceptance Tests

Two-task poison tests for every permanent input error and transient retry tests with bounded attempts.

## Verification

Provisioning/task-control focused tests, typecheck, complete core.

## Rollback

New error fields must remain schema-valid and safely visible to older readers.

## Evidence

Not implemented.
