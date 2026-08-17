# BKP-001: Offsite Authenticated Backup

```text
Status: pending
Priority: P1 operations
Target: 0.6.3
Owner: unassigned
Depends on: 0.6.2 release
Blocks: disaster-recovery authenticity claim
```

## Problem

The verified local backup and unsigned SHA-256 manifest share one failure domain. The public-safe backup excludes operational state; a one-time encrypted private export is not a managed rotation policy.

## Required Invariants

- One immutable off-host copy is authenticated independently of the backup directory.
- Sensitive state is encrypted with a separately managed key and bounded retention.
- Restore drills verify committed bytes, dependencies, assets, and separately restored state.

## Scope

Detached signature/attestation, off-host immutable storage, encrypted state backup, retention, restore drill, and credential rotation runbook.

## Out of Scope

Publishing secrets, storing keys beside ciphertext, or treating a same-disk copy as offsite.

## Design

Use object-lock or equivalent immutable storage, detached authenticity, separate key custody, timestamped retention, and periodic automated restore drills.

## Acceptance Tests

Tampered artifact/manifest, missing offsite copy, wrong key, partial restore, stale credentials, retention expiry, and full offline restore.

## Verification

Independent signature verification and documented off-host restore drill.

## Rollback

Never delete the last verified local set while migrating storage.

## Evidence

Not implemented.
