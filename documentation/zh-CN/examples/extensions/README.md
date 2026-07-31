# 扩展示例

适用于 pi-coding-agent 的示例扩展。

## 用法

```bash
# Load an extension with --extension flag
pi --extension examples/extensions/permission-gate.ts

# Or copy to extensions directory for auto-discovery
cp permission-gate.ts ~/.pi/agent/extensions/
```

## 示例

### 生命周期与安全

| 扩展 | 描述 |
|-----------|-------------|
| `permission-gate.ts` | 在危险 bash 命令（rm -rf、sudo 等）前请求确认 |
| `project-trust.ts` | 演示面向用户/全局和 CLI 扩展的 `project_trust` 事件 |
| `protected-paths.ts` | 阻止写入受保护路径（.env、.git/、node_modules/） |
| `confirm-destructive.ts` | 在破坏性会话操作（clear、switch、fork）前确认 |
| `dirty-repo-guard.ts` | 阻止在存在未提交 git 更改时切换会话 |
| `sandbox/` | 使用带有每项目配置的 `@anthropic-ai/sandbox-runtime` 进行操作系统级沙箱化 |
| `gondolin/` | 将内置工具和 `!` 命令路由到 Gondolin 微型虚拟机 |

### 自定义工具

| 扩展 | 描述 |
|-----------|-------------|
| `todo.ts` | 带自定义渲染和状态持久化的待办列表工具及 `/todos` 命令 |
| `hello.ts` | 最小自定义工具示例 |
| `question.ts` | 演示使用 `ctx.ui.select()` 和自定义 UI 向用户提问 |
| `questionnaire.ts` | 带标签栏导航的多问题输入 |
| `tool-override.ts` | 覆盖内置工具（例如为 `read` 添加日志/访问控制） |
| `dynamic-tools.ts` | 在启动后（`session_start`）和运行时通过命令注册工具，并提供提示词片段和特定工具提示词指南 |
| `kimi-deferred-tools.ts` | 为 Kimi 延迟工具加载协议搜索并逐步激活工具 |
| `structured-output.ts` | 返回 `terminate: true` 的最终结构化输出工具，使代理能在工具调用时结束 |
| `built-in-tool-renderer.ts` | 在保留原有行为的同时为内置工具（read、bash、edit、write）提供自定义紧凑渲染 |
| `minimal-mode.ts` | 覆盖内置工具渲染以实现最小显示（折叠模式中仅显示工具调用，不显示输出） |
| `truncated-tool.ts` | 使用正确的输出截断（50KB/2000 行）包装 ripgrep |
| `ssh.ts` | 通过 SSH 使用可插拔操作将所有工具委派给远程机器 |
| `subagent/` | 将任务委派给拥有隔离上下文窗口的专用子代理 |

### 命令与 UI

| 扩展 | 描述 |
|-----------|-------------|
| `preset.ts` | 通过 `--preset` 标志和 `/preset` 命令配置模型、思考级别、工具和指令的命名预设 |
| `plan-mode/` | 带有 `/plan` 命令和步骤跟踪、用于只读探索的 Claude Code 风格计划模式 |
| `tools.ts` | 用于启用/禁用工具且带会话持久化的交互式 `/tools` 命令 |
| `handoff.ts` | 通过 `/handoff <goal>` 将上下文转移到新的专注会话 |
| `qna.ts` | Extracts questions from last response into editor 通过 `ctx.ui.setEditorText()` |
| `status-line.ts` | Shows turn progress in footer 通过 `ctx.ui.setStatus()` with themed colors |
| `github-issue-autocomplete.ts` | Adds `#1234` issue completions by stacking a custom autocomplete provider that preloads open issues from `gh issue list` |
| `widget-placement.ts` | 通过 `ctx.ui.setWidget()` 在编辑器上方和下方显示小组件 |
| `hidden-thinking-label.ts` | Customizes the collapsed thinking label 通过 `ctx.ui.setHiddenThinkingLabel()` |
| `working-indicator.ts` | Customizes the streaming working indicator 通过 `ctx.ui.setWorkingIndicator()` |
| `model-status.ts` | Shows model changes in status bar 通过 `model_select` hook |
| `snake.ts` | 带自定义 UI、键盘处理和会话持久化的贪吃蛇游戏 |
| `tic-tac-toe.ts` | Tic-tac-toe vs the agent with `executionMode: "sequential"` tools to prevent race conditions on shared cursor state |
| `send-user-message.ts` | 演示通过 `pi.sendUserMessage()` 从扩展发送用户消息 |
| `timed-confirm.ts` | 演示使用 AbortSignal 自动关闭 `ctx.ui.confirm()` 和 `ctx.ui.select()` 对话框 |
| `rpc-demo.ts` | 演示所有 RPC 支持的扩展 UI 方法；与 [`examples/rpc-extension-ui.ts`](../../../../examples/rpc-extension-ui.ts) 配套使用。 |
| `modal-editor.ts` | Custom vim-like modal editor 通过 `ctx.ui.setEditorComponent()` |
| `rainbow-editor.ts` | Animated rainbow text effect 通过 custom editor |
| `notify.ts` | Desktop notifications 通过 OSC 777 when agent finishes (Ghostty, iTerm2, WezTerm) |
| `titlebar-spinner.ts` | Braille spinner animation in terminal title while the agent is working |
| `summarize.ts` | Summarize conversation with GPT-5.2 以及 show in transient UI |
| `custom-footer.ts` | Custom footer with git branch 以及 token stats 通过 `ctx.ui.setFooter()` |
| `custom-header.ts` | Custom header 通过 `ctx.ui.setHeader()` |
| `overlay-test.ts` | Test overlay compositing with inline text inputs 以及 edge cases |
| `overlay-qa-tests.ts` | Comprehensive overlay QA tests: anchors, margins, stacking, overflow, animation |
| `doom-overlay/` | DOOM game running as an overlay at 35 FPS (demonstrates real-time game rendering) |
| `shutdown-command.ts` | 添加演示 `ctx.shutdown()` 的 `/quit` 命令 |
| `reload-runtime.ts` | Adds `/reload-runtime` 以及 `reload_runtime` tool showing safe reload flow |
| `interactive-shell.ts` | 通过 `user_bash` 钩子以完整终端运行交互式命令（vim、htop） |
| `inline-bash.ts` | 通过 `input` 事件转换展开提示词中的 `!{command}` 模式 |
| `input-transform-streaming.ts` | 通过 `streamingBehavior` 跳过流中 steering 的高成本输入预处理 |

