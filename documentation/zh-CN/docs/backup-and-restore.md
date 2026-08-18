# 完整备份与恢复

权威运维手册：[`BACKUP_AND_RESTORE.md`](../../../BACKUP_AND_RESTORE.md)。

最新已验证项目备份保存在工作树之外：

```text
/root/coco-tmp/coco-backups/coco-full-20260817T190344Z
```

备份包含：完整Git refs和历史、committed source、物理依赖树、`v0.6.1`九个发布资产、GitHub/Pages元数据、SHA-256清单和隔离恢复演练证据。

由于该项目备份未加密，敏感的`/root/.coco`和OpenCode状态被明确排除。Provider凭据、prompt、task log和本地配置必须使用独立加密介质备份。

快速验证：

```bash
cd /root/coco-tmp/coco-backups/coco-full-20260817T190344Z
sha256sum --check SHA256SUMS
git bundle verify coco-all-refs.bundle
```

恢复到新目录，绝不能覆盖当前工作树：

```bash
git clone /root/coco-tmp/coco-backups/coco-full-20260817T190344Z/coco-all-refs.bundle /root/coco-tmp/coco-restored
```

恢复依赖、发布资产或敏感状态前，必须完整阅读权威手册。
