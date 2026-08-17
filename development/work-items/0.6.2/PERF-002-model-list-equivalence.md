# PERF-002: Full-Configuration Model List Equivalence

```text
Status: completed
Priority: P0 release gate
Target: 0.6.2
Owner: unassigned
Depends on: PERF-001
Blocks: 0.6.2 performance claim
```

## Problem

The lightweight `--list-models` path is proven only for a default empty agent directory. Package extensions, settings packages, provider registration, auth state, malformed models, and search behavior may differ from full Pi.

## Reproduction

Register a provider through a configured package extension and compare lightweight versus full Pi model-list output.

## Required Invariants

- Lightweight and full paths are byte-equivalent for every supported model-visibility input.
- Unknown extension/config inputs force the full path.

## Scope

Model-list eligibility, differential fixture matrix, auth/custom/package extension coverage, and fallback tests.

## Out of Scope

New providers or changed model visibility semantics.

## Design

Enumerate all configuration sources that can register or filter models. Run both paths over the same private fixture and compare stdout, stderr, and exit status byte-for-byte.

## Acceptance Tests

Settings packages, global package extension provider, native/custom provider, malformed models, auth variants, search hit/miss, explicit extension, and unknown configuration cases.

## Verification

Differential suite, visible-model catalog, launcher tests, benchmark, complete core and integrity.

## Rollback

Disable the lightweight path and retain the full Pi path.

## Evidence

Implemented at `8cbcfc0`.

Lightweight and full Pi output, stderr and exit code are byte-compared across custom models, auth file/environment, malformed models and search hit/miss. Settings packages, explicit/global/project extensions and unknown visibility inputs force the full path. Focused differential tests passed.
