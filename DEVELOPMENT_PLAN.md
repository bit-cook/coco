# CoCo Development Plan

Last updated: 2026-08-18

## Current State

- Released: `v0.6.3` at `016597c95efa511c861ed651b1ded9e56c9ed22c`
- Development branch: `candidate/v0.7.4`
- Next target: `0.7.0`, starting with `TOOL-001` only
- npm: not published
- Website: https://bit-cook.github.io/coco/
- Research pages: `/research.html` and `/research-zh-CN.html`

`v0.6.3` closed command recovery, atomic MCP publication, and authenticated off-host backup work. Do not reopen completed 0.6.x work unless a regression is found.

## Completed 0.6.3 Wave

The release wave is complete:

| Item | Goal | Depends on |
|---|---|---|
| `REC-001` | Make command effects recoverable; mark unknown effects `uncertain` | completed |
| `CFG-000` | Publish complete MCP/config generations or keep last-good | completed |
| `BKP-001` | Rotate an authenticated off-host backup and prove one restore | completed |

The three-item 0.6.3 wave is released. Start `CFG-001` only; do not start the rest of 0.7.0 at once.

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

The published `v0.6.3` passed:

- Core `619/619`
- Integrity `39/39`
- Package `2/2`
- Closure `175` manifests
- Runtime probe `20,686` entries
- Node 22.19 startup matrix
- Offline install/version/uninstall
- Real delegated-cgroup detached setsid/double-fork test
- GitHub private-draft release lifecycle and nine-asset verification

Control and MCP commands are journaled, MCP generations publish atomically through one router, and native mounted off-host backups passed a two-runner restore drill. Raw Bash/provider side effects move to EVID-002 because the host hook cannot replay a recorded result. Next: `CFG-001` only.

## Boundaries

- Public GitHub release requires explicit authorization.
- npm publication is independent and currently not planned.
- No broad UI redesign, speculative provider, Windows support, or wholesale external-runtime adoption during the 0.6.3 reliability wave.
- Research candidates for 0.7.0 remain in `development/work-items/0.7.0/` and are not part of the current implementation wave.
- Prime Agent and DeepSeek Harness are research inputs only; no external source or dependency was copied.

## External Research

Prime Agent and DeepSeek Harness were reviewed at fixed commits. Their useful ideas are summarized on the public research pages and mapped to future work items; neither runtime is being imported wholesale.

CFG-001, EVID-001, and EVID-002 are complete and merged to main. TOOL-001 initial ordered pool is implemented on `candidate/v0.7.4`; production Pi tool-loop integration remains. ORCH-001 remains pending.

TOOL-001 initial evidence: focused pool/fence tests pass, complete core `663/663`, package closure `172`, scanner clean, public package contract passed, and runtime probe `21,362`. Parallel-safe segments overlap, exclusive calls form barriers, and results commit in request order. Pi tool-loop integration is blocked pending a batch hook.

ORCH-001 staged foundations are now present: durable inbox with priority/admission, bounded continuation policy, and supervisor-owned parent/child lineage. Focused ORCH tests pass; production runner integration remains.
