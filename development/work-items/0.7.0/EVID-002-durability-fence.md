# EVID-002: Durability Fence Before External Effects

```text
Status: pending
Priority: P1 research-derived
Target: 0.7.0
Owner: unassigned
Depends on: EVID-001, RUN-001
Blocks: TOOL-001
Sources: DeepSeek Harness 99f6f02f; Prime Agent 849c9211
```

## Problem

CoCo has strong task terminal evidence, but model requests, Bash, MCP, and future adapter effects do not share one explicit pre-effect durability rule. A persistence failure can leave an external side effect without a reconstructable intent.

## Reproduction

Inject storage failure immediately before an external call after in-memory admission. Observe whether the provider/tool can start without a durable intent and correlation ID.

## Required Invariants

- External effects start only after intent and correlation identity are durable.
- Persistence failure produces zero external calls.
- Unknown result is explicit and never automatically replayed.

## Scope

- model/provider call intent
- Bash/MCP/tool call intent
- command idempotency and uncertain result
- task/session evidence correlation

## Out of Scope

- Distributed exactly-once claims
- Automatic replay of non-idempotent operations

## Design

Persist a canonical effect intent, flush/commit it, execute, then persist result before response. Duplicate IDs return the durable result. A crash after execution but before result becomes `uncertain` unless the adapter provides a verified idempotency protocol.

## Fault Matrix

| Crash point | Required state |
|---|---|
| before intent flush | no external call |
| after intent, before call | safe pending/recovery decision |
| during call | uncertain unless adapter proves result |
| after result, before response | return cached durable result |

## Acceptance Tests

One fault test per phase for provider, Bash, MCP, and control mutation. Verify external call counts and no blind replay.

## Verification

Focused fault matrix, task/session receipts, complete core and integrity if runtime code changes.

## Rollback

Version intents and retain safe reading of existing records; never downgrade uncertain operations to retryable.

## Evidence

Research only. Inspired by DeepSeek Harness session checkpoint policy and Prime Agent command recovery journal. No external code copied.
