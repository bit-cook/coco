# CoCo Active Development Plan

```text
Released version: 0.6.1
Current target: 0.6.2
Development branch: candidate/v0.6.2
Base commit: 30dfa4e67b5ac0bb01d00d4ddc2925484c453bb1
Plan status: active
Last updated: 2026-08-18
```

## Objective

Close the confirmed release-safety and deterministic task-recovery P0 findings before adding product features. Preserve the `0.6.1` startup improvements and integrity invariants.

## Next Executable Action

All 0.6.2 P0 implementation, real delegated-cgroup proof, disposable private-draft release proof, and final 0.6.2 local gates are verified in the uncommitted candidate worktree. The next action is a coordinator-reviewed commit, push, and release-candidate binding; public Release publication remains a separate explicit authorization and is not automated by the workflow.

## Work Items

| ID | Priority | Status | Depends on | Scope summary |
|---|---|---|---|---|
| REL-001 | P0 | completed | REL-005 | Four-stage release credential isolation |
| REL-002 | P0 | completed | REL-001, REL-005 | Draft-first immutable publication and lifecycle |
| REL-003 | P0 | completed | REL-004 | Bind offline bundle to verified public tarball |
| REL-004 | P0 release gate | completed | none | Tighten package metadata and offline archive closure |
| REL-005 | P0 release gate | completed | REL-003, REL-004 | Exact nine-asset contract, tag/commit/digest binding |
| RUN-001 | P0 | completed | none | Durable supervisor launch FSM and crash recovery |
| RUN-002 | P0 | completed | RUN-001 | Strict stop-barrier ownership |
| RUN-003 | P0 | completed | RUN-001 for runner integration | Durable ledger plus owner-generation runner consumer |
| RUN-004 | P0 | completed | RUN-001 | Invalid cwd and provisioning isolation |
| RUN-005 | P0 | completed | RUN-001 shared terminal recovery schema | Invalid UTF-8 terminal recovery |
| CON-001 | P0 decision | completed | none | Require Linux cgroup v2 for full-termination claim |
| CON-002 | P0 implementation | completed | RUN-001, RUN-002, CON-001 | Linux cgroup v2 containment and real detached descendant proof |
| PERF-001 | P0 user-approved | completed | none | Optimize startup and runtime latency without weakening integrity |
| PERF-002 | P0 release gate | completed | PERF-001 | Prove lightweight model-list equivalence across all config paths |
| PERF-003 | P1 release gate | completed | PERF-001 | Versioned startup benchmark profile and regression budgets |
| INT-001 | P0 release gate | completed | PERF-001 | Fix and execute canonical-root launcher verification |
| INT-002 | P0 release gate | completed | PERF-001 | Prove runtime topology fast/full fallback behavior |
| DOC-001 | P0 release gate | completed | documentation freeze | Regenerate locale completeness and packed-link closure |

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
| Core | uncommitted 0.6.2 candidate bytes | verified | 574/574 passed, 1 delegated-cgroup capability skip before real probe; real cgroup test separately passed 1/1 |
| Integrity | uncommitted 0.6.2 candidate bytes | verified | 39/39 passed |
| Package | uncommitted 0.6.2 candidate bytes | verified | 2/2 passed |
| Closure | uncommitted 0.6.2 candidate bytes | verified | 175 manifests approved |
| Scanner | uncommitted 0.6.2 candidate bytes | verified | clean; dedicated temp root `/root/coco-tmp/tmp` |
| Pages | 30dfa4e | current | deployed and live-verified in run 32067272227 |

PERF-001/002/003 and INT-001/002 are complete at `8cbcfc0`; later governed startup changes make their historical evidence stale. Final 0.6.2 candidate gates passed on Node 22.19.0, integrity 39/39, core 574/574, package 2/2, closure 175, scanner, and a 20,677-entry runtime probe. Real offline tar byte equality/install/version/uninstall, detached runner/Control lifecycle, writable delegated-cgroup setsid/double-fork containment, and the disposable private-draft release lifecycle passed. GitHub's Release PATCH endpoint rejects `If-Match`; automatic workflow therefore finalizes only a verified private draft with tag-scoped serialization, immediate pre-write revalidation, complete binding payload, response validation, and post-write exact-inventory revalidation. Public release remains an explicit separate action.

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
