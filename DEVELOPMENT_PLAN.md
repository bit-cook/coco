# CoCo Development Plan

Last updated: 2026-08-18

## Current State

- Released: `v0.7.2` at `652c3a9c`
- Development branch: `release/v0.7.4`
- Next target: publish `v0.7.4`; bare coweb distribution fix
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

CFG-001, EVID-001, EVID-002, TOOL-001, and ORCH-001 are complete. The initial TOOL-001 pool landed on `candidate/v0.7.4`; final production integration uses the pinned Pi candidate below.

TOOL-001 historical initial evidence: focused pool/fence tests passed, complete core `663/663`, package closure `172`, scanner clean, public package contract passed, and runtime probe `21,362`. This preceded production Pi integration.

ORCH-001 is complete. TOOL-001 production integration is complete through pinned clean Pi candidate `coco-v0.82.1-coco.11`, which preserves ordered result commit across contiguous parallel-safe segments and sequential barriers. Candidate workflow `32685150665` verifies source behavior, archive bytes, manifest/shrinkwrap binding, package smoke, and empty-cache offline install. Final CoCo gates pass core `676/676`, integrity `39/39`, closure `172`, scanner clean, package `2/2`, and runtime probe `21,368`.

The published `v0.7.1` carries that final TOOL-001 integration. Release workflow `32731763396` passed all four permission-isolated stages and published nine assets; post-release main CI `32738293959` passed. Version/release focused contracts pass `68/68`; core `676/676`, integrity `39/39`, closure `172`, scanner clean, package `2/2`, runtime probe `21,368`, and Node `22.19.0` startup performance pass. npm remains intentionally unpublished.

Post-release public verification downloaded all nine assets, validated every entry named by `SHA256SUMS`, installed through the public `install.sh` into an isolated home, observed `coco --version` as `0.7.1`, and removed the isolated install, agent state, and launcher through the public uninstaller. No npm package was published.

The published `v0.7.2` delivered differential integrity verification (ADR-005), the frame-safe localization cache (ADR-006), complete Chinese TUI coverage, and the redesigned ring-pair mark. Release workflow `32803930372` passed all four permission-isolated stages and published nine assets; Pages serves 0.7.2. Post-release public verification validated every `SHA256SUMS` entry, installed through the public `install.sh`, observed `coco --version` 0.7.2, and exercised warm FAST verification at 2.6s first paint. An in-place `COCO_BIN_DIR` upgrade exposed a self-referencing launcher link; the installer now installs the real launcher file in that topology. npm remains intentionally unpublished.