### Git 集成

| 扩展 | 描述 |
|-----------|-------------|
| `git-checkpoint.ts` | 每轮创建 git stash 检查点，用于在 fork 时恢复代码 |
| `auto-commit-on-exit.ts` | Auto-commits on exit using last assistant message 用于 commit message |

### 系统提示词 & Compaction

| 扩展 | 描述 |
|-----------|-------------|
| `pirate.ts` | Demonstrates `systemPromptAppend` to dynamically modify system prompt |
| `claude-rules.ts` | Scans `.claude/rules/` folder 以及 lists rules in system prompt |
| `custom-compaction.ts` | Custom compaction that summarizes entire conversation |
| `trigger-compact.ts` | Triggers compaction when context usage exceeds 100k tokens 以及 adds `/trigger-compact` comm以及 |

### 系统集成

| 扩展 | 描述 |
|-----------|-------------|
| `mac-system-theme.ts` | Syncs pi theme with macOS dark/light mode |

### 资源

| 扩展 | 描述 |
|-----------|-------------|
| `dynamic-resources/` | Loads skills, prompts, 以及 themes using `resources_discover` |

### 消息与通信

| 扩展 | 描述 |
|-----------|-------------|
| `message-renderer.ts` | 通过 `registerMessageRenderer` 提供带颜色和可展开详情的自定义消息渲染 |
| `entry-renderer.ts` | TUI-only session entry rendering 通过 `appendEntry` 以及 `registerEntryRenderer` |
| `event-bus.ts` | Inter-extension communication 通过 `pi.events` |

### 会话元数据

| 扩展 | 描述 |
|-----------|-------------|
| `session-name.ts` | Name sessions 用于 the session selector 通过 `setSessionName` |
| `bookmark.ts` | Bookmark entries with labels 用于 `/tree` navigation 通过 `setLabel` |

### 自定义提供商

| 扩展 | 描述 |
|-----------|-------------|
| `custom-provider-anthropic/` | Custom Anthropic provider with OAuth support 以及 custom streaming implementation |
| `custom-provider-gitlab-duo/` | GitLab Duo provider using pi-ai's built-in Anthropic/OpenAI streaming 通过 proxy |

### 外部依赖

| Extension | Description |
|-----------|-------------|
| `with-deps/` | Extension with its own package.json 以及 dependencies (demonstrates jiti module resolution) |
| `file-trigger.ts` | Watches a trigger file 以及 injects contents into conversation |

## 编写扩展

完整文档请参见 [docs/extensions.md](../../docs/extensions.md)。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Subscribe to lifecycle events
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // Register custom tools
  pi.registerTool({
    name: "greet",
    label: "Greeting",
    description: "Generate a greeting",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // Register commands
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify("Hello!", "info");
    },
  });
}
```

## 关键模式

**Use StringEnum 用于 string parameters** (required 用于 Google API compatibility):
```typescript
import { StringEnum } from "@earendil-works/pi-ai";

// Good
action: StringEnum(["list", "add"] as const)

// Bad - doesn't work with Google
action: Type.Union([Type.Literal("list"), Type.Literal("add")])
```

**State persistence 通过 details:**
```typescript
// Store state in tool result details for proper forking support
return {
  content: [{ type: "text", text: "Done" }],
  details: { todos: [...todos], nextId },  // Persisted in session
};

// Reconstruct on session events
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.toolName === "my_tool") {
      const details = entry.message.details;
      // Reconstruct state from details
    }
  }
});
```
