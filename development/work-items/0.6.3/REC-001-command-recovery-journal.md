# REC-001: Command Recovery Journal

```text
Status: ready
Priority: P1 research-derived
Target: 0.6.3
Owner: ai-agent-wave-a
Depends on: RUN-001, RUN-003
Blocks: EVID-002
Sources: Prime Agent 849c9211
```

## Problem

Supervisor launch recovery does not by itself make provider, Bash, MCP, and Control mutations idempotent. A command can execute and the caller can disconnect before receiving a durable result.

## Required Invariants

- Command receipt is durable before the external effect.
- Result is durable before response publication.
- Repeated command IDs return the recorded result.
- Unknown side effects are `uncertain` and never blindly replayed.

## Scope

Control mutations, provider/config writes, task dispatch commands, Bash/MCP effect intents, and command recovery journal.

## Out of Scope

Distributed exactly-once effects, external services without idempotency, and automatic replay of non-idempotent commands.

## Design

Use a private journal keyed by command ID, operation ID, request digest, and effect generation. Persist `received`, `executing`, `result`, or `uncertain`. Bind recovery to task receipt and supervisor identity.

## Acceptance Tests

Crash before effect, during effect, after effect before response, duplicate command ID, request digest mismatch, and restart recovery tests for each effect class.

## Verification

Control/task/provider/MCP fault suites, privacy contracts, complete core and package closure.

## Rollback

Unknown records remain uncertain; downgrade must never turn them into retryable work.

## Evidence

Not implemented. Research-derived from Prime Agent command recovery journal; no external code copied.
