# CoCo Active Development Plan

```text
Released version: 0.6.1
Current target: 0.6.2
Development branch: candidate/v0.6.2
Base commit: e085d3dc2b59074c23a52f4fe4c76c17504d0e5b
Plan status: active
Last updated: 2026-08-16
```

## Objective

Close the confirmed release-safety and deterministic task-recovery P0 findings before adding product features. Preserve the `0.6.1` startup improvements and integrity invariants.

## Next Executable Action

Claim `REL-001` and implement read-only build versus minimal publish credential isolation. In parallel, a separate agent may claim `RUN-001` because its file scope does not overlap.

## Work Items

| ID | Priority | Status | Depends on | Scope summary |
|---|---|---|---|---|
| REL-001 | P0 | ready | none | Split release build and publish permissions |
| REL-002 | P0 | pending | REL-001 | Draft-first immutable publication |
| REL-003 | P0 | ready | none | Bind offline bundle to verified public tarball |
| REL-004 | P1 | ready | none | Tighten package metadata and offline archive closure |
| RUN-001 | P0 | ready | none | Durable supervisor launch FSM and crash recovery |
| RUN-002 | P0 | pending | RUN-001 | Strict stop-barrier ownership |
| RUN-003 | P0 | ready | none | Durable webhook dispatch outbox |
| RUN-004 | P0 | pending | RUN-001 | Invalid cwd and provisioning isolation |
| RUN-005 | P0 | ready | none | Invalid UTF-8 terminal recovery |
| CON-001 | P0 decision | pending | RUN-001 | Linux cgroup v2 containment feasibility and implementation |
| PERF-001 | P0 user-approved | completed | none | Optimize startup and runtime latency without weakening integrity |

Detailed definitions live in `development/work-items/0.6.2/`.

## Parallelization

Safe initial parallel group:

```text
REL-001: .github/workflows/release.yml and workflow contracts
REL-003: scripts/build-offline-bundle.mjs and offline bundle tests
RUN-001: task supervisor/runner recovery and focused tests
RUN-003: control-service/webhook dispatch state and focused tests
RUN-005: supervisor output import/log encoding and focused tests
```

Serial constraints:

```text
RUN-001 -> RUN-002 -> RUN-004
REL-001 -> REL-002
RUN-001 -> CON-001 final integration decision
```

The coordinator owns `DEVELOPMENT_PLAN.md`, `AGENTS.md`, generated manifests, shared release contract tests, and final gate reconciliation.

PERF-001 temporarily owns launcher, dispatcher, project preflight, startup benchmark, and performance-contract files. It may proceed before REL/RUN implementation because the user explicitly prioritized performance, but it must not weaken the P0 invariants or edit their state-machine files.

## Evidence

| Gate | Commit | Status | Last result |
|---|---|---|---|
| Core | 6262f75 | current | 478/478 passed |
| Integrity | 6262f75 | current | 37/37 passed |
| Package | 6262f75 | current | 2/2 passed |
| Closure | 6262f75 | current | 175 manifests approved |
| Scanner | 6262f75 | current | clean |
| Pages | e085d3d | current | deployed and live-verified |

PERF-001 is complete at `6262f75`; later governed startup changes make these gates stale again.

Any implementation edit must update this table immediately.

## Batch Exit Criteria

`0.6.2` is not releasable until all are proven on committed bytes:

```text
release build cannot read repository write credentials
failed publication cannot expose a partial public release
same-tag release assets cannot be overwritten
offline and public CoCo tarball digests are identical
every pre-authorization crash state converges
an invalid task cannot poison later queued tasks
duplicate webhook delivery can recover pending dispatch
concurrent stop operations elect one owner
invalid UTF-8 cannot prevent terminal evidence
containment scope and guarantee are documented and tested
complete core, integrity, package, offline, VSIX, and lifecycle gates pass
```

## Deferred Work

- `0.7.0`: task history retention, prune, log/worktree/cache GC, Control pagination and scale.
- `0.8.0`: explicit Windows decision, macOS lifecycle evidence, Node/platform matrix.
- No Dashboard visual redesign, new orchestration features, or speculative providers before P0 closure.

## Historical Context

No prior document was deleted. See `HISTORICAL_DOCUMENTS.md` for migration journals, legacy roadmaps, research pages, published release baselines, and backup recovery instructions.
