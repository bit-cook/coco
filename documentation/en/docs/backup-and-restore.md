# Backup and Restore

The canonical operator guide is [`BACKUP_AND_RESTORE.md`](../../../BACKUP_AND_RESTORE.md).

The latest verified project backup is stored outside the worktree:

```text
/root/coco-tmp/coco-backups/coco-full-20260817T190344Z
```

It includes complete Git refs/history, committed source, physical dependencies, the nine `v0.6.1` release assets, GitHub/Pages metadata, SHA-256 manifests, and an isolated restore drill.

Sensitive `/root/.coco` and OpenCode state are intentionally excluded because this is an unencrypted project backup. Use separately encrypted storage for credentials, prompts, task logs, and local configuration.

Quick verification:

```bash
cd /root/coco-tmp/coco-backups/coco-full-20260817T190344Z
sha256sum --check SHA256SUMS
git bundle verify coco-all-refs.bundle
```

Restore into a new directory; never overwrite the active worktree:

```bash
git clone /root/coco-tmp/coco-backups/coco-full-20260817T190344Z/coco-all-refs.bundle /root/coco-tmp/coco-restored
```

Read the canonical guide before restoring dependencies, release assets, or sensitive state.
