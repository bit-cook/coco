# CoCo Active Development Plan

```text
Released version: 0.6.1
Current target: 0.6.2
Development branch: candidate/v0.6.2
Base commit: 30dfa4e67b5ac0bb01d00d4ddc2925484c453bb1
Plan status: active
Last updated: 2026-08-17
```

## Objective

Close the confirmed release-safety and deterministic task-recovery P0 findings before adding product features. Preserve the `0.6.1` startup improvements and integrity invariants.

## Next Executable Action

Claim `REL-004` first because it closes confirmed package/offline vulnerabilities and defines the immutable input required by REL-003/REL-005. In parallel, claim `RUN-001` for the supervisor state machine. `CON-001` is resolved: Linux cgroup v2 containment is required for the 0.6.2 full-termination claim, so CON-002 follows RUN-001/RUN-002.

## Work Items

| ID | Priority | Status | Depends on | Scope summary |
|---|---|---|---|---|
| REL-001 | P0 | pending | REL-005 | Implement four-stage release credential isolation |
| REL-002 | P0 | pending | REL-001, REL-005 | Draft-first immutable publication and lifecycle |
| REL-003 | P0 | pending | REL-004 | Bind offline bundle to verified public tarball |
| REL-004 | P0 release gate | ready | none | Tighten package metadata and offline archive closure |
| REL-005 | P0 release gate | pending | REL-003, REL-004 | Exact nine-asset contract, tag/commit/digest binding |
| RUN-001 | P0 | ready | none | Durable supervisor launch FSM and crash recovery |
| RUN-002 | P0 | pending | RUN-001 | Strict stop-barrier ownership |
| RUN-003 | P0 | ready | RUN-001 for runner integration | Durable webhook dispatch outbox |
| RUN-004 | P0 | pending | RUN-001 | Invalid cwd and provisioning isolation |
| RUN-005 | P0 | pending | RUN-001 shared terminal recovery schema | Invalid UTF-8 terminal recovery |
| CON-001 | P0 decision | completed | none | Require Linux cgroup v2 for full-termination claim |
| CON-002 | P0 implementation | pending | RUN-001, RUN-002, CON-001 | Implement Linux cgroup v2 containment |
| PERF-001 | P0 user-approved | completed | none | Optimize startup and runtime latency without weakening integrity |
| PERF-002 | P0 release gate | ready | PERF-001 | Prove lightweight model-list equivalence across all config paths |
| PERF-003 | P1 release gate | ready | PERF-001 | Versioned startup benchmark profile and regression budgets |
| INT-001 | P0 release gate | ready | PERF-001 | Fix and execute canonical-root launcher verification |
| INT-002 | P0 release gate | ready | PERF-001 | Prove runtime topology fast/full fallback behavior |
| DOC-001 | P0 release gate | pending | documentation freeze | Regenerate locale completeness and packed-link closure |

Detailed definitions live in `development/work-items/0.6.2/`.

## Parallelization

Safe initial parallel group:

```text
REL-004: package closure/offline archive contracts
RUN-001: task supervisor/runner recovery and focused tests
RUN-003: delivery ledger only; runner integration waits for RUN-001
PERF-002 + PERF-003: model-list equivalence and benchmark budgets
INT-001 + INT-002: launcher/root and topology integrity tests
```

Serial constraints:

```text
RUN-001 -> RUN-002 -> RUN-004
RUN-001 -> RUN-005
RUN-001 -> RUN-003 final integration
RUN-001 + RUN-002 + CON-001 -> CON-002
REL-004 -> REL-003 -> REL-005 -> REL-001 -> REL-002
PERF-001 -> PERF-002 + PERF-003
PERF-001 -> INT-001 + INT-002
```

The coordinator owns `DEVELOPMENT_PLAN.md`, `AGENTS.md`, generated manifests, shared release contract tests, all dependency reconciliation, and final gate reconciliation. RUN-001 and RUN-005 are serial because they share terminal recovery and runner files. RUN-003 may implement its ledger transaction independently, but cannot clear dispatch on runner ownership until RUN-001 is complete.

## Evidence

| Gate | Commit | Status | Last result |
|---|---|---|---|
| Core | 6262f75 | stale | 478/478 passed before later packaged docs |
| Integrity | 6262f75 | stale | 37/37 passed before later packaged docs |
| Package | 30dfa4e | current | 2/2 passed |
| Closure | 30dfa4e | current | 175 manifests approved |
| Scanner | 30dfa4e | current | clean |
| Pages | 115c08d | stale | prior plan deployed; 30dfa4e pending deployment |

PERF-001 is complete at `6262f75`; later governed startup changes make those gates stale. Research-document changes keep package/closure/scanner current but require core/integrity rerun before a product release.

Any implementation edit must update this table immediately.

Evidence invalidation rules:

```text
runtime/package implementation edit -> core, integrity, package, closure stale
packaged documentation or package inventory edit -> package, closure, scanner stale; rebuild determines integrity impact
release workflow/installer/offline/VSIX edit -> release contract and lifecycle stale
site edit -> Pages contract and live deployment stale
test-only edit -> affected test evidence stale, product bytes unchanged
.opencode journal edit -> no package/runtime evidence change
```

## Batch Exit Criteria

`0.6.2` is not releasable until all are proven on committed bytes:

```text
release build cannot read repository write credentials
release uses build -> draft upload -> read-only draft verify -> publish stages
failed publication cannot expose a partial public release
same-tag release assets cannot be overwritten
offline and public CoCo tarball digests are identical
every pre-authorization crash state converges
an invalid task cannot poison later queued tasks
duplicate webhook delivery can recover pending dispatch
concurrent stop operations elect one owner
invalid UTF-8 cannot prevent terminal evidence
containment scope and guarantee are documented and tested
lightweight model listing is differential-tested across every config source
canonical-root and runtime-topology integrity tests pass
startup p50/p95 budgets pass on a versioned host profile
documentation completeness inventory and packed relative links are current
complete core, integrity, package, offline, VSIX, and lifecycle gates pass
```

## Deferred Work

- `0.6.3`: REC-001 command-level recovery journal and CFG-000 atomic MCP publication before generalized live generations/effect evidence.
- `0.6.3`: BKP-001 adds independently authenticated, off-host immutable backup and encrypted operational-state rotation.
- `0.7.0`: task history retention, prune, log/worktree/cache GC, Control pagination and scale. Research-derived candidates are EVID-001/EVID-002, TOOL-001, CFG-001, and ORCH-001 under `development/work-items/0.7.0/`; all remain pending until their `0.6.2` dependencies complete.
- `0.8.0`: explicit Windows decision, macOS lifecycle evidence, Node/platform matrix.
- No Dashboard visual redesign, new orchestration features, or speculative providers before P0 closure.

## External Research

Prime Agent commit `849c92114b0b4372fa272281b87cdbe8f7c9ed8d` and DeepSeek Harness commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` were reviewed read-only. The formal bilingual report is `documentation/*/docs/external-agent-research.md`; the reproducible source inventory is `development/research/prime-agent-deepseek-harness-snapshot.md`.

No external runtime or dependency is approved. Whole-framework Cordis migration, persistent Python RLM kernels, unauthenticated LAN control, project-local auto-loaded skills/plugins, and sandbox claims without process/network containment are explicitly rejected or deferred.

## Historical Context

No prior document was deleted. See `HISTORICAL_DOCUMENTS.md` for migration journals, legacy roadmaps, research pages, published release baselines, and backup recovery instructions.
