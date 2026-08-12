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
