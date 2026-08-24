# CoCo Agent Collaboration Rules

Read this file before changing the repository.

## Current Truth

- Worktree: `/root/coco-tmp/coco-v053-migration`
- Current branch: `chore/v0.7.1-release-closeout`
- Released version: `0.7.1`
- Current target: post-release maintenance only; no new research item is active
- Active plan: `DEVELOPMENT_PLAN.md`
- Work items: `development/work-items/0.7.0/`
- Execution journal: `.opencode/memory/DEVELOPMENT_JOURNAL.md`
- Historical document index: `HISTORICAL_DOCUMENTS.md`
- Generated asset rules: `development/GENERATED_ASSETS.md`

The protected migration source `/root/coco` remains a dirty `0.2.1` behavior source. Never clean, reset, overwrite, or release it.

## Required Reading Order

1. `AGENTS.md`
2. `DEVELOPMENT_PLAN.md`
3. The selected work item
4. The latest journal checkpoint
5. Relevant ADRs and generated-asset rules
6. Implementation and tests in the work-item scope

## Non-Destructive Rules

- Never use destructive reset, clean, rebase, pull, or overwrite checkout operations.
- Never modify unrelated user or agent changes.
- Never delete or rewrite historical documentation; update `HISTORICAL_DOCUMENTS.md` when adding an archive or successor.
- Do not commit, push, tag, publish, deploy, or edit remote state without explicit user authorization.
- Use `apply_patch` for manual edits.
- Do not hand-edit generated assets unless their documented generator is unavailable and the exception is recorded.
- Regenerate governed assets only after a code batch is frozen.

## Work Item Protocol

- Work only on a `ready` item whose dependencies are completed.
- Before editing, claim the item in `.opencode/work-leases.json` with the base commit, exact file scope, and expiry.
- Parallel agents must have non-overlapping file scopes.
- One coordinating agent owns shared files and reconciles cross-batch tests.
- Do not expand scope silently. Record a follow-up item instead.
- Completion requires the item acceptance tests, journal evidence, plan status update, and lease removal.

## Required Invariants

### Terminal Execution

- Persist terminal evidence before receipt or terminal-event publication.
- Once terminal evidence exists, never execute the run again.
- Authorized/no-outcome dead runs remain `EXECUTION_OUTCOME_IN_DOUBT` and are never automatically repeated.
- Recovery order remains log seal, receipt, terminal intent, task completion, terminal publication.

### Logs and Receipts

- JSONL is canonical, private, contiguous, bounded, and UTF-8 valid.
- A sealed run rejects appends.
- Receipt bytes, record count, latest timestamp, hash, and seal must agree.
- Invalid output encoding must not permanently block terminal recovery.

### Runtime Integrity

- No environment variable or externally forgeable process property may bypass verification.
- Direct launcher invocation verifies itself.
- Warm caches are trusted-local change detection; any metadata change falls back to complete hashing.
- CAS completion is written last and reuse must reject symlinks, corruption, and identity drift.

### Publication

- Archive operations use one private snapshot.
- Reject traversal, aliases, duplicates, special entries, prefix conflicts, malformed ZIP ranges/CRC, and unbound package input.
- Build/test code must not execute while repository write credentials are available.
- Failed release attempts must not expose partial public assets.

## Evidence Freshness

Every gate is one of `current`, `stale`, `not run`, `blocked`, or `failed`, and is bound to a commit. Any governed edit marks affected complete evidence stale immediately. Never quote an old green count as current after relevant code or generated assets change.

## Verification Policy

- Run focused tests after each work item.
- Run typechecks and `git diff --check` before integration.
- Read `development/GENERATED_ASSETS.md` before building.
- Run complete core/integrity/package/lifecycle gates only after a batch is frozen.
- Record exact commands, pass/fail/blocked status, and failure attribution in the journal.

## Resume Checklist

```bash
git status --short --branch
git rev-parse HEAD
node -p "require('./package.json').version"
git diff --check
```

Then read `DEVELOPMENT_PLAN.md`, inspect `.opencode/work-leases.json`, and continue the single active work item. If plan, lease, branch, or journal disagree, stop implementation and reconcile the documents first.
