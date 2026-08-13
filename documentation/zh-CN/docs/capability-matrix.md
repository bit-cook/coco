# CoCo v0.5.2 能力矩阵

机器可读矩阵位于 `resources/capability-matrix.v1.json`。状态只允许：`production`、`production-with-debt`、`contract`、`experimental`、`platform-limited`、`planned`。

## Production

- 私有、事务化、可恢复的 managed state。
- Durable background tasks、进程身份和保守取消。
- Task events、bounded logs、terminal receipts 和 diagnosis。
- `/goal` 与 saved-session `/loop`。
- MCP stdio client 和 approval policy。
- 五个 managed providers、model seeds、LKG catalog 和 custom OpenAI-compatible provider。
- 英文/简中 TUI 和橙墨/橙纸配对主题，但当前实现存在 artifact patch debt。
- Git worktree task isolation。
- Loopback control service 和 VS Code client。
- Offline startup、package closure、runtime integrity 和 secret scan。

## Contract

- `isolated-required` / `host-explicit` execution policy 和 evidence chain。
- Plan → edit → verify 状态机。
- Unified Provider readiness contract：configuration、model、credential、rotation、catalog、local status 和 network verification projection。
- Stable-key model-panel TUI contract：semantic rows、renderer、controller、presenter、atomic adapter conformance 和 runtime capability gate。

这些 contract 会拒绝不安全状态，但当前不等于生产 sandbox 或完整自动编辑执行器。

## Experimental

- JS/TS lexical repository map。
- Auto-loaded subagent example。

Subagent 的独立 context 不等于 OS isolation。

## Platform-limited

- 官方 online installer：Linux/macOS x64/arm64。
- 当前发布的 self-contained offline bundle：Linux x64。
- Windows 有部分 runtime adapter 和文档，但不是官方 installer target。

## Planned

- 完整 Provider lifecycle state machine、transition API、selection/activation gate 和 persisted health history。
- Source-owned TUI host registration与其他panels的stable-key迁移。
- Project memory、checkpoint 和 per-model context budget。
- Controlled workflow engine。
- OS-enforced sandbox backend。
- SBOM、attestation 和完整跨平台 release smoke。

文档和网页不得把 `contract`、`experimental` 或 `planned` 描述为 production。
