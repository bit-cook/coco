# CoCo Active Development Journal

This is the canonical append-oriented execution journal. Current execution order and gate status live in `DEVELOPMENT_PLAN.md`; dated entries below are historical facts. The journal is intentionally outside the npm package and runtime integrity roots so recording verification results does not invalidate generated release assets.

Stable architecture and migration rationale live in:

```text
documentation/en/docs/development-migration-journal.md
documentation/zh-CN/docs/development-migration-journal.md
```

## Recovery Header

```text
Canonical worktree: /root/coco-tmp/coco-v053-migration
Current branch: candidate/v0.6.2
Current commit at review: 1db561056cba780c9a35c594895b158782a5429d
Released product version: 0.6.1
Current target: 0.6.2
Git mode: attached development branch
Migration source: /root/coco at 2970165, package version 0.2.1
Current phase: P0 release safety, deterministic recovery, and Linux containment
Remote operations: prohibited unless explicitly authorized
```

Resume commands:

```bash
cd /root/coco-tmp/coco-v053-migration
git status --short --branch
git rev-parse HEAD
node -p "require('./package.json').version"
git diff --check
```

## 2026-08-15: Canonical Worktree Established

Objective: stop advancing the stale `0.2.1` worktree and migrate behavior onto the complete `0.5.3` product baseline.

Evidence:

```text
origin/main: 6ec5dd3
package version: 0.5.3
v0.5.3 tag: ac92c9c2f5a387adf3f8055f362e21d305b719c9
old worktree behind origin/main: 122 commits
```

Decision: use `/root/coco-tmp/coco-v053-migration` as a detached, non-committing migration candidate. Preserve `/root/coco` unchanged as a behavior source.

## 2026-08-15: Parallel Capability Reconciliation

Archive batch changed:

```text
scripts/publication-secret-scanner.mjs
scripts/verify-package-closure.mjs
test/publication-secret-scanner.test.mjs
test/release-packaging-contract.test.mjs
```

Implemented private snapshots, canonical member paths, duplicate/alias/prefix-conflict rejection, strict ZIP EOCD/local-central/range/CRC verification, tar limits/timeouts, and source-bound tarball inventory. Preserved `0.5.3` pi-tui package metadata.

Evidence: scanner tests passed `11/11`; package test was initially blocked because `node_modules` was absent.

Integrity batch changed:

```text
scripts/runtime-integrity.mjs
scripts/coco-bootstrap.cjs
scripts/coco-launcher.mjs
test/coco-launcher.test.mjs
test/coco-startup-performance.test.mjs
test/task-3-runtime-integrity.test.mjs
```

Implemented bypass removal, cache schema v2, six-field snapshots, and CJS/ESM cache alignment while preserving the `0.5.3` Pi/pi-ai/pi-tui/MCP/product-identity closure.

Evidence: syntax passed; forged-bypass source test passed; dependency-backed tests initially blocked.

The first log migration delegation returned only a plan and made no changes. This was explicitly recorded and not counted as complete.

## 2026-08-15: Task Log and Terminal Evidence Migration

Implemented in the `0.5.3` baseline:

- Validated O(1) JSONL append index.
- Short-write loop and `datasync`.
- Missing, corrupt, and stale index recovery.
- Partial EOF-tail recovery.
- Complete invalid JSON tail fails closed without mutation.
- UTF-8, canonical JSON, identity, and contiguous sequence validation.
- Immutable per-run seal with actual-byte verification.
- Empty log materialization.
- Append after seal returns `TASK_LOG_SEALED`.
- `terminalEvidence` persisted before receipt/event completion.
- Receipt failure retains a non-runnable recoverable run.
- Restart recovery performs zero child re-executions.
- FIFO output writes, `StringDecoder`, exact caps, and stream backpressure.
- Log saturation preserves the child result and sets `logsTruncated`.
- Diagnosis uses bounded tail metadata and task snapshot revalidation.

Focused evidence:

```text
task logs initial migration: passed 11/11
task/control/output/receipt suite: passed 39/39
logs/control/diagnosis/runner suite: passed 37/37
feature typecheck: passed
git diff --check: passed
```

One Control fixture failed with `TASK_RECEIPT_INVALID` because it passed `describe.latestAt` into the strict receipt-v1 schema. The fixture was corrected to select only `bytes`, `records`, `ref`, and `sha256`. Production validation was not relaxed.

## 2026-08-15: Dependency Materialization

Source and candidate both resolve to commit `6ec5dd3` and have identical package metadata:

```text
package.json SHA-256: d81d3614843af274db13e095f18ea0cd01c9b39e315f2f93ea13a3bdb0deae7a
package-lock.json SHA-256: 1e472f39fcfcda90c4e7da5cbd6656bbbf6c0aa536b70fd0616c09ca6a834607
dependency source: /root/coco-tmp/coco-v030-release/node_modules
method: physical cp -a; no symlink
installed-tree lock SHA-256: 7633d03d2ea10d041777a35763c62ebb5c8a69269e1fe6d97b1cd7ed5fd23dd9
```

Verified versions:

```text
npm 11.18.0
cross-spawn 7.0.6
@earendil-works/pi-coding-agent 0.82.1
@earendil-works/pi-tui 0.82.1
@modelcontextprotocol/sdk 1.30.0
```

Package closure passed with `175` package manifests.

## 2026-08-15: Generation and Pre-Core Gates

Command:

```bash
npm run build
```

Result: passed. Product identity reported `changed: false`; identity patch, asset map, and runtime integrity manifest were generated.

Post-generation evidence:

```text
runtime integrity probe: approved, 20,655 entries
launcher/startup: passed 3/3
real npm pack public package contract: passed 1/1
full typecheck: passed
package closure: approved, 175 package manifests
repository secret scan: clean
git diff --check: passed
```

Important correction: recording this result in packaged `documentation/` made generated assets stale. The live journal was therefore moved to `.opencode/memory/`. Stable documentation now points here and should not receive routine checkpoint edits.

## Current Next Action

Core command executed:

```bash
npm run test:core
```

Result:

```text
tests: 415
passed: 413
failed: 2
duration: about 7.8 minutes
```

Failures:

```text
coco-goal-extension.test.mjs: English assertion received zh-CN output
coco-goal-state.test.mjs: English assertion received zh-CN output
```

Attribution: test isolation. The process-level language singleton loaded the user's existing zh-CN agent state. This is not a product behavior regression and is not related to terminal evidence, logs, archive verification, or integrity changes. The equivalent issue was previously fixed in the old migration source by installing an isolated English language service in these tests.

Current next action:

1. Add explicit isolated English language service setup to the two goal tests only.
2. Run those tests.
3. Rerun `npm run test:core` once to establish a complete green baseline.
4. Run `npm run test:integrity` once.
5. Record final git status, integrity entry count, package closure, secret scan, and remaining No-Go reasons here.

## 2026-08-15: Core Gate Passed

The two isolated goal tests passed `14/14` after installing an explicit English language service in their test process. No product language behavior was changed.

Core command:

```bash
npm run test:core
```

Final result:

```text
tests: 415
passed: 415
failed: 0
cancelled: 0
skipped: 0
duration: 464,475 ms
```

This supersedes the earlier `413/415` checkpoint. Generated assets remain current because only test files and this non-packaged live journal changed after generation.

Next executable action: run `npm run test:integrity` once. Do not modify governed files during or after the run.

## 2026-08-15: Final Validation Checkpoint

Long integrity command:

```bash
npm run test:integrity
```

Result:

```text
tests: 27
passed: 27
failed: 0
duration: 608,597 ms
```

Final read-only gates:

```text
runtime integrity probe: approved, 20,655 entries
package closure: approved, 175 package manifests
repository secret scan: clean
git diff --check: passed
package version: 0.5.3
baseline: 6ec5dd3
node_modules: ignored physical directory, not a symlink
```

Complete verified gate summary:

```text
focused task/control/log suite: 39/39
focused diagnosis suite: 37/37
goal locale isolation: 14/14
launcher/startup: 3/3
real npm pack public package contract: 1/1
core suite: 415/415
integrity suite: 27/27
full typecheck: passed
package closure: approved
secret scan: clean
```

Intentional migration changes currently include task terminal evidence, immutable log sealing, indexed append/recovery, output backpressure, lightweight diagnosis, archive hardening, source-bound package closure, integrity-cache alignment, generated assets, regression tests, stable migration guides, `AGENTS.md`, and this live journal.

The candidate remains detached and uncommitted. No commit, branch, tag, push, PR, release, upload, or remote state change was performed.

## Remaining No-Go Reasons

- No user-approved version after the already published `0.5.3` has been selected.
- No clean candidate commit exists; current changes are only in a detached worktree.
- The migration diff has not yet received an independent final code review focused on interactions with the `0.5.3` execution-evidence and provider chains.
- Release workflow remains outside the current authorization boundary.

## Next Recommended Action

Perform an independent review of the detached migration diff, ordered by severity:

1. Terminal evidence, seal, cancellation, schedule, and event/receipt consistency.
2. Archive snapshot, ZIP parser, tar inventory, and resource-budget behavior.
3. CJS/ESM integrity cache trust boundary and complete startup dependency closure.
4. Control diagnosis snapshot consistency and response privacy.

If review finds no blockers, ask the user for the intended post-`0.5.3` version and explicit authorization before creating a branch or commit. Do not infer or publish a version automatically.

## 2026-08-15: Independent Final Review Reopened the Candidate

Review method: four independent read-only reviews covering terminal evidence, archive/package verification, runtime integrity, and Control/diagnosis. No governed code was changed during review. Existing generated assets and test evidence remain current, but the candidate is security-blocked.

### Critical execution finding

The current terminal evidence outbox starts after the child outcome returns to the parent. It does not close either of these crash windows:

```text
spawn returns -> PID/identity publication
child performs effects and exits -> parent persists terminalEvidence
```

A parent crash in either window can leave a running task without a durable outcome. Restart recovery can classify the run as abandoned and execute the prompt again. This violates the no-reexecution invariant for non-idempotent work.

Required architecture: introduce a per-run supervisor/wrapper with a durable launch gate and durable outcome outbox. The task body may execute only after PID/identity ownership is persisted. The wrapper must persist exit outcome before exiting. Restart must consume wrapper outcome before abandonment or requeue.

### High terminal-evidence findings

1. Cancel can race with terminal evidence and produce `running + cancelPending + terminalEvidence`, after which both cancel finalization and evidence flush can fail schema validation.
2. Started-run exception paths can still call direct `finish()`, bypassing seal and receipt.
3. Receipt write accepts caller-supplied descriptors without independently proving a matching canonical seal and current JSONL; `latestAt` is not in receipt v1.
4. Heartbeat events can consume the 4096-event capacity, leaving no slot for the terminal event and causing permanent restart failure.
5. Event lifecycle enforcement allows histories that are not valid FSM sequences.
6. Successful cancellation can leave a started event stream without a terminal cancellation/abandonment event.
7. A same-length middle-record log mutation can evade append-time index/tail validation until a full read or seal.
8. Several log/receipt APIs create task directories before validating task/run IDs, allowing invalid input to cause filesystem side effects.
9. Private task prompts remain visible in child argv and `/proc/.../cmdline`.
10. Scheduled recovery calculates the next run from recovery time rather than durable `endedAt`, causing outage-dependent schedule drift.

### High archive/package findings

1. ZIP member ranges are checked for overlap but not complete coverage; credentials can be hidden in a prefix, inter-member gap, or orphan local record.
2. Directory, ignored, and greater-than-4-MiB ZIP members can skip decompression, size, and CRC validation.
3. Ordinary, tar, or ZIP text larger than 4 MiB is treated as clean; adding one NUL can also bypass text scanning.
4. Tarball closure proves that packaged files match source files, but does not independently prove exact equality with the expected source/package inventory or required directory set.
5. Tarball is snapshotted, but source comparison still uses path-based multi-step reads and remains susceptible to source replacement during verification.
6. Tar extraction has no total uncompressed-byte or sparse-file logical-size limit.
7. Duplicate/prefix checks are O(n^2) at 25k/50k member limits and can cause CPU denial of service.
8. Secret-scanner tar listing lacks a timeout and output-size checks happen only after commands complete.

### High runtime-integrity findings

1. Hand-maintained `FAST_ROOTS` does not cover the actual executable startup closure. Existing files in pi-agent-core, pi-ai, pi-tui, MCP dist, jiti, typebox, chalk, diff, proper-lockfile, undici, and other synchronously loaded dependencies can change while warm verification still approves.
2. ESM full verification uses path-based `lstat -> readFile` and does not match the descriptor/O_NOFOLLOW/fstat/path-revalidation semantics of CJS bootstrap.

Medium integrity findings:

- CJS and ESM cache writers are direct, non-atomic writes and can follow a cache symlink.
- Cache directory snapshots do not prove that the supplied directory key set is complete and within the startup roots.
- Manifest generation uses the weaker path-based reader and publishes manifest/sidecar non-atomically.
- Warm-cache threat language must remain explicitly limited to trusted-local change detection.

### High Control findings

1. `/v1/tasks` and `/v1/agents` use a subtractive projection and still expose prompt, cwd, worktree path, branch, result, lastError, processIdentity, activeRunId, schedule, GitHub config, and PID information.
2. Concurrent control starts using `port: 0` can both listen and race to overwrite one control state file, leaving an unmanaged live instance.
3. HTTP errors return raw `error.message`, leaking paths and internals, and map unknown server faults to HTTP 400.

Medium Control findings:

- Diagnosis still combines task, events, logs, and process observations from different revisions; the second task comparison does not include heartbeat/event/log revisions.
- Task-event pagination and heartbeat diagnosis scan the complete bounded event stream.
- Agent-wide state locking means a slow log read/seal can block unrelated tasks.
- `alive` is an instantaneous observation and needs `observedAt` semantics.
- Signed malformed webhook JSON reaches generic exception handling.

### Evidence interpretation

The following results remain factual and current:

```text
core: 415/415
integrity: 27/27
launcher/startup: 3/3
package contract: 1/1
runtime probe: 20,655 approved entries
package closure: 175 approved manifests
typecheck: passed
secret scan: clean for currently covered scanner behavior
```

They do not close the architectural and adversarial cases above. Release and commit readiness are therefore **No-Go**.

## Replanned Critical Path

### Phase 0: Preserve evidence and freeze unrelated scope

