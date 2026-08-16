# RUN-002: Strict Stop-Barrier Ownership

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

Stopping state writes `ownerPid` and `ownerIdentity` but liveness checks read `pid` and `processIdentity`. Concurrent stop calls can replace a live owner's barrier, and non-owners can clear it.

## Reproduction

Run two `stopRunner()` calls concurrently. The second treats the first live barrier as stale because it reads nonexistent field names.

## Required Invariants

- Exactly one live stop operation owns the barrier.
- Only matching `operationId` and owner identity may update or clear it.
- Start, claim, and task creation observe the barrier consistently.

## Scope

- `scripts/task-runner.mjs`
- stop/start/cancel race tests

## Out of Scope

- General supervisor FSM beyond its dependency contract
- cgroup containment

## Design

Define and validate one canonical schema. Use transactional compare-and-delete by `operationId`, `ownerPid`, and `ownerIdentity`. Stale takeover records predecessor evidence.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| concurrent stop | one owner; loser receives `RUNNER_STOPPING` |
| owner dies | verified takeover |
| old owner clears after takeover | clear rejects/no-op |
| start races stop | start remains blocked until owner clears |

## Acceptance Tests

Concurrent stop, stale takeover, old-owner clear, stop/start, stop/create, and stop/claim interleavings.

## Verification

Focused stop tests, task-control suite, typecheck, complete core.

## Rollback

Reader must safely recognize or reject legacy barrier schema; no blind deletion.

## Evidence

Not implemented.
