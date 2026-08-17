# REL-003: Bind Offline and Public Tarballs

```text
Status: ready
Priority: P0
Target: 0.6.2
Owner: unassigned
Depends on: REL-004
Blocks: REL-005, REL-002
Last updated: 2026-08-16
```

## Problem

`buildOfflineBundle()` performs a second independent `npm pack`, so the offline ZIP package is not digest-bound to the already verified public tarball.

## Reproduction

Generate the public tarball, change or make a package input nondeterministic before offline build, and compare the two tarball digests. No equality gate exists.

## Required Invariants

- One npm tarball is built and package-closure verified.
- Offline bundle consumes that exact private snapshot.
- Public and offline package digests are identical.

## Scope

- `scripts/build-offline-bundle.mjs`
- `.github/workflows/release.yml` integration points
- offline bundle and release contract tests

## Out of Scope

- Node runtime signing
- Offline installer extraction policy, owned by REL-004

## Design

Require explicit `packageArchive` and `packageSha256` inputs. Reject missing, symlinked, replaced, mismatched, or noncanonical input. Copy from one private snapshot into the ZIP.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| package replaced after digest | private snapshot or identity check rejects |
| wrong expected digest | build fails closed |
| second npm pack attempted | contract test fails |

## Acceptance Tests

- ZIP `coco-package.tgz` SHA-256 equals public tarball SHA-256.
- Race replacement and symlink inputs reject.
- Builder cannot run without explicit archive and digest.

## Verification

Offline bundle tests, package closure, real bundle scan, release contracts, and `git diff --check`.

## Rollback

No persisted state; revert builder API and workflow caller together.

## Evidence

Not implemented.
