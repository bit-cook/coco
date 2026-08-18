# RUN-003: Durable Webhook Dispatch Outbox

```text
Status: completed
Priority: P0
Target: 0.6.2
Owner: unassigned
Depends on: none for RUN-003A ledger; RUN-001 and RUN-002 for RUN-003B dispatch consumer
Blocks: none
Last updated: 2026-08-18
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

Split implementation into RUN-003A and RUN-003B. RUN-003A persists delivery, task, and dispatch intent atomically. RUN-003B clears only after a matching runner generation acknowledges scanning or claiming that intent; observing any runner owner is insufficient. Duplicate and Control restart paths recover pending intents.

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

RUN-003A and RUN-003B are implemented in uncommitted candidate bytes. Delivery, queued task, and intent commit atomically; legacy queued deliveries recover one latest intent per task; runner claim/ack is owner-generation CAS-bound after durable task claim and supervisor preparation; Control retries from durable task/dispatch anchors for its lifetime; queued cancellation and attempt-limit disposition update task and ledger atomically. Focused integration is 92/92, complete core is 559 passed with one delegated-cgroup capability skip, integrity is 39/39, package is 2/2, closure is 175 approved, scanner is clean, and runtime probe approves 20,677 entries.
