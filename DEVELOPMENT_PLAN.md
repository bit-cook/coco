# CoCo Active Development Plan

```text
Released version: 0.6.1
Current target: 0.6.2
Development branch: candidate/v0.6.2
Base commit: a0c28db816564b8fc3bb653d9b46abaefaac4ca1
Plan status: active
Last updated: 2026-08-17
```

## Objective

Close the confirmed release-safety and deterministic task-recovery P0 findings before adding product features. Preserve the `0.6.1` startup improvements and integrity invariants.

## Next Executable Action

Claim `REL-001` and implement read-only build versus minimal publish credential isolation. In parallel, a separate agent may claim `RUN-001` because its file scope does not overlap.

## Work Items

| ID | Priority | Status | Depends on | Scope summary |
|---|---|---|---|---|
| REL-001 | P0 | ready | none | Split release build and publish permissions |
| REL-002 | P0 | pending | REL-001, REL-003, REL-004 | Draft-first immutable publication |
| REL-003 | P0 | ready | none | Bind offline bundle to verified public tarball |
| REL-004 | P0 release gate | ready | none | Tighten package metadata and offline archive closure |
| RUN-001 | P0 | ready | none | Durable supervisor launch FSM and crash recovery |
| RUN-002 | P0 | pending | RUN-001 | Strict stop-barrier ownership |
| RUN-003 | P0 | ready | RUN-001 for runner integration | Durable webhook dispatch outbox |
| RUN-004 | P0 | pending | RUN-001 | Invalid cwd and provisioning isolation |
| RUN-005 | P0 | pending | RUN-001 shared terminal recovery schema | Invalid UTF-8 terminal recovery |
| CON-001 | P0 decision | pending | none | Decide Linux containment policy and release guarantee |
| CON-002 | P0 implementation | pending | RUN-001, CON-001 | Implement Linux cgroup v2 containment if approved |
| PERF-001 | P0 user-approved | completed | none | Optimize startup and runtime latency without weakening integrity |

Detailed definitions live in `development/work-items/0.6.2/`.

## Parallelization

Safe initial parallel group:

```text
REL-001: .github/workflows/release.yml and workflow contracts
REL-004: package closure/offline archive contracts
RUN-001: task supervisor/runner recovery and focused tests
RUN-003: delivery ledger only; runner integration waits for RUN-001
CON-001: Linux containment feasibility and policy decision
```

Serial constraints:

```text
RUN-001 -> RUN-002 -> RUN-004
RUN-001 -> RUN-005
RUN-001 -> RUN-003 final integration
RUN-001 + CON-001 -> CON-002
REL-004 -> REL-003 final integration -> REL-002
REL-001 -> REL-002
```

The coordinator owns `DEVELOPMENT_PLAN.md`, `AGENTS.md`, generated manifests, shared release contract tests, and final gate reconciliation.

The coordinator owns `DEVELOPMENT_PLAN.md`, `AGENTS.md`, generated manifests, shared release contract tests, all dependency reconciliation, and final gate reconciliation. RUN-001 and RUN-005 are serial because they share terminal recovery and runner files. RUN-003 may implement its ledger transaction independently, but cannot clear dispatch on runner ownership until RUN-001 is complete.

## Evidence

| Gate | Commit | Status | Last result |
|---|---|---|---|
| Core | a0c28db | stale | 478/478 passed before research-doc batch |
| Integrity | a0c28db | stale | 37/37 passed before research-doc batch |
| Package | a0c28db | current | 2/2 passed |
| Closure | a0c28db | current | 175 manifests approved |
| Scanner | a0c28db | current | clean |
| Pages | e085d3d | current | deployed and live-verified |

PERF-001 is complete at `6262f75`; later governed startup changes make those gates stale. Research-document changes keep package/closure/scanner current but require core/integrity rerun before a product release.

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

- `0.6.3`: command-level recovery journal and explicit uncertain outcomes, if not pulled into 0.6.2 after RUN-001.
- `0.7.0`: task history retention, prune, log/worktree/cache GC, Control pagination and scale. Research-derived candidates are EVID-001/EVID-002, TOOL-001, CFG-001, and ORCH-001 under `development/work-items/0.7.0/`; all remain pending until their `0.6.2` dependencies complete.
- `0.8.0`: explicit Windows decision, macOS lifecycle evidence, Node/platform matrix.
- No Dashboard visual redesign, new orchestration features, or speculative providers before P0 closure.

## External Research

Prime Agent commit `849c92114b0b4372fa272281b87cdbe8f7c9ed8d` and DeepSeek Harness commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` were reviewed read-only. The formal bilingual report is `documentation/*/docs/external-agent-research.md`; the reproducible source inventory is `development/research/prime-agent-deepseek-harness-snapshot.md`.

No external runtime or dependency is approved. Whole-framework Cordis migration, persistent Python RLM kernels, unauthenticated LAN control, project-local auto-loaded skills/plugins, and sandbox claims without process/network containment are explicitly rejected or deferred.

## Historical Context

No prior document was deleted. See `HISTORICAL_DOCUMENTS.md` for migration journals, legacy roadmaps, research pages, published release baselines, and backup recovery instructions.
