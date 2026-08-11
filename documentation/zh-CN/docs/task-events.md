# TaskEvent v1 存储协议

TaskEvent 是 CoCo v0.3 的有界、非权威可观测层；`tasks.json` 仍是执行状态真相。

- 每个 task/run 使用 `task-events/<taskId>/<runId>.jsonl`，`seq` 连续递增，记录为 canonical JSON，UUID event ID 支持幂等重试。
- 单 stream 最多 4096 个事件或 4 MiB，单事件最多 16 KiB；文件为 `0600`，目录为 `0700`。
- v1 只记录 runner 生命周期元数据。`payloadRef` 与 `payloadDigest` 保持 `null`；prompt、命令、日志、PID、环境变量和凭据不得写入事件。
- active run 会发出有界 heartbeat。重启时会重放 pending terminal intent，并在重新排队前记录 `run.abandoned`。
- 非交互 stdout/stderr 独立存放于 `task-logs/<taskId>/<runId>.jsonl`，每个 run 最多 4096 条或 4 MiB。
- loopback bearer-token Control API 通过 `GET /v1/tasks/<taskId>/runs/<runId>/events` 和 `/logs` 提供只读分页查询，使用排他的 `cursor` 与有界 `limit`。

事件不能重建 `tasks.json`；旧任务可能没有完整历史，进程崩溃后也不承诺日志字节级完整。
