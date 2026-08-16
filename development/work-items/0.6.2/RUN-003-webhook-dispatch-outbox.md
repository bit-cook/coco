# RUN-003: Durable Webhook Dispatch Outbox

```text
Status: ready
Priority: P0
Target: 0.6.2
Owner: unassigned
Depends on: none
Blocks: none
Last updated: 2026-08-16
```

## Problem

Webhook delivery and task queueing commit before detached runner startup. If startup fails, the delivery key is consumed; duplicate retry does not dispatch the queued task.

## Reproduction

Hold the runner stopping barrier, send a valid delivery, clear the barrier, then resend the same key. The second request is duplicate and runner startup is not retried.

## Required Invariants

- Accepted delivery, queued task, and dispatch intent are durable together.
- Duplicate delivery can idempotently recover a pending dispatch.
- A delivery never causes more than one task trigger.

## Scope

- `scripts/control-service.mjs`
- `scripts/webhook-deliveries.mjs`
- `scripts/task-state.mjs` if dispatch state belongs there
- webhook/control tests

## Out of Scope

- Supervisor launch phases
- Generic task retention

## Design

Persist `dispatchPending` in the same transaction as acceptance. Clear only after runner ownership is observed. Duplicate path retries startup when the matching task remains queued/pending.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| after ledger/task commit | duplicate or recovery loop dispatches |
| runner stopping | pending remains durable |
| control restart | pending dispatch is retried |
| concurrent duplicates | one trigger and one dispatch intent |

## Acceptance Tests

Runner stopping, startup failure, control crash, transaction crash, and 20-way duplicate concurrency tests.

## Verification

Webhook/control focused suite, typecheck, complete core.

## Rollback

Legacy deliveries without dispatch state remain readable; migration must not retrigger completed tasks.

## Evidence

Not implemented.
