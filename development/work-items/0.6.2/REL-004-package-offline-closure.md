# REL-004: Package and Offline Closure Tightening

```text
Status: ready
Priority: P1
Target: 0.6.2
Owner: unassigned
Depends on: none
Blocks: none
Last updated: 2026-08-16
```

## Problem

Package metadata catches unrelated `ENOENT` as an optional lock, offline checksums do not enforce an exact member set, offline tar extraction lacks complete structural checks, and standalone npm tokens are not detected.

## Reproduction

- Remove an installed direct dependency manifest while retaining the lock; metadata may suppress the `ENOENT`.
- Remove a required line from offline `SHA256SUMS`; only listed entries are checked.
- Scan a standalone `npm_...` token without assignment or Bearer syntax.

## Required Invariants

- Lock and direct dependency manifests are mandatory and independently verified.
- Offline checksum inventory is exact and canonical.
- Archive structure is checked before extraction.
- High-confidence npm tokens reject without path allowlists.

## Scope

- `scripts/verify-package-closure.mjs`
- `offline-install.sh`
- `scripts/publication-secret-scanner.mjs`
- corresponding tests

## Out of Scope

- Release credential isolation
- Full Windows installer

## Design

Narrow error classification to the exact lock read; enforce direct package existence/version. Parse exact offline members before extraction. Reuse archive policy where feasible. Add bounded npm token detector and positive/negative corpus.

## Acceptance Tests

- Missing lock or any direct dependency rejects with a stable code.
- Empty, duplicate, missing, extra, absolute, or traversal checksum members reject.
- Unsafe package/Node archive members reject before extraction.
- Real npm token-shaped fixtures reject; placeholders pass.

## Verification

Closure, scanner, offline installer tests, shell syntax, package contract, and full scanner.

## Rollback

No state migration. Revert strict parsers and fixtures together.

## Evidence

Not implemented.
