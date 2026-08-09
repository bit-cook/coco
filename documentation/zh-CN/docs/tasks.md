# 任务、Agent 与控制后台

CoCo 0.2 使用一个本地 Runner 执行持久任务。任务状态和结果保存在 `~/.coco/agent/tasks.json`，编码任务默认使用独立 Git worktree。

```bash
coco task create "实现并测试这个功能"
coco task list --json
coco task active
coco task cancel <id>
coco task stop-all
```

`active` 会显示 Runner 和所有运行中 Agent 的 PID。`stop-all` 会终止每个 Agent 的完整进程组，从 `SIGTERM` 升级到 `SIGKILL`，验证进程组已经消失，将任务标记为已取消，并停止 Runner，避免定时任务立即重新启动。

## 触发器

```bash
coco task create "执行维护检查" --schedule 6h
coco task create "检查收到的数据" --webhook
coco task create "检查 push" --github-event push
```

Webhook 和 GitHub 任务在端点收到有效 Bearer 令牌或 `X-Hub-Signature-256` HMAC 前保持阻塞。错过的定时任务不会集中补跑。

## 控制后台

```bash
coco control start
coco control token
coco control status
```

打开返回的本机地址并输入令牌。后台可以创建需要审批的 worktree 任务、查看历史和活跃 Agent、取消单个任务或完全终止全部任务。它不会暴露原始 RPC、Provider 凭据、任意会话路径或直接 Shell 接口。

控制服务只接受 loopback 监听。远程访问时保持监听 `127.0.0.1`，并使用经过认证的 SSH 隧道或保持源站私有的 TLS 终止隧道。内置服务使用 HTTP，不负责 TLS 终止。

## MCP

```bash
coco mcp add filesystem -- node /absolute/path/to/server.mjs
coco mcp approve filesystem
coco mcp list
coco mcp remove filesystem
```

MCP stdio 服务使用官方 SDK 和受限的继承环境。新服务默认需要交互审批，在无界面会话中会被拒绝，直到执行 `coco mcp approve <name>` 明确修改策略。可用 `ask` 或 `deny` 再次收紧策略。

## VS Code

随包提供的 `vscode/` 扩展连接同一个控制 API。它可以附加当前 selection 和 open tabs、创建立即运行或等待审批的任务、浏览任务历史，并打开 VS Code 原生 Git diff。
