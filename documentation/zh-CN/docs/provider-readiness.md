# Provider Readiness v1

`scripts/provider-readiness.mjs` 提供 additive、只读的 Provider readiness projection。它当前不改变启动、模型选择、Provider sync、网络请求、退出码或现有 JSON 输出。

## 核心边界

- Credential `available` 只表示本地存在候选凭据，不表示服务接受该凭据。
- `localStatus: ready` 只表示 Provider 配置、模型和非 rotation credential 在本地齐备。
- Network verification 是独立维度；`models-endpoint` 成功不等于 inference 已验证。
- Bootstrap `applied` 和 sync `applied` 是 mutation status，不是 readiness。

## Local Status

- `ready`
- `credential-missing`
- `rotation-required`
- `provider-missing`
- `model-missing`
- `unknown`

## Verification Status

- `verified`
- `rejected`
- `inconclusive`
- `not-checked`

Verification scope 当前允许 `models-endpoint` 和 `inference-endpoint`。`not-checked` 必须没有 scope，其余状态必须声明 scope，避免产生不明确的“已验证”声明。

Auth status JSON 已 additive 返回该 projection，并保留所有原有字段。Auth status 只有 credential 和 rotation observations，因此 credential 存在但 provider/model 未检查时必须返回 `localStatus: unknown`。

Doctor JSON 已增加顶层 `providers` 数组，并组合默认 Provider 的 configuration、model、credential 和 rotation observations。本地条件齐备时可返回 `localStatus: ready`，但在没有网络 probe 证据时 verification 仍为 `not-checked`。

Provider sync 的每个成功结果已增加 `readiness`，并将成功证据限定为 `verification.scope: models-endpoint`。原有 `status`、`modelCount`、`provider` 和 `catalogSha256` 字段保持不变。允许 empty catalog 时 verification 可以是 `verified`，但 model/local status 仍必须是 `missing`/`model-missing`。

启用 connectivity 的 Doctor 会为每个实际 probe 的 Provider 保留 verification projection：401/403 是 `rejected`，其他 HTTP、schema 或 network failure 是 `inconclusive`。Default Provider 始终排在首位且即使没有 credential 也保留 local projection。原有 aggregate `PROVIDER_CONNECTIVITY` check、status 和 exit code 保持不变。

Bootstrap 结果新增 `providerReadiness.current` 和 `providerReadiness.projected`，scope 为 `all-managed`。Dry run 的 projected 是应用安全、非冲突修改后的预测状态；apply 返回同一计划对应的 committed projection；noop 时 current 与 projected 相同。

Bootstrap 通过只读 sanitized observation 读取 auth、environment、legacy models credential 和 rotation metadata。结果只包含 `available/missing`、source 和 rotation boolean，不包含 key、环境变量名或 credential 内容。读取在 bootstrap 创建目录、恢复 transaction 或写状态前完成；无效或 symlinked credential state fail closed。

Doctor local readiness 与 connectivity 复用同一 sanitized observation，不执行 transaction recovery。Legacy models credential 可参与 default AUTH_STATUS 和 connectivity probe，但 key 仅瞬时传给 probe，不进入结果。

`coco manage providers status [provider] [--json]` 提供 all-managed 或单 Provider 的统一本地只读视图。它不联网、不恢复 transaction、不修改状态；catalog 保守显示 `unknown`，verification 固定为 `not-checked`。
