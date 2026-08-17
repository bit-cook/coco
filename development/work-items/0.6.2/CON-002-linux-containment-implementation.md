# CON-002: Linux Run Containment Implementation

```text
Status: pending
Priority: P0 implementation
Target: 0.6.2 or immediate 0.6.3 per CON-001
Owner: unassigned
Depends on: RUN-001, CON-001
Blocks: containment release claim
Last updated: 2026-08-17
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

If approved by CON-001, create one cgroup per run, attach before authorization, persist its identifier, use `cgroup.kill`, and verify emptiness. If delegated cgroups are unavailable, return a stable unsupported result rather than overclaiming.

## Acceptance Tests

Detached child, `setsid`, double-fork, TERM-ignore/KILL, leader-dead, runner restart, and unsupported-host tests.

## Verification

Linux process tests, task core, integrity if governed runtime changes, lifecycle, and platform documentation contracts.

## Rollback

No live task may be stranded by a containment migration. Define cleanup and fallback before enabling production mode.

## Evidence

Not implemented.
