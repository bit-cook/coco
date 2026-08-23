# Agent Brief

Use this short brief when joining CoCo development.

## Current State

- Released: `v0.6.3`, commit `016597c`
- Development branch: `candidate/v0.7.6`
- Next target: `0.7.0`, beginning with `ORCH-001 integration`
- npm: not published
- Website: https://bit-cook.github.io/coco/

## First Files

1. `AGENTS.md`
2. `DEVELOPMENT_PLAN.md`
3. `development/AI_AGENT_EXECUTION_PLAN.md`
4. Your work item under `development/work-items/`
5. `.opencode/work-leases.json`

## Working Rules

- Claim an exact file scope before editing.
- Do not modify another Agent's leased files.
- Do not use destructive git commands.
- Do not commit, push, tag, publish, or change remote state.
- Keep prompts short when asking another Agent for review; pass paths and questions, not large source excerpts.

## Handoff Format

Return:

- work item and files changed;
- focused commands and pass/fail results;
- remaining risks or blocked checks;
- generated files that need regeneration;
- recommended next dependency.

## Test Commands

```bash
npm run typecheck:features
TMPDIR=/root/coco-tmp/tmp node --test path/to/focused.test.mjs
git diff --check
```

Use full package and integrity gates only when the coordinator freezes an integrated batch.
