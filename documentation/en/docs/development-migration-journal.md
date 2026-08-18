# CoCo 0.5.3 Migration and Recovery Journal

Last updated: 2026-08-16

This document is the durable handoff for humans and autonomous agents working on CoCo. It records why the migration exists, what has changed, which invariants must hold, what has been verified, and the exact next steps after interruption or context loss.

This is the stable migration guide. Live commands, test results, blockers, and the current recovery checkpoint are maintained outside the release package at `.opencode/memory/DEVELOPMENT_JOURNAL.md`. Update the live journal during routine development; change this guide only when architecture or durable policy changes.

## Current Handoff (Supersedes Historical Checkpoints Below)

The dated checkpoints below are retained as migration history and are not current execution instructions. Current execution truth is `AGENTS.md` followed by `DEVELOPMENT_PLAN.md`.

Current state at the latest review: released version `0.6.1`; branch `candidate/v0.6.2`; reviewed commit `1db5610`; clean worktree; verified complete backup and restore drill. PERF-001 measured the untagged candidate at approximately 7.14 seconds cold and 1.22 seconds warm p50 for `--list-models`, but complete core/integrity evidence is stale after later packaged documentation changes and must be rerun before release. The immediate route is REL-004 → REL-003 → REL-005 → REL-001 → REL-002 in parallel with RUN-001 recovery work and required CON-002 Linux containment.

## Historical Checkpoint: Initial 0.5.3 Migration

Date: 2026-08-15

Objective: migrate the tested security and terminal-evidence work from the old `0.2.1` source into the complete `0.5.3` baseline without overwriting upstream capabilities.

Canonical worktree and baseline:

```text
/root/coco-tmp/coco-v053-migration
6ec5dd3d2105cacbed2e6ea795d74b9eb2155118
package version 0.5.3
detached HEAD
```

Files intentionally changed so far:

```text
AGENTS.md
documentation/en/docs.json
documentation/en/docs/development-migration-journal.md
documentation/zh-CN/docs.json
documentation/zh-CN/docs/development-migration-journal.md
scripts/coco-bootstrap.cjs
scripts/coco-launcher.mjs
scripts/publication-secret-scanner.mjs
scripts/runtime-integrity.mjs
scripts/task-state.mjs
scripts/verify-package-closure.mjs
test/coco-launcher.test.mjs
test/coco-startup-performance.test.mjs
test/publication-secret-scanner.test.mjs
test/release-packaging-contract.test.mjs
test/task-3-runtime-integrity.test.mjs
```

Current evidence:

```text
publication-secret-scanner.test.mjs: passed 11/11
targeted nonce-bypass source test: passed
changed-file syntax checks: passed
git diff --check: passed at the end of delegated batches
launcher/startup tests: blocked by absent node_modules in this worktree
package contract: blocked by absent node_modules/npm/package.json
full integrity suite: not run
asset map and runtime manifest: stale because governed files changed
```

Parallel-agent reconciliation:

- Archive agent modified only its assigned four files, preserved `0.5.3` pi-tui metadata, and passed scanner tests.
- Integrity agent modified only its assigned six files, removed the bypass, and passed syntax plus the source-level nonce test. Dependency-backed tests are blocked.
- Log-store agent returned an implementation plan but did not modify `scripts/task-logs.mjs`; no log migration should be assumed complete.

Active blocker: the `0.5.3` task log store still lacks validated O(1) append indexes and immutable seals. The runner therefore cannot safely adopt terminal evidence recovery yet.

Next executable action: migrate `scripts/task-logs.mjs` and its tests into this worktree, run log unit/crash/concurrency/seal/performance tests, then integrate terminal evidence into `scripts/task-runner.mjs`.

Do not regenerate manifests before those governed files are frozen. Do not run `npm install` until dependency materialization has been reconciled with the pinned package-input workflow.

### Checkpoint: log store and runner terminal evidence integration

Date: 2026-08-15

