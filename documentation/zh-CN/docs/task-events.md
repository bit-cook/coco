# TaskEvent v1 存储协议

TaskEvent 是 CoCo v0.3 的有界、非权威可观测层；`tasks.json` 仍是执行状态真相。

- 每个 task/run 使用 `task-events/<taskId>/<runId>.jsonl`，`seq` 连续递增，记录为 canonical JSON，UUID event ID 支持幂等重试。
- 单 stream 最多 4096 个事件或 4 MiB，单事件最多 16 KiB；文件为 `0600`，目录为 `0700`。
- v1 只记录 runner 生命周期元数据。`payloadRef` 与 `payloadDigest` 保持 `null`；prompt、命令、日志、PID、环境变量和凭据不得写入事件。
- active run 会发出有界 heartbeat。重启时会重放 pending terminal intent，并在重新排队前记录 `run.abandoned`。
- 非交互 stdout/stderr 独立存放于 `task-logs/<taskId>/<runId>.jsonl`，每个 run 最多 4096 条或 4 MiB。
- loopback bearer-token Control API 通过 `GET /v1/tasks/<taskId>/runs/<runId>/events` 和 `/logs` 提供只读分页查询，使用排他的 `cursor` 与有界 `limit`。
- 每个 terminal run 都会写入私有 canonical 收据 `task-receipts/<taskId>/<runId>.json`，记录 runner 契约、退出码、判定、时间戳，以及有界日志产物（如存在）的 SHA-256 摘要。收据发布支持幂等重试，并在 terminal event 之前完成。
- `GET /v1/tasks/<taskId>/runs/<runId>/receipt` 返回认证后的收据，不包含 task prompt、凭据或原始命令输出。`GET /v1/tasks/<taskId>/diagnosis` 保守地结合进程 identity、heartbeat 年龄和最近日志活动，返回 `healthy`、`waiting`、`stuck` 或 `unknown`；无法观察到进程时绝不会判为 stuck。
- v0.4 的首个上下文实验提供有界、只读的 JavaScript/TypeScript `buildRepoMap()`。它报告候选函数、类、导出变量、imports，以及字节/文件/符号计数，并跳过依赖和构建目录。该实现明确是 lexical 候选清单，不冒充完整语法引用图；不会编辑文件或执行命令。
- v0.4 执行契约单独表示为纯 `plan -> edit -> verify` 状态机。它拒绝跳过阶段、terminal 状态变更，以及没有明确 passed verification verdict 的 `completed`。当前切片不执行编辑或命令。

事件不能重建 `tasks.json`；旧任务可能没有完整历史，进程崩溃后也不承诺日志字节级完整。
