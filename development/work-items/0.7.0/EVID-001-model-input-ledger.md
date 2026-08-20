# EVID-001: Model Input Ledger

```text
Status: in_progress
Priority: P1 research-derived
Target: 0.7.0
Owner: coordinator
Depends on: CFG-001, RUN-001, RUN-005
Blocks: EVID-002
Sources: DeepSeek Harness 99f6f02f
```

## Problem

CoCo does not yet prove that every byte visible to a model request is reconstructable from durable session/task evidence. Implicit runtime context can escape receipts and make replay, audit, and recovery disagree with actual execution.

## Reproduction

Inject model-visible context through an extension/runtime hook without a corresponding durable event, capture the actual request, then attempt reconstruction from persisted session evidence. The projections can differ without one central invariant failing.

## Required Invariants

- Every model-visible message, prompt section, tool schema, injected context, and provider generation is represented durably.
- The request projection is deterministic and byte-comparable after canonicalization.
- Secret redaction for UI does not alter private audit evidence.

## Scope

- session event/projection and request evidence
- provider generation reference
- runtime invariant/diagnostic tests

## Out of Scope

- Replacing Pi session architecture
- Importing Cordis or DeepSeek Harness session packages
- Public exposure of raw prompts or secrets

## Design

Define the exact final provider-request seam after context hooks, compatibility transforms, retries, reasoning/tool-choice normalization, provider generation binding, and header/parameter assembly. Derive one canonical private `ModelRequestProjection` from durable facts and compare it with the actual request at that seam.

## Acceptance Tests

- Byte-equivalent canonical request projection for normal, compacted, resumed, tool, goal, MCP, and extension-safe paths.
- Every omitted model-visible input produces a stable invariant error.
- Private evidence remains bounded and excluded from public DTOs.

## Verification

Focused session/provider tests, replay/fork tests, privacy contracts, complete core and package scanner.

## Rollback

Keep new events readable but disable enforcement behind a versioned private schema only if migration cannot complete; never silently discard evidence.

## Evidence

The private ledger and strict session-event projection are present with canonical, idempotent, generation-bound projections, digest conflict rejection, bounded size, provider lifecycle integration, serialized concurrent writes, contiguous event sequences, request isolation, and normal/compacted/resumed/tool projection tests. Real session context hook wiring remains. No external code copied.