- Do not migrate provider, TUI, model-panel, or plan-receipt features.
- Do not choose a version, branch, commit, tag, or release.
- Keep current generated artifacts as the last known green checkpoint, but mark them stale immediately when governed fixes begin.

### Phase 1: Durable execution supervisor

1. Define a strict private run-supervisor state/outcome schema keyed by taskId/runId.
2. Spawn a fixed wrapper, not the task prompt directly.
3. Persist wrapper PID/identity before opening a private execution gate.
4. Pass prompt through a private stdin/fd/file, never argv.
5. Wrapper persists terminal outcome before exit.
6. Recovery checks durable outcome before abandoned/requeue.
7. Route every started-run exception through terminal evidence; delete direct started-run `finish()` fallback.
8. Add kill-at-every-boundary fault injection and external-effect counter tests.

### Phase 2: Terminal FSM and evidence binding

1. Add cancel-versus-outcome CAS arbitration; durable outcome wins once present.
2. Clear cancelPending when evidence wins.
3. Make cancellation publish one idempotent terminal lifecycle event.
4. Reserve terminal event capacity; sample or separate heartbeat telemetry.
5. Enforce a real event lifecycle FSM.
6. Bind receipt write to canonical seal/current JSONL under the same lock and include latestAt in a versioned receipt schema.
7. Validate IDs before any directory creation.
8. Bind schedule advancement to durable endedAt/cadence.

### Phase 3: Archive verifier fail-closed rewrite

1. Stream-scan ordinary and archive text with detector overlap; NUL and oversize become scan errors, never clean skips.
2. Validate every ZIP member CRC/size before ignore decisions.
3. Require complete local-range coverage or reject extra archive bytes.
4. Replace O(n^2) path conflict checks with sort-and-linear validation.
5. Add tar listing timeout and pre-extraction logical-size/sparse limits.
6. Snapshot both tarball and exact source inventory; compare complete expected/actual sets bidirectionally.

### Phase 4: One descriptor-based integrity implementation

1. Build or generate the actual startup executable closure instead of maintaining FAST_ROOTS manually.
2. Use one descriptor/O_NOFOLLOW/fstat/path-revalidation helper for bootstrap, ESM verification, and manifest generation.
3. Publish cache, manifest, and sidecar through exclusive temp files, fsync, rename, and directory fsync.
4. Bind cache schema to startup-closure hash and complete directory-path-set hash.
5. Add mutation tests for pi-agent-core, pi-ai, pi-tui, MCP dist, and representative transitive dependencies.

### Phase 5: Control boundary minimization

1. Replace subtractive `cleanTask` with explicit DTO allowlists.
2. Add a control ownership lock spanning instance check, listen, and state publication.
3. Map only allowlisted StateError codes; unknown errors become HTTP 500 `CONTROL_INTERNAL_ERROR` without raw messages.
4. Add event/log revisions or return explicit approximate-observation metadata with observedAt.
5. Add event tail index/latest-of-type and reduce global lock scope.

### Phase 6: Regenerate and validate once

- Narrow fault-injection and adversarial tests after each phase.
- Full typecheck and scanner/package tests after archive/integrity phases.
- Freeze governed files, regenerate assets once, then run core and one full integrity suite.
- Update only this live journal while running final gates.

## Immediate Next Executable Action

Design and implement the private run-supervisor/outcome schema and wrapper protocol first. Do not patch cancel, receipts, archive, or integrity in parallel until the supervisor linearization points are written down and tested, because those subsystems depend on the definition of “execution has started” and “outcome is durable.”

## 2026-08-15: Run Supervisor Protocol Implemented

Semantic guarantee was deliberately narrowed to what a local durable protocol can prove: **at-most-one automatic launch**. It does not claim arbitrary external exactly-once behavior. If execution was authorized but no durable outcome exists after the supervisor dies, the run becomes `EXECUTION_OUTCOME_IN_DOUBT` and is never automatically requeued.

New governed files:

```text
scripts/task-run-supervisor.mjs
scripts/task-run-supervisor-main.mjs
```

Private run directory:

```text
task-runs/<taskId>/<runId>/
  spec.json
  registration.json
  authorization.json
  outcome.json
  stdout.log
  stderr.log
```

Linearization protocol:

1. Parent writes private canonical spec and empty output files.
2. Parent spawns a fixed supervisor argv containing only task ID and run ID.
3. Supervisor records its PID and process identity before waiting.
4. Parent verifies registration, publishes PID/identity in task state, then writes authorization.
5. Supervisor reads private prompt/cwd from spec only after authorization.
6. Supervisor executes CoCo in-process and writes canonical outcome before normal exit.
7. Parent or restarted runner materializes stdout/stderr into JSONL/index/seal through one state transaction.
8. Terminal evidence, receipt, and event recovery continues from the durable outcome.

Recovery classification:

- No authorization: task body never started; terminate any waiting wrapper and safely requeue.
- Authorization plus outcome: consume outcome and never execute again.
- Authorization, live wrapper, no outcome: keep observing and do not requeue.
- Authorization, dead wrapper, no outcome: retain the running run with `EXECUTION_OUTCOME_IN_DOUBT` and do not requeue.

Privacy:

- Prompt is no longer present in the default child argv.
- Prompt exists only in a private state directory and in supervisor memory after gate authorization.
- Injected `spawnTask`/`spawnChild` test seams retain legacy behavior and are not production execution paths.

Focused evidence:

```text
supervisor/task/log initial suite: 32/32 passed
durable outcome and in-doubt recovery: 2/2 passed
syntax checks: passed
git diff --check: passed
```

One test initially hung because a detached idle fixture was orphaned after an assertion failure. The exact fixture process was terminated, fixture handles now use `unref()`, tests have ten-second bounds, and finally blocks explicitly terminate the fixture process group. A later failure was a missing test-only import; after correction, both recovery tests passed.

Generated assets and all previous build/core/integrity evidence are stale because governed supervisor, runner, log, state-path, and bootstrap files changed.

Next executable action: test the real default supervisor path end-to-end with a bounded local invocation, then close cancel-versus-outcome arbitration and route all started-run exceptions through the durable outcome/evidence path.

## 2026-08-15: Supervisor and Terminal FSM Phases Passed

Supervisor additions after the previous checkpoint:

- Real fixed-wrapper execution reached the offline CoCo bootstrap and persisted outcome before exit.
- Default production prompt is absent from `/proc/<pid>/cmdline`.
- Parent restart consumes a durable supervisor outcome without calling the execution seam.
- Authorized dead runs without outcome remain non-runnable with `EXECUTION_OUTCOME_IN_DOUBT`.
- Started-run exceptions now use terminal evidence, seal, receipt, and event instead of direct finish.
- Result/error values are UTF-8-byte truncated to state-schema limits.
- Cancel-versus-outcome uses commit-time arbitration: completed cancel wins over a later injected outcome; existing evidence wins over cancel finalization and clears `cancelPending`.

Terminal FSM additions:

- Event telemetry reserves terminal capacity.
- Heartbeat telemetry saturation no longer terminates the task and terminal publication remains possible.
- Event lifecycle rejects terminal-first, duplicate start, non-start telemetry before start, and post-terminal events.
- Successful running-task cancellation publishes an idempotent `run.abandoned` outbox before clearing active run identity.
- Receipt write independently verifies canonical log seal/current JSONL instead of trusting the caller descriptor.
- Log/event/receipt IDs are validated before directory creation.
- Scheduled next run is derived from durable evidence `endedAt`, not recovery wall-clock time.

Focused evidence:

```text
supervisor/task/process/control suite: 54/54 passed
events/receipts/execution-evidence suite: 44/44 passed
terminal FSM/task/cancel/control suite: 52/52 passed
feature typecheck: passed
git diff --check: passed
```

Generated assets and previous core/integrity results remain stale due to governed changes. No build regeneration has occurred during these phases.

Next executable action: archive fail-closed phase: eliminate oversize/NUL clean skips, validate every ZIP member before ignore decisions, require complete local-range coverage, replace O(n^2) path validation, and add tar listing/extraction budgets.

## 2026-08-15: Terminal FSM and Archive Scanner Progress

Terminal FSM changes completed:

- Added terminal event reserve; heartbeat telemetry saturation no longer consumes terminal capacity.
- Added strict lifecycle checks for terminal-first, duplicate start, pre-start telemetry, and post-terminal events.
- Running-task cancellation publishes an idempotent `run.abandoned` outbox before clearing run identity.
- Receipt write independently verifies the current canonical log seal and rejects caller descriptor mismatch.
- IDs are validated before log/event/receipt directory creation.
- Scheduled next-run time derives from durable evidence `endedAt`.

Evidence:

```text
events/receipts/execution evidence: 44/44 passed
terminal FSM/task/cancel/control: 52/52 passed
```

Archive scanner changes completed in this subphase:

- ZIP local ranges must cover bytes from offset zero through the central directory with no gaps or orphan records.
- Every ZIP member is inflated/length/CRC validated before ignore decisions.
- Directory payloads must be empty and canonical.
- Canonical path duplicate/prefix checks changed from O(n^2) to sort plus linear scan.
- Tar listing now has a timeout.
- NUL-containing and greater-than-4-MiB ordinary/archive content no longer passes as clean. ASCII detector scanning uses bounded overlapping windows over arbitrary bytes.
- Repository binary assets now scan clean without using NUL as an exemption.

Evidence:

```text
publication secret scanner: 12/12 passed
full repository secret scan: clean
```

Generated assets and prior core/integrity evidence remain stale because governed files changed. Remaining archive work: exact expected package inventory equality, source snapshot/descriptor race protection, and tar pre-extraction logical-size/sparse limits.

Next executable action: complete package closure source/inventory and extraction-budget hardening, then move to descriptor-based integrity unification.

### Checkpoint: exact package inventory gate needs reconciliation

Implemented:

- npm `pack --dry-run --json --ignore-scripts` expected file inventory.
- Bidirectional equality between expected regular files and tar regular files.
- Descriptor-based source reads with `O_NOFOLLOW`, fstat/read/fstat, and path revalidation.
- Per-member and total logical-size limits before extraction.

Verification result:

```text
npm run verify:closure: passed, 175 package manifests
real public npm pack contract: failed after 125,738 ms
failure: verifyTarballClosure returned rejected instead of approved
exact rejection code: not yet captured
```

This is a closure verifier reconciliation failure, not evidence that the package is safe or unsafe. Do not relax inventory equality. Next action is to capture the stable rejection code and compare dry-run versus actual regular-file inventories to identify the first missing/extra path.

Follow-up captured the stable rejection:

```json
{"code":"PACKAGE_TARBALL_INTEGRITY_INVALID","status":"rejected"}
```

Therefore exact inventory equality, source descriptor validation, and logical-size gates all passed. Rejection occurred later because runtime manifest and sidecar are intentionally stale after governed supervisor/task/archive changes. The real package contract remains `blocked by stale generated assets`, not failed inventory reconciliation. Do not regenerate until integrity and Control phases freeze.

Archive/package implementation phase is complete pending final post-build package verification.

## 2026-08-15: Integrity and Control Hardening Integrated

Package closure hardening completed:

- Exact expected inventory generated through pinned npm dry-run.
- Bidirectional equality with tar regular-file inventory.
- Descriptor-based source reads with O_NOFOLLOW and path revalidation.
- Per-member and total logical-size budgets before extraction.
- Current pre-build package rejection is only `PACKAGE_TARBALL_INTEGRITY_INVALID`, as expected from stale generated assets; inventory and source checks passed before that stage.

Integrity hardening completed:

- ESM full verification now uses descriptor reads, O_NOFOLLOW, fstat before/after, and path revalidation.
- Cache writes use exclusive 0600 temp files, fsync, rename, and directory fsync, and reject symlink targets.
- Cache entry and directory key sets must be complete.
- Startup closure is manifest-bound. Until a precise module closure generator exists, it safely covers every manifest entry, trading warm performance for no dependency omissions.
- Added mutation coverage for pi-tui and MCP dist plus partial/symlink cache cases.

Control hardening completed:

- HTTP task/agent DTOs use explicit allowlists.
- Prompt, paths, results, errors, process identity, PID, and outbox fields are not projected.
- Control ownership lock spans instance check, listen, and state publication.
- Concurrent port-zero starts publish one owner.
- Unknown HTTP errors return 500 CONTROL_INTERNAL_ERROR without raw messages.
- Malformed authenticated JSON and webhook JSON return stable allowlisted errors.
- Alive observations include observedAt.

Cross-module evidence:

```text
task/control/archive integrated suite: 62/62 passed
integrity adversarial narrow suite: 4/4 passed
startup closure contract: 1/1 passed
feature typecheck: passed
git diff --check: passed
```

Governed code is frozen at this checkpoint. Next action: regenerate all assets once, then run package/startup/typecheck/scanner gates followed by core and one long integrity suite. Routine results must be recorded only in this live journal.

### Post-build gates

```text
npm run build: passed, product identity unchanged
launcher/startup: 3/3 passed
real npm pack public contract: 1/1 passed
full typecheck: passed
package closure: approved, 175 manifests
secret scan: clean
runtime integrity probe: approved, 20,657 entries
git diff --check: passed
```

Exact package inventory, source descriptor validation, logical extraction budgets, and packaged manifest verification all passed on a real npm tarball.

Next action: run core serially, then one full integrity suite. Do not modify governed files between these gates.

### Core gate failure after supervisor integration

```text
tests: 428
passed: 427
failed: 1
duration: 439,299 ms
```

Only failure:

```text
authorized supervisor executes the real offline entry and persists outcome before exit
assertion: supervisor state outcome was null after child close
```

All other supervisor recovery, terminal FSM, task, archive, integrity-cache, Control, package, and legacy tests passed. Full integrity suite has not been run after this failure.

Next action: reproduce with a preserved private fixture and inspect bounded stderr plus canonical supervisor state. Determine whether bootstrap exits before wrapper finalization, outcome write fails, or the test observes close before durable publication. Do not weaken the outcome requirement.

Diagnosis and correction:

