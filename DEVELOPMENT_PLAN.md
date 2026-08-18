# CoCo Development Plan

Last updated: 2026-08-18

## Current State

- Released: `v0.6.2` at `964df563312799df7f2e000b862b17beab88f42d`
- Development branch: `candidate/v0.6.2`
- Next target: `0.6.3`
- npm: not published
- Website: https://bit-cook.github.io/coco/
- Research pages: `/research.html` and `/research-zh-CN.html`

`v0.6.2` closed the release, task recovery, dispatch, provisioning, UTF-8, and Linux containment work. Do not reopen those work items unless a regression is found.

## Next Three Items

These items are ready and can be developed in parallel by separate Agents:

| Item | Goal | Depends on |
|---|---|---|
| `REC-001` | Make command effects recoverable; mark unknown effects `uncertain` | `RUN-001`, `RUN-003` |
| `CFG-000` | Publish complete MCP/config generations or keep last-good | `REC-001` |
| `BKP-001` | Rotate an authenticated off-host backup and prove one restore | `v0.6.2` |

After these three items are integrated, select the smallest next feature from the `0.7.0` research-derived work items. Do not start all of them at once.

## Agent Workflow

1. Read `AGENTS.md`, this file, `development/AGENT_BRIEF.md`, and the selected work item.
2. Claim exact files in `.opencode/work-leases.json`.
3. Implement only that item and add focused fault tests.
4. Run syntax checks, focused tests, and `git diff --check`.
5. Return changed files, commands, results, risks, and the next dependency.
6. The coordinator integrates changes and owns generated files, shared workflows, and release decisions.

See `development/AI_AGENT_EXECUTION_PLAN.md` for the short execution rules.

## Verification

- Code item: focused tests.
- Integrated code batch: affected tests plus typecheck.
- Package/runtime change: build, integrity, package, closure, scanner, and lifecycle once.
- Site/docs-only change: site contracts, local-link closure, and scanner.
- Release/tag: complete gates on the committed bytes.

Do not repeat the full release gate for every Agent or documentation edit.

## Completed Baseline

- Release asset contract and permission-isolated private-draft workflow.
- Durable supervisor launch and stop-barrier recovery.
- Durable webhook dispatch ledger and runner consumer.
- Invalid cwd, worktree, Git retry, and provisioning isolation.
- Invalid UTF-8 terminal recovery with `encodingLoss` evidence.
- Linux cgroup v2 containment and real detached descendant proof.
- Startup performance, runtime integrity, package closure, and documentation completeness.
- Bilingual external-agent research pages with fixed source commits.

## Evidence

The published `v0.6.2` passed:

- Core `574/574`
- Integrity `39/39`
- Package `2/2`
- Closure `175` manifests
- Runtime probe `20,677` entries
- Node 22.19 startup matrix
- Offline install/version/uninstall
- Real delegated-cgroup detached setsid/double-fork test
- GitHub private-draft release lifecycle and nine-asset verification

## Boundaries

- Public GitHub release requires explicit authorization.
- npm publication is independent and currently not planned.
- No broad UI redesign, speculative provider, Windows support, or wholesale external-runtime adoption during the 0.6.3 reliability wave.
- Research candidates for 0.7.0 remain in `development/work-items/0.7.0/` and are not part of the current implementation wave.
- Prime Agent and DeepSeek Harness are research inputs only; no external source or dependency was copied.

## External Research

Prime Agent and DeepSeek Harness were reviewed at fixed commits. Their useful ideas are summarized on the public research pages and mapped to future work items; neither runtime is being imported wholesale.