Status:

- `scripts/task-logs.mjs` migration is now implemented.
- Log tests passed `11/11`, including indexed append, crash-tail recovery, complete-invalid-tail fail closed, independent-store locking, immutable seal, empty materialization, and performance.
- `scripts/task-runner.mjs` now persists terminal evidence before sealing, receipt publication, and terminal-event publication.
- Cancellation rejects a task whose terminal evidence has already been persisted.
- Internal `terminalEvidence` is removed from task command and Control API projections.
- A restart fault-injection test was added to prove receipt failure does not re-execute the child.

Verification command:

```bash
node --test test/task-logs.test.mjs test/task-logs-perf.test.mjs test/task-receipts.test.mjs test/task-control-state.test.mjs test/control-service.test.mjs
```

Result:

```text
task logs/performance/receipts: passed 13/13
task-control-state.test.mjs: blocked during module loading
control-service.test.mjs: blocked during module loading
blocker: ERR_MODULE_NOT_FOUND for cross-spawn imported by dist/utils/child-process.js
runner/control assertions executed: no
```

Syntax checks and `git diff --check`: passed.

Dependency source discovery found `/root/coco-tmp/coco-v030-release/node_modules` with the required pinned packages: npm `11.18.0`, Pi core `0.82.1`, pi-tui `0.82.1`, and MCP `1.30.0`. Before materialization, verify the source worktree commit and package-lock hash match this candidate. Use a physical copy, not a mutable dependency symlink, and record the command and hashes here.

Next executable action: validate and materialize the dependency tree, then rerun runner/control tests and the terminal-evidence fault injection.

### Checkpoint: dependency materialization and terminal pipeline verified

Date: 2026-08-15

Dependency materialization:

```text
source: /root/coco-tmp/coco-v030-release/node_modules
source commit: 6ec5dd3
candidate commit: 6ec5dd3
source and candidate package.json SHA-256: d81d3614843af274db13e095f18ea0cd01c9b39e315f2f93ea13a3bdb0deae7a
source and candidate package-lock.json SHA-256: 1e472f39fcfcda90c4e7da5cbd6656bbbf6c0aa536b70fd0616c09ca6a834607
method: physical `cp -a`, no symlink
installed-tree lock SHA-256: 7633d03d2ea10d041777a35763c62ebb5c8a69269e1fe6d97b1cd7ed5fd23dd9
```

Verified installed versions:

```text
npm 11.18.0
cross-spawn 7.0.6
@earendil-works/pi-coding-agent 0.82.1
@earendil-works/pi-tui 0.82.1
@modelcontextprotocol/sdk 1.30.0
```

`npm run verify:closure` passed with `175` package manifests.

Runner integration now includes:

- Terminal evidence persistence before receipt/event completion.
- Restart recovery with zero child re-executions after receipt failure.
- Immutable log seal before receipt publication.
- UTF-8-safe `StringDecoder` capture.
- Exact bounded in-memory stdout/stderr.
- FIFO log writes with high/low-water stream pause and resume.
- Observable log-write failure.
- Successful child outcome preserved when bounded log storage saturates.
- Persistent `logsTruncated` projection.

Verification:

```text
task/control/log/performance/receipt suite: passed 39/39
syntax checks: passed
git diff --check: passed
```

An earlier Control API fixture failed with `TASK_RECEIPT_INVALID` because it passed the new `describe.latestAt` field into the intentionally strict v1 receipt schema. The fixture now explicitly selects `bytes`, `records`, `ref`, and `sha256`; production schema was not relaxed.

Launcher and startup tests remain blocked by stale generated integrity assets after governed files and documentation changed. This is expected intermediate state, not a runtime regression. Do not regenerate yet: diagnosis optimization remains in scope.

Next executable action: replace full log scans in diagnosis with lightweight tail metadata and revalidate the task snapshot after observation.

### Checkpoint: diagnosis optimized and governed code frozen

