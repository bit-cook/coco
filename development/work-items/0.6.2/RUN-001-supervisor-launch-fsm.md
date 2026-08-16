# RUN-001: Durable Supervisor Launch FSM

```text
Status: ready
Priority: P0
Target: 0.6.2
Owner: unassigned
Depends on: none
Blocks: RUN-002, RUN-004, CON-001
Last updated: 2026-08-16
```

## Problem

A crash after supervisor `spec.json` preparation but before registration or authorization leaves a task permanently `running` with no live process and no recovery transition.

## Reproduction

1. Claim a task.
2. Wait for `spec.json`.
3. Kill runner before registration.
4. Restart runner.
5. Observe permanent `running` with no execution or outcome.

## Required Invariants

- Unauthorized dead runs eventually become abandoned and may retry with a new run ID.
- Authorized dead/no-outcome runs remain `EXECUTION_OUTCOME_IN_DOUBT` and never retry automatically.
- No crash phase leaves permanent ambiguous `running` state.
- Terminal evidence still prevents re-execution.

## Scope

- `scripts/task-runner.mjs`
- `scripts/task-run-supervisor.mjs`
- `scripts/task-run-supervisor-main.mjs`
- `scripts/task-state.mjs` if schema changes are required
- focused supervisor/recovery tests

## Out of Scope

- Process containment implementation
- Stop barrier ownership
- Dashboard

## Design

Persist `prepared`, `registered`, `authorized`, `outcome`, `revoked`, and `abandoned` transitions with phase identity and lease timestamps. Recovery decisions are transactional and idempotent.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| after prepare | abandon and requeue with new run ID |
| after process spawn, before registration | detect dead/unregistered lease and abandon |
| after registration, before authorization | revoke/terminate then abandon and requeue |
| after authorization, before outcome | outcome in doubt, no retry |
| after outcome | consume outcome, never re-execute |

## Acceptance Tests

One SIGKILL fault test per transition, repeated restart tests, concurrent registration tests, and zero duplicate child executions.

## Verification

Supervisor/recovery focused suite, task core suite, typecheck, and complete core before integration.

## Rollback

Persisted schema migration must retain safe interpretation of partial new states. Document downgrade behavior before completion.

## Evidence

Not implemented.
