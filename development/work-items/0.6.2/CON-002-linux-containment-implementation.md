# CON-002: Linux Run Containment Implementation

```text
Status: completed
Priority: P0 implementation
Target: 0.6.2
Owner: unassigned
Depends on: RUN-001, RUN-002, CON-001
Blocks: containment release claim
Last updated: 2026-08-18
```

## Problem

POSIX process groups cannot contain `setsid`, double-fork, detached, or daemonized descendants.

## Reproduction

Spawn detached descendants, cancel the task, and prove whether descendants survive process-group termination.

## Required Invariants

- Product claims match the CON-001 policy decision.
- Supported containment is durable across runner restart.
- Termination succeeds only after the containment is empty.

## Scope

Linux cgroup v2 integration, persisted containment identity, runner recovery, kill and empty checks, and detached-process tests.

## Out of Scope

Windows Job Objects, macOS implementation, general sandboxing, and network policy.

## Design

Create one cgroup per run, attach before authorization, persist its identifier and owner generation, use `cgroup.kill`, and verify emptiness. If delegated cgroups are unavailable, return a stable degraded/unsupported result rather than overclaiming.

## Acceptance Tests

Detached child, `setsid`, double-fork, TERM-ignore/KILL, leader-dead, runner restart, and unsupported-host tests.

## Verification

Linux process tests, task core, integrity if governed runtime changes, lifecycle, and platform documentation contracts.

## Rollback

No live task may be stranded by a containment migration. Define cleanup and fallback before enabling production mode.

## Evidence

Implemented in uncommitted candidate bytes. Per-run cgroup descriptors, attach-before-authorization, cgroup.kill/empty checks, restart recovery, cleanup-pending retry, process-group degraded fallback, outcome handoff, and cancellation recovery are covered by focused tests. The real delegated-cgroup test now executes on this host and proves detached setsid and double-fork descendants are killed and the cgroup is empty before cleanup.
