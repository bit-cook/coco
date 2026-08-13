# Model Panel Source Contract

`resources/coco-model-panel-contract.mjs` 是 source-owned、无 UI 文案、无 Pi internal dependency 的模型面板语义契约。

## 当前范围

- 使用 `{provider, id}` 作为稳定 identity。
- Current model 排在第一位。
- 其余 rows 按 Provider 排序，同 Provider 保持输入顺序。
- 状态只使用 `ready` 和 `login-required`。
- Selection 只产生 `{action: select, model}` 或 `{action: login, provider}`。
- Differential tests 与当前 patched Pi `ModelSelectorComponent` 比较 rows、排序、默认模型持久化和 login handoff。

## 不宣称的能力

该 contract 不是新面板，也不注册 `/model` alias。Pi `0.82.1` 尚未提供：

- 覆盖内置 `/model` 和 Ctrl+P 的 panel registration API。
- Extension 可用的 visible-model projection。
- Provider login operation。
- Default model persistence API。

因此当前不能安全删除 model selector artifact patch。注册一个功能较少的 alias 会造成回归，不采用。

## Removal Gate

只有 runtime 提供 supported model-panel adapter，且 differential tests 在 source-owned implementation 上通过，才能移除 selector visible/login/selection anchors。Localization renderer 将在该 semantic contract 之上使用 stable message keys，不再用英文显示文本作为 key。