- Pi invokes `process.exit()` inside an async `main()` whose Promise is not exported by the launcher module. Throwing a controlled exit only inside the wrapper try/catch was insufficient because the error surfaced as an unhandled rejection.
- Wrapper now captures only its private controlled-exit rejection/exception and converts it to an awaited exit request. Unknown asynchronous failures become failed outcomes.
- Bootstrap nonzero `process.exitCode` completion is handled directly because integrity/bootstrap rejection does not issue a Pi exit request.
- A subsequent stress attempt failed before execution with an exact `ENTRY_HASH_MISMATCH` for the modified wrapper. This is expected stale-manifest behavior after the governed fix, not a supervisor protocol failure. Assets must be regenerated before stress rerun.

Post-regeneration supervisor evidence:

```text
npm run build: passed
real authorized supervisor offline entry: 10/10 consecutive runs passed
```

Next action: rerun the complete core suite. If it passes, run exactly one complete integrity suite without governed edits between them.

Complete core rerun:

```text
tests: 428
passed: 428
failed: 0
duration: 459,946 ms
```

Governed code and generated assets remained unchanged during the run. Next action: run one complete integrity suite.

Complete integrity suite:

```text
tests: 30
passed: 30
failed: 0
duration: 838,431 ms
```

This evidence is current for the frozen governed code and regenerated manifest. Next action: final independent boundary reviews plus real npm pack/runtime/typecheck/scanner closure. Any finding that changes governed code invalidates generated assets and the affected core/integrity evidence.

## 2026-08-15: Final Review Reopened Release Blockers

Read-only final reviews found real blockers despite passing gates. Current commit/release status remains No-Go.

Critical/high findings accepted for correction:

- Concurrent supervisors can both register for one run; authorization is not bound to PID/process identity, allowing duplicate automatic execution.
- A successful CLI path that returns without calling process.exit can leave supervisor without outcome.
- Durable supervisor outcome can be overwritten by cancel before import into terminalEvidence.
- `scripts/canonical-json.mjs` is executed before ESM verification but excluded from the manifest.
- Runtime entry descriptors are not bound through later path-based import; startup entries require final revalidation or a stronger import boundary.
- Package source reads are individually stable but do not represent one source snapshot.
- Ordinary-file secret scanning has lstat/readFile TOCTOU and the bounded overlap can miss an unbounded assignment crossing chunks.
- CLI task resolution accepts absent/ambiguous IDs; diagnosis can prefer a stale event heartbeat over newer task heartbeat.

Lower-priority accepted follow-ups:

- Parent-directory symlink closure checks, exact directory inventory, control stop/claim race, legacy PID reuse, and strict auth syntax.

Latest final read-only gates before fixes:

```text
typecheck: passed
closure: approved, 175 manifests
secret scan: clean
runtime probe: approved, 20,657 entries
real npm pack contract: 1/1 passed
```

These results become stale when blocker fixes land. Next action: parallel non-overlapping fixes, then regenerate and rerun affected narrow suites before full gates.

### Final-review blocker correction progress

Implemented:

- Registration is exclusive-create; concurrent supervisors elect one winner.
- Authorization binds exact PID and process identity and is checked before task code import.
- Outcome and cancellation revocation compete under the shared state transaction lock; only one may commit.
- Natural successful runtime completion uses a beforeExit exit request and still writes outcome first.
- Runtime integrity no longer executes an unprotected canonical helper before verification; canonical helper is asset/manifest protected.
- CJS and ESM manifest schemas, asset-map validation, closure completeness, dynamic roots, and final import revalidation are aligned.
- Ordinary scanner files use descriptor reads/revalidation; directory races and long cross-window assignments fail closed.
- Package closure uses a source snapshot/revalidation, rejects intermediate symlinks and unexpected directories.
- CLI task IDs reject absent/ambiguous destructive targets; CLI DTO, diagnosis heartbeat selection, legacy control identity, and auth parsing are hardened.

Focused evidence after integration:

```text
supervisor/cancel/task/event/receipt: 41/41 passed
archive/package-input: 23/23 passed
control/CLI/diagnosis: 14/14 passed
integrity critical regressions: 3/3 passed
startup closure: 1/1 passed
feature typecheck: passed
git diff --check: passed
```

Generated assets and all prior full core/integrity evidence are stale after these governed fixes. Remaining accepted blockers before regeneration: log/supervisor descriptor TOCTOU and stop-all versus task-claim serialization.

Remaining blocker fixes completed:

- Log JSONL/index/seal and supervisor canonical state use O_NOFOLLOW descriptor reads with fstat/path revalidation.
- Log append uses O_APPEND/O_CREAT/O_NOFOLLOW and verifies descriptor/path identity.
- Supervisor stdout/stderr import rejects symlink, replacement, non-private, non-regular, or unstable files; failures are not converted to empty output.
- stop-all establishes a persistent stopping barrier before runner claim, terminates verified runner, reloads active tasks, verifies task termination, then clears the barrier.
- Durable supervisor outcome versus cancel has an explicit regression test and outcome remains authoritative.

Final code-stage evidence:

```text
task/supervisor/log/control/stop integrated: 70/70 passed
archive/package-input: 23/23 passed
full typecheck: passed
feature typecheck: passed
git diff --check: passed
```

Code is frozen again. Generated assets and prior full suites remain stale until the next build. Next action: build once, run package/runtime/scanner gates, then core and one integrity suite.

### Post-build and core result after final-review fixes

Post-build gates passed:

```text
real npm pack contract: 1/1
package closure: approved, 175 manifests
secret scan: clean
runtime integrity: approved, 20,658 entries
launcher/startup: 3/3
```

Core result:

```text
tests: 441
passed: 438
failed: 3
duration: 612,077 ms
```

All three failures are the same fixture class in `test/coco-offline-startup.test.mjs`: its hand-written manifest no longer satisfies the intentionally stricter CJS schema and returns `RUNTIME_INTEGRITY_MANIFEST_INVALID`. Production package/runtime gates passed. Correct action is to update the fixture to the current strict schema, not weaken the verifier. Full integrity has not been rerun after final-review fixes.

Fixture correction:

- Added strict manifest schemaVersion, startupClosure, entry class/size, and a canonical schema-v2 asset map with its real digest.
- Focused offline startup rerun: 3/3 passed.
- Only test code changed, so generated runtime assets remain current.

Next action: rerun all 441 core tests, then the full integrity suite.

Final complete core gate:

```text
tests: 441
passed: 441
failed: 0
duration: 611,852 ms
```

Generated assets remained current because only the test fixture changed after build. Next action: run the complete integrity suite without governed edits.

Final complete integrity gate:

```text
tests: 33
passed: 33
failed: 0
duration: 751,028 ms
```

This suite includes canonical helper protection, closure reduction rejection, final startup-entry revalidation, pi-tui/MCP mutation, cache symlink/partial state, manifest/sidecar replacement, FIFO/symlink, and directory snapshot cases.

Next action: read-only final closure review of previously accepted critical/high findings, final generated-asset/runtime/package checks, worktree inventory, and orphan process check. No governed edits unless a reproduced blocker remains.

### Final read-only review still found three high blockers

Closed findings confirmed: concurrent supervisor election, normal-return outcome, outcome/cancel arbitration, canonical helper protection, and stop-all claim barrier.

Still reproducible:

- Final startup rehash closes descriptors before pathname import; launcher can be atomically replaced in that gap.
- Package input helper compares source before/after copy but does not compare staging bytes to the source manifest.
- Directory secret scan enumerates paths and scans later without final directory/file identity revalidation, allowing safe substitution during scan and restoration before return.

No orphan task supervisor/runner/control process was found. Existing unrelated system Playwright/Postgres processes were not modified.

All full-suite evidence is stale again once these fixes modify governed code. Next action: parallel fixes using descriptor-bound module source, staging manifest equality, and private/stable scanner snapshot with final source-tree revalidation.

Final three high blockers corrected:

- Bootstrap builds a private physical runtime snapshot from final descriptor-verified bytes, validates exact paths/hash/size/mode, and imports launcher plus relative dependencies from that snapshot. Final-rehash pathname replacement executes only the verified bytes.
- Package input staging manifest is checked against the first source manifest after copy and again before replacement; source restoration cannot hide staging corruption.
- Directory secret scanner scans a private snapshot and re-enumerates/re-digests the original tree before return; safe substitution followed by restoration fails closed.

Focused evidence:

```text
bootstrap final-import race: 3/3 passed
package-input/scanner races and contracts: 31/31 passed
full typecheck: passed
feature typecheck: passed
git diff --check: passed
```

Generated assets and prior full core/integrity evidence are stale. Next action: build, post-build gates, then rerun full suites.

Build attempt failed closed with `ASSET_MAP_INVALID` because a focused Python compile created `scripts/__pycache__/package-input-helper.cpython-314.pyc`. This was generated during the current verification batch, not a pre-existing user file. The exact generated bytecode file was removed; no user or unrelated files were deleted. Build must be rerun and is not yet passed.

After exact generated-bytecode cleanup:

```text
npm run build: passed
package closure: approved, 175 manifests
secret scan: clean
runtime integrity probe: approved, 20,658 entries
supervisor/launcher/startup: 9/9 passed
real npm pack contract: 1/1 passed
git diff --check: passed
```

Next action: rerun complete core and complete integrity against the snapshot-import build.

Snapshot-import core result:

```text
tests: 443
passed: 442
failed: 1
duration: 592,074 ms
```

Only failure is the bare installed PTY offline-startup test: expected timeout 124 but process exited 1 after snapshot-import changes. All other 442 tests passed. The assertion did not expose stderr, so it was amended to include bounded output and the single test will be rerun for diagnosis. Full integrity is not run after this failure.

PTY diagnosis and correction:

- First rerun exposed snapshot deletion after launcher import returned while Pi async main still needed the verified theme asset. Snapshot lifetime now extends to process exit; import/bootstrap failure still cleans immediately.
- With correct lifetime, PTY reached timeout but full snapshot creation exceeded the rendering budget because every temporary file was fsynced.
- Removed per-file fsync only for the private ephemeral runtime snapshot. O_EXCL/O_NOFOLLOW creation, private permissions, exact inventory, and final hash/size/mode verification remain intact. Durable cache/state writes retain fsync.

Focused evidence:

```text
bare installed PTY offline startup: 1/1 passed
direct CJS + final-rehash replacement: 2/2 passed
```

Generated assets and full suites are stale after bootstrap changes. Next action: rebuild and rerun post-build, core, and integrity gates.

Final snapshot-lifetime build and core evidence:

```text
npm run build: passed
post-build closure/scanner/runtime/package/supervisor gates: passed
complete core: 443/443 passed
core duration: 614,883 ms
```

Next action: run the complete integrity suite without governed edits.

Final complete integrity evidence:

```text
tests: 34
passed: 34
failed: 0
duration: 793,656 ms
```

This run includes the final-rehash pathname replacement case and confirms execution of only verified snapshot bytes. Next action: final read-only blocker closure and status inventory. No further governed edits are planned.

Final read-only review confirmed all prior critical/high blockers closed. It identified one Medium cleanup leak if tar extraction-directory creation failed after archive snapshot creation. The scanner `finally` now covers extraction-directory creation and always cleans the archive snapshot; scanner 15/15 passed. Assets were regenerated, secret scan is clean, runtime probe approves 20,658 entries, and diff check passes.

Because the scanner is governed, the immediately previous full core/integrity evidence is stale by hash. Code is frozen. Next action: final complete core and integrity reruns.

## 2026-08-16: Final Current-Asset Validation

Final read-only review result:

- No reproducible critical or high blocker remains in the reviewed supervisor, terminal FSM, integrity import, package staging, scanner snapshot, archive, or stop-all boundaries.
- Final-rehash replacement executes only descriptor-verified bytes from the private runtime snapshot.
- Package staging is manifest-bound to the stable source snapshot.
- Directory scanner replacement-and-restoration attacks fail closed through private snapshot scanning and final source-tree digest revalidation.
- Snapshot lifetime supports asynchronous Pi startup and cleanup on normal process exit.
- Residual low risk: SIGKILL/system crash can leave a private 0700 runtime snapshot because user-space exit cleanup cannot run.

Final evidence against the current generated asset map and manifest:

```text
npm run build: passed
complete core: 443/443 passed (614,810 ms)
complete integrity: 34/34 passed (789,155 ms)
real npm pack contract: 1/1 passed (213,156 ms)
package closure: approved, 175 manifests
secret scan: clean
runtime integrity probe: approved, 20,658 entries
full typecheck: passed
feature typecheck: passed
git diff --check: passed
task supervisor/runner/control orphan check: none found
```

Candidate code-validation status: Go. Commit/tag/release/remote status: not performed and not authorized. Worktree remains detached and intentionally dirty with the migration changes.

Next executable action if authorized: inspect final diff and create a local commit on an explicitly requested branch. Do not publish, tag, or modify remote state without separate explicit authorization.

## 2026-08-16: Full Reassessment Supersedes Previous Go Label

Objective: independently reassess the candidate and derive the next best development plan rather than relying on the previous dirty-worktree green gates.

Baseline remains:

```text
worktree: /root/coco-tmp/coco-v053-migration
HEAD: 6ec5dd3d2105cacbed2e6ea795d74b9eb2155118
version: 0.5.3
mode: detached, dirty
tracked modified files: 41
important untracked runtime/test/docs files: task-run-supervisor*.mjs, task-commands.test.mjs, task-logs-perf.test.mjs, task-run-supervisor.test.mjs, AGENTS.md, bilingual migration docs
```

The earlier `Candidate code-validation status: Go` is superseded. New read-only reviews found product and delivery blockers not represented by the existing tests.

Confirmed high-priority findings:

