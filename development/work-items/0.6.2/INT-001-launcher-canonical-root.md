# INT-001: Canonical-Root Launcher Verification

```text
Status: completed
Priority: P0 release gate
Target: 0.6.2
Owner: unassigned
Depends on: PERF-001
Blocks: 0.6.2 integrity claim
```

## Problem

The direct launcher dynamically imports `verifyRuntimeIntegrity` but the lexical-root versus realpath-root fallback calls an unbound identifier, risking `ReferenceError` and incorrect preflight diagnostics.

## Reproduction

Invoke the direct launcher through a preserved symlink path so lexical and canonical roots differ; execute the fallback branch.

## Required Invariants

- Direct launcher always verifies the selected canonical runtime root.
- Symlink/realpath divergence executes the fallback verifier and emits the correct stable integrity code.

## Scope

Launcher function binding, canonical path behavior, direct execution fixtures, and error mapping.

## Out of Scope

Changing cache trust or reducing verification coverage.

## Design

Bind the dynamically imported verifier to a local constant and make lexical/canonical root selection explicit. Execute both branches through real filesystem fixtures and preserve stable integrity error attribution.

## Acceptance Tests

Real path, symlink-preserving path, replaced target, canonical-root mutation, and verifier failure tests execute the branch rather than inspect source text.

## Verification

Launcher suite, complete integrity, startup benchmark.

## Rollback

Always execute the full verifier on the lexical root if canonical handling cannot be proven.

## Evidence

Implemented at `8cbcfc0`. The verifier is locally bound and real `--preserve-symlinks` fixtures execute lexical/canonical divergence without `ReferenceError`; stable project-resource attribution is preserved. Complete integrity passed 39/39.
