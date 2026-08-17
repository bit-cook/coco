# CON-001: Linux Containment Policy Decision

```text
Status: pending
Priority: P0 decision
Target: 0.6.2 or immediate 0.6.3
Owner: unassigned
Depends on: none
Blocks: CON-002 and the 0.6.2 containment claim
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

- Linux cgroup v2 feasibility and policy decision
- documented platform guarantee and release placement
- acceptance design for detached/setsid/double-fork tests

## Out of Scope

- Windows Job Object implementation unless separately approved
- General container sandboxing or network policy

## Design

Decide whether Linux cgroup v2 is required for 0.6.2 or immediately after it. The decision must explicitly state what cancellation can and cannot guarantee on hosts without delegated cgroups. Implementation belongs to CON-002.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| detached child | cgroup kill removes child |
| leader exits first | remaining cgroup members still terminate |
| runner crash | restarted runner resolves containment ID |
| cgroup unavailable | stable explicit unsupported result |

## Acceptance Tests

Policy matrix and feasibility probe covering detached child, `setsid`, double-fork, TERM-ignore/KILL, leader-dead, restart, and unsupported-host behavior.

## Verification

Feasibility probe, platform policy contract, and plan/documentation consistency. No implementation is claimed by this item.

## Rollback

Containment state must not strand live tasks. Define safe fallback and cleanup before implementation is accepted.

## Evidence

Decision not completed; implementation is explicitly assigned to CON-002.