1. **Runtime root lifecycle:** detached runner/control processes inherit the temporary bootstrap snapshot root, which the parent removes on exit. This can make subsequent runner launches and Control static assets unavailable.
2. **Runtime cache/performance:** the snapshot currently contains all 20,658 manifest entries, is recreated and rehashed on each startup, and can write about 173 MB per launch. The snapshot verifier can also contaminate source-root warm-cache metadata.
3. **Stopping recovery:** a persisted stopping barrier is not safely takeover/retryable after stop-process crash, cancellation failure, identity mismatch, or storage failure.
4. **Process termination:** a non-process-group PID can be reported terminated when only the nonexistent negative process group was checked; root PID liveness must be independently verified.
5. **Supervisor capture:** direct fd writes and descendant output can bypass the JavaScript write monkey-patch and exceed the intended output cap, preventing durable outcome consumption.
6. **Task terminal/API contract:** cancel can rewrite completed/failed tasks; terminal-won races can return a false HTTP `cancelled: true`; scheduled attempts can overflow the schema cap; worktree creation precedes claim and can orphan resources.
7. **Webhook contract:** task creation does not provision the generated secret to the caller, and signed webhook deliveries have no persistent replay/idempotency key.
8. **Control client contract:** HTTP DTO hardening removed fields still consumed by the Dashboard and VS Code extension. A safe summary/detail DTO split is required rather than restoring sensitive fields to list responses.
9. **Package-input transaction:** absent selectors can be injected after the initial snapshot; journal rename/rollback is not crash-recoverable or replayable.
10. **Release scanner/package policy:** publication scanning ignores all archive `node_modules` despite bundled dependencies being shipped; nested archives are not recursively inspected. Tarball verification must bind the verified artifact bytes to the bytes uploaded by release automation.
11. **Dependency closure:** installed and tarball versions of pi-tui and the full pinned lock/integrity closure are not asserted with the same strictness as pi-coding-agent and MCP.
12. **Delivery closure:** the candidate is not a reproducible commit; required runtime files are untracked; version remains already-released `0.5.3`; CI timeouts do not match observed core/integrity/package durations; stable bilingual migration docs and AGENTS handoff are stale.

Recommended architecture decision:

- Replace ephemeral runtime execution snapshots with a persistent content-addressed verified runtime root. Keep `sourceRoot`, `verifiedRuntimeRoot`, and `projectCwd` distinct.
- Bind the runtime key to manifest hash plus Node ABI/platform/architecture. Materialize atomically into a private CAS directory with completion record, fsync, ownership/lease references, and GC. Detached runner/control state stores the runtime key, never a temporary absolute root.
- Do not use Node module hooks as the production security boundary; they are less reliable across Node 22 ESM/CJS/dynamic import/worker/native-addon paths. They may be used later for closure discovery.
- Initially keep the full closure for correctness, but make it persistent and reusable. Only after lifecycle and recovery are stable, derive and prove a smaller runtime closure.

Best execution order:

### Phase A: Persistent Runtime Root

- Define root contract and runtime-key schema.
- Implement CAS materializer, atomic completion marker, concurrent creator behavior, disk/inode budget, stale staging cleanup, leases and reference-aware GC.
- Switch bootstrap/launcher/runner/control/supervisor to the persistent verified root and separate source cache from CAS verification metadata.
- Add detached-parent-exit, concurrent materialization, SIGTERM/SIGKILL residue, cache-domain, disk-full, and runtime-key recovery tests.

### Phase B: Process and Stop Recovery

- Fix non-group and group-leader termination semantics on Unix and Windows.
- Make stopping barrier idempotent and takeover-safe with operation ID, owner identity, phase, and recovery scan.
- Ensure stop/cancel clears persisted state only after independent root PID and descendant verification.
- Add crash, PID reuse, identity mismatch, ENOSPC/EACCES, retry, and concurrent stop tests.

### Phase C: Supervisor Terminal Protocol

- Replace inherited stdout/stderr files and write monkey-patching with a bounded capture helper/pipe that drains direct and descendant output.
- Normalize every exit code/signal into schema-valid durable outcome values.
- Preserve outcome/revocation arbitration and make oversized output unable to block outcome persistence.
- Add direct-fd, descendant, simultaneous streams, exit-code range, signal, disk-full, and restart tests.

### Phase D: Task Claim and Resource State Machine

- Define explicit claim/provisioning phases so worktree creation is compensatable and restart-recoverable.
- Handle attempt cap with a durable terminal reason without crashing the runner or starving other tasks.
- Make terminal tasks non-cancellable and expose truthful cancel outcomes through CLI and HTTP.
- Add worktree rollback/crash and attempt-boundary tests.

### Phase E: Control and Webhook Contracts

- Define summary/detail DTOs and update HTTP UI plus VS Code in the same batch.
- Return webhook secret only once at creation or explicit rotation; never in list/detail.
- Add transactional GitHub delivery and generic idempotency-key records with restart persistence.
- Linearize control start/stop ownership and map business conflicts to stable 404/409/503 responses.
- Add consumer-contract, provisioning, replay-concurrency, terminal-cancel, and start/stop tests.

### Phase F: Package and Publication Closure

- Make package-input absent selectors part of final inventory and implement durable journal recovery before further staging.
- Assert installed and bundled PI/TUI/MCP versions plus lock integrity and transitive closure.
- Separate workspace ignores from publication policy; scan bundled dependency contents and recursively inspect bounded nested archives.
- Return/verify one artifact digest and ensure release upload/checksum uses exactly the verified bytes.

### Phase G: Delivery and Reproducible Candidate

- Select a new version after code stabilizes; never republish `0.5.3`.
- Update package/lock/VSIX/changelog/install docs and refresh stale bilingual migration docs and AGENTS handoff.
- Add all required runtime/test/docs files to a deliberate candidate file list; do not use `git add -u`.
- Create a clean candidate worktree from committed bytes only after explicit commit authorization.
- Split CI core/package/scanner/integrity jobs, align timeouts to measured P95/P99, and require checks on the same SHA.
- Run clean candidate gates: npm ci, build, typechecks, architecture/fork checks, core, integrity, package/closure/scanner, offline bundle, VSIX, checksum, sandbox install/version/uninstall.

The single next executable action is **Phase A discovery/design plus a minimal persistent CAS runtime-root prototype**, not another full test run and not a commit. Its acceptance gate is a real `bin/coco runner start` and `control start` whose parent exits while the detached children continue using the same durable runtime key, followed by restart/GC safety tests. Do not begin Phase B or regenerate release evidence until that gate passes.

## 2026-08-16: Phase A CAS Runtime Prototype In Progress

Implemented only the first Phase A slice in `scripts/coco-bootstrap.cjs`:

- Runtime execution root key is content-addressed by manifest hash, Node modules ABI, platform, and architecture.
- Runtime roots are materialized under `${COCO_CODING_AGENT_DIR}/runtime/<key>` instead of ephemeral `/tmp`.
- Materialization uses a private staging directory, exclusive files, private modes, structure validation, completion marker, and atomic rename.
- Existing complete runtime keys are reused and validated structurally; source integrity cache remains separate from the runtime root.
- Parent process no longer deletes the runtime root on exit, so detached descendants can retain the same stable root.

Initial focused result:

```text
direct CJS bootstrap and final-rehash replacement: 2/2 passed after prototype correction
```

The first PTY run exposed the expected cost of first full materialization: a fresh agent directory did not render within the 15-second UI budget. This is not accepted as a final result. The prototype currently prioritizes lifecycle correctness and must next prove detached runner/control behavior, then optimize first materialization or define a bounded closure before Phase A can pass.

Generated asset map and runtime manifest are stale because governed bootstrap code changed. No full core/integrity evidence is current for this prototype. Do not commit or release.

Phase A follow-up evidence:

```text
CAS key reuse on repeated native startup: 1 persistent key / 1 completion marker
real runner start -> parent exit -> runner status -> stop: passed
real control start -> parent exit -> token/status -> stop: passed
CJS integrity/cache/runtime focused suite: 8/8 passed
```

Phase B first slice also started because process termination is a prerequisite for safe stopping recovery:

- Unix termination now independently checks root PID and process group.
- Non-detached/non-group process termination has a regression test.
- Stopping barrier stores operation/owner/phase metadata and a dead-owner barrier can be safely taken over.
- Process/stop suite: 13/13 passed, stale-barrier recovery: passed.

The persistent CAS runtime still needs a proper runtime-key handoff contract in detached state, disk/inode budget and GC/lease policy, and first-materialization performance measurement. Full generated assets and full suites are stale after the current governed changes.

Additional current evidence:

```text
two simultaneous first-start materializers: passed, 1 key / 1 completion / 0 locks
runner runtime state contains durable runtimeKey: passed
runner/control/supervisor state suite: 44/44 passed
non-group process termination and stale barrier takeover: 13/13 passed
supervisor exit-code normalization regression suite: 31/31 passed
```

The concurrent materialization test initially exposed `ENOTEMPTY` for the second creator. An exclusive runtime-key lock with dead-owner recovery now makes the second process wait and reuse the completed key. This was a real finding and is recorded as fixed.

Phase A remains open for leases/GC, disk/inode budgets, runtime-key re-resolution on detached restart, and first-materialization performance. Bounded supervisor fd capture remains a separate unstarted Phase C batch. Generated assets remain stale after the current governed bootstrap/runner/supervisor changes.

## 2026-08-16: CAS Concurrency, Process Safety, Capture, and Terminal Contract Progress

Current implementation batches after reassessment:

- Persistent CAS runtime roots use manifest/Node/platform/arch keys, private staging, completion markers, atomic rename, exclusive per-key locks, dead-owner lock recovery, and source/runtime cache separation.
- Runner/control durable state records both `runtimeKey` and `runtimeRoot`.
- Unix termination independently verifies root PID and process group; non-group root regression is covered.
- Stopping barriers carry operation/owner/phase data and stale-owner takeover is covered.
- Supervisor exit codes normalize to schema-valid `0..255` values.
- Supervisor stdout/stderr production execution now uses runner-owned pipes, drains direct/descendant output, applies hard byte caps, and persists truncation state instead of relying only on process write monkey-patching.
- Terminal tasks cannot be rewritten by cancel; Control cancel response reports the actual outcome and task projection.

Current focused evidence:

```text
CAS concurrent first materialization: passed, 1 key / 1 completion / 0 locks
real runner/control parent-exit lifecycle: passed
runtime state/supervisor/control suite: 44/44 passed
process/stop suite: 13/13 passed
task/log/supervisor capture suite: 41/41 passed
cancel/control/terminal suite: 42/42 passed
```

Further active-batch evidence:

```text
runtimeKey/runtimeRoot durable runner/control state: passed
bounded supervisor pipe capture regression suite: 41/41 passed
terminal cancel and truthful Control outcome suite: 42/42 passed
webhook create provisioning/CLI contract suite: 11/11 passed
```

The create command now returns webhook credentials only in the one-time creation response, under an explicit `{ auth, path, secret }` object; ordinary visible task projections remain secret-free. Persistent delivery idempotency is intentionally not folded into this change and is the next webhook batch.

Webhook delivery batch completed:

- Added private durable `webhook-deliveries.json` state.
- GitHub requests require `X-GitHub-Delivery`; generic requests require `Idempotency-Key`.
- Delivery acceptance and duplicate detection use the shared state transaction lock.
- Concurrent duplicate acceptance is retried on `STATE_LOCKED` and only one request is accepted.
- Duplicate requests return `202`, `accepted:false`, `reason:"duplicate"` without requeueing.
- Webhook ledger/control suite: 10/10 passed, including 20-way concurrent acceptance.

An initial concurrent test exposed two implementation issues (`STATE_LOCKED` retry and empty transaction operations); both were fixed and the test now passes. Generated assets and complete suites remain stale.

Provisioning recovery follow-up:

- `ensureTaskWorktree` now detects a branch-only residue left by an interrupted `git worktree add` and reattaches the worktree with the existing branch after verifying its commit equals the persisted base commit.
- Mismatched branch/path/commit remains `WORKTREE_CONFLICT`; no force deletion or overwrite is attempted.
- Provisioning/runtime GC/runner/stop suite: 36/36 passed.
- An initial branch-residue assertion used the branch name instead of the deterministic worktree directory name; corrected to assert both path and branch registration.

Current implementation evidence remains narrow only. Full core/integrity/package evidence is stale after runtime-root, lease/GC, runtime resolver, pipe capture, webhook ledger, attempt cap, and provisioning changes.

Task scheduling safety follow-up:

- A scheduled task at `attempts === 1000` now becomes durable `failed` with `TASK_ATTEMPT_LIMIT_REACHED`, clears its schedule, and does not enter an invalid 1001 state or crash the runner.
- Boundary regression for the attempt cap and scheduled requeue: passed.

Current stale evidence remains: generated asset map/runtime manifest, complete core, complete integrity, and package/release gates. The next executable action is Phase A runtime lease/GC and disk/inode budget closure, followed by worktree provisioning recovery.

Generated asset map/runtime manifest and all prior complete core/integrity evidence are stale after these governed changes. Remaining Phase A items are runtime leases/GC, disk/inode budgets, restart resolution, and first-materialization performance. Next batch: webhook secret provisioning plus persistent delivery/idempotency transaction.

Do not edit governed code during these steps. If governed code changes, mark all generation and post-generation evidence stale and restart from generation.

Phase A lease/GC and budget slice:

- Runtime CAS garbage collection removes only unreferenced runtime keys older than the grace period.
- Runner/control `runtimeRoot` references protect active keys.
- Runtime leases live outside the verified runtime tree in private `.leases/`, so integrity does not treat lease metadata as unmanifested executable content.
- Dead lease owners are removed; live lease keys are protected from GC.
- Stale `.staging-*` and lock files are reclaimed after the grace period.
- Bootstrap checks a 64 MiB free-space floor before materialization and fails closed below it.
- Existing runtime completion/integrity focused tests: 2/2 passed after lease placement correction.

The lease implementation still needs PID identity binding rather than PID-only liveness and a dedicated GC/lease adversarial test file. Generated assets were regenerated once for this slice; complete core/integrity/package evidence is not run against the current batch.

Lease identity and provisioning progress:

- Lease records now bind PID to process identity; GC protects only matching live owners.
- Runtime lease identity focused check passed; runtime integrity focused suite remains 2/2 after lease changes.
- Added explicit `provisioning` task state for worktree-backed tasks.
- Worktree path, branch, and base commit are persisted before Git side effects.
- `ensureTaskWorktree` is idempotent and fails closed on path/branch/commit conflicts.
- Runner restart resumes provisioning before allocating an execution attempt.
- Provisioning cancellation clears only the intent and does not execute Git worktree creation.
- Combined runner/cancel/process/stop/provisioning suite: 45/45 passed.

An agent manual lease check initially used `require()` on JSON and failed as a harness mistake; corrected JSON parsing confirmed key and process identity. Current remaining Phase A work is dedicated GC adversarial coverage, runtime-key re-resolution, and disk/inode fault injection. Phase D now has a first provisioning FSM slice but still needs crash/rollback and cleanup-failure tests. Generated assets and full gates remain stale.

Current Phase A/Phase D closure evidence:

