# CONTROL-001: Control Task Pipeline End-to-End Usability

```text
Status: completed
Priority: P0 user-reported
Target: 0.7.4
Owner: opencode-control-001
Depends on: COWEB-002
Reported: 2026-08-27 public dashboard unusable; tasks flash, approve yields nothing
```

## Problem

Real E2E against the running control service: every task transitions to
`failed` within one second with `lastError = "coco: ERR_MODULE_NOT_FOUND"`.
The detached supervisor launches the agent via `resolve(root, "bin", "coco")`
where `root` is the bootstrap CAS runtime snapshot (`~/.coco/agent/runtime/<key>/`).
Trust anchors `bin/coco` and `scripts/coco-bootstrap.cjs` are deliberately not
materialized into snapshots, so the agent entry never exists and no task can
ever run. Secondary UI defects hide the failure: the 3s poller wipes and fully
rebuilds the task grid (visible flashing), N+1 serial detail fetches stall the
rebuild, action errors are swallowed silently, and a mid-render rejection
leaves the grid truncated.

## Required Invariants

- Detached runs launch the same verified app entrypoint as an ordinary
  `coco` invocation; snapshots stay trust-anchor-free.
- Dev mode (control started without bootstrap env) behavior is unchanged.
- Task lifecycle observable in UI without full-DOM rebuild flicker.
- Action failures surface to the operator instead of disappearing.

## Scope

- `scripts/coco-bootstrap.cjs` (export COCO_APP_ROOT)
- `scripts/task-run-supervisor-main.mjs` (entry resolution prefers COCO_APP_ROOT)
- `control/public/app.js`, `control/public/index.html`, `control/public/control.css`
- `test/task-run-supervisor.test.mjs`
- regenerated governed assets if hashes change

## Acceptance

1. Approved task completes with non-empty result text through the real API. — ✅ verified (commit `8a7d92a` produced by run)
2. Blocked task + `/approve` completes the run. — ✅ verified
3. Browser session (CDP) connects with token, creates a task, observes incremental card updates without grid wipe, approves, sees result. — ✅ 7/7 over public URL (`e87c8767d21f36.lhr.life`)
4. Focused control/supervisor tests pass; integrity gate passes after asset regeneration; `git diff --check` clean. — ✅ 15/15 + 49/49, integrity pass, clean

## Status Addendum (2026-08-27)

Implementation and verification complete; awaiting commit authorization.
Follow-up recorded: runner state files can pin stale snapshot dirs across
manifest-changing upgrades — `resolveRuntimeRoot`/`startDetachedRunner` reuse
needs an identity-drift policy item (RUNNER-STATE-DRIFT).

## Addendum 2 (2026-08-27 evening): create-time cwd validation + runtime-root drift fix

User follow-up ("approve on 2+3 does nothing") traced to UX feedback chain: the
cwd they entered (`coco-test`) does not exist; provisioning correctly rejected
`TASK_CWD_INVALID` and reset the task to blocked per retry design, so approve
appeared to be a no-op while the only signal was a small dim mono line.

- `control-service.mjs`: POST /v1/tasks validates cwd upfront (`validateTaskCwd`):
  non-existent/non-directory → 400 `TASK_CWD_INVALID`; worktree-requiring task in
  a non-git dir → 400 `WORKTREE_REPOSITORY_INVALID`; retryable/locked git states map
  to 503. PUBLIC_ERRORS extended accordingly.
- `runtime-root.mjs`: `resolveRuntimeRoot` prefers `COCO_RUNTIME_ROOT` when it passes
  CAS self-verification (marker.manifestHash equals sha256 of the snapshot's bundled
  manifest), falling back to state pins; fixes silent reuse of pre-upgrade snapshot
  dirs that kept serving stale control/runner code across asset regenerations
  (closes RUNNER-STATE-DRIFT as designed behavior; drift now detected via hash check).
- `app.js`+CSS: failures render as prominent error blocks (`.task-result[data-kind=error]`,
  ⚠ header), results as before.

Evidence: suites `task-run-supervisor` 15/15, `control-service`+recovery trio 20/20,
runner/worktree/control trio 18/18; live API 400 matrix (bogus cwd, non-git cwd);
happy-path task completed again post-fix through public URL; headless browser over
public URL: form reject notice immediate + no ghost task + error styling + completion
render (all pass). Snapshot rotation verified: service now runs newest key
`96cccfe1…`, older dirs left on disk (cleanup follow-up).
