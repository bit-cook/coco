# RFC：Builtin Model Panel Adapter

## 状态

`Contract / upstream-or-selective-fork proposal / not registered in Pi 0.82.1`

## 目标

提供一个原子的 `registerBuiltinModelPanel(adapter)` host seam，同时拥有：

- `/model`
- `app.model.select`
- `app.model.cycleForward`
- `app.model.cycleBackward`

不存在 adapter 时必须完整保留当前 built-in fallback。Duplicate owner 必须确定性失败，reload/unload 必须中止所有 active invocation 并原子恢复 fallback。

## Runtime Facade

Host 提供私有 facade，而不是公开整个 `ModelRuntime`、`SettingsManager` 或 `AgentSession`：

- cached visible models
- scoped models
- configured-auth observation
- bounded background refresh
- complete provider login flow
- default-model persistence
- `AgentSession.setModel()` activation
- `AgentSession.cycleModel()` delegation

Cycle 必须委托 host，adapter 不得从 rows 自行推导 target，否则会破坏 scope、thinking、auth 和 event semantics。

## 当前 CoCo Contract

`resources/coco-model-panel-adapter-contract.mjs` 提供 source-owned conformance host，验证原子 ownership、fallback、query/action routing、duplicate conflict 和 reload cancellation。它没有 Pi import，也不会注册实际 runtime。

`resources/coco-model-reference-resolver.mjs` 和 `resources/coco-model-panel-controller.mjs` 已实现 source-owned exact reference、cached-first projection、bounded refresh、ready persist-before-activate、locked login-only、cycle delegation 和 close cancellation。它们是 headless implementation，不包含 TUI 或 Pi internal imports。

## 上游或 Selective Fork Gate

1. Pi host 实现该 atomic seam和runtime facade。
2. Host integration tests与CoCo conformance suite通过。
3. Source-owned model panel使用semantic contract和stable-key renderer。
4. Differential parity覆盖cached-first refresh、login、persistence、activation、cycle和errors。
5. 才能删除model selector artifact anchors。
