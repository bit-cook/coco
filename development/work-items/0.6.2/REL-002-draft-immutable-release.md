# REL-002: Draft-First Immutable Release

```text
Status: pending
Priority: P0
Target: 0.6.2
Owner: unassigned
Depends on: REL-001
Blocks: none
Last updated: 2026-08-16
```

## Problem

The workflow creates a public release before upload and lifecycle verification, then uses `--clobber`, allowing partial public releases and same-version asset replacement.

## Reproduction

Fail an upload or lifecycle check after `gh release create`; the public release already exists. Rerun with changed bytes; `--clobber` replaces assets.

## Required Invariants

- Failure cannot expose a public partial release.
- Existing version assets are immutable.
- Publication occurs only after remote asset and lifecycle verification.

## Scope

- `.github/workflows/release.yml`
- release lifecycle helper/tests

## Out of Scope

- GitHub organization policy outside this repository
- npm publication

## Design

Create an empty draft, reject pre-existing assets, upload without clobber, verify exact names/count/sizes/digests, execute online/offline/VSIX lifecycle checks, then publish once. Failed attempts remain draft or are safely removed if they were created by the current operation.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| upload failure | release remains non-public draft |
| asset verification failure | release remains non-public draft |
| lifecycle failure | release remains non-public draft |
| existing tag/release/assets | reject without replacing bytes |

## Acceptance Tests

- No `--clobber` in release workflow.
- Draft remains private through all verification steps.
- Exact nine-asset inventory is enforced for the current release contract.
- Publish step is last and runs once.

## Verification

Focused workflow contracts and a disposable-tag end-to-end dry run. Full release gate required.

## Rollback

Delete only an unpublished draft created by the current run; never delete or alter a published release.

## Evidence

Not implemented.
