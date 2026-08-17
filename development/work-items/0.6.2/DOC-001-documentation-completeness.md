# DOC-001: Documentation Completeness and Packed-Link Closure

```text
Status: pending
Priority: P0 release gate
Target: 0.6.2
Owner: unassigned
Depends on: documentation freeze
Blocks: 0.6.2 documentation claim
```

## Problem

The locale completeness manifest is a stale 2026-08-01 snapshot that still claimed complete translation and byte-identical mirrors. Packaged locale documentation can also link to a root file absent from the package.

## Reproduction

Compare current README/CHANGELOG/DESIGN hashes and line counts with the manifest, then inspect the real npm tarball for every relative link target.

## Required Invariants

- Every count, hash, and status is generated from frozen release bytes.
- Stale inventories cannot claim complete.
- Every relative link in the packed artifact resolves or is classified as an intentional external source link.
- English and Chinese current-product pages remain paired.

## Scope

Completeness generator, manifest status, packed link checker, navigation/file parity, and documentation contracts.

## Out of Scope

Translating inherited upstream documentation unrelated to current CoCo behavior unless published as current guidance.

## Design

Generate the inventory once after documentation freeze. Distinguish translated current-product pages, byte mirrors, inherited history, and external fixed-commit links. Verify the actual npm tarball.

## Acceptance Tests

Changed source hash, missing locale, stale status, missing packed target, unresolved relative link, and correctly classified historical/external link.

## Verification

Documentation/navigation contracts, real npm pack, package closure, scanner, and zero unclassified link failures.

## Rollback

Mark the inventory invalid rather than preserving a false complete claim.

## Evidence

Not implemented.
