# CoCo Agent Handoff

Read this file before changing the repository.

## Canonical Development Worktree

- Active migration worktree: `/root/coco-tmp/coco-v053-migration`
- Baseline commit: `6ec5dd3d2105cacbed2e6ea795d74b9eb2155118`
- Baseline product version: `0.5.3`
- Git state: detached HEAD by design; do not create commits, tags, branches, or remote changes unless the user explicitly requests them.
- Live execution journal: `.opencode/memory/DEVELOPMENT_JOURNAL.md`
- Stable English migration guide: `documentation/en/docs/development-migration-journal.md`
- Stable Chinese migration guide: `documentation/zh-CN/docs/development-migration-journal.md`

`/root/coco` is a dirty migration source based on `0.2.1`. It contains useful, tested security work, but it is not the product-version source of truth and must not be released or advanced as the main candidate.

## Non-Destructive Rules

- Never reset, clean, checkout over, rebase, pull into, or delete either worktree.
- Never remove untracked files from `/root/coco`, including profiler output.
- Never overwrite a `0.5.3` file wholesale with its `/root/coco` counterpart. Migrate behavior semantically and preserve upstream execution evidence, provider, TUI, model-panel, and release features.
- Do not commit, push, tag, publish, upload, or edit remote state without explicit user authorization.
- Use `apply_patch` for manual edits.
- Regenerate asset maps and runtime manifests only after a code batch is frozen.

## Required Invariants

### Terminal Execution Evidence

- A child exit result must be persisted as `terminalEvidence` before receipt or terminal-event publication.
- Once terminal evidence exists, the run must never execute again.
- Recovery order is log seal, receipt, terminal event intent, task completion, terminal event publication.
- Receipt or event failure must retain the terminal evidence outbox for restart recovery.

### Task Logs

- JSONL records are canonical, contiguous, private, bounded, and UTF-8 valid.
- The index is a validated cache, not a source of truth.
- A sealed run rejects all later appends.
- A receipt may reference only a sealed descriptor whose bytes, record count, latest timestamp, and SHA-256 still match the log.

### Archive Verification

- Archive listing, scanning, and extraction operate on one private snapshot, never the caller-controlled path after validation starts.
- Reject non-canonical paths, duplicates, aliases, special entries, prefix conflicts, overlapping ZIP ranges, malformed EOCD, metadata disagreement, and CRC mismatch.
- A release tarball regular file must match the current source candidate in bytes and normalized mode.

### Runtime Integrity

- No environment variable or process property may bypass verification.
- CJS and ESM cache readers/writers must use the same schema and startup closure.
- Warm cache is trusted-local change detection, not protection from an attacker who can modify both runtime and cache.

## Resume Checklist

Run these commands before continuing:

```bash
git status --short --branch
node -p "require('./package.json').version"
git diff --check
```

Expected candidate version is `0.6.1`. Read the latest checkpoint in the migration journal, then inspect only the files in the active batch.

The Phase A-F implementation batch is frozen. Persistent CAS runtime roots, terminal evidence/log sealing, bounded supervisor capture, provisioning recovery, Control summary/detail DTOs, webhook idempotency, dependency materialization, and publication archive scanning are complete. Current generated assets pass core 470/470, integrity 36/36, real npm pack, closure, scanner, runtime probe, and detached lifecycle gates. Do not edit governed code without marking this evidence stale and regenerating artifacts.

## Verification Policy

- Run narrow tests after each batch.
- Do not run the ten-minute integrity suite until all governed files are frozen and the manifest is regenerated.
- A failed test caused by absent `node_modules` in this worktree is an environment blocker, not proof of code correctness. Restore or link dependencies using a verified non-mutating approach before final validation.
- Record every test command, result, and failure attribution in the journal.

## Mandatory Journal Protocol

- Treat the migration journal as part of every implementation batch. Update it
  after discovery, implementation, any failed assumption or test, plan changes,
  generated-asset changes, and before handoff or stopping.
- Each checkpoint must state the date, objective, exact files changed, decisions
  and invariants, commands actually run, pass/fail/blocked results, stale
  generated assets, unresolved risks, and the next executable action.
- Never call a blocked or unrun test passed. Mark evidence as `passed`, `failed`,
  `blocked`, `not run`, or `stale`, and explain why.
- Keep the recovery header and latest checkpoint in
  `.opencode/memory/DEVELOPMENT_JOURNAL.md` synchronized with the real worktree.
  Stable design belongs in packaged documentation; chronological execution
  evidence belongs only in the live journal so routine logging does not stale
  runtime or package assets.
- Parallel agents must have non-overlapping file scopes and return changed files,
  tests, and blockers. The coordinating agent records and cross-checks their
  results in the journal.
- Never write credentials, raw private prompts, sensitive output, email contents,
  or tokens to the journal. Use hashes, redacted labels, bounded metadata, and
  stable error codes.
