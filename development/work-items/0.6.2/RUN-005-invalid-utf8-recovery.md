# RUN-005: Invalid UTF-8 Terminal Recovery

```text
Status: completed
Priority: P0
Target: 0.6.2
Owner: unassigned
Depends on: RUN-001 shared terminal recovery schema
Blocks: none
Last updated: 2026-08-18
```

## Problem

Supervisor output captures arbitrary bytes, but terminal materialization uses fatal UTF-8 decoding. One invalid byte can make a successful run fail recovery on every restart.

## Reproduction

Write `Buffer.from([0xff])` to stdout and exit zero. Outcome persists, then output import throws `TASK_LOG_IMPORT_INVALID`; restart repeats the same failure.

## Required Invariants

- Arbitrary child bytes cannot permanently block terminal evidence.
- Text output remains valid UTF-8 across chunk boundaries.
- Encoding loss is observable and bounded.
- A successful child is not silently re-executed.

## Scope

- supervisor capture/materialization
- runner terminal outcome import
- task log/receipt schema only if an encoding-loss field is required
- focused tests

## Out of Scope

- General log retention
- Binary artifact download API

## Design

Use streaming decoder semantics or deterministic U+FFFD replacement. Record `encodingLoss` or equivalent evidence. Preserve bounded raw private capture only if needed for diagnosis.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| invalid byte in one chunk | replacement and terminal completion |
| split multi-byte sequence | correct reconstruction |
| invalid persisted outcome on restart | idempotent completion, no rerun |
| output at byte cap | truncation and encoding flags agree |

## Acceptance Tests

Invalid single byte, split sequence, mixed streams, restart recovery, cap boundary, and receipt validation tests.

## Verification

Supervisor/log/receipt focused suite, typecheck, complete core.

## Rollback

Schema addition must be optional for legacy records and strict for new evidence.

## Evidence

Implemented in uncommitted candidate bytes. Supervisor raw output is decoded with deterministic U+FFFD replacement, valid split UTF-8 remains intact, and final JSONL materialization truncates at its encoded evidence budget rather than failing recovery. `encodingLoss` is persisted independently from `logsTruncated`, legacy records default it to false, DTOs expose it, and durable outcome/terminal evidence recovery does not re-execute the task. Focused log/receipt/runner/DTO tests pass 65/65, including replacement expansion at the raw output cap.