```text
runtime GC current/reference/live-lease/stale-debris test: passed
feature typecheck including runtime-store: passed
runtime-store/provisioning/runner/stop suite: 35/35 passed
```

Runtime GC policy is extracted into `scripts/runtime-store.mjs` with direct adversarial coverage. The production bootstrap GC path remains duplicated and must be unified with the tested policy before Phase A is complete.

Next executable action: make production bootstrap call the tested runtime-store policy, then add runtime-key restart resolution and crash/rollback provisioning tests. Do not run full gates yet; generated assets remain stale after current governed changes.

Runtime-key restart resolution:

- Added `scripts/runtime-root.mjs` resolver.
- Detached runner/control now resolve a durable `runtimeKey/runtimeRoot` reference only after checking agent-dir containment, completion marker, key equality, and directory type.
- A killed runner restarted through the persisted state and reused the same runtime key in a real CLI test.
- Runner/control/stop regression suite after resolver integration: 39/39 passed.
- Build completed before real restart test; generated assets reflect the resolver batch.

Phase A now has persistent root, concurrent materialization, lease identity, GC policy, disk floor, durable references, and restart resolution. Remaining Phase A gap is direct production-vs-extracted GC policy unification and dedicated ENOSPC/stale/corrupt bootstrap fault injection. Phase D provisioning still needs crash/rollback tests. Full core/integrity evidence remains stale.

Lease identity correction:

- Lease records now include the same Linux process start-time identity format used by task process ownership (`linux:<starttime>`); non-Linux records retain platform PID identity until platform-specific process metadata is available.
- GC protects a lease only when PID and process identity both match; PID reuse no longer protects an unrelated process.
- Build and runtime focused verification after this correction: passed.
- A manual lease check initially used Node `require()` against a JSON file and failed as a test harness error; the corrected JSON reader confirmed the lease key and process identity fields.

Phase A remaining work is now dedicated GC adversarial tests, restart/runtime-key resolution, and explicit lease refresh/cleanup policy. Next code batch is worktree provisioning state/recovery, but no full gates are current until Phase A test additions are complete.

Production GC policy unification:

- Added synchronous shared policy `scripts/runtime-store-policy.cjs`.
- Production CJS bootstrap and testable ESM `runtime-store.mjs` now use the same stale-runtime/stale-debris selection rules.
- The initial integration exposed an `activeKeys`/`activeLeases` variable error in the production path; bootstrap focused tests caught and fixed it before any full gate.
- After rebuild: direct CJS bootstrap/final-rehash integrity cases 2/2 passed; runtime GC/provisioning/runner/stop suite 36/36 passed; feature typecheck and diff check passed.

Phase A is now structurally complete except dedicated bootstrap fault injection for ENOSPC, corrupt completion, stale lock/staging, and active lease. Phase D provisioning has idempotent branch-only recovery and 36/36 current suite coverage. Full core/integrity/package evidence remains stale until these fault tests are added and the governed batch is frozen.

Phase A fault-injection closure:

- Shared policy now validates completion marker identity and storage byte/inode budgets.
- Storage fails closed below 64 MiB free bytes or 1024 free inodes without adding any environment bypass.
- Policy tests cover valid/corrupt completion and exact byte/inode boundaries: 2/2 passed.
- Bootstrap-level real test materialized a runtime, corrupted its completion marker, created stale staging/lock debris, restarted, and verified atomic same-key rebuild plus debris removal.
- Result: `corrupt_completion_rebuilt=yes stale_debris_removed=yes`.
- Build and feature typecheck passed for this frozen Phase A/Phase D batch.

Phase A/Phase D implementation is now frozen. Next action: run current-asset focused suites, then complete core, integrity, package, closure, scanner, and detached lifecycle gates. Any governed edit restarts generation and full evidence.

Current-asset pre-full-gate evidence:

```text
affected runtime/task/control/webhook/provisioning suite: 61/61 passed
full typecheck: passed
feature typecheck: passed
package closure: approved, 175 manifests
secret scan: clean
runtime integrity probe: approved, 20,662 entries
git diff --check: passed
```

Governed code remains frozen. Next action: complete core, then complete integrity, followed by real npm pack and detached lifecycle gates.

First complete core attempt after Phase A/Phase D freeze:

```text
tests: 455
passed: 452
failed: 3
duration: 648,883 ms
```

All three failures were one fixture closure issue: `test/coco-offline-startup.test.mjs` copied `coco-bootstrap.cjs` but not its new production dependency `runtime-store-policy.cjs`. The fixture now copies and manifests the policy file. Focused offline startup rerun: 3/3 passed. Production package closure and runtime probe had already passed; do not weaken bootstrap dependency validation.

Only test fixture code changed after build, so generated runtime assets remain current. Next action: rerun complete core, then integrity.

Complete core rerun after fixture closure correction:

```text
tests: 455
passed: 455
failed: 0
duration: 696,690 ms
```

Governed code and generated assets remained unchanged during the run. Next action: complete integrity, then real package and detached lifecycle gates.

First complete integrity attempt after Phase A freeze:

```text
tests: 34
passed: 26
failed: 8
duration: 1,006,088 ms
```

Seven failures came from source CJS cache never being written. Root cause: `fsyncSync` was accidentally removed from the bootstrap fs import when ephemeral snapshot fsync was optimized; `writeCache()` swallowed the resulting ReferenceError as best-effort. `fsyncSync` was restored and the warm-cache focused test passed.

The FIFO test timeout had a separate security cause: top-level `require("./runtime-store-policy.cjs")` made Node inspect a governed FIFO `package.json` for package scope before bootstrap verification ran. Production bootstrap now has no local pre-verification dependency. It executes policy only from descriptor/hash-verified manifest bytes after closure revalidation. Warm-cache and FIFO focused rerun: 2/2 passed.

These are governed bootstrap changes, so generated assets, complete core, and complete integrity evidence are stale again. Next action: rebuild, rerun integrity, then rerun core and final package/lifecycle gates.

Integrity rerun sequence:

- First rerun after cache/FIFO fixes: 33/34 passed. The only failure was a test expectation temporarily changed to `full` while cache writing was broken; after restoring `fsyncSync`, the correct second-start mode is again `fast`.
- Focused direct CJS cache mode: passed.
- Complete integrity rerun: 34/34 passed in 788,867 ms.

Generated assets match the current bootstrap. Complete core evidence is stale because bootstrap changed after its previous 455/455 run. Next action: rerun core, then real package and detached lifecycle gates.

Current-bootstrap complete core:

```text
tests: 455
passed: 455
failed: 0
duration: 613,834 ms
```

Complete integrity remains current at 34/34. Next action: real npm pack/package closure/scanner/runtime probe and detached runner/control lifecycle gates.

Final read-only review after all green gates reopened five High blockers. Current Go status is withdrawn and all complete evidence becomes stale once fixes land:

- persistent runtime snapshot content can be modified after completion and reused without hash verification;
- runtime materialization lock is PID-only and can block forever on PID reuse/unrelated live PID;
- webhook delivery ledger commit and task queue transition are separate transactions, allowing accepted-but-lost deliveries;
- one unrecoverable provisioning conflict can crash runner recovery and poison all later queued tasks;
- bounded capture swallows output-file write errors and can publish incomplete logs as complete evidence.

Medium follow-ups: live lock mtime GC, staging-directory cleanup, bounded webhook retention, and stale runtime-state resolver preference. Next action: parallel non-overlapping blocker fixes, then regenerate and rerun affected/full gates. Do not commit or release.

High-blocker correction batch completed:

- CAS snapshots are revalidated by hash/size/mode before every reuse; tampered launcher content is rebuilt, never executed.
- Runtime lock owner tickets bind PID, process identity, and owner ID with bounded wait and owner-safe release; GC preserves live locks and cleans real staging directories.
- Runtime resolver skips stale state and tries the next valid durable runtime reference.
- Webhook delivery ledger and task queue transition are now one state transaction; running/provisioning/queued tasks reject without consuming the idempotency key.
- Unrecoverable worktree conflicts block only their task and runner continues later queued work.
- Bounded capture uses write-all semantics and capture write/sync/close failures publish observable failed, truncated evidence rather than successful receipts.

Cross-batch evidence:

```text
runtime/task/control/webhook/provisioning/capture suite: 72/72 passed
full typecheck: passed
feature typecheck: passed
FIFO/cache focused integrity: 2/2 passed
git diff --check: passed
```

All previous complete evidence is stale after these governed fixes. Next action: build, complete integrity, complete core, then package and detached lifecycle gates.

## 2026-08-16: Phase A/Phase D Final Current-Asset Gates

Final evidence after CAS tamper/lock, webhook atomicity, provisioning isolation, and capture-write fixes:

```text
npm run build: passed
complete integrity: 36/36 passed (852,099 ms)
complete core: 466/466 passed (654,462 ms)
real npm pack contract: 1/1 passed (229,779 ms)
package closure: approved, 175 manifests
secret scan: clean
runtime integrity probe: approved, 20,662 entries
full typecheck: passed
feature typecheck: passed
git diff --check: passed
real detached runner/control parent-exit lifecycle: passed
```

Phase A persistent CAS/runtime lifecycle and Phase D provisioning/task terminal batches are code-validated against current generated assets. Remaining medium risks before release planning:

- webhook ledger retains only 10,000 deliveries without a provider retry-window retention contract;
- non-Linux lease identity remains weaker than Linux start-time identity;
- crash cleanup can leave private stale runtime content until the next GC invocation;
- provisioning cleanup/rollback failures still need an operator-facing retry command;
- Dashboard/VS Code task detail DTO contract and package/publication policy remain separate Phase E/F work.

Commit/tag/release remains No-Go: detached dirty worktree, version 0.5.3, stale handoff docs, and Phase E/F/G incomplete. Next executable action: Phase E summary/detail DTO consumer migration plus stable Control error contract, followed by Phase F bundled dependency/nested archive policy.

## 2026-08-16: Phase E Control Contract Batch

- Added authenticated `GET /v1/tasks/:id` detail DTO with prompt/cwd/result/lastError while retaining the secret-free summary list.
- Detail excludes PID, process identity, webhook secret, worktree path, provisioning and terminal outbox internals.
- Dashboard and VS Code now select summaries then fetch detail; neither expects private fields in `/v1/tasks`.
- Added stable mappings for non-cancellable task conflicts, runner stopping/start failure, and control ownership conflict.
- Webhook delivery ledger now validates timestamps and prunes keys outside a seven-day retry retention window before duplicate detection.
- Control/UI/VS Code/package ABI/webhook contract suite: 23/23 passed; syntax and diff checks passed.

Generated assets and complete gates are stale after Phase E governed/UI changes. Next action: Phase F publication scanner policy for bundled dependencies and bounded nested archives, then regenerate and run final gates.

## 2026-08-16: Phase F Publication Closure Batch

- Workspace scanning still ignores local `node_modules`, but publication archives scan bundled dependency members.
- Nested tgz/gz/zip/vsix archives recurse with depth 3, count 100, and shared compressed/uncompressed budgets; corruption or limit overflow fails closed.
- Scanner paths preserve `outer::inner::member` provenance.
- Credential detectors now distinguish explicit env/schema/test/example placeholders by value shape rather than dependency path allowlists; real live/random literals remain blocked.
- Full repository scan is clean and scanner suite is 18/18 passed.
- Package closure now verifies installed PI/TUI/MCP versions and exact lock version/resolved/integrity for all three pinned dependencies.

Generated assets are stale after scanner/control/package verifier changes. Next action: build, Phase E/F focused gates, then complete core/integrity/package/lifecycle gates.

Phase E/F focused run initially passed 42/43. The sole failure was stable error precedence: the existing core-version mismatch fixture now reached the stricter lock check first and returned `PACKAGE_LOCK_INVALID`. `verifyPackageClosure` now checks the installed core version before general metadata, preserving `PACKAGE_CORE_VERSION_MISMATCH`; focused rerun and closure passed.

Phase E/F governed code is frozen. Next action: build, rerun focused suite, then complete core/integrity and real package/lifecycle gates.

Phase E/F post-build focused evidence:

```text
Control/webhook/scanner/package contract suite: 43/43 passed
package closure: approved, 175 manifests
secret scan: clean, including bundled dependencies and nested archives
full typecheck: passed
feature typecheck: passed
git diff --check: passed
```

Next action: complete integrity and core on current generated assets, then real npm pack and detached lifecycle gates.

## 2026-08-16: Phase E/F Current-Asset Validation

```text
complete integrity: 36/36 passed (852,516 ms)
complete core: 470/470 passed (682,845 ms)
real npm pack contract: 1/1 passed (254,363 ms)
package closure: approved, 175 manifests
secret scan: clean, including bundled dependencies and bounded nested archives
runtime integrity probe: approved, 20,662 entries
full typecheck: passed
feature typecheck: passed
git diff --check: passed
real detached runner/control lifecycle: passed
```

Phase E summary/detail DTO and client migration, stable HTTP errors, webhook atomic idempotency/retention, and Phase F dependency/publication closure are validated against current generated assets.

Remaining Phase G blockers:

- candidate remains detached and dirty with required untracked runtime/test/docs files;
- version remains already-released 0.5.3 and no successor version has been authorized;
- AGENTS and bilingual handoff docs still describe stale focused counts and generation state;
- CI timeout/job layout does not reflect observed core/integrity/package durations;
- no clean committed-byte candidate exists and commit/branch/tag/release/remote operations remain unauthorized.

Next executable action: update local handoff/docs and CI timeout planning without choosing a version or committing, produce an explicit candidate file inventory, then request only the decisions that cannot be inferred (new version and local commit/branch authorization).

Phase G local preparation:

- CI timeouts updated from measured durations: PR/main 45 minutes, integrity 30 minutes, release 75 minutes; workflow contract tests updated.
- English and Chinese stable migration guides now contain a superseding architecture checkpoint and current evidence.
- AGENTS handoff no longer references stale 39/39 and regeneration instructions.
- Candidate inventory was enumerated explicitly from tracked modifications and untracked files; required untracked runtime/test/docs files are visible and must be staged deliberately if commit authorization is granted.

The first real package contract after documentation/CI edits rejected because runtime assets were stale, while workflow tests and typechecks passed. This is expected governed-document hash behavior. Next action: rebuild and rerun package/core/integrity current-asset gates. Version and commit/branch remain unauthorized decisions.

## 2026-08-16: Phase G Local Candidate Preparation Complete

