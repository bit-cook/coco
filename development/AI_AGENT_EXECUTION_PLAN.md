# AI Agent Plan

Last updated: 2026-08-18

CoCo uses AI Agents as the main development workforce. Keep the plan small: three work items, clear ownership, focused tests, and one integration gate per batch.

## Now: 0.6.3

Run these three work items in parallel. Their file scopes do not overlap:

| Work item | Goal | First result |
|---|---|---|
| `REC-001` | Make command effects recoverable and mark unknown effects `uncertain` | journal schema and crash tests |
| `CFG-000` | Publish a complete MCP/config generation or keep last-good | candidate/rollback tests |
| `BKP-001` | Rotate an authenticated off-host backup and prove restore | one restore drill |

After each item, the Agent returns a focused test result and a short handoff. The coordinator integrates the three results, then runs the affected subsystem tests once.

## Later: 0.7.0

Start only after the 0.6.3 contracts are stable:

- `EVID-001` model-input ledger
- `EVID-002` durability fence
- `CFG-001` provider/MCP generations
- `TOOL-001` ordered bounded tools
- `ORCH-001` lineage and continuation

## How Agents Work

1. Read `AGENTS.md`, `DEVELOPMENT_PLAN.md`, the work item, and `development/AGENT_BRIEF.md`.
2. Claim the exact files in `.opencode/work-leases.json`.
3. Implement only that work item and add focused fault tests.
4. Run syntax checks, focused tests, and `git diff --check`.
5. Return changed files, commands, results, risks, and a suggested next dependency.
6. Do not commit, push, tag, publish, or edit another Agent's files.

## Gate Rhythm

- Code change: focused tests only.
- Integrated code batch: affected subsystem tests plus typecheck.
- Package/runtime/generated change: full build, integrity, package, closure, scanner, and lifecycle once.
- Site/docs-only change: site contracts, local-link closure, and scanner.
- Release/tag: full gates on committed bytes.

Strict review is reserved for credentials, public release, durable replay, subprocess containment, secrets, and package assets. Normal documentation, translations, and internal refactors use focused checks.
