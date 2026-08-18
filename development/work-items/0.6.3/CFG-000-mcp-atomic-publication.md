# CFG-000: MCP Atomic Publication

```text
Status: ready
Priority: P1 recovery foundation
Target: 0.6.3
Owner: ai-agent-wave-a
Depends on: REC-001
Blocks: CFG-001
```

## Problem

MCP startup can register part of a tool set before a later schema, collision, or registration failure closes the client, leaving partial tools that reference a failed connection.

## Required Invariants

- Discover, normalize, validate, and collision-check a complete candidate before publishing any tool.
- Failure publishes nothing and retains the last-good set.
- Published tools reference one live client generation.

## Scope

MCP discovery, schema validation, name normalization, collision policy, atomic registration, teardown, and last-good startup state.

## Out of Scope

General live HMR, provider generation, or settings UI.

## Design

Prepare an immutable candidate tool generation, validate all entries, publish all-or-none, and dispose failed candidates. Persist only bounded non-secret generation metadata.

## Acceptance Tests

Pagination, duplicate name, invalid schema, partial registration, client close, restart, and last-good retention failures.

## Verification

MCP/config focused tests, privacy and scanner contracts, complete core.

## Rollback

Disable reload and retain the last known good startup generation.

## Evidence

Not implemented. No external code copied.