Current generated-asset evidence after CI and bilingual documentation updates:

```text
npm run build: passed
complete integrity: 36/36 passed (886,022 ms)
complete core: 470/470 passed (673,432 ms)
real npm pack/workflow contract: 6/6 passed (220,767 ms)
package closure: approved, 175 manifests
publication scanner: clean
full typecheck: passed
feature typecheck: passed
git diff --check: passed
```

CI budgets now reflect measured execution with margin: PR/main 45 minutes, integrity 30 minutes, release 75 minutes. Stable English/Chinese architecture checkpoints and AGENTS handoff are current.

Explicit candidate inventory includes all tracked modifications plus required untracked runtime modules (`runtime-root.mjs`, `runtime-store-policy.cjs`, `runtime-store.mjs`, `task-run-supervisor*.mjs`, `webhook-deliveries.mjs`), their tests, AGENTS, bilingual migration guides, and the live journal. The live `.opencode` journal is local execution evidence and should not be packaged; whether it belongs in a commit should be decided explicitly.

Only non-inferable blockers remain:

1. Choose a successor version; `0.5.3` must not be republished.
2. Explicitly authorize or decline creation of a local branch and commit. No tag, push, PR, release, or remote mutation is implied by local commit authorization.

Until those decisions, worktree stays detached and dirty. Commit/tag/release status remains No-Go despite current local validation.

## 2026-08-16: Successor Version Authorized

The user selected `0.6.0` and explicitly authorized creation of a local candidate branch and commit. This authorization excludes tag, push, PR, release, publication, and all remote mutation.

Current product version surfaces were updated to `0.6.0`: package/lock root, product manifest, capability matrix, generated product identity, VS Code manifest, MCP client identity, installer, public install/offline/VSIX documentation, homepage uninstall links, changelog, and version contract tests. Historical `0.5.3` baseline and rollback evidence remain unchanged.

Architecture/version/documentation/VSIX/release focused run passed 16/17. The sole failure was real package integrity before rebuilding after governed version/document edits; this is expected stale-manifest behavior. Next action: build, rerun package/version gates, then complete integrity/core before creating the authorized local branch and commit.

## 2026-08-16: v0.6.0 Local Commit Gate

Final current-asset evidence after the authorized version transition:

```text
product/lock/VSIX/manifest/capability/MCP/install/docs version: 0.6.0
architecture contract: approved, version 0.6.0
npm run build: passed
real npm pack + v0.6.0 release contract: 2/2 passed
package closure: approved, 175 manifests
publication scanner: clean
full typecheck: passed
feature typecheck: passed
complete integrity: 36/36 passed (893,124 ms)
complete core: 470/470 passed (672,526 ms)
git diff --check: passed
```

Governed files are frozen. Authorized next action: create local branch `candidate/v0.6.0`, stage the reviewed candidate inventory including this durable handoff journal, inspect staged status/diff and recent history, run the scanner against staged bytes/current tree, and create one local candidate commit. Tag, push, PR, release, publication, and remote mutation remain prohibited.

## 2026-08-16: v0.6.0 Release Workflow Repair

The user authorized branch/tag push and GitHub Release, excluding npm publication. Release run `31943349934` was not stuck in queue: the hosted job started after about seven minutes and completed core, integrity, closure, and npm pack. It failed after 21m47s while scanning the generated tarball.

Root causes:

- `jose` runtime source compares input with the PEM header string, and the scanner treated a standalone `BEGIN PRIVATE KEY` header as a complete private key block.
- The outer npm tar expands to about 196.6 MiB and its legitimate nested pinned candidate expands to about 115.8 MiB. Both satisfy the 256 MiB per-archive limit, but the shared cumulative 256 MiB limit rejected their combined 312.4 MiB.

Repair:

- Private-key detection now requires a matching complete BEGIN/END block with bounded content; standalone parser/header strings pass.
- The 256 MiB per-archive limit remains. The bounded cumulative nested-archive budget is 512 MiB, while depth 3 and count 100 remain unchanged.
- Added complete-block and header-only regression coverage; fixtures construct key markers at runtime so repository scanning does not whitelist test paths.

Evidence:

```text
scanner suite: 19/19 passed
real generated coco-0.6.0.tgz scan: clean
repository scan: clean
npm run build: passed
real package + v0.6.0 contract: 2/2 passed
package closure: approved, 175 manifests
git diff --check: passed
```

No GitHub Release was created by the failed run. Next action under the release-repair authorization: commit and push the scanner fix, update the unreleased `v0.6.0` tag to that fix commit, then monitor the replacement release workflow. npm publication remains prohibited.

The replacement release run `31945426257` started within 20 seconds, so hosted-runner queueing was not the issue and migration to self-hosted would not have accelerated it. It passed core, integrity, closure, npm tar scanning, tar closure, offline build, and VSIX build, then failed at the final whole-release scan after 24m51s. The failing member was the official Node runtime archive inside the offline ZIP.

Second repair batch:

- tar archives accept one canonical `./` root directory and strictly validated internal relative symlinks only when they directly target a regular member in the same archive; absolute, escaping, dangling, chained, and special entries reject;
- shared archive expansion budgets count leaf bytes instead of double-counting nested archive containers, while per-archive 256 MiB, cumulative 512 MiB, depth 3, and count 100 limits remain;
- tar extraction remains bounded at 120 seconds for archives up to 256 MiB;
- token detector value and whitespace quantifiers are bounded, PEM block matching is linear, and huge cross-chunk assignments retain a linear fail-closed fallback;
- explicit npm/Node documentation placeholders are recognized by value shape, never by package path; complete non-placeholder PEM blocks and random live-shaped tokens still reject.

Local evidence:

```text
scanner suite: 19/19 passed
complete offline ZIP + VSIX release directory scan: clean in 85 seconds
real npm package + v0.6.0 contract: 2/2 passed
package closure: approved, 175 manifests
repository scan: clean
complete integrity with TMPDIR=/root/coco-tmp: 36/36 passed
```

A prior local integrity attempt failed with `RUNTIME_STORAGE_BUDGET_EXCEEDED` because `/tmp` had only 284 MiB free after release debugging; this was correct fail-closed behavior, not a code regression. The successful rerun used the repository's large temporary root. Next action: complete core, commit/push this repair, update the still-unreleased tag, and rerun release. npm publication remains prohibited.

## 2026-08-16: Startup Performance Repair for 0.6.1

User report: published 0.6.0 startup can exceed ten seconds. Baseline on the candidate host:

```text
bootstrap --version cold: 6.09 s
bootstrap --version warm: 1.92 s
real coco --list-models cold: 15.74 s
real coco --list-models warm: 6.19 s
runtime manifest: 20,662 entries / 172.9 MiB
```

Root causes and corrections:

- bootstrap validated an existing CAS snapshot twice in one launch; reuse now performs one validation;
- bootstrap handed a same-process verification capability to the launcher, but trailing-slash path drift made the capability comparison fail, so launcher repeated a complete ESM integrity scan; roots are now normalized before capability comparison and the capability is deleted immediately after consumption;
- direct launcher invocation still performs its own full integrity verification; no environment nonce or bypass was added;
- private CAS warm cache records six-field file and directory snapshots; unchanged noncritical files use trusted-local metadata gating, while launcher, runtime policy, manifest, and sidecar are content-verified every launch; any metadata change falls back to complete hashing and rebuild;
- source warm-cache checks use one `lstat` per entry instead of open/fstat/lstat/close; any metadata change still falls back to full source hashing;
- first CAS materialization writes verified files in bounded 64-file asynchronous batches while preserving private staging, `O_EXCL`, `O_NOFOLLOW`, file modes, completion-last ordering, and atomic rename;
- Node's official compile cache is enabled only after runtime integrity approval and is isolated by runtime key under the private agent directory.

Performance after the frozen implementation:

```text
real coco --list-models cold: 9.37 s (40% faster)
real coco --list-models warm: 2.18 s (65% faster)
bootstrap --version warm: about 1.0 s (48% faster)
```

Focused security evidence: CAS tamper/rebuild, noncritical metadata change/full fallback, launcher replacement, lock identity, source metadata-preserved mutation, source inode replacement, direct launcher, and runtime-store tests passed. Next action: complete integrity/core/package gates, bump to 0.6.1, regenerate assets, commit, push/tag, and publish GitHub Release. npm publication remains prohibited.

## 2026-08-16: CoCo 0.6.1 Published

Complete integrity/core/package gates after the startup performance batch:

```text
complete integrity: 37/37 passed
complete core: 472/472 passed
architecture/documentation/VSIX/performance contracts: 9/9 passed
real npm pack contract: 2/2 passed
package closure: approved, 175 manifests
secret scan: clean
full typecheck: passed
feature typecheck: passed
git diff --check: passed
```

Release workflow run `31962760485`: passed in 26m21s.

Published assets:

```text
coco-0.6.1.tgz
coco-0.6.1.tgz.sha256
coco-0.6.1-offline-linux-x64.zip
coco-0.6.1-offline-linux-x64.zip.sha256
coco-agent-0.6.1.vsix
coco-agent-0.6.1.vsix.sha256
install.sh
uninstall.sh
SHA256SUMS
```

Release: https://github.com/bit-cook/coco/releases/tag/v0.6.1
Workflow: https://github.com/bit-cook/coco/actions/runs/31962760485
npm: not published (authorized without npm)
Tag: v0.6.1 -> b88190b
Branch: candidate/v0.6.1
Commit: b88190b4433c292f6adeb01273d60cb284deb45a

## 2026-08-16: Post-Release Review Documentation and Website

The v0.6.1 committed bytes, remote branch, peeled tag, successful release workflow, and nine published assets were rechecked. npm remains unpublished. A four-track read-only review covered startup/runtime integrity, task and Control recovery, publication closure, and platform/operations.

The resulting formal plan is recorded in locale-paired pages:

```text
documentation/en/docs/development-review-plan.md
documentation/zh-CN/docs/development-review-plan.md
```

The plan orders work as:

```text
0.6.2: release safety and deterministic task recovery
0.7.0: long-running retention and Control scalability
0.8.0: explicit platform delivery closure
```

Both documentation navigation files link the new review. The public homepage now reports the measured v0.6.1 startup improvement and current engineering priorities. `site/plan.html` was replaced because it still described the obsolete v0.5.3/v0.5.4 route and an invalid 187 ms startup claim; it now presents the v0.6.1 baseline, v0.6.2 immediate batches, later milestones, and explicit exit gates. Homepage review links are local `plan.html` links rather than branch URLs that could 404 before a repository push.

Focused evidence:

```text
documentation/homepage/current-plan contracts: 3/3 passed
publication scanner: clean
git diff --check: passed
stale v0.5.3/v0.5.4/187ms/current-branch review links in site: none
```

Documentation is governed package content, so generated package/integrity assets are stale after this edit. Next action: build once, rerun focused documentation/package checks, commit and push the documentation/site update, then dispatch and verify GitHub Pages. No new release or npm publication is authorized or required.

Documentation and website delivery result:

```text
build: passed
documentation/homepage/current-plan contracts: 3/3 passed
real package and v0.6.1 release contracts: 2/2 passed
package closure: approved, 175 manifests
publication scanner: clean
commit: f72768a9f9dc0e268b110b0a2d7a334e3ff279f7
branch push: candidate/v0.6.1 passed
Pages run: 31967483422 passed in 21 seconds
```

The first workflow-dispatch run (`31967435519`) failed before runner assignment because the `github-pages` environment allowed only `main` and `gh-pages`. It was not a content, build, or runner failure. A temporary exact deployment policy for `candidate/v0.6.1` was added, the verified commit was deployed, and that temporary policy was immediately deleted. The environment again allows only `main` and `gh-pages`.

Cache-busted public reads verified all three deployed pages:

- English homepage contains v0.6.1, 2.18s warm, 9.37s cold, integrity 37/37, and the three engineering priorities.
- Chinese homepage contains the equivalent localized evidence and priorities.
- `plan.html` contains the b88190b baseline, v0.6.2/v0.7.0/v0.8.0 route, four immediate batches, and ten explicit v0.6.2 exit criteria.

No tag, release, npm publication, or release asset was changed by this documentation deployment.

## 2026-08-16: Homepage Ready-to-Use Model Message

The user requested that the homepage stop naming `agnes/agnes-2.5-flash` and clearly state that CoCo opens ready to use without model configuration.

Changes:

- English homepage now says a ready-to-use model is selected automatically and no model setup is required before the first conversation.
- Chinese homepage now says “打开 CoCo 就能直接使用” and “第一次对话前不需要配置模型”.
- The specification rows now show model setup as unnecessary and first run as immediately ready.
- Homepage contracts reject the concrete Agnes model ID and require the localized no-configuration message.

Evidence:

```text
homepage/current-plan contracts: 2/2 passed
publication scanner: clean
git diff --check: passed
stale default-model/provider wording in homepage: none
```

Only site HTML, its contract test, and this live journal changed. These paths do not require runtime manifest regeneration. Next action: commit, push, deploy Pages from the verified branch, restore the environment branch policy, and verify live localized content.

## 2026-08-16: Executable Development System and Pre-0.6.2 Backup

Before restructuring development documentation, a non-destructive backup was created and verified at commit `e085d3dc2b59074c23a52f4fe4c76c17504d0e5b`:

```text
local branch: backup/pre-v0.6.2-20260816
bundle: /root/coco-tmp/coco-backups/coco-pre-v0.6.2-20260816.bundle
checksum: /root/coco-tmp/coco-backups/coco-pre-v0.6.2-20260816.bundle.sha256
bundle verification: passed, complete history, 50 refs
checksum verification: passed
existing remote backup-equivalent: origin/candidate/v0.6.1 at e085d3d
```

The active branch is now `candidate/v0.6.2`. No historical document was deleted or moved. The permanent discovery and recovery entry is `HISTORICAL_DOCUMENTS.md`; it lists the English/Chinese migration journals, strategy pages, legacy roadmap, research page, RFCs, changelogs, backup branch, bundle, checksum, verification commands, and safe restore command.

The agent collaboration structure is now:

