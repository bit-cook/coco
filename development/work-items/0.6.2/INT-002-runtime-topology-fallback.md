# INT-002: Runtime Topology Fast/Full Fallback

```text
Status: completed
Priority: P0 release gate
Target: 0.6.2
Owner: unassigned
Depends on: PERF-001
Blocks: 0.6.2 integrity claim
```

## Problem

Existing topology tests do not directly prove that directory additions, removals, renames, unexpected files, or partial cache corruption leave fast mode and enter full verification or rejection.

## Reproduction

Warm the cache, mutate directory topology, and observe that existing tests do not assert the reported integrity mode.

## Required Invariants

- Any topology change invalidates fast mode.
- Unexpected governed content rejects after full verification.
- Source and CAS caches obey the same semantics.

## Scope

Observable integrity mode tests, source/CAS topology fixtures, cache schema corruption, and stable rejection codes.

## Out of Scope

Weaker metadata trust or ignoring empty directories.

## Design

Expose machine-readable fast/full mode in the fixture path and build deterministic source/CAS topology mutations. Assert fallback or rejection directly rather than inferring behavior from exit success.

## Acceptance Tests

Add empty directory, add unexpected file, remove, rename, inode replace, reorder/delete cache records, and directory-count mismatch across source and CAS.

## Verification

Focused topology suite and complete integrity.

## Rollback

Fall back to recursive topology enumeration if optimized validation cannot prove equivalence.

## Evidence

Implemented at `8cbcfc0`. Source and CAS tests directly observe fast/full mode for empty-directory add, unexpected file, remove, rename, inode replacement, cache-record deletion/rename and directory-count corruption. Unexpected content rejects and no topology mutation remains fast. Complete integrity passed 39/39.
