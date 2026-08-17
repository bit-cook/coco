# CoCo Engineering Review and Development Plan

Last reviewed: 2026-08-16

This document records the post-release review of CoCo `0.6.1` and the ordered development plan that follows from it. It is a risk and execution plan, not a claim that every listed improvement is already implemented.

## Verified Baseline

The review baseline is the committed and published release:

```text
version: 0.6.1
commit: b88190b4433c292f6adeb01273d60cb284deb45a
tag: v0.6.1
release workflow: passed
release assets: 9/9 present
npm publication: not performed
```

Release evidence includes complete core `472/472`, integrity `37/37`, package closure over 175 manifests, a clean publication scan, online installation lifecycle verification, offline and VS Code artifacts, and SHA-256 manifests.

Startup performance on the release-candidate host improved from approximately 15.74 seconds cold and 6.19 seconds warm to 9.37 seconds cold and 2.18 seconds warm for `coco --list-models`.

The untagged `candidate/v0.6.2` PERF-001 batch later measured approximately 7.14 seconds cold and 1.22 seconds warm p50. These are candidate measurements, not a claim about the published `0.6.1` one-click installation.

## Review Decision

The next cycle should not begin with new end-user features. The highest-value path is a security and reliability patch release, followed by long-running scalability and then an explicit platform-support decision.

The corrected target sequence is:

```text
0.6.2  release safety, task recovery, and containment policy decision
0.6.3  command recovery journal if not pulled into 0.6.2
0.7.0  long-running state, retention, Control scalability, and research prototypes
0.8.0  platform delivery closure, if broader platform support is selected
```

## P0: Release Safety

### Isolate publication credentials

The current release job holds `contents: write` while it checks out the repository, installs dependencies, builds, and runs tests. The workflow must be split into:

1. A read-only build-and-verify job with checkout credentials disabled.
2. A minimal publish job that downloads a digest-bound artifact and does not execute repository code or dependency installation.

Acceptance criteria:

- Build and test steps cannot read a repository write token.
- The publish job does not run `npm ci`, build scripts, tests, or package scripts.
- The exact artifact digest produced by the build job is verified before publication.

### Make releases atomic and immutable

Publication should be draft-first. Assets must not be uploaded with `--clobber`.

Acceptance criteria:

- A failed release remains private as a draft.
- The expected asset names and count are exact.
- Uploaded assets are downloaded and checked for size and SHA-256 before publication.
- Online install, offline fresh install, uninstall, and VSIX structure checks complete before the release becomes public.
- A rerun cannot replace assets under an existing tag and version.

### Bind the offline package to the public package

The offline builder currently performs a second `npm pack`. It must instead consume the already verified public tarball.

Acceptance criteria:

```text
SHA256(public coco-<version>.tgz)
  == SHA256(offline ZIP / coco-package.tgz)
```

The offline builder must accept the tarball path and expected digest as explicit inputs.

### Tighten package and archive verification

This is a P0 release gate, not a deferred quality task. REL-004 must complete before REL-003's final integration and before REL-002 can publish.

- Require `package-lock.json`; do not treat unrelated `ENOENT` failures as an optional lock.
- Validate every direct bundled dependency independently.
- Require an exact offline `SHA256SUMS` member set.
- Apply canonical path, duplicate, type, and prefix-conflict checks before offline tar extraction.
- Add high-confidence standalone npm-token detection.
- Add signed Node checksums or repository-pinned Node archive digests.

## P0: Task Recovery and Containment

### Durable supervisor launch FSM

Persist the complete launch sequence:

```text
prepared -> registered -> authorized -> outcome
                         -> revoked
prepared/registered -> abandoned
```

An unauthorized run whose process is absent must be abandoned and requeued with a new run ID. An authorized run whose process is absent and has no outcome must remain `EXECUTION_OUTCOME_IN_DOUBT` and must not be repeated automatically.

Required fault tests kill the runner or supervisor after every transition and prove eventual convergence without duplicate execution or permanent `running` state.

RUN-005 is serial with this item because invalid-UTF-8 terminal recovery shares the launch/recovery schema and runner files. RUN-003 may implement its delivery ledger independently, but its runner-ownership clear/retry integration waits for this FSM.

### Containment policy and implementation

Process groups are not a complete containment boundary because a child can detach or create a new session.

