# REL-001: Release Permission Isolation

```text
Status: ready
Priority: P0
Target: 0.6.2
Owner: unassigned
Depends on: REL-005
Blocks: REL-002
Last updated: 2026-08-16
```

## Problem

The release job holds `contents: write` while checkout credentials, dependency installation, repository scripts, build, and tests are active. Compromised executed code could mutate repository or release state.

## Reproduction

Inspect `.github/workflows/release.yml`: one write-enabled job checks out the repository and runs `npm ci` before publication.

## Required Invariants

- Build and test code cannot read a repository write credential.
- Published bytes come from one verified build artifact.
- The publish job executes no dependency or repository code.

## Scope

- `.github/workflows/release.yml`
- release workflow contract tests
- minimal artifact inventory helper if required

## Out of Scope

- Draft lifecycle and immutability policy, owned by REL-002
- Offline package construction, owned by REL-003
- npm publication

## Design

Implement four stages: read-only build/verify, minimal-write draft creation/upload, read-only draft download/lifecycle verification, and minimal-write publish. Set checkout `persist-credentials: false`. Neither write stage may checkout, install dependencies, run repository code, or execute downloaded assets.

## Fault Matrix

| Fault point | Required recovery |
|---|---|
| build/test failure | no publish job and no release mutation |
| artifact digest mismatch | publish rejects before release creation |
| missing artifact member | publish rejects before release creation |

## Acceptance Tests

- Workflow contract proves build job has only `contents: read`.
- Workflow contract proves checkout credentials are not persisted.
- Workflow contract proves both write jobs have no checkout, npm, Node repository script, build, test, or downloaded-asset execution step.
- Workflow contract proves artifact digest and exact inventory validation.

## Verification

Run release workflow contracts, YAML syntax validation, typechecks, scanner, and `git diff --check`. Full release dry run required before completion.

## Rollback

Revert workflow and contract changes together; no persisted product state migration.

## Evidence

Not implemented.
