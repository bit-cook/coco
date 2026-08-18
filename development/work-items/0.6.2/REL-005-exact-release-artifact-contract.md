# REL-005: Exact Release Artifact Contract

```text
Status: completed
Priority: P0 release gate
Target: 0.6.2
Owner: unassigned
Depends on: REL-003, REL-004
Blocks: REL-001, REL-002
Last updated: 2026-08-18
```

## Problem

Release verification downloads expected files but does not prove that the remote release contains only the exact intended names, sizes, digests, tag target, and source commit.

## Reproduction

Add an extra remote asset while preserving the nine expected names; the current verification still succeeds.

## Required Invariants

- The artifact inventory is explicit, versioned, and contains exactly nine assets.
- Every asset name, size, SHA-256, version, and media role is bound to one source commit and tag.
- Extra, missing, duplicate-semantic, stale, or overwritten assets reject.

## Scope

Release artifact manifest, local/remote inventory validation, tag/commit binding, workflow contracts, and failure-injection tests.

## Out of Scope

Credential isolation and draft publication mechanics.

## Design

Build one canonical manifest from immutable local outputs. Validate it before upload, after draft upload through the GitHub API, and immediately before publication. Bind run ID, attempt, draft ID, tag, and commit.

## Acceptance Tests

Missing, extra, renamed, wrong-size, wrong-digest, wrong-tag, wrong-commit, stale-attempt, and concurrent-attempt cases reject.

## Verification

Workflow contracts, disposable draft dry run, online/offline/VSIX artifact checks, and package closure.

## Rollback

Delete only an unpublished draft owned by the same run/attempt; never replace published assets.

## Evidence

Implemented and dry-run verified in uncommitted candidate bytes. Exact nine-asset manifest, local/remote inventory contracts, tag/commit/digest binding, same-run rerun takeover, partial-upload recovery, published-release protection, immutable private-draft snapshot verification, and post-write inventory revalidation are covered by focused and live API evidence.
