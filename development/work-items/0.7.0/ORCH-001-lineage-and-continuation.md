# ORCH-001: Authoritative Lineage and Continuation

```text
Status: in_progress
Priority: P1 prototype
Target: 0.7.0
Owner: coordinator
Depends on: RUN-001, RUN-002, RUN-003, CON-002, REC-001, EVID-002
Blocks: none
Sources: Prime Agent 849c9211
```

## Problem

CoCo has goal, loop, task, schedule, webhook, and experimental subagent concepts, but no single durable inbox/continuation policy or authoritative parent-child lineage ledger. Adding external agents without these primitives would create competing execution paths.

## Reproduction

Combine a running goal, scheduled continuation, user follow-up, and child work. Observe that priority, admission boundary, lineage, and completion evidence are not expressed by one state machine.

## Required Invariants

- User follow-up priority and tool-boundary steering are deterministic.
- Continuation obeys bounded turns, tokens, time, cost, and explicit quality gates.
- Parent/child topology is durable supervisor-owned state, not inferred from transcript text.
- Child execution uses the same authorization, outcome, containment, logs, and receipts as root tasks.
- Global-only resource policy remains enforced.

## Scope

- durable inbox categories and admission rules
- continuation policy
- parent/child lineage ledger
- child budget aggregation and diagnostics

## Out of Scope

- Persistent Python kernels
- Project-local agents or skills
- Model-written global harness state
- Uncontained daemon children

## Design

Implement as staged sub-items rather than one simultaneous launch: durable inbox and priority rules; supervisor-owned lineage ledger; bounded continuation policy; only then child spawning with shared authorization, containment, effect evidence, and aggregate budgets.

## Acceptance Tests

Priority/race matrix, restart replay, duplicate child spawn, stale worker fencing, aggregate budget exhaustion, lineage corruption, and no-clobber tests.

## Verification

Task/supervisor/goal/loop tests, containment tests, complete core and integrity if runtime closure changes.

## Rollback

Disable child spawning while retaining readable lineage/inbox history; never infer missing authority from transcripts.

## Evidence

Staged foundations and service facade are present: durable inbox, bounded continuation policy, supervisor-owned lineage ledger, one orchestration API, and authenticated Control status/inbox/pop/child-transition routes. Production runner/Control task selection, child spawning, and child budget aggregation remain. No external code copied.