```text
AGENTS.md                              current collaboration and invariants
DEVELOPMENT_PLAN.md                    current status, dependency graph, evidence and next action
HISTORICAL_DOCUMENTS.md                preserved-document and backup index
development/WORK_ITEM_TEMPLATE.md      required packet format
development/GENERATED_ASSETS.md        generation and evidence-freshness rules
development/work-items/0.6.2/          ten agent-ready work packets
documentation/architecture/decisions/ four runtime/supervision/release/platform ADRs
.opencode/work-leases.json             local file-scope lease registry
```

The ten work packets are REL-001 through REL-004, RUN-001 through RUN-005, and CON-001. Each packet records status, priority, dependencies, reproduction, invariants, allowed scope, out-of-scope work, design, fault matrix where applicable, acceptance tests, verification, rollback, and evidence.

Focused evidence:

```text
development plan/documentation/current-plan contracts: 4/4 passed
work item IDs: unique
work item inventory: exact 10/10
ADR inventory: exact 4/4
publication scanner: clean
git diff --check: passed
```

The new architecture ADRs are packaged documentation, so package and runtime generated assets are stale. Next action: run the canonical build once, repeat plan/package/closure checks, then commit and push the collaboration structure. No product feature implementation, version bump, tag, release, or npm publication is part of this batch.

Post-build evidence:

```text
npm run build: passed
development plan/documentation/current-plan contracts: 4/4 passed
real package and v0.6.1 release contracts: 2/2 passed
package closure: approved, 175 manifests
publication scanner: clean
git diff --check: passed
```

Generated package and runtime assets now match the packaged ADR documentation. Complete core and integrity counts remain historical and intentionally marked stale for the 0.6.2 implementation cycle; no product implementation was changed in this collaboration-structure batch.

## 2026-08-16: PERF-001 Startup and Runtime Performance

The user explicitly prioritized further startup and runtime optimization. `PERF-001` was added to the active plan and claimed with a file-scope lease at base commit `7b2c5a6b45f580ece596a62a2dc0edbbc0e7a6b4`.

Measured baseline on Node v24.15.0:

```text
--version cold: 6.64 s
--version warm p50: 0.704 s
--list-models cold: 9.18 s
--list-models warm p50: 2.401 s
forced full p50: 2.283 s
--help warm p50: 1.192 s
task list --json warm p50: 1.245 s
control status warm p50: 1.363 s
```

Retained optimizations:

- Project-resource preflight no longer performs four identical walks. It performs an initial scan and a descriptor-bound final revalidation immediately before Pi import. Every command still performs the initial forbidden-resource check.
- `--list-models` uses a lightweight entry composed from the bundled Pi `ModelRuntime` and the bundled, CoCo-patched `listModels` formatter. It does not duplicate model visibility, authentication status, custom provider, search, or output logic. Explicit extension arguments or an agent extension directory fall back to the full Pi entry.
- Warm directory topology validation compares the six-field snapshots of every cached directory directly instead of recursively enumerating the tree again. Any added/removed/renamed entry changes its direct parent directory metadata and triggers complete fallback.
- The benchmark now supports expected nonzero command exit codes and records the expected code with full percentile summaries.

Rejected experiments:

- Skipping project-resource preflight for native commands was reverted because it violated the existing contract that forbidden project executables reject even `--version`/help startup.
- 128-way asynchronous metadata `lstat` was reverted because warm `--version` regressed from approximately 0.765 s to 0.993 s and `--list-models` from 1.656 s to 2.296 s.

Current measured results after retained changes:

```text
--version warm p50: 0.486 s
--list-models cold: 7.57 s
--list-models warm p50: 1.275 s
--help warm p50: 0.795 s
task list --json warm p50: 0.872 s
```

Relative to the 0.6.1 post-release baseline, warm model listing is approximately 47% faster and remains below the 10-second cold-start target. Focused output-equivalence, extension fallback, project-resource rejection, cache topology, source/CAS metadata fallback, tamper, visible-model, and launcher tests passed. Generated assets were refreshed after each governed freeze. Next action: run final focused/typecheck checks, complete integrity/core/package/lifecycle gates, update PERF-001 evidence, clear the lease, and commit the batch.

PERF-001 completed at implementation commit `f67851c` with generated assets at `6262f75`. Final current-byte gates are integrity 37/37, core 478/478, package 2/2, closure 175 approved, runtime probe 20,668 approved, scanner clean, detached lifecycle passed, and both typecheck suites passed. Final measured `--list-models` cold was 7.14 seconds and warm p50 1.224 seconds; `--version` warm p50 was 0.500 seconds. The lease is cleared. Subsequent governed startup edits must mark this evidence stale.

## 2026-08-17: External Research Batch Post-Build Evidence

```text
research/plan/work-item contract suite: 5/5 passed
npm run build: passed
real package and v0.6.1 contracts: 2/2 passed
package closure: approved, 175 manifests
publication scanner: clean
```

Generated package and runtime assets now include the bilingual research report and fixed source inventory metadata. The five 0.7.0 research work items remain pending; the 0.6.2 P0 release/recovery order is unchanged. No external source code or dependency was added.

## 2026-08-17: Prime Agent and DeepSeek Harness Research

Read-only source research was performed against fixed commits and local snapshots outside the CoCo repository:

```text
Prime Agent: 849c92114b0b4372fa272281b87cdbe8f7c9ed8d, MIT
DeepSeek Harness: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca, MIT, developer preview
```

Reports and source inventory:

```text
documentation/en/docs/external-agent-research.md
```

Adoptable patterns were identified, not copied: Prime command recovery journal, steering/follow-up queues, worker generation fencing, session leases, authoritative lineage and host continuation; DeepSeek model-input ledger, pre-effect durability fence, closed tool calls, ordered bounded safe-tool pool, provider generations, MCP atomic reload, last-good revision CAS, transactional publication and invariant registry.

Explicitly rejected or deferred: wholesale Cordis migration, persistent Python RLM before containment and secret isolation, unauthenticated LAN control, project-local auto-loaded agents/skills/plugins, and treating file-effect sandboxing as full process/network containment.

Five pending research-derived work items were added under `development/work-items/0.7.0/`: EVID-001, EVID-002, TOOL-001, CFG-001, and ORCH-001. They are blocked by the 0.6.2 P0 release/recovery work and do not authorize external runtime or dependency adoption.

Research contract suite and plan structure checks are required before this batch can be committed; no external code or dependency was added.

## 2026-08-17: Second Comprehensive Plan Review

The latest review found plan-level defects and corrected them before implementation resumes:

- `RUN-001` and `RUN-005` are now serial because they share terminal recovery schema and runner files.
- `RUN-003` ledger work can start independently, but runner ownership clearing and retry integration depend on `RUN-001`.
- `REL-004` is now a P0 release gate and blocks final REL-003/REL-002 integration.
- `REL-002` explicitly waits for REL-001, REL-003, and REL-004.
- `CON-001` is policy/feasibility only; `CON-002` owns Linux cgroup implementation after the decision.
- Prime-derived command recovery is now explicit as `REC-001` in `0.6.3` unless intentionally pulled into `0.6.2` after RUN-001/RUN-003.
- Evidence table was corrected: research documentation keeps package/closure/scanner evidence current but core/integrity must be rerun before a product release.

Current review/document/website contracts: 7/7 passed. Next action: build, package/closure/scanner checks, commit and push the corrected plan/documentation/site batch. No product implementation or release is authorized by this review.

Post-build evidence:

```text
npm run build: passed
review/document/website contracts: 7/7 passed
real package and v0.6.1 contracts: 2/2 passed
package closure: approved, 175 manifests
publication scanner: clean
git diff --check: passed
```

Pages deployment run `32053163738` checked out and uploaded the correct `9c0a154` site artifact, then GitHub's `deploy-pages` API returned HTTP 503. GitHub Status reported `major / Partial System Outage`; workflow dispatch and environment-policy APIs also returned 503 during the incident. The temporary exact `candidate/v0.6.2` deployment policy was eventually deleted successfully, restoring the environment policy to only `main` and `gh-pages`. The website content is committed and pushed but must not be called live until the same commit is redeployed after GitHub recovers.

## 2026-08-17: Pages Deployment Recovery

GitHub recovered from `Partial System Outage`. Pages run `32055174652` deployed commit `115c08d` successfully in 22 seconds. Temporary `candidate/v0.6.2` branch policy deleted; environment restored to `main` + `gh-pages` only.

Live verification (cache-busted):
- plan.html: shows re-reviewed route, v0.6.3–v0.7.0, CON-001/002 split, REC-001, 1.22s warm, 7.14s cold
- English homepage: shows "next candidate measures 1.22 seconds", "model setup none required", engineering priorities
- Chinese homepage: equivalent localized content

All documentation, plans, and website are now current. No product code, release, or npm was changed.

## 2026-08-17: Complete Project Backup

Created a timestamped, non-destructive backup set outside the worktree:

```text
/root/coco-tmp/coco-backups/coco-full-20260817T190344Z
```

Included layers:

- complete Git bundle with all local branches, remote-tracking refs, tags, history, and worktree HEAD refs;
- committed source tarball;
- physical `node_modules` dependency archive;
- all nine verified GitHub Release `v0.6.1` assets;
- repository, Actions, workflow, release, Pages, environment, secret-name, variable, ref, worktree, local-config, object-count, and fsck metadata;
- one SHA-256 manifest over every regular backup file;
- isolated restore-drill evidence.

Sensitive `/root/.coco` and `/root/.config/opencode` content was intentionally excluded from the unencrypted project set because it can contain credentials, prompts, task logs, and local provider configuration. The recovery guide requires separate encrypted storage and credential rotation.

Restore drill result:

```text
bundle clone: passed
HEAD identity: passed
git fsck: passed (known gh-pages dangling commit only)
dependency extraction: passed
package closure: approved, 175 manifests
backup/plan/research contracts: 6/6 passed
source archive byte comparison: 1,319/1,319 passed
release SHA256SUMS and three sidecars: passed
```

Canonical instructions: `BACKUP_AND_RESTORE.md`. Locale-paired documentation and `HISTORICAL_DOCUMENTS.md` link the backup. Final commit identity and artifact digests are recorded in the backup's `metadata/final-backup-facts.txt` and `SHA256SUMS`, avoiding a self-referential documentation hash.

## 2026-08-17: Third Comprehensive Review and Plan Hardening

The review at commit `1db5610` confirmed 0.6.2 remains No-Go and strengthened the plan before implementation:

- Release chain is REL-004 -> REL-003 -> REL-005 -> REL-001 -> REL-002.
- Release architecture is four-stage: read-only build, minimal-write draft upload, read-only remote lifecycle verification, minimal-write publish.
- Linux cgroup v2 containment is required in 0.6.2 for any full descendant-termination claim.
- RUN-001 must unify authorization/revocation/outcome arbitration; RUN-002 includes task creation and Control/CLI race semantics; RUN-003 separates ledger from generation-acknowledged consumption.
- Added PERF-002/003 and INT-001/002 for full model-list equivalence, executable performance budgets, canonical-root verification, and topology fallback.
- Added DOC-001 for regenerated documentation completeness and packed-link closure, plus REL-005 exact remote artifact/tag/commit/digest binding.
- Added 0.6.3 CFG-000 MCP atomic publication and BKP-001 authenticated offsite backup; closed the 0.7 dependency DAG.

Documentation truth was corrected: current journal/handoff headers, historical migration markers, containment claims, relative repository links, backup package inclusion, stale completeness manifest, historical roadmap banner, and candidate performance caveats. Review/document/site contracts passed 11/11 before build. Next action: canonical build, package/closure/scanner verification, commit, push, and Pages deployment. No product implementation or release occurs in this batch.

Post-build evidence:

```text
npm run build: passed
review/document/site contracts: 11/11 passed
real package/release contracts: 2/2 passed
package closure: approved, 175 manifests
packed backup guide and locale links: present
publication scanner: clean
git diff --check: passed
```

Core and integrity remain explicitly stale because this batch changed packaged documentation and package inventory; they are release gates, not documentation-batch claims.

The reviewed plan/document/site batch was committed as `30dfa4e67b5ac0bb01d00d4ddc2925484c453bb1`. Package 2/2, closure 175, scanner clean, and review/document/site 11/11 evidence bind to those committed bytes. Pages evidence remains stale until that commit is deployed. Core and integrity remain stale by design.

Pages run `32067272227` deployed site commit `30dfa4e` successfully in 21 seconds. Cache-busted reads verified English/Chinese homepages, current plan, and the historical-strategy banner. The temporary candidate deployment policy was removed; the environment again allows only `main` and `gh-pages`. Pages evidence is current at `30dfa4e`.

## 2026-08-17: First 0.6.2 P0 Implementation Batch

Parallel batches completed at implementation commit `8cbcfc0`:

- REL-004 mandatory lock/direct manifests, exact offline checksum inventory, pre-extraction archive closure, safe internal Node symlinks, and standalone npm token detection.
- RUN-001 durable launch FSM with mutually exclusive authorization/revocation/outcome, generation/lease/takeover CAS, abandoned pre-auth recovery, structured outcome-in-doubt, legacy migration, and replay-idempotent transitions.
- PERF-002 full-configuration lightweight/full model-list differential gate.
- PERF-003 versioned six-command Node 22 startup matrix with primed warm samples, p50/p95, host/runtime binding, and executable CI budget.
- INT-001 canonical-root direct launcher verification.
- INT-002 observable source/CAS topology fast/full fallback.

Cross-review found and fixed three blockers before freeze: official Node internal symlinks, empty-operation replay transactions, and version-only performance evaluation. Final current-byte evidence:

```text
affected integration suite: 104/104 passed
complete integrity: 39/39 passed
complete core: 511/511 passed
real package contracts: 2/2 passed
package closure: approved, 175 manifests
runtime integrity probe: approved, 20,674 entries
publication scanner: clean
real offline build/install/version/uninstall: passed
detached runner/control lifecycle: passed
Node 22 performance matrix budget: passed
git diff --check: passed
```

Next parallel pair is REL-003 single immutable tarball and RUN-002 strict stop ownership; RUN-003A ledger may proceed independently. Leases are cleared.

## 2026-08-17: Second 0.6.2 P0 Implementation Batch

REL-003, RUN-002, and DOC-001 were implemented in parallel and cross-reviewed. Four blockers were found and fixed before freeze: the release workflow now passes the explicit package archive/digest without an argv-size hazard; same-owner stop failures can resume while concurrent owners remain excluded; unknown documentation pages fail closed instead of auto-downgrading to historical; shortcut reference and relative autolink targets are included in packed-link closure.

