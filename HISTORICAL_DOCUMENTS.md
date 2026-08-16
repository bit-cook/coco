# CoCo Historical Documents and Backup Index

This index preserves the location and purpose of older plans, migration records, and backups. Historical files remain in place and must not be deleted or rewritten as current truth.

## Current Documents

- Active execution plan: `DEVELOPMENT_PLAN.md`
- Agent rules: `AGENTS.md`
- Formal English review: `documentation/en/docs/development-review-plan.md`
- Formal Chinese review: `documentation/zh-CN/docs/development-review-plan.md`
- Public current plan: `site/plan.html`
- Live chronological journal: `.opencode/memory/DEVELOPMENT_JOURNAL.md`

## Preserved Migration History

- English migration and recovery journal: `documentation/en/docs/development-migration-journal.md`
- Chinese migration and recovery journal: `documentation/zh-CN/docs/development-migration-journal.md`
- Repository changelog: `CHANGELOG.md`
- English packaged changelog: `documentation/en/CHANGELOG.md`
- Chinese packaged changelog: `documentation/zh-CN/CHANGELOG.md`

## Preserved Strategy and Research

- Current public engineering plan: `site/plan.html`
- Strategy 2026: `site/roadmap.html`
- Legacy roadmap snapshot: `site/roadmap-legacy.html`
- Legacy product research: `site/landscape.html`
- Chinese strategy source: `documentation/zh-CN/docs/strategy-roadmap-2026.md`
- Product manifest RFC: `documentation/zh-CN/docs/product-manifest-rfc.md`
- Model panel RFC and contract:
  - `documentation/zh-CN/docs/model-panel-adapter-rfc.md`
  - `documentation/zh-CN/docs/model-panel-contract.md`

## Backup Before 0.6.2

Baseline commit:

```text
e085d3dc2b59074c23a52f4fe4c76c17504d0e5b
```

Local immutable references:

```text
branch: backup/pre-v0.6.2-20260816
bundle: /root/coco-tmp/coco-backups/coco-pre-v0.6.2-20260816.bundle
checksum: /root/coco-tmp/coco-backups/coco-pre-v0.6.2-20260816.bundle.sha256
```

Verify the backup:

```bash
git bundle verify /root/coco-tmp/coco-backups/coco-pre-v0.6.2-20260816.bundle
sha256sum --check /root/coco-tmp/coco-backups/coco-pre-v0.6.2-20260816.bundle.sha256
```

Restore into a new directory without changing the active worktree:

```bash
git clone /root/coco-tmp/coco-backups/coco-pre-v0.6.2-20260816.bundle coco-restored
```

Never restore by resetting or overwriting the active worktree.

## Interpretation Rule

When documents disagree:

1. `AGENTS.md` controls collaboration and safety rules.
2. `DEVELOPMENT_PLAN.md` controls current execution order and status.
3. Work-item files control implementation scope and acceptance.
4. ADRs control accepted architecture decisions.
5. The live journal records what actually happened.
6. Files listed as historical explain prior decisions but do not define current status.
