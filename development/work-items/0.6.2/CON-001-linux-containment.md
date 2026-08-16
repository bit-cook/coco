# CON-001: Linux Run Containment

```text
Status: pending
Priority: P0 decision
Target: 0.6.2 or immediate 0.6.3
Owner: unassigned
Depends on: RUN-001
Blocks: containment claim
Last updated: 2026-08-16
```

## Problem

POSIX process-group termination cannot contain detached, `setsid`, double-fork, or daemonized descendants. A cancelled task can continue operating outside its original group.

## Reproduction

Spawn a detached child from a task, unref it, then cancel or stop all. The supervisor group terminates while the detached child remains alive.

## Required Invariants

- Product claims match the actual platform guarantee.
- On supported containment platforms, cancellation succeeds only when the containment is empty.
- Containment identity is durable across runner restart.

## Scope

- Linux cgroup v2 feasibility and implementation
- containment state and task-process integration
- detached/setsid/double-fork fault tests
- documentation of platform guarantees

## Out of Scope

- Windows Job Object implementation unless separately approved
- General container sandboxing or network policy

## Design

Prefer one cgroup v2 per run, persist its identifier, attach supervisor before authorization, terminate with `cgroup.kill`, and verify no processes remain. If unprivileged cgroup delegation is unavailable, fail closed for isolation-required modes and document weaker host behavior.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| detached child | cgroup kill removes child |
| leader exits first | remaining cgroup members still terminate |
| runner crash | restarted runner resolves containment ID |
| cgroup unavailable | stable explicit unsupported result |

## Acceptance Tests

Detached child, `setsid`, double-fork, TERM-ignore/KILL, leader-dead, restart, and unsupported-host tests.

## Verification

Linux focused suite, real process tests, core, and platform documentation contracts.

## Rollback

Containment state must not strand live tasks. Define safe fallback and cleanup before implementation is accepted.

## Evidence

Decision and implementation not completed.
