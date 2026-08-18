# PERF-003: Versioned Startup Release Budget

```text
Status: completed
Priority: P1 release gate
Target: 0.6.2
Owner: unassigned
Depends on: PERF-001
Blocks: performance release claim
```

## Problem

Current measurements are useful one-host evidence but are not an executable regression budget: cold has one sample, the command matrix is manual, and CI does not compare p50/p95 thresholds.

## Reproduction

Add a deterministic startup delay; current benchmark source-contract tests still pass because no numeric budget is enforced.

## Required Invariants

- Benchmark definitions, host fingerprint, Node version, sample count, cold/warm/full semantics, p50/p95, and allowed regression are versioned.
- Security validation cannot be disabled to meet a budget.

## Scope

Benchmark profiles, matrix runner, baseline artifact, CI comparison, and noise policy.

## Out of Scope

Changing product behavior solely to satisfy an unstable host.

## Design

Store a versioned benchmark profile with host fingerprint, Node/runtime identity, matrix, sample counts, cold-cache preparation, percentiles, noise allowance, and maximum regression. CI emits measurements and fails only against the declared profile policy.

## Acceptance Tests

`--version`, `--help`, task list, control status, lightweight/full list-models, cold/warm/full paths with minimum repetitions and intentional regression fixture.

## Verification

Release-host benchmark, CI contract, startup/security focused suite.

## Rollback

Keep measurements informational if the host cannot satisfy the declared noise policy; never silently widen budgets.

## Evidence

Implemented at `8cbcfc0`.

The tracked `coco-startup-linux-v1` baseline covers six command paths, cold/warm/full modes, five primed samples, p50/p95, host and Node identity, and declared noise/regression. `benchmark:startup:check` runs on the pinned Node 22 self-hosted main job and fails matrix, host, runtime, sample or percentile drift. The current post-build check passed.
