# CFG-001: Provider and MCP Generations

```text
Status: in_progress
Priority: P1 research-derived
Target: 0.7.0
Owner: coordinator
Depends on: CFG-000, REL-004, RUN-001
Blocks: EVID-001
Sources: DeepSeek Harness 99f6f02f
```

## Problem

After CFG-000 provides all-or-none MCP publication, provider/config/MCP live reload still needs immutable generation binding so in-flight requests never observe mixed endpoint, credentials, settings, or tools.

## Reproduction

Change provider or MCP configuration while a request/discovery is active. Inject parse, pagination, schema, or connection failure and observe whether live consumers retain one complete generation.

## Required Invariants

- Every request records one immutable provider/config/credential generation ID.
- In-flight requests retain their generation.
- New generations publish atomically only after complete validation.
- Failed reload keeps the last-good provider and MCP tool set.
- Stale connections cannot publish into a newer generation.

## Scope

- provider composition and request binding
- MCP discovery/reload
- config revision CAS and last-good state
- diagnostics and tests

## Out of Scope

- Generic module HMR
- Plugin-owned settings UI
- Secret values in public state

## Design

Prepare immutable candidates, validate all components, compare revision at commit, atomically replace the generation, and dispose the predecessor after no in-flight consumer remains.

## Acceptance Tests

Concurrent config writes, invalid external edits, credential/endpoint swap during stream, MCP pagination/schema failure, stale connection publish, and rollback tests.

## Verification

Provider/MCP/config suites, privacy/secret scanner, complete core and package closure.

## Rollback

Retain last-good generation and allow explicit operator rollback by generation ID.

## Evidence

The initial runtime generation registry is present with revision-CAS publication, immutable in-flight leases, last-good retention, bounded history, rollback-by-source, stale-generation rejection, provider preflight binding, concurrent writer tests, and predecessor disposal after the last lease. Production provider/MCP composition remains for the next focused integration. No external code was copied.
