# Pi Upstream Baseline Dashboard

## 当前基线

- Repository：`earendil-works/pi`
- Package：`@earendil-works/pi-coding-agent`
- Version：`0.82.1`
- Npm tarball integrity：已记录于 `resources/upstream-baseline.v1.json`
- Release date：`2026-07-25`
- Source tag/commit：未记录

2026-08-12 显式在线检查观察到最新稳定版 `0.84.1`：CoCo 落后 3 个稳定 Release，发布日期差 13 天。由于 baseline source commit 未记录，commit lag 仍为 unknown；该观察不会自动改写 baseline。

Compatibility probe 已确认 `0.84.1` npm integrity 有效，但当前 patch 在第一个漂移 anchor 以 `COCO_PATCH_UNKNOWN_ANCHOR` fail closed，因此该版本为 `incompatible`，不能升级 baseline。

因此离线 dashboard 必须将 `commitsBehind` 显示为 `null`，不能用 package version 猜 source commit。

## 命令

```bash
node scripts/pi-upstream-dashboard.mjs --as-of 2026-08-12
```

默认模式：

- 不执行 DNS、HTTP、`gh`、`git fetch` 或 npm registry 请求。
- 不写文件。
- 报告 package baseline、integrity、age 和 provenance 缺口。

显式在线模式：

```bash
node scripts/pi-upstream-dashboard.mjs --online --as-of 2026-08-12
```

在线模式只查询固定的 GitHub API origin，拒绝 redirect，超时 10 秒，响应上限 2 MiB；结果只用于报告，不自动更新 baseline。

## 更新规则

1. 普通 CI 和 Release 不依赖在线查询。
2. Online check 只能进入 scheduled 或 manual workflow。
3. 更新 baseline 必须单独评审 package integrity、tag、commit 和 patch anchor。
4. 通用上游修复优先贡献；CoCo 差异记录在 patch inventory/divergence ledger。

## Compatibility Probe

`scripts/pi-upstream-compatibility.mjs` 只接受显式精确版本：

```bash
npm run probe:upstream -- --version 0.84.1
```

Probe 在临时目录安装公开 npm candidate，校验 registry integrity，使用当前未放宽的 patch transforms 检查 anchors，再执行 syntax 和 credential-free offline smoke。Receipt 永远是 advisory，`promotionAuthorized` 固定为 `false`；candidate 通过也不能自动更新 baseline。

Receipt schema v2 还包含 `modelPanelRuntimeAdapter` advisory，对 baseline patched、candidate before patch 和 candidate after patch 分别检查 exact artifact/symbol capabilities。该 advisory 不参与 compatibility gate，也不能授权 promotion。

Scheduled/manual workflow 使用独立 `coco-upstream` runner，不执行 pull request、不修改仓库、不发布 Release。普通 CI 只测试离线 receipt/参数/workflow 契约。
