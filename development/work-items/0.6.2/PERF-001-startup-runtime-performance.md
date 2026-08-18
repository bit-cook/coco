# PERF-001: Startup and Runtime Performance

```text
Status: completed
Priority: P0 user-approved
Target: 0.6.2
Owner: primary-agent
Depends on: none
Blocks: none
Last updated: 2026-08-16
```

## Problem

CoCo `0.6.1` improved measured `--list-models` startup to approximately 9.37 seconds cold and 2.18 seconds warm on the release host, but startup and native command latency remain sensitive to integrity scans, project-resource preflight, module loading, and filesystem scale. Runtime throughput also lacks one repeatable benchmark matrix.

## Reproduction

Run `scripts/benchmark-startup.mjs` and timed real commands in a fresh private agent directory. Compare cold, warm, forced-full, native command, forwarded Pi command, and task command paths.

## Required Invariants

- No environment or externally forgeable property bypasses verification.
- Direct launcher invocation still verifies itself.
- Source/CAS metadata changes still fall back to complete hashing.
- Project executable resources remain forbidden before Pi import.
- At-most-once execution, terminal evidence, and publication rules are unchanged.

## Scope

- `scripts/coco-bootstrap.cjs`
- `scripts/coco-launcher.mjs`
- `scripts/coco-dispatcher.mjs`
- `scripts/project-resource-preflight.mjs`
- `scripts/benchmark-startup.mjs`
- startup/performance/integrity tests
- generated package/runtime manifests after freeze

## Out of Scope

- Task state-machine changes
- Release workflow changes
- Dashboard redesign
- Weaker cache trust or reduced integrity coverage

## Design

Measure first. Remove duplicate work, defer expensive modules until required, let native commands avoid project preflight when they cannot import project resources, batch safe filesystem work, and add stable budgets. Every shortcut must have a security test proving the skipped work is irrelevant to that path.

## Fault Matrix

| Optimization boundary | Required protection |
|---|---|
| native command fast path | no project extension import and no API-key argument bypass |
| forwarded Pi path | full project-resource preflight before Pi import |
| warm cache | metadata change triggers full verification |
| compile cache | symlink/corruption cannot alter verified source selection |
| benchmark seam | cannot affect production dispatch or integrity |

## Acceptance Tests

- Repeatable cold/warm/full benchmark JSON for version, help, doctor, task list, and `--list-models`.
- Security tests for native versus forwarded preflight order.
- Existing CAS/source tamper and direct-launch tests remain green.
- Warm real `--list-models` p50 improves beyond 0.6.1 baseline without regression in cold p50.
- Native command warm p50 has an explicit budget derived from the release host.

## Verification

Focused startup/performance/security tests, typechecks, build, complete integrity, complete core, real package, closure, scanner, and detached lifecycle.

## Rollback

Revert optimization and generated assets together. No persisted schema changes are allowed in this item.

## Evidence

```text
implementation commit: f67851c
generated-asset commit: 6262f75
Node: v24.15.0
```

Baseline versus final release-host measurements:

| Path | Baseline | Final | Change |
|---|---:|---:|---:|
| `--version` warm p50 | 0.704 s | 0.500 s | 29% faster |
| `--list-models` cold | 9.18 s | 7.14 s | 22% faster |
| `--list-models` warm p50 | 2.401 s | 1.224 s | 49% faster |
| `--help` warm p50 | 1.192 s | 0.795 s | 33% faster |
| `task list --json` warm p50 | 1.245 s | 0.872 s | 30% faster |

Retained implementation:

- Pi-backed lightweight model listing with byte-equivalent output and extension fallback.
- Initial project-resource scan plus descriptor-bound final revalidation immediately before Pi import.
- Direct cached-directory snapshot checks instead of a second recursive enumeration.
- Cache schema v3 binds `directoryCount`; malformed or legacy caches fall back to full verification.
- Benchmark expected-code and percentile reporting.

Rejected experiments:

- Native command preflight bypass: reverted because it weakened the forbidden project-resource contract.
- Asynchronous 128-way metadata checks: reverted because warm performance regressed.

Verification:

```text
focused startup/model/security suite: 23/23 passed
complete integrity: 37/37 passed
complete core: 478/478 passed
real package contracts: 2/2 passed
package closure: approved, 175 manifests
runtime probe: approved, 20,668 entries
publication scanner: clean
detached runner/control lifecycle: passed
typecheck and feature typecheck: passed
git diff --check: passed
```