CON-001 first decides the 0.6.2 versus immediate-0.6.3 placement and documents the platform guarantee. CON-002 owns implementation if the decision approves Linux cgroup v2.

Preferred implementation:

- Linux: one cgroup v2 per run and `cgroup.kill` for termination.
- Windows: Job Object.
- macOS and other POSIX systems: explicit descendant tracking or a documented weaker guarantee.

Termination is successful only when the containment is empty.

### Recover webhook dispatch

Webhook acceptance and task queueing are durable, but runner dispatch also needs a persistent outbox:

```text
delivery accepted -> task queued -> dispatchPending
runner ownership observed -> dispatchPending cleared
```

A duplicate delivery for a still-queued task must idempotently retry dispatch.

### Isolate bad tasks from the queue

Invalid or missing `cwd`, non-Git worktree requests, and permanent provisioning errors must block or fail only their task. They must never terminate the global runner or starve later tasks.

### Correct stop and output recovery

- Use one strict stopping-barrier schema with `ownerPid`, `ownerIdentity`, and `operationId`.
- Only the barrier owner may clear it.
- Normalize invalid UTF-8 deterministically and record encoding loss instead of repeatedly failing terminal recovery.
- Use a minimal environment allowlist for unattended task processes.

## P1: Long-Running Operation (`0.7.0`)

### State retention

- Separate active tasks from terminal history.
- Archive terminal tasks by age and count.
- Add `coco task prune` and an authenticated Control operation.
- Apply one retention policy to task records, logs, receipts, supervisor artifacts, worktrees, branches, and compile caches.
- Rotate `runner.log` and `control.log`.

The system must still accept new tasks after more than 10,000 historical completions.

### Control scalability

- Paginate task summaries.
- Fetch task detail only when a user expands a task.
- Replace overlapping three-second polling with one cancellable, non-reentrant refresh loop.
- Display connection errors and the last successful refresh time.
- Add benchmarks for 100, 1,000, and 10,000 task histories.

### Operator visibility

`coco doctor` should report task counts, state bytes, runtime and compile-cache usage, retained worktrees, disk and inode headroom, pending dispatches, and recovery blockers.

## P2: Platform Closure (`0.8.0` or a Dedicated Platform Release)

The product must make an explicit decision instead of implying support from partial code paths.

### Option A: Linux and macOS only

- State that Windows is unsupported in installation, npm preflight, and documentation.
- Add macOS clean install, upgrade, Control lifecycle, task cancellation, and uninstall smoke tests.

### Option B: Full Windows support

- Add PowerShell install and uninstall flows.
- Publish and test a Windows offline bundle.
- Implement Job Object task containment.
- Add Windows Control, runner, upgrade, and cleanup lifecycle tests.

For either option, CI should cover the minimum supported Node version, the installer-pinned Node version, and the current LTS on every supported operating system.

## Work That Should Wait

The following work should not displace the P0 batches:

- Dashboard visual redesign.
- New Agent features or orchestration modes.
- Additional providers without a concrete user requirement.
- Broad Windows claims before an installer and lifecycle evidence exist.
- Further startup shortcuts that weaken integrity or race detection.

## Execution Order

1. Freeze the `0.6.2` scope to release safety and deterministic task recovery.
2. Implement release credential isolation and draft-first publication.
3. Implement supervisor launch recovery, stopping-barrier correction, webhook dispatch outbox, invalid-task isolation, and UTF-8 recovery.
4. Complete CON-001 policy decision; implement CON-002 only if approved.
5. Run focused crash and supply-chain tests.
6. Regenerate governed assets once.
7. Run complete core, integrity, package, offline, VSIX, and lifecycle gates.
8. If command-level recovery is not explicitly pulled into 0.6.2, schedule REC-001 for 0.6.3 before EVID-002.
9. Publish only from committed bytes and only after the draft asset lifecycle passes.

## Release Exit Criteria

`0.6.2` is ready only when:

```text
release build runs without write credentials
failed publication cannot expose a partial release
release assets cannot be overwritten
offline and public tarballs are digest-identical
every pre-authorization crash state converges
no single invalid task can poison the queue
duplicate webhooks recover pending dispatch
concurrent stop operations elect one owner
invalid UTF-8 cannot prevent terminal evidence
complete core, integrity, package, and lifecycle gates pass
```