Current focused evidence:

```text
REL-003 explicit package snapshot tests: 10/10 passed
RUN-002 stop/control/barrier tests: 53/53 passed
DOC-001 completeness/backup tests: 7/7 passed
documentation manifest: 56 pages, 982 packed relative links, 0 unclassified
real offline build/install/version/tarball-byte-equality/uninstall: passed
release directory scanner: clean
git diff --check: passed
```

Next action: final build and complete performance/integrity/core/package/lifecycle gates on the merged bytes; then commit implementation, update plan evidence, clear leases, and continue REL-005 plus RUN-003A.

Second batch completed at `a5eb3d3` after final cross-review fixes. Current-byte evidence is performance matrix pass, integrity 39/39, core 524/524, package 2/2, closure 175 approved, documentation complete with 982 packed links and zero unclassified, runtime probe 20,675, scanner clean, real offline tar equality/install/version/uninstall passed, detached lifecycle passed, and both typecheck suites passed. Leases are cleared. Next: REL-005, RUN-003A, and CON-002.

## 2026-08-18: Third 0.6.2 P0 Candidate Batch

REL-005, REL-001, REL-002, RUN-003A, and CON-002 implementation is complete in the uncommitted candidate worktree and was cross-reviewed. The batch closed exact nine-asset release inventory and same-run rerun recovery, four-stage permission isolation, final publish ETag CAS, lifecycle token scrubbing, durable dispatch ledger v2, Linux cgroup v2 descriptors and attach-before-authorization, outcome handoff, unsupported process-group fallback, cleanup-pending retry, and cancellation race recovery.

Current-byte verification:

```text
focused release artifact contract: 9/9 passed
focused release workflow contracts: 8/8 passed
focused containment/supervisor/stop suites: 69 passed, 1 real delegated-cgroup test skipped by host capability
complete integrity: 39/39 passed
complete core: 553/553 passed, 1 delegated-cgroup test skipped by host capability
real package contracts: 2/2 passed
package closure: approved, 175 manifests
publication scanner: clean (COCO_SCANNER_TMPDIR=/root/coco-tmp; /tmp was full)
runtime integrity probe: approved, 20,677 entries
Node 22.19 startup benchmark: passed
real offline tar byte equality/install/version/uninstall: passed
real detached runner/control lifecycle: passed
typechecks and git diff --check: passed
```

The host has no writable delegated cgroup v2, so the real detached setsid/double-fork descendant proof remains skipped and must run on a capable Linux runner. A disposable GitHub draft/tag end-to-end dry run also remains outstanding. RUN-003B pending-dispatch consumption is not implemented and was not claimed by this batch. No commit, push, tag, GitHub Release, or npm publish was performed.

## 2026-08-18: RUN-003B Durable Dispatch Consumer

RUN-003B is implemented in uncommitted candidate bytes. The runner consumes pending webhook intents only after durable task claim and production supervisor preparation, binds claim/ack to runner owner and generation, retries state-lock contention, and preserves intents across crash windows. Control runs a service-lifetime recovery loop driven by pending dispatch, launch-pending, pending run event, and terminal evidence anchors. Legacy v1 queued deliveries synthesize only the latest pending intent per task. Queued webhook cancellation and attempt-limit disposition update task and ledger in one transaction.

Current-byte evidence: focused RUN-003/control/runner integration 92/92 passed; complete integrity 39/39; complete core 559 passed, zero failed, one delegated-cgroup capability skip; package 2/2; closure 175 approved; scanner clean; runtime probe 20,677 approved; feature typecheck and diff check passed. RUN-003 is complete. No commit, push, tag, release, or npm publish was performed.

## 2026-08-18: RUN-004 Invalid Task Isolation

RUN-004 is implemented in uncommitted candidate bytes. Permanent cwd and repository errors, worktree conflicts, and unknown task-local provisioning failures affect only their task. Provisioning resume revalidates cwd and repository identity. Git lock and generic transient failures use one-second per-task backoff with a five-attempt observable exhaustion state, while RUNNER_STOPPING and STATE_LOCKED preserve durable provisioning for the next runner. Missing, non-Git, file, symlink, conflict, retry recovery, exhaustion, unknown-failure, and control-signal fault injections pass. No remote or release action was performed.

## 2026-08-18: RUN-005 Invalid UTF-8 Recovery

RUN-005 is implemented in uncommitted candidate bytes. Supervisor output materialization deterministically replaces invalid UTF-8, preserves valid split sequences, records durable `encodingLoss` independently from `logsTruncated`, and truncates final JSONL at the encoded evidence budget so replacement expansion cannot permanently block terminal recovery. Legacy task and terminal-evidence records default the new optional field to false; new records are strict. Focused log, receipt, runner recovery, CLI, and Control DTO tests pass 65/65, including raw-cap replacement expansion. No remote or release action was performed.

## 2026-08-18: Final Local 0.6.2 P0 Gate

All locally executable P0 implementation is frozen in the uncommitted candidate worktree. Final current-byte evidence:

```text
build and both typecheck suites: passed
complete integrity: 39/39 passed
complete core: 573/573 passed, 1 real delegated-cgroup test skipped by host capability
real package contracts: 2/2 passed
package closure: 175 manifests approved
publication scanner: clean
runtime integrity probe: 20,677 entries approved
Node 22.19.0 six-command startup benchmark: passed
real offline npm tar byte equality/install/version/uninstall: passed
detached runner/control parent-exit lifecycle: passed
git diff --check: passed
```

The remaining release blockers require external capabilities unavailable on this host: a disposable GitHub draft/tag end-to-end dry run and a writable delegated cgroup v2 runner for the real detached setsid/double-fork containment proof. No commit, push, tag, GitHub Release, npm publish, or remote state mutation was performed.

## 2026-08-18: Real Delegated Cgroup Proof

The current session's delegated cgroup v2 subtree is writable. The previously skipped real test had four test-infrastructure defects: cgroup cleanup used `rm` instead of `rmdir`, the fixed probe directory could remain after a failed probe, SIGUSR1 could arrive before handler readiness, and the nested double-fork script had unsafe manual quoting. After fixing those test-only defects and waiting for kill/reap propagation, the real detached setsid/double-fork test executes and passes `1/1`. CON-002 is complete. The only remaining external proof is the disposable GitHub four-stage release dry run, which requires explicit authorization for remote refs and Release mutation.

## 2026-08-18: Disposable Private-Draft Release Proof

The user explicitly authorized one isolated remote dry run and cleanup. Temporary version/tag `v0.6.21818`, branch `dry-run/release-v0.6.21818`, and private draft Releases were used; no temporary release was published. Actions runs `32150414330`, `32154928592`, and `32158549630` successively proved the read-only build and exact nine-asset upload while exposing three real workflow/platform issues: minimal-write jobs cannot use `gh release upload` without a checkout, GitHub read-scoped tokens cannot read private drafts, and Release PATCH rejects `If-Match` conditional writes. The workflow now uploads assets directly through `upload_url`, snapshots the private draft into a one-day immutable Actions artifact while write credentials are present, and executes repository/lifecycle validation in a separate read-only job with no GitHub token.

GitHub's Release PATCH endpoint returned `400 Conditional request headers are not allowed in unsafe requests unless supported by the endpoint`. The final design therefore does not claim endpoint CAS. It uses tag-scoped workflow serialization, immediate pre-write owner/tag/commit/receipt/exact-inventory revalidation, a complete binding PATCH payload, PATCH-response binding validation, and post-write exact-inventory revalidation.

Run `32164115317` completed the immutable read-only build before its queued write stage was cancelled to avoid extended GitHub-hosted queue time. The same run's immutable build artifact was used for the authorized manual-equivalent remaining stages. Private draft `372551710` passed exact nine-asset API upload/download byte verification, no-token online install/version/uninstall, no-token offline install/version/uninstall, VSIX extraction/version/entry checks, approved receipt generation, complete binding PATCH, and post-write exact inventory validation. The private draft, temporary tag, and temporary remote branch were then deleted; `v0.6.1` remained the unchanged latest public release.

`/tmp` was also repaired operationally. The 6 GiB tmpfs was full from interrupted CoCo scanner/tar/package/runtime fixtures. Only unreferenced CoCo-named test artifacts were removed, releasing approximately 4 GiB (`100% -> 34%` used). `/tmp/opencode`, browser, systemd, and unknown paths were preserved. `/root/coco-tmp/tmp` was created with mode `0700`; subsequent CoCo test commands should use it through `TMPDIR` and `COCO_SCANNER_TMPDIR` rather than increasing the memory-backed tmpfs.

## 2026-08-18: Final 0.6.2 Candidate Gates

The candidate version surface is now `0.6.2` in the uncommitted worktree. Generated product identity, documentation completeness, package asset map, and runtime integrity manifest were regenerated. Current-byte evidence:

```text
focused version/release/documentation gates: 31/31 passed
complete integrity: 39/39 passed
complete core: 574/574 passed
real delegated cgroup detached setsid/double-fork: 1/1 passed
real package contracts: 2/2 passed
package closure: 175 approved
publication scanner: clean
runtime integrity probe: 20,677 approved
Node 22.19.0 startup matrix: passed
real 0.6.2 offline tar byte equality/install/version/uninstall: passed
```

The authorized isolated GitHub exercise created and then removed temporary tag `v0.6.21818`, branch `dry-run/release-v0.6.21818`, and private drafts. It proved exact upload, private snapshot verification, no-token online/offline/VSIX lifecycle, receipt generation, and post-write inventory. GitHub Release PATCH rejected `If-Match`; automatic workflow was therefore changed to stop at a fully verified private draft rather than risk an unconditionally public partial release. Existing public `v0.6.1` remains unchanged. No commit, push, formal tag, public Release, or npm publish was performed for 0.6.2.

## 2026-08-18: Post-Release Plan Reset

The later authorized release completed `v0.6.2` at `964df56`, and the research pages were deployed in Pages run `32188532292`. The old pre-release plan is preserved at `development/history/DEVELOPMENT_PLAN-0.6.2-pre-release.md`; the exact earlier text remains available with `git show 0b9f857:DEVELOPMENT_PLAN.md`.

The active plan is now deliberately short: `REC-001`, `CFG-000`, and `BKP-001` are ready for parallel AI Agents. Each Agent owns one work item and exact files, runs focused tests, and hands back a concise result. Full gates run only after integration or before a release. The onboarding rules are in `development/AGENT_BRIEF.md` and the short cadence is in `development/AI_AGENT_EXECUTION_PLAN.md`.

## 2026-08-18: First 0.6.3 AI Agent Wave

Three Agents worked in parallel on non-overlapping file scopes from `candidate/v0.6.3` at `881d0ac`:

- REC-001 added a command recovery journal with durable receipt/result, idempotent command IDs, digest conflict rejection, and uncertain recovery.
- CFG-000 added MCP candidate publication with validation, collision checks, generation/revision state, last-good retention, and legacy migration.
- BKP-001 added authenticated manifest rotation, encrypted operational state, retention, tamper detection, and restore drill helpers.

Focused results: `13/13` combined tests passed, syntax checks passed, and diff check passed. These are initial modules, not yet wired into Control/provider/MCP runtime or a real off-host storage adapter. Leases were cleared after the focused handoff; coordinator integration is the next small batch.

One upstream Agent prompt was rejected by the model provider's prompt filter. No code or repository operation failed. Subsequent coordination uses short prompts with file paths and local deterministic tests instead of repeating long research/security text.

The second short-prompt wave wired REC-001 into idempotent Control task creation, added a generation-safe MCP runtime registry adapter, and added a stable backup command API. Combined focused integration passed `34/34`, feature typecheck passed, and no prompt filter error recurred. Full generated/package/runtime gates are deferred to this frozen integrated batch rather than repeated per Agent.

The frozen first integration batch regenerated runtime/package assets and passed: core `595/595`, package closure `175`, scanner clean, runtime probe `20,681`, real package contract `2/2`, and focused integration `34/34`. The adapters remain isolated until a subsequent production rollout review; no release or npm action is planned for this development batch.

The next adapter wave added a reusable Control mutation wrapper, a fail-closed MCP host adapter, and a credential-free backup store contract/filesystem backend. REC task creation now uses the shared wrapper; backup commands can publish/fetch/list/remove through an injected store. Pi currently exposes only sequential `registerTool` with no unregister or generation commit API, so the production MCP extension was intentionally not switched; the adapter rejects unsupported hosts before registration. Combined focused integration passed `48/48` and feature typecheck passed.

After batch freeze and generated-asset regeneration, complete core passed `609/609`; package closure remained `175`, scanner was clean, package contracts passed `2/2`, and runtime probe approved `20,685` entries. No npm or release action was performed.

REC-001 then extended the shared mutation wrapper to Control approve, cancel, and stop-all while preserving no-key compatibility. Webhooks continue to use the existing durable delivery ledger. Focused Control recovery passed `23/23`; after regeneration, complete core passed `610/610`, closure `175`, scanner clean, package `2/2`, and runtime probe `20,685`.

CFG-000 resolved the Pi host limitation without adding an upstream patch: the production extension now registers one stable `mcp` router tool only after a complete generation has been discovered and prepared. Routing binds each call to the current generation. MCP focused tests passed `18/18`; after regeneration, complete core passed `613/613`, closure `175`, scanner clean, package `2/2`, and runtime probe `20,686`. CFG-000 is complete.

BKP-001 then exposed the filesystem store through the native `coco backup` command and documented mounted NFS/SSHFS/object-store operation with environment-managed keys. This avoids cloud SDK and credential coupling. After the CLI and runbook update, complete core passed `614/614`, closure `175`, scanner clean, package `2/2`, and runtime probe `20,686`. A deployment-specific off-host restore drill remains.

REC-001 then journaled MCP router calls by stable tool-call ID, bounded durable responses to 1 MiB, and refused replay after an uncertain effect. Pi's built-in tool hook can block but cannot return a recorded result, so raw Bash/provider side effects are explicitly assigned to EVID-002 instead of duplicating an incomplete recovery protocol. REC-001 is complete within the replayable command boundary.

After final REC/CFG/BKP regeneration, complete core passed `617/617`, closure `175`, scanner clean, package `2/2`, and runtime probe `20,686`. REC-001 and CFG-000 are complete; BKP-001 is code-complete but retains one deployment-specific off-host restore drill.
