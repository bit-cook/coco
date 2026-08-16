# ADR-002: At-Most-Once Automatic Task Supervision

```text
Status: accepted; launch FSM extension planned in RUN-001
Date: 2026-08-16
```

## Context

Background tasks modify user workspaces. Repeating an authorized run after losing its result can duplicate destructive effects.

## Decision

Persist supervisor specification, registration, authorization, outcome, and revocation. Once authorized, a dead run with no durable outcome becomes `EXECUTION_OUTCOME_IN_DOUBT` and is never automatically repeated. Terminal evidence is persisted before receipt or event publication and permanently prevents re-execution.

Unauthorized prepared or registered runs may be abandoned and retried only after deterministic recovery proves they were never authorized. RUN-001 will make those launch phases explicit.

## Security Consequences

- Prompt content is not placed in argv.
- Authorization identity binds execution.
- Outcome/revocation arbitration is durable.
- Availability is intentionally sacrificed when execution outcome is unknowable.

## Operational Consequences

Operators need an explicit resolution path for outcome-in-doubt tasks. Recovery tests must cover every launch transition.

## Alternatives Rejected

- Blind retry after parent or supervisor death.
- Exactly-once claims without a transactional external effect boundary.

## Tests

Supervisor authorization/outcome, cancellation arbitration, restart recovery, receipt failure, and planned launch-FSM SIGKILL matrix.