Date: 2026-08-15

Implemented:

- `logs.latestAt()` validates the index and reads only one bounded tail record.
- Diagnosis no longer hashes or parses the entire bounded JSONL stream.
- Control diagnosis observes task, event/log metadata, and process identity, then reloads the task and compares status, active run ID, PID, and process identity.
- A changed snapshot is retried once; a second change returns `STATE_CHANGED_DURING_DIAGNOSIS` with HTTP 409.

Verification:

```text
logs/control/diagnosis/runner suite: passed 37/37
feature typecheck: passed
git diff --check: passed
```

The task/terminal/archive/integrity implementation batch is now frozen. Generated product identity, asset map, and runtime integrity artifacts are stale and must be regenerated before launcher, startup, package, core, or full integrity claims.

Next executable action: run the repository build/generation commands once, record all changed generated files, then run launcher/startup/package gates followed by core and one full integrity suite.

### Checkpoint: generated assets and pre-core gates passed

Date: 2026-08-15

Generation command:

```bash
npm run build
```

Result: passed. Product identity check returned `changed: false`; identity patch, package asset map, and runtime integrity manifest were regenerated successfully.

Post-generation evidence:

```text
runtime integrity probe: approved, 20,655 entries
launcher/startup suite: passed 3/3
real npm pack public package contract: passed 1/1
full typecheck: passed
package closure: approved, 175 package manifests
repository secret scan: clean
git diff --check: passed
```

Generated assets are current for the frozen implementation at this checkpoint. Any later governed-code or documentation change requires regeneration and invalidates the launcher/startup/package evidence above.

Next executable action: run `npm run test:core` serially. If it passes, record the result and run `npm run test:integrity` once.

## 1. Repository Topology

### Active candidate

```text
/root/coco-tmp/coco-v053-migration
HEAD: 6ec5dd3d2105cacbed2e6ea795d74b9eb2155118
Version: 0.5.3
State: detached worktree, intentionally uncommitted
```

This is the only worktree that should receive new migration work.

### Historical migration source

```text
/root/coco
HEAD: 297016534873bc0fcb4e3bcda5d32013c7859004
Version at HEAD and in package.json: 0.2.1
Relationship: 122 commits behind origin/main
```

The old worktree contains tested security and observability work developed while protecting a large dirty tree. It is a source of behavior and tests, not a version source of truth. Copying entire files from it would remove `0.5.3` execution evidence, provider lifecycle, TUI, model-panel, product identity, and release work.

### Clean references

```text
/root/coco-tmp/coco-origin-main-clean
/root/coco-tmp/coco-v030-release
```

Do not modify these reference worktrees.

## 2. Why the Migration Was Required

CoCo was previously advanced and released through `0.5.3`. The old active directory remained checked out at `2970165`, whose package version is `0.2.1`, because destructive synchronization was intentionally avoided while preserving user changes. Security and task-system improvements were then developed on that old base.

The version history was never lost:

```text
origin/main package version: 0.5.3
v0.5.3 tag: ac92c9c2f5a387adf3f8055f362e21d305b719c9
0.5.3 preparation commit: 783a54d
```

The correct fix is semantic migration into a clean `0.5.3` worktree, not changing the old package version string.

## 3. Safety Constraints

- Preserve `/root/coco` exactly; do not reset, clean, rebase, pull, or overwrite it.
- No commit, push, tag, release, upload, PR, or other remote mutation without explicit user authorization.
- Keep the active migration worktree detached until the user chooses a version and integration strategy.
- Migrate one subsystem at a time and retain upstream `0.5.3` behavior.
- Freeze governed code before generating `scripts/package-asset-map.v1.json` and runtime integrity manifests.
- Treat any existing release artifact as stale until it passes source-bound closure verification against the active candidate.

## 4. Completed Work on the Old Source

The following behavior was implemented and verified in `/root/coco` before migration began:

