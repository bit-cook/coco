# 环境变量

Pi 以三种方式使用环境变量：

- `PI_OFFLINE` 等变量配置 Pi 进程。
- Pi 设置 `PI_CODING_AGENT`，让子进程可以检测自己是否在 Pi 内运行。
- LLM 可调用的 bash 工具运行的命令会接收描述当前会话的 `PI_*` 变量。


## 进程标记

CLI 和 RPC 入口会设置 `PI_CODING_AGENT=true`。子进程会继承它，并可用它检测自己是否在 Pi 内运行。它不是会话专属变量；通过 SDK 嵌入 Pi 时也不会自动设置。

## Bash 工具会话环境

bash 工具运行的命令会接收当前 Pi 会话状态：

| 变量 | 说明 |
|----------|-------------|
| `PI_SESSION_ID` | 当前会话 ID |
| `PI_SESSION_FILE` | 当前会话 JSONL 文件的绝对路径；临时会话中未设置 |
| `PI_PROVIDER` | 当前选中的模型提供商 |
| `PI_MODEL` | 当前选中的模型 ID |
| `PI_REASONING_LEVEL` | 当前生效的推理级别：`off`、`minimal`、`low`、`medium`、`high`、`xhigh` 或 `max` |

这些值会在每条命令启动时解析。因此切换模型或更改推理级别会影响下一条 bash 命令，无需重启 Pi。`PI_PROVIDER` 和 `PI_MODEL` 标识选中的 Pi 模型，而不是路由器可能在内部选择的其他上游模型。

当有人询问正在运行的模型或提供商时，请检查这些变量，不要从系统提示中推断：

```bash
printf '%s/%s\n' "$PI_PROVIDER" "$PI_MODEL"
printf 'reasoning=%s session=%s\n' "$PI_REASONING_LEVEL" "$PI_SESSION_ID"
```

会话持久化时，可以直接检查会话文件：

```bash
if [ -n "$PI_SESSION_FILE" ]; then
  tail -n 1 "$PI_SESSION_FILE"
fi
```

这些变量会注入 LLM 可调用的 bash 工具，不会注入用户输入的 `!` 或 `!!` 命令。

### 自定义 Bash 工具

使用 `createBashTool()` 创建的 bash 工具，在向 Pi 注册时默认会暴露会话环境。注入发生在 `spawnHook` 之前，因此钩子会在 `ctx.env` 中收到这些变量：

```typescript
const bashTool = createBashTool(cwd, {
  spawnHook: (ctx) => ({
    ...ctx,
    env: { ...ctx.env, CI: "1" },
  }),
});
```

可以独立于 spawn hook 禁用会话元数据：

```typescript
const bashTool = createBashTool(cwd, {
  exposeSessionEnvironment: false,
  spawnHook: (ctx) => ctx,
});
```

禁用后，Pi 会移除这些变量的继承值，避免嵌套 Pi 进程暴露过期的父会话元数据。

## Pi 进程配置

这些变量由 Pi 自身读取：

| 变量 | 说明 |
|----------|-------------|
| `PI_CODING_AGENT_DIR` | 覆盖配置目录；默认为 `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | 覆盖会话存储目录；会被 `--session-dir` 覆盖 |
| `PI_PACKAGE_DIR` | 覆盖软件包目录，适用于 Nix/Guix store 路径 |
| `PI_OFFLINE` | 禁用启动时网络操作，包括更新检查、软件包更新和安装/更新遥测 |
| `PI_SKIP_VERSION_CHECK` | 禁用 `pi.dev` 最新版本请求 |
| `PI_TELEMETRY` | 覆盖安装/更新遥测和提供商归属请求头：`1`/`true`/`yes` 或 `0`/`false`/`no` |
| `PI_CACHE_RETENTION` | 在支持的情况下设置为 `long`，启用扩展的提供商提示缓存 |
| `PI_SHARE_VIEWER_URL` | 覆盖 `/share` 使用的基础 URL |
| `PI_HARDWARE_CURSOR` | 设置为 `1` 以显示硬件光标；参见[终端设置](terminal-setup.md) |
| `VISUAL`、`EDITOR` | 未设置 `externalEditor` 时使用的外部编辑器回退值 |
| `HTTP_PROXY`、`HTTPS_PROXY` | 代理出站 HTTP 请求 |

`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等提供商凭据及云提供商配置列在[提供商](providers.md#environment-variables-or-auth-file)文档中。