- Removed forgeable launcher nonce and environment bypasses.
- Added schema-v2 warm integrity cache with six-field snapshots.
- Added append-only task logs with validated indexes, crash-tail recovery, UTF-8 safety, short-write handling, and bounded performance.
- Added FIFO runner log persistence with stream backpressure and observable truncation.
- Added `logsTruncated` task state.
- Added private task receipts and conservative stuck diagnosis.
- Added terminal evidence outbox and restart recovery.
- Added immutable per-run log seals.
- Added archive snapshots, canonical path checks, strict ZIP/VSIX EOCD/header/range/CRC verification, and source-bound tarball closure.
- Added deterministic control-server close behavior.

Old-source verification evidence:

```text
core suite: 315/315
task/seal/receipt/scanner narrow suite: 53/53
release/startup/package contracts: 19/19
runtime integrity: 20,440 entries, approved
repository secret scan: clean
typecheck: passed
git diff --check: passed
```

These results prove the behavior on the old source, not compatibility with the complete `0.5.3` product.

## 5. Current 0.5.3 Migration Status

### Batch A: Worktree and capability reconciliation

Status: complete.

- Created dedicated detached worktree from `origin/main@6ec5dd3`.
- Confirmed package version `0.5.3`.
- Confirmed upstream already contains task events, logs, receipts, diagnosis, control APIs, execution evidence, provider lifecycle, TUI, and model-panel work.
- Established the rule that files must be merged semantically instead of copied wholesale.

### Batch B: Task state schema

Status: implemented, not yet fully integrated.

Changed `scripts/task-state.mjs`:

- Added backward-compatible `logsTruncated`, defaulting to `false` for legacy tasks.
- Added backward-compatible `terminalEvidence`, defaulting to `null`.
- Added strict terminal evidence validation.
- Required terminal evidence to coexist only with a running task, active run ID, and no pending run event.

Terminal evidence schema contains only bounded terminal metadata:

```text
endedAt
eventId
exitCode
lastError
logsTruncated
result
status
```

It must not contain prompts, raw logs, environment values, credentials, PIDs, or arbitrary payloads.

### Batch C: Archive and package hardening

Status: code migrated; scanner tests passed; package contract blocked by missing dependencies.

Modified:

```text
scripts/publication-secret-scanner.mjs
scripts/verify-package-closure.mjs
```

Preserved `0.5.3` metadata, including bundled `@earendil-works/pi-tui`.

Implemented archive snapshotting, canonical paths, duplicate and prefix-conflict rejection, strict ZIP verification, CRC checks, bounded extraction, and source-bound tarball inventory.

Evidence:

```text
publication-secret-scanner tests: 11/11 passed
syntax checks: passed
git diff --check: passed
```

Package contract did not run because this worktree has no `node_modules/npm/package.json`. This is an environment dependency blocker and must remain recorded as unverified, not passed.

### Batch D: Runtime integrity cache

Status: code migrated; dependency-backed startup tests blocked.

Modified:

```text
scripts/runtime-integrity.mjs
scripts/coco-bootstrap.cjs
scripts/coco-launcher.mjs
```

Implemented:

- Removed `COCO_INTEGRITY_VERIFIED` bypass.
- Unified CJS and ESM cache schema v2.
- Unified six-field snapshots: size, mtimeMs, ctimeMs, mode, dev, ino.
- Added directory snapshots and bounded warm-cache tests.
- Preserved `0.5.3` Pi core, pi-ai, pi-tui, MCP, product identity, and dispatch behavior.

Evidence:

```text
syntax checks: passed
forged nonce bypass test: passed
```

Blocked tests:

- Launcher and startup tests fail before target assertions because this worktree lacks `node_modules` required by the existing runtime manifest.
- Full integrity tests were intentionally not run.

### Batch E: Task log store

Status: not migrated.

The delegated agent inspected interfaces but did not modify files. The `0.5.3` store still rewrites the entire JSONL file on every append and has no seal.

Required migration:

- O(1) append with a validated index.
- Short-write loop and `datasync`.
- Stale/corrupt index recovery.
- Partial EOF-tail recovery.
- Complete but invalid JSON must fail closed without mutation.
- UTF-8 and canonical JSON validation.
- Global state-lock serialization.
- `describe()` with latest metadata.
- Idempotent immutable seal.
- Seal reread must verify actual JSONL bytes.
- Empty seal must materialize JSONL/index.
- Append after seal must return `TASK_LOG_SEALED`.

### Batch F: Runner terminal state machine

Status: not migrated.

The `0.5.3` runner still performs:

```text
child exit -> logs.describe -> receipt.write -> finish
```

This creates contradictory evidence after crashes. It must become:

```text
child exit
  -> persist terminalEvidence (point of no re-execution)
  -> seal log
  -> idempotently write receipt
  -> persist terminal event intent and completed task projection
  -> idempotently publish terminal event
  -> clear activeRunId
```

Recovery must process terminal evidence before interrupted-run abandonment. Once terminal evidence exists, the run must never be executed again.

## 6. Required Tests for Terminal Evidence

At minimum, add or migrate tests proving:

1. Receipt write fails after terminal evidence is persisted.
2. The task remains running, non-runnable, and retains its original completed/failed evidence.
3. A restarted runner performs zero child executions.
4. Recovery writes one receipt and one terminal event.
5. Recovery clears terminal evidence and active run ID only after publication succeeds.
6. A sealed run rejects append from an independent log-store instance.
7. A modified JSONL file causes seal verification to fail closed.
8. Empty output produces a real empty JSONL target and deterministic digest.
9. Scheduled runs receive a new run ID only after the prior run evidence is fully published.
10. Cancellation cannot erase already persisted terminal evidence.

## 7. Dependency Restoration

The active migration worktree currently lacks `node_modules`. Do not run `npm install` blindly: the project uses pinned, bundled, and patched runtime inputs.

Preferred sequence:

1. Inspect the clean reference worktree and package input scripts.
2. Confirm dependency paths and hashes against `package-lock.json`, package asset map, and runtime manifest.
3. Use the repository's existing bootstrap/materialization workflow or a verified read-only dependency source.
4. Never symlink mutable dependencies into a final release candidate.
5. Record the exact materialization command and resulting hashes here.

Until dependencies exist, syntax and pure unit tests are valid evidence; launcher, startup, package, and full integrity results are blocked.

## 8. Resume Commands

```bash
cd /root/coco-tmp/coco-v053-migration
git status --short --branch
node -p "require('./package.json').version"
git diff --check
```

Expected:

```text
HEAD detached at 6ec5dd3
version 0.5.3
only documented migration files modified
```

Then run:

```bash
node --check scripts/task-state.mjs
node --test test/publication-secret-scanner.test.mjs
```

Do not regenerate manifests until task logs and the runner state machine are integrated and all governed code is frozen.

## 9. Exact Next Steps

1. Migrate the task log store and its tests.
2. Run log unit, crash-recovery, concurrency, seal, and performance tests.
3. Integrate terminal evidence into the `0.5.3` runner without removing upstream execution evidence behavior.
4. Add receipt-failure and restart-recovery fault injection.
5. Update control diagnosis to use lightweight tail metadata rather than full log scans.
6. Restore verified dependencies.
7. Run typecheck and subsystem tests.
8. Freeze code and regenerate asset map and runtime manifest once.
9. Run launcher/startup/package tests.
10. Run the full core suite, followed by the long integrity suite once.

## 10. Release State

Release remains **No-Go**.

Reasons:

- Migration is incomplete.
- Dependency-backed tests are blocked.
- The worktree is detached and uncommitted.
- No clean candidate commit exists.
- Generated assets are stale after governed-file changes.
- No user-approved next version has been selected after `0.5.3`.

Do not change the version or produce a release until all migration and validation gates close.
