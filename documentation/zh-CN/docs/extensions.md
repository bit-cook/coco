> pi 可以创建扩展。要求它为您的用例构建一个。

# 扩展

扩展是扩展 pi 行为的 TypeScript 模块。他们可以订阅生命周期事件、注册可由 LLM 调用的自定义工具、添加命令等。

> **/reload 的放置：** 将扩展放入 `~/.pi/agent/extensions/`（全局）或 `.pi/extensions/`（项目本地）中以进行自动发现。 `pi -e ./path.ts` 仅用于快速测试。自动发现位置中的扩展可以使用 `/reload` 进行热重载。

**关键能力：**
- **自定义工具** - 注册LLM可以通过`pi.registerTool()`调用的工具
- **事件拦截** - 阻止或修改工具调用、注入上下文、自定义压缩
- **用户交互** - 通过`ctx.ui`提示用户（选择、确认、输入、通知）
- **自定义 UI 组件** - 通过 `ctx.ui.custom()` 进行键盘输入的完整 TUI 组件，用于复杂的交互
- **自定义命令** - 通过 `pi.registerCommand()` 注册 `/mycommand` 等命令
- **会话持久性** - 存储通过 `pi.appendEntry()` 重新启​​动后仍然存在的状态
- **自定义渲染** - 控制工具调用/结果和消息在 TUI 中的显示方式

**用例示例：**
- 权限门（`rm -rf`、`sudo`等之前确认）
- Git 检查点（每次存储，在分支上恢复）
- 路径保护（块写入 `.env`、`node_modules/`）
- 自定义压缩（以您的方式总结对话）
- 对话摘要（参见 `summarize.ts` 示例）
- 交互式工具（问题、向导、自定义对话框）
- 有状态工具（待办事项列表、连接池）
- 外部集成（文件观察器、webhooks、CI 触发器）
- 等待时玩游戏（参见 `snake.ts` 示例）

请参阅 [examples/extensions/](../../../examples/extensions/) 了解工作实现。

## 目录

- [快速入门](#quick-start)
- [延伸地点](#extension-locations)
- [可用导入](#available-imports)
- [编写扩展](#writing-an-extension)
  - [扩展款式](#extension-styles)
- [活动](#events)
  - [生命周期概述](#lifecycle-overview)
  - [资源事件](#resource-events)
  - [会议活动](#session-events)
  - [代理活动](#agent-events)
  - [模特活动](#model-events)
  - [工具事件](#tool-events)
- [扩展上下文](#extensioncontext)
- [扩展命令上下文](#extensioncommandcontext)
- [扩展API方法](#extensionapi-methods)
- [状态管理](#state-management)
- [自定义工具](#custom-tools)
  - [动态刀具加载](#dynamic-tool-loading)
- [自定义用户界面](#custom-ui)
- [错误处理](#error-handling)
- [模式行为](#mode-behavior)
- [示例参考](#examples-reference)

## 快速入门

创建`~/.pi/agent/extensions/my-extension.ts`：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // React to events
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // Register a custom tool
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
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

  // Register a command
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });
}
```

使用 `--extension`（或 `-e`）标志进行测试：

```bash
pi -e ./my-extension.ts
```

## 扩展地点

> **安全性：** 扩展程序以您的完整系统权限运行，并且可以执行任意代码。仅从您信任的来源安装。

扩展是从受信任的位置自动发现的。项目本地 `.pi/extensions` 条目仅在项目受信任后加载。

|地点 |范围 |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` |全球（所有项目）|
| `~/.pi/agent/extensions/*/index.ts` |全局（子目录）|
| `.pi/extensions/*.ts` |项目本地 |
| `.pi/extensions/*/index.ts` |项目本地（子目录）|

通过 `settings.json` 的其他路径：

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1"
  ],
  "extensions": [
    "/path/to/local/extension.ts",
    "/path/to/local/extension/dir"
  ]
}
```

要通过 npm 或 git 将扩展共享为 pi 包，请参阅 [packages.md](packages.md)。

## 可用进口

|套餐 |目的|
|---------|---------|
| `@earendil-works/pi-coding-agent` |扩展类型（`ExtensionAPI`、`ExtensionContext`、事件）|
| `typebox` |工具参数的架构定义 |
| `@earendil-works/pi-ai` | AI 实用程序（`StringEnum` 用于与 Google 兼容的枚举）|
| `@earendil-works/pi-tui` |用于自定义渲染的 TUI 组件 |

npm 依赖项也可以工作。在扩展旁边（或父目录中）添加 `package.json`，运行 `npm install`，并且会自动解析来自 `node_modules/` 的导入。

对于使用 `pi install`（npm 或 git）安装的分布式 pi 软件包，运行时 deps 必须位于 `dependencies` 中。软件包安装默认使用生产安装（`npm install --omit=dev`），因此`devDependencies`在运行时不可用；配置 `npmCommand` 时，git 包使用普通 `install` 来与包装器兼容。

Node.js 内置插件（`node:fs`、`node:path` 等）也可用。

## 编写扩展

扩展导出接收 `ExtensionAPI` 的默认工厂函数。工厂可以是同步的或异步的：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subscribe to events
  pi.on("event_name", async (event, ctx) => {
    // ctx.ui for user interaction
    const ok = await ctx.ui.confirm("Title", "Are you sure?");
    ctx.ui.notify("Done!", "info");
    ctx.ui.setStatus("my-ext", "Processing...");  // Footer status
    ctx.ui.setWidget("my-ext", ["Line 1", "Line 2"]);  // Widget above editor (default)
  });

  // Register tools, commands, shortcuts, flags
  pi.registerTool({ ... });
  pi.registerCommand("name", { ... });
  pi.registerShortcut("ctrl+x", { ... });
  pi.registerFlag("my-flag", { ... });
}
```

扩展通过 [j​​iti](https://github.com/unjs/jiti) 加载，因此 TypeScript 无需编译即可工作。

如果工厂返回 `Promise`，则 pi 在继续启动之前会等待它。这意味着异步初始化在 `session_start` 之前、`resources_discover` 之前以及通过 `pi.registerProvider()` 排队的提供程序注册被刷新之前完成。

### 异步工厂函数

使用异步工厂进行一次性启动工作，例如获取远程配置或动态发现可用模型。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  const response = await fetch("http://localhost:1234/v1/models");
  const payload = (await response.json()) as {
    data: Array<{
      id: string;
      name?: string;
      context_window?: number;
      max_tokens?: number;
    }>;
  };

  pi.registerProvider("local-openai", {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: payload.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.context_window ?? 128000,
      maxTokens: model.max_tokens ?? 4096,
    })),
  });
}
```

此模式使获取的模型在正常启动期间可用并可用于 `pi --list-models`。

### 长期资源和关闭

扩展工厂可能在从不启动会话的调用中运行。不要从工厂启动后台资源，例如进程、套接字、文件观察程序或计时器。

推迟后台资源启动，直到 `session_start` 或需要资源的命令/工具/事件。注册幂等 `session_shutdown` 处理程序以关闭您启动的任何会话范围资源。

### 扩展样式

**单个文件** - 最简单，适用于小型扩展：

```
~/.pi/agent/extensions/
└── my-extension.ts
```

**带有index.ts的目录** - 用于多文件扩展名：

```
~/.pi/agent/extensions/
└── my-extension/
    ├── index.ts        # Entry point (exports default function)
    ├── tools.ts        # Helper module
    └── utils.ts        # Helper module
```

**具有依赖项的包** - 对于需要 npm 包的扩展：

```
~/.pi/agent/extensions/
└── my-extension/
    ├── package.json    # Declares dependencies and entry points
    ├── package-lock.json
    ├── node_modules/   # After npm install
    └── src/
        └── index.ts
```

```json
// package.json
{
  "name": "my-extension",
  "dependencies": {
    "zod": "^3.0.0",
    "chalk": "^5.0.0"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

在扩展目录中运行`npm install`，然后从`node_modules/`自动导入工作。

## 活动

### 生命周期概述

```
pi starts
  │
  ├─► project_trust (user/global and CLI extensions only, before project resources load)
  ├─► session_start { reason: "startup" }
  └─► resources_discover { reason: "startup" }
      │
      ▼
user sends prompt ─────────────────────────────────────────┐
  │                                                        │
  ├─► (extension commands checked first, bypass if found)  │
  ├─► input (can intercept, transform, or handle)          │
  ├─► (skill/template expansion if not handled)            │
  ├─► before_agent_start (can inject message, modify system prompt)
  ├─► agent_start                                          │
  ├─► message_start / message_update / message_end         │
  │                                                        │
  │   ┌─── turn (repeats while LLM calls tools) ───┐       │
  │   │                                            │       │
  │   ├─► turn_start                               │       │
  │   ├─► context (can modify messages)            │       │
  │   ├─► before_provider_headers (can mutate headers)     |
  │   ├─► before_provider_request (can inspect or replace payload)
  │   ├─► after_provider_response (status + headers, before stream consume)
  │   │                                            │       │
  │   │   LLM responds, may call tools:            │       │
  │   │     ├─► tool_execution_start               │       │
  │   │     ├─► tool_call (can block)              │       │
  │   │     ├─► tool_execution_update              │       │
  │   │     ├─► tool_result (can modify)           │       │
  │   │     └─► tool_execution_end                 │       │
  │   │                                            │       │
  │   └─► turn_end                                 │       │
  │                                                        │
  ├─► agent_end                                            │
  └─► agent_settled (no retry/compaction/follow-up left)   │
                                                           │
user sends another prompt ◄────────────────────────────────┘

/new (new session) or /resume (switch session)
  ├─► session_before_switch (can cancel)
  ├─► session_shutdown
  ├─► session_start { reason: "new" | "resume", previousSessionFile? }
  └─► resources_discover { reason: "startup" }

/fork or /clone
  ├─► session_before_fork (can cancel)
  ├─► session_shutdown
  ├─► session_start { reason: "fork", previousSessionFile }
  └─► resources_discover { reason: "startup" }

/name or pi.setSessionName()
  └─► session_info_changed

/compact or auto-compaction
  ├─► session_before_compact (can cancel or customize)
  └─► session_compact

/tree navigation
  ├─► session_before_tree (can cancel or customize)
  └─► session_tree

/model or Ctrl+P (model selection/cycling)
  ├─► thinking_level_select (if model change changes/clamps thinking level)
  └─► model_select

thinking level changes (settings, keybinding, pi.setThinkingLevel())
  └─► thinking_level_select

exit (Ctrl+C, Ctrl+D, SIGHUP, SIGTERM)
  └─► session_shutdown
```

### 启动活动

#### 项目_信任

在 pi 决定是否信任具有动态配置（`.pi` 或 `.agents/skills`）的项目之前触发。它在启动期间以及当会话替换（例如 `/resume`）进入当前进程中尚未解析信任的 cwd 时运行。仅用户/全局扩展和 CLI `-e` 扩展参与；直到信任解决后才会加载项目本地扩展。

```typescript
pi.on("project_trust", async (event, ctx) => {
  // event.cwd - current working directory
  // ctx has a limited trust context: cwd, mode, hasUI, and select/confirm/input/notify UI helpers
  if (await ctx.ui.confirm("Trust project?", event.cwd)) {
    return { trusted: "yes", remember: true };
  }
  return { trusted: "undecided" };
});
```

`project_trust` 处理程序必须返回 `{ trusted: "yes" | "no" | "undecided" }`。返回 `"yes"` 或 `"no"` 的用户/全局或 CLI 扩展拥有该决策；第一个是/否决定获胜并抑制内置信任提示。使用 `remember: true` 来坚持是/否决定；否则它仅适用于当前进程。返回 `"undecided"` 让后续处理程序或内置信任流程决定。在提示之前检查 `ctx.hasUI`。如果没有处理程序返回是/否，则继续正常的信任解析：首先应用保存的 `trust.json` 决策，然后 `defaultProjectTrust` 控制 pi 默认情况下是否询问、信任或拒绝。

### 资源事件

#### 资源发现

在 `session_start` 之后触发，因此扩展可以贡献额外的技能、提示和主题路径。
启动路径使用`reason: "startup"`。重新加载使用`reason: "reload"`。

```typescript
pi.on("resources_discover", async (event, _ctx) => {
  // event.cwd - current working directory
  // event.reason - "startup" | "reload"
  return {
    skillPaths: ["/path/to/skills"],
    promptPaths: ["/path/to/prompts"],
    themePaths: ["/path/to/themes"],
  };
});
```

### 会议活动

有关会话存储内部结构和 SessionManager API，请参阅[会话格式](session-format.md)。

#### 会话开始

当会话启动、加载或重新加载时触发。

```typescript
pi.on("session_start", async (event, ctx) => {
  // event.reason - "startup" | "reload" | "new" | "resume" | "fork"
  // event.previousSessionFile - present for "new", "resume", and "fork"
  ctx.ui.notify(`Session: ${ctx.sessionManager.getSessionFile() ?? "ephemeral"}`, "info");
});
```

#### 会话信息已更改

通过 `/name`、RPC 或 `pi.setSessionName()` 设置当前会话显示名称时触发。

```typescript
pi.on("session_info_changed", async (event, ctx) => {
  // event.name - current normalized name, or undefined if cleared
  ctx.ui.notify(`Session renamed: ${event.name ?? "(none)"}`, "info");
});
```

#### 切换前的会话

在开始新会话 (`/new`) 或切换会话 (`/resume`) 之前触发。

```typescript
pi.on("session_before_switch", async (event, ctx) => {
  // event.reason - "new" or "resume"
  // event.targetSessionFile - session we're switching to (only for "resume")

  if (event.reason === "new") {
    const ok = await ctx.ui.confirm("Clear?", "Delete all messages?");
    if (!ok) return { cancel: true };
  }
});
```

成功切换或新会话操作后，pi 为旧扩展实例发出 `session_shutdown`，为新会话重新加载并重新绑定扩展，然后发出 `session_start` 以及 `reason: "new" | "resume"` 和 `previousSessionFile`。
在 `session_shutdown` 中进行清理工作，然后在 `session_start` 中重新建立任何内存中状态。

#### 分叉前的会话

通过 `/fork` 分叉或通过 `/clone` 克隆时触发。

```typescript
pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId - ID of the selected entry
  // event.position - "before" for /fork, "at" for /clone
  return { cancel: true }; // Cancel fork/clone
  // OR
  return { skipConversationRestore: true }; // Reserved for future conversation restore control
});
```

成功分叉或克隆后，pi 为旧扩展实例发出 `session_shutdown`，为新会话重新加载并重新绑定扩展，然后发出 `session_start` 以及 `reason: "fork"` 和 `previousSessionFile`。
在 `session_shutdown` 中进行清理工作，然后在 `session_start` 中重新建立任何内存中状态。

#### session_before_compact / session_compact

压实时发射。详细信息请参见[compaction.md](compaction.md)。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, reason, willRetry, signal } = event;

  // reason - "manual" (/compact), "threshold", or "overflow"
  // willRetry - whether the aborted turn is retried after compaction (overflow recovery)

  // Cancel:
  return { cancel: true };

  // Custom summary:
  return {
    compaction: {
      summary: "...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      // usage: summaryResponse.usage, // Optional; included in session totals
    }
  };
});

pi.on("session_compact", async (event, ctx) => {
  // event.compactionEntry - the saved compaction
  // event.fromExtension - whether extension provided it
  // event.reason - "manual" (/compact), "threshold", or "overflow"
  // event.willRetry - whether the aborted turn is retried after compaction (overflow recovery)
});
```

#### session_before_tree / session_tree

在 `/tree` 导航上触发。有关树导航概念，请参阅[会话](sessions.md)。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;
  return { cancel: true };
  // OR provide custom summary:
  return {
    summary: {
      summary: "...",
      // usage: summaryResponse.usage, // Optional; included in session totals
      details: {},
    },
  };
});

pi.on("session_tree", async (event, ctx) => {
  // event.newLeafId, oldLeafId, summaryEntry, fromExtension
});
```

#### 会话关闭

在启动的会话运行时被拆除之前触发。使用它来清理从 `session_start` 或其他会话范围的挂钩打开的资源。

```typescript
pi.on("session_shutdown", async (event, ctx) => {
  // event.reason - "quit" | "reload" | "new" | "resume" | "fork"
  // event.targetSessionFile - destination session for session replacement flows
  // Cleanup, save state, etc.
});
```

### 代理活动

#### 代理启动之前

在用户提交提示后、代理循环之前触发。可以注入消息和/或修改系统提示。

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt - user's prompt text
  // event.images - attached images (if any)
  // event.systemPrompt - current chained system prompt for this handler
  //   (includes changes from earlier before_agent_start handlers)
  // event.systemPromptOptions - structured options used to build the system prompt
  //   .customPrompt - any custom system prompt (from --system-prompt, SYSTEM.md, or custom templates)
  //   .selectedTools - tools currently active in the prompt
  //   .toolSnippets - one-line descriptions for each tool
  //   .promptGuidelines - custom guideline bullets
  //   .appendSystemPrompt - text from --append-system-prompt flags
  //   .cwd - working directory
  //   .contextFiles - AGENTS.md files and other loaded context files
  //   .skills - loaded skills

  return {
    // Inject a persistent message (stored in session, sent to LLM)
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,
    },
    // Replace the system prompt for this turn (chained across extensions)
    systemPrompt: event.systemPrompt + "\n\nExtra instructions for this turn...",
  };
});
```

`systemPromptOptions` 字段允许扩展访问 Pi 用于构建系统提示的相同结构化数据。这使您可以检查 Pi 已加载的内容 - 自定义提示、指南、工具片段、上下文文件、技能 - 无需重新发现资源或重新解析标志。当您的扩展需要对系统提示进行深入、明智的更改，同时尊重用户提供的配置时，请使用它。

在 `before_agent_start` 内部，`event.systemPrompt` 和 `ctx.getSystemPrompt()` 都反映了当前处理程序的链接系统提示符。以后的 `before_agent_start` 处理程序仍然可以再次修改它。

#### 代理开始/代理结束/代理结算

当低级别代理运行开始时，`agent_start` 会触发。当运行结束时，`agent_end` 会触发，但 Pi 仍然可以自动重试、自动压缩并重试，或者继续处理排队的后续消息。使用 `agent_settled` 进行状态集成，需要知道 Pi 不会继续自动运行。

```typescript
pi.on("agent_start", async (_event, ctx) => {});

pi.on("agent_end", async (event, ctx) => {
  // event.messages - messages from this low-level run
});

pi.on("agent_settled", async (_event, ctx) => {
  // ctx.isIdle() is true here unless another extension started a new run.
});
```

#### 转弯开始/转弯结束

每回合触发（一个 LLM 响应 + 工具调用）。

```typescript
pi.on("turn_start", async (event, ctx) => {
  // event.turnIndex, event.timestamp
});

pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex, event.message, event.toolResults
});
```

#### 消息开始/消息更新/消息结束

因消息生命周期更新而触发。

- `message_start` 和 `message_end` 针对用户、助手和 toolResult 消息触发。
- `message_update` 触发助理流式更新。
- `message_end` 处理程序可以返回 `{ message }` 来替换最终确定的消息。更换后必须保持相同的`role`。

```typescript
pi.on("message_start", async (event, ctx) => {
  // event.message
});

pi.on("message_update", async (event, ctx) => {
  // event.message
  // event.assistantMessageEvent (token-by-token stream event)
});

pi.on("message_end", async (event, ctx) => {
  if (event.message.role !== "assistant") return;

  return {
    message: {
      ...event.message,
      usage: {
        ...event.message.usage,
        cost: {
          ...event.message.usage.cost,
          total: 0.123,
        },
      },
    },
  };
});
```

#### 工具执行开始/工具执行更新/工具执行结束

因工具执行生命周期更新而触发。

在并行工具模式下：
- `tool_execution_start` 在预检阶段以辅助源顺序发出
- `tool_execution_update` 事件可能会跨工具交错
- 每个工具完成后，`tool_execution_end` 按工具完成顺序发出
- 最终的 `toolResult` 消息事件仍稍后按助理源顺序发出

```typescript
pi.on("tool_execution_start", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args
});

pi.on("tool_execution_update", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.args, event.partialResult
});

pi.on("tool_execution_end", async (event, ctx) => {
  // event.toolCallId, event.toolName, event.result, event.isError
});
```

#### 语境

在每次 LLM 通话之前触发。非破坏性地修改消息。消息类型请参见[会话格式](session-format.md)。

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages - deep copy, safe to modify
  const filtered = event.messages.filter(m => !shouldPrune(m));
  return { messages: filtered };
});
```

#### before_provider_headers

组装传出 HTTP 标头后触发。使用它来添加、覆盖或删除请求标头。

处理程序就地改变 `event.headers`。将键设置为字符串以添加或覆盖它，或设置为 `null` 以删除它。

```typescript
pi.on("before_provider_headers", (event, ctx) => {
  // Add or override — e.g. a session id for gateway tracing/attribution
  event.headers["x-session-id"] = ctx.sessionManager.getSessionId();

  // Drop a tracking header pi adds for this call
  event.headers["X-OpenRouter-Title"] = null;
});
```

每个提供商请求运行一次；重试重用相同的标头而不是重新触发钩子。

#### before_provider_request 之前

在构建特定于提供者的负载之后、发送请求之前触发。处理程序按扩展加载顺序运行。返回 `undefined` 保持有效负载不变。返回任何其他值都会替换后续处理程序和实际请求的有效负载。

该钩子可以重写提供者级别的系统指令或完全删除它们。 `ctx.getSystemPrompt()` 不会反映这些有效负载级别的更改，它报告 Pi 的系统提示字符串而不是最终的序列化提供程序有效负载。

```typescript
pi.on("before_provider_request", (event, ctx) => {
  console.log(JSON.stringify(event.payload, null, 2));

  // Optional: replace payload
  // return { ...event.payload, temperature: 0 };
});
```

这主要用于调试提供程序序列化和缓存行为。

#### after_provider_response

在收到 HTTP 响应之后且在使用其流主体之前触发。处理程序按扩展加载顺序运行。

```typescript
pi.on("after_provider_response", (event, ctx) => {
  // event.status - HTTP status code
  // event.headers - normalized response headers
  if (event.status === 429) {
    console.log("rate limited", event.headers["retry-after"]);
  }
});
```

标头可用性取决于提供商和传输。抽象 HTTP 响应的提供者可能不会公开标头。

### 模特活动

#### 模型选择

当通过 `/model` 命令、模型循环 (`Ctrl+P`) 或会话恢复更改模型时触发。

```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model - newly selected model
  // event.previousModel - previous model (undefined if first selection)
  // event.source - "set" | "cycle" | "restore"

  const prev = event.previousModel
    ? `${event.previousModel.provider}/${event.previousModel.id}`
    : "none";
  const next = `${event.model.provider}/${event.model.id}`;

  ctx.ui.notify(`Model changed (${event.source}): ${prev} -> ${next}`, "info");
});
```

使用它来更新 UI 元素（状态栏、页脚）或在活动模型更改时执行特定于模型的初始化。

#### 思考级别选择

当思维水平发生变化时被解雇。这仅用于通知；处理程序返回值将被忽略。

```typescript
pi.on("thinking_level_select", async (event, ctx) => {
  // event.level - newly selected thinking level
  // event.previousLevel - previous thinking level

  ctx.ui.setStatus("thinking", `thinking: ${event.level}`);
});
```

当 `pi.setThinkingLevel()`、模型更改或内置思维级别控件更改活跃思维级别时，使用此更新扩展 UI。

### 工具事件

#### 工具调用

在 `tool_execution_start` 之后、工具执行之前触发。 **可以阻止。** 使用 `isToolCallEventType` 缩小范围并获取键入的输入。

在 `tool_call` 运行之前，pi 等待先前发出的代理事件通过 `AgentSession` 完成排空。这意味着`ctx.sessionManager`通过当前辅助工具调用消息是最新的。

在默认的并行工具执行模式下，来自同一辅助消息的同级工具调用将按顺序进行预检，然后并发执行。不保证 `tool_call` 能够从 `ctx.sessionManager` 中的同一助理消息中看到同级工具结果。

`event.input` 是可变的。在执行之前对其进行适当修改以修补工具参数。

行为保证：
- `event.input` 的突变会影响实际的工具执行
- 后来的 `tool_call` 处理程序看到早期处理程序所做的突变
- 突变后不会进行重新验证
- 从 `tool_call` 返回的值仅通过 `{ block: true, reason?: string }` 控制阻塞

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  // event.toolName - "bash", "read", "write", "edit", etc.
  // event.toolCallId
  // event.input - tool parameters (mutable)

  // Built-in tools: no type params needed
  if (isToolCallEventType("bash", event)) {
    // event.input is { command: string; timeout?: number }
    event.input.command = `source ~/.profile\n${event.input.command}`;

    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command" };
    }
  }

  if (isToolCallEventType("read", event)) {
    // event.input is { path: string; offset?: number; limit?: number }
    console.log(`Reading: ${event.input.path}`);
  }
});
```

#### 键入自定义工具输入

自定义工具应导出其输入类型：

```typescript
// my-extension.ts
export type MyToolInput = Static<typeof myToolSchema>;
```

将 `isToolCallEventType` 与显式类型参数一起使用：

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { MyToolInput } from "my-extension";

pi.on("tool_call", (event) => {
  if (isToolCallEventType<"my_tool", MyToolInput>("my_tool", event)) {
    event.input.action;  // typed
  }
});
```

#### 工具结果

在工具执行完成后、`tool_execution_end` 加上最终工具结果消息事件发出之前触发。 **可以修改结果。**

在并行工具模式下，`tool_result` 和 `tool_execution_end` 可能会按工具完成顺序交错，而最终的 `toolResult` 消息事件仍会稍后按辅助源顺序发出。

`tool_result` 处理程序链如中间件：
- 处理程序按扩展加载顺序运行
- 每个处理程序都会看到前一个处理程序更改后的最新结果
- 处理程序可以返回部分补丁（`content`、`details`、`isError` 或 `usage`）；省略的字段保留其当前值

使用 `ctx.signal` 在处理程序内进行嵌套异步工作。这允许 Esc 取消模型调用、`fetch()` 以及由扩展启动的其他中止感知操作。

```typescript
import { isBashToolResult } from "@earendil-works/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  // event.content, event.details, event.isError, event.usage

  if (isBashToolResult(event)) {
    // event.details is typed as BashToolDetails
  }

  const response = await fetch("https://example.com/summarize", {
    method: "POST",
    body: JSON.stringify({ content: event.content }),
    signal: ctx.signal,
  });

  // Modify result:
  return { content: [...], details: {...}, isError: false, usage: nestedModelUsage };
});
```

### 用户狂欢活动

#### 用户bash

当用户执行 `!` 或 `!!` 命令时触发。 **可以拦截。**

```typescript
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

pi.on("user_bash", (event, ctx) => {
  // event.command - the bash command
  // event.excludeFromContext - true if !! prefix
  // event.cwd - working directory

  // Option 1: Provide custom operations (e.g., SSH)
  return { operations: remoteBashOps };

  // Option 2: Wrap pi's built-in local bash backend
  const local = createLocalBashOperations();
  return {
    operations: {
      exec(command, cwd, options) {
        return local.exec(`source ~/.profile\n${command}`, cwd, options);
      }
    }
  };

  // Option 3: Full replacement - return result directly
  return { result: { output: "...", exitCode: 0, cancelled: false, truncated: false } };
});
```

### 输入事件

#### 输入

在检查扩展命令之后但在技能和模板扩展之前收到用户输入时触发。该事件看到原始输入文本，因此 `/skill:foo` 和 `/template` 尚未扩展。

**加工订单：**
1. 首先检查扩展命令 (`/cmd`) - 如果找到，则运行处理程序并跳过输入事件
2. `input` 事件触发 - 可以拦截、转换或处理
3. 如果不处理：技能命令（`/skill:name`）扩展为技能内容
4. 如果不处理：提示模板（`/template`）扩展到模板内容
5. 代理处理开始（`before_agent_start`等）

```typescript
pi.on("input", async (event, ctx) => {
  // event.text - raw input (before skill/template expansion)
  // event.images - attached images, if any
  // event.source - "interactive" (typed), "rpc" (API), or "extension" (via sendUserMessage)
  // event.streamingBehavior - "steer" | "followUp" | undefined
  //   undefined when idle, "steer" for mid-stream interrupts,
  //   "followUp" for messages queued until the agent finishes

  // Transform: rewrite input before expansion
  if (event.text.startsWith("?quick "))
    return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };

  // Handle: respond without LLM (extension shows its own feedback)
  if (event.text === "ping") {
    ctx.ui.notify("pong", "info");
    return { action: "handled" };
  }

  // Route by source: skip processing for extension-injected messages
  if (event.source === "extension") return { action: "continue" };

  // Intercept skill commands before expansion
  if (event.text.startsWith("/skill:")) {
    // Could transform, block, or let pass through
  }

  return { action: "continue" };  // Default: pass through to expansion
});
```

**结果：**
- `continue` - 不变地传递（如果处理程序不返回任何内容，则默认）
- `transform` - 修改文字/图像，然后继续扩展
- `handled` - 完全跳过代理（第一个返回此的处理程序获胜）

跨处理程序转换链。请参阅 [input-transform.ts](../../../examples/extensions/input-transform.ts) 和 [input-transform-streaming.ts](../../../examples/extensions/input-transform-streaming.ts) 了解 `streamingBehavior` 感知路由。

## 扩展上下文

所有处理程序都会收到 `ctx: ExtensionContext`。

### ctx.ui

用户交互的 UI 方法。有关完整详细信息，请参阅[自定义 UI](#custom-ui)。

### ctx模式

当前运行模式：`"tui"`、`"rpc"`、`"json"` 或 `"print"`。使用 `ctx.mode === "tui"` 保护仅限终端的功能，例如 `custom()`、组件工厂、终端输入和直接 TUI 渲染。

### ctx.hasUI

TUI 和 RPC 模式下的 `true`。打印模式（`-p`）和 JSON 模式下的 `false`。使用它来保护在 TUI 和 RPC 模式下工作的对话框方法（`select`、`confirm`、`input`、`editor`）和即发即弃方法（`notify`、`setStatus`、`setWidget`、`setTitle`、`setEditorText`）。在 RPC 模式下，一些特定于 TUI 的方法是无操作或返回默认值（请参阅 [rpc.md](rpc.md#extension-ui-protocol)）。

### ctx.cwd

当前工作目录。

构建项目本地配置路径时，使用 `CONFIG_DIR_NAME` 而不是硬编码 `.pi`。重新命名的发行版可以使用不同的配置目录名称。

```typescript
import { CONFIG_DIR_NAME, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    const projectConfigPath = join(ctx.cwd, CONFIG_DIR_NAME, "my-extension.json");
    // ...
  });
}
```

### ctx.isProjectTrusted()

返回项目本地信任对于当前会话上下文是否处于活动状态。这包括临时信任决策和 CLI 信任覆盖，而不仅仅是全局信任存储中保存的决策。

在阅读项目本地扩展配置之前使用此配置，该配置仅适用于受信任的项目。

### ctx.sessionManager

对会话状态的只读访问。有关完整的 SessionManager API 和条目类型，请参阅[会话格式](session-format.md)。

对于 `tool_call`，此状态在处理程序运行之前通过当前辅助消息同步。在并行工具执行模式下，仍然不能保证包含来自同一辅助消息的同级工具结果。

```typescript
ctx.sessionManager.getEntries()             // All entries
ctx.sessionManager.getBranch()              // Current branch
ctx.sessionManager.buildContextEntries()    // Active branch entries with compaction applied
ctx.sessionManager.getLeafId()              // Current leaf entry ID
```

### ctx.modelRegistry / ctx.model / ctx.thinkingLevel

访问模型、提供者和解析的身份验证。 `ctx.modelRegistry.getProvider(id)` 返回有效的 pi-ai 提供程序，而 `getProviderAuth(id)` 则解析其当前的 API 密钥、标头、基本 URL 和提供程序范围的环境，而无需加载模型。 `ctx.model`是活跃模型，`ctx.thinkingLevel`是其当前有效思维级别。

### ctx信号

当前代理中止信号，或当没有代理轮次处于活动状态时为 `undefined`。

将此用于由扩展处理程序启动的中止感知嵌套工作，例如：
- `fetch(..., { signal: ctx.signal })`
- 接受 `signal` 的模型调用
- 接受 `AbortSignal` 的文件或进程助手

`ctx.signal` 通常在活动转弯事件期间定义，例如 `tool_call`、`tool_result`、`message_update` 和 `turn_end`。
在空闲或非轮流上下文中，例如会话事件、扩展命令和 pi 空闲时触发的快捷方式，它通常是 `undefined`。

```typescript
pi.on("tool_result", async (event, ctx) => {
  const response = await fetch("https://example.com/api", {
    method: "POST",
    body: JSON.stringify(event),
    signal: ctx.signal,
  });

  const data = await response.json();
  return { details: data };
});
```

### ctx.isIdle() / ctx.abort() / ctx.hasPendingMessages()

控制流程助手。当 Pi 正在处理代理运行、自动重试、自动压缩重试或排队延续时，`ctx.isIdle()` 为 false。

### ctx.shutdown()

请求正常关闭 pi。

- **交互模式：** 推迟到代理变得空闲（处理完所有排队的转向和后续消息后）。
- **RPC模式：**推迟到下一个空闲状态（完成当前命令响应后，等待下一个命令时）。
- **打印模式：** 无操作。处理完所有提示后，该过程将自动退出。

在退出之前向所有分机发出 `session_shutdown` 事件。可用于所有上下文（事件处理程序、工具、命令、快捷方式）。

```typescript
pi.on("tool_call", (event, ctx) => {
  if (isFatal(event.input)) {
    ctx.shutdown();
  }
});
```

### ctx.getContextUsage()

返回活动模型的当前上下文使用情况。使用最后一次助理使用情况（如果可用），然后估计跟踪消息的标记。

```typescript
const usage = ctx.getContextUsage();
if (usage && usage.tokens > 100_000) {
  // ...
}
```

### ctx.compact()

触发压缩而不等待完成。使用 `onComplete` 和 `onError` 进行后续操作。

```typescript
ctx.compact({
  customInstructions: "Focus on recent changes",
  onComplete: (result) => {
    ctx.ui.notify("Compaction completed", "info");
  },
  onError: (error) => {
    ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
  },
});
```

### ctx.getSystemPrompt()

返回 Pi 当前的系统提示字符串。

- 在 `before_agent_start` 期间，这反映了当前回合迄今为止所做的连锁系统提示更改。
- 它不包括后来的`context`消息突变。
- 它不包括 `before_provider_request` 有效负载重写。
- 如果稍后加载的扩展程序在您的扩展程序之后运行，它们仍然可以更改最终发送的内容。

```typescript
pi.on("before_agent_start", (event, ctx) => {
  const prompt = ctx.getSystemPrompt();
  console.log(`System prompt length: ${prompt.length}`);
});
```

## 扩展命令上下文

命令处理程序接收 `ExtensionCommandContext`，它使用会话控制方法扩展了 `ExtensionContext`。这些仅在命令中可用，因为如果从事件处理程序调用它们可能会死锁。

### ctx.getSystemPromptOptions()

返回 Pi 当前用于构建系统提示的基本输入。

```typescript
const options = ctx.getSystemPromptOptions();
const contextPaths = options.contextFiles?.map((file) => file.path) ?? [];
```

它与 `before_agent_start` `event.systemPromptOptions` 具有相同的形状和可变性：自定义提示、活动工具、工具片段、提示指南、附加系统提示文本、cwd、加载的上下文文件和加载的技能。它可能包含完整的上下文文件内容，因此将其视为敏感的扩展本地数据，并避免通过命令列表、日志或自动完成元数据公开它。

这会报告当前的基本提示输入。它不包括每回合 `before_agent_start` 链式系统提示更改、后来的 `context` 事件消息突变或 `before_provider_request` 有效负载重写。

### ctx.waitForIdle()

等待代理完全解决，包括自动重试、自动压缩重试和排队延续：

```typescript
pi.registerCommand("my-cmd", {
  handler: async (args, ctx) => {
    await ctx.waitForIdle();
    // Agent is now idle, safe to modify session
  },
});
```

### ctx.newSession（选项？）

创建一个新会话：

```typescript
const parentSession = ctx.sessionManager.getSessionFile();
const kickoff = "Continue in the replacement session";

const result = await ctx.newSession({
  parentSession,
  setup: async (sm) => {
    sm.appendMessage({
      role: "user",
      content: [{ type: "text", text: "Context from previous session..." }],
      timestamp: Date.now(),
    });
  },
  withSession: async (ctx) => {
    // Use only the replacement-session ctx here.
    await ctx.sendUserMessage(kickoff);
  },
});

if (result.cancelled) {
  // An extension cancelled the new session
}
```

选项：
- `parentSession`：要记录在新会话标头中的父会话文件
- `setup`：在 `withSession` 运行之前改变新会话的 `SessionManager`
- `withSession`：针对新的替换会话上下文运行切换后工作。不要使用捕获的旧`pi` /命令`ctx`；请参阅[会话替换生命周期和脚枪](#session-replacement-lifecycle-and-footguns)。

### ctx.fork(entryId, 选项?)

从特定条目分叉，创建一个新的会话文件：

```typescript
const result = await ctx.fork("entry-id-123", {
  withSession: async (ctx) => {
    // Use only the replacement-session ctx here.
    ctx.ui.notify("Now in the forked session", "info");
  },
});
if (result.cancelled) {
  // An extension cancelled the fork
}

const cloneResult = await ctx.fork("entry-id-456", { position: "at" });
if (cloneResult.cancelled) {
  // An extension cancelled the clone
}
```

选项：
- `position`：`"before"`（默认）在选定的用户消息之前分叉，将该提示恢复到编辑器中
- `position`：`"at"` 通过所选条目复制活动路径，而不恢复编辑器文本
- `withSession`：针对新的替换会话上下文运行切换后工作。不要使用捕获的旧`pi` /命令`ctx`；请参阅[会话替换生命周期和脚枪](#session-replacement-lifecycle-and-footguns)。

### ctx.navigateTree(targetId, 选项?)

导航到会话树中的不同点：

```typescript
const result = await ctx.navigateTree("entry-id-456", {
  summarize: true,
  customInstructions: "Focus on error handling changes",
  replaceInstructions: false, // true = replace default prompt entirely
  label: "review-checkpoint",
});
```

选项：
- `summarize`：是否生成废弃分支的摘要
- `customInstructions`：摘要器的自定义指令
- `replaceInstructions`：如果为 true，则 `customInstructions` 替换默认提示而不是附加
- `label`：附加到分支汇总条目的标签（如果不汇总，则附加到目标条目）

### ctx.switchSession（会话路径，选项？）

切换到不同的会话文件：

```typescript
const result = await ctx.switchSession("/path/to/session.jsonl", {
  withSession: async (ctx) => {
    await ctx.sendUserMessage("Resume work in the replacement session");
  },
});
if (result.cancelled) {
  // An extension cancelled the switch via session_before_switch
}
```

选项：
- `withSession`：针对新的替换会话上下文运行切换后工作。不要使用捕获的旧`pi` /命令`ctx`；请参阅[会话替换生命周期和脚枪](#session-replacement-lifecycle-and-footguns)。

要发现可用会话，请使用静态 `SessionManager.list()` 或 `SessionManager.listAll()` 方法：

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

pi.registerCommand("switch", {
  description: "Switch to another session",
  handler: async (args, ctx) => {
    const sessions = await SessionManager.list(ctx.cwd);
    if (sessions.length === 0) return;
    const choice = await ctx.ui.select(
      "Pick session:",
      sessions.map(s => s.file),
    );
    if (choice) {
      await ctx.switchSession(choice, {
        withSession: async (ctx) => {
          ctx.ui.notify("Switched session", "info");
        },
      });
    }
  },
});
```

### 会话替换生命周期和脚枪

`withSession` 收到一个新的 `ReplacedSessionContext`，它使用绑定到替换会话的异步 `sendMessage()` 和 `sendUserMessage()` 帮助程序扩展了 `ExtensionCommandContext`。

生命周期和脚枪：
- `withSession` 仅在旧会话发出 `session_shutdown`、旧运行时已被拆除、替换会话已反弹并且新扩展实例已收到 `session_start` 后运行。
- 回调仍然在原始闭包中执行，而不是在新的扩展实例中执行。这意味着您的旧扩展实例可能在 `withSession` 启动之前已经运行了关闭清理。
- 捕获的旧 `pi` / 旧命令 `ctx` 会话绑定对象在替换后已过时，如果使用将抛出。仅使用传递给 `withSession` 的 `ctx` 进行会话绑定工作。
- 之前提取的原始对象仍然是您的责任。例如，如果您在替换之前捕获 `const sm = ctx.sessionManager`，则 `sm` 仍然是旧的 `SessionManager` 对象。更换后请勿重复使用。
- `withSession` 中的代码应该假定 `session_shutdown` 处理程序无效的任何状态都已经消失。仅捕获在完全关闭后仍然存在的纯数据，例如字符串、ID 和序列化配置。

安全模式：

```typescript
pi.registerCommand("handoff", {
  handler: async (_args, ctx) => {
    const kickoff = "Continue from the replacement session";
    await ctx.newSession({
      withSession: async (ctx) => {
        await ctx.sendUserMessage(kickoff);
      },
    });
  },
});
```

不安全模式：

```typescript
pi.registerCommand("handoff", {
  handler: async (_args, ctx) => {
    const oldSessionManager = ctx.sessionManager;
    await ctx.newSession({
      withSession: async (_ctx) => {
        // stale old objects: do not do this
        oldSessionManager.getSessionFile();
        pi.sendUserMessage("wrong");
      },
    });
  },
});
```

### ctx.reload()

运行与 `/reload` 相同的重新加载流程。

```typescript
pi.registerCommand("reload-runtime", {
  description: "Reload extensions, skills, prompts, themes, and context files",
  handler: async (_args, ctx) => {
    await ctx.reload();
    return;
  },
});
```

重要行为：
- `await ctx.reload()` 为当前扩展运行时发出 `session_shutdown`
- 然后它重新加载资源并发出 `session_start` 和 `reason: "reload"` 以及 `resources_discover` 和原因 `"reload"`
- 当前运行的命令处理程序仍然在旧的调用框架中继续
- `await ctx.reload()` 之后的代码仍然从预重载版本运行
- `await ctx.reload()` 之后的代码不得假设旧的内存扩展状态仍然有效
- 处理程序返回后，未来的命令/事件/工具调用将使用新的扩展版本

为了获得可预测的行为，请将重新加载视为该处理程序的终端 (`await ctx.reload(); return;`)。

工具与 `ExtensionContext` 一起运行，因此它们无法直接调用 `ctx.reload()`。使用命令作为重新加载入口点，然后公开一个将该命令作为后续用户消息排队的工具。

LLM 可以调用来触发重新加载的示例工具：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("reload-runtime", {
    description: "Reload extensions, skills, prompts, themes, and context files",
    handler: async (_args, ctx) => {
      await ctx.reload();
      return;
    },
  });

  pi.registerTool({
    name: "reload_runtime",
    label: "Reload Runtime",
    description: "Reload extensions, skills, prompts, themes, and context files",
    parameters: Type.Object({}),
    async execute() {
      pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
      return {
        content: [{ type: "text", text: "Queued /reload-runtime as a follow-up command." }],
      };
    },
  });
}
```

## 扩展API方法

### pi.on（事件，处理程序）

订阅活动。事件类型和返回值请参见[事件](#events)。

### pi.registerTool(定义)

注册一个可由法学硕士调用的自定义工具。有关完整详细信息，请参阅[自定义工具](#custom-tools)。

`pi.registerTool()` 在扩展加载期间和启动后都可以工作。您可以在 `session_start`、命令处理程序或其他事件处理程序内调用它。新工具会在同一会话中立即刷新，因此它们会出现在 `pi.getAllTools()` 中，并且可以由法学硕士调用，无需使用 `/reload`。

使用 `pi.setActiveTools()` 在运行时启用或禁用工具（包括动态添加的工具）。

使用 `promptSnippet` 将自定义工具选择到 `Available tools` 中的单行条目中，并使用 `promptGuidelines` 在该工具处于活动状态时将特定于工具的项目符号附加到默认的 `Guidelines` 部分。

**重要提示：** `promptGuidelines` 项目符号平铺到 `Guidelines` 部分，没有工具名称前缀。每条指南必须命名它所引用的工具——避免“在......时使用此工具”，因为法学硕士无法分辨“这”意味着哪个工具。写“当...时使用 my_tool”。

有关完整示例，请参阅 [dynamic-tools.ts](../../../examples/extensions/dynamic-tools.ts)。

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does",
  promptSnippet: "Summarize or transform text according to action",
  promptGuidelines: ["Use my_tool when the user asks to summarize previously generated text."],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    // Optional compatibility shim. Runs before schema validation.
    // Return the current schema shape, for example to fold legacy fields
    // into the modern parameter object.
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Stream progress
    onUpdate?.({ content: [{ type: "text", text: "Working..." }] });

    return {
      content: [{ type: "text", text: "Done" }],
      details: { result: "..." },
    };
  },

  // Optional: Custom rendering
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

### pi.sendMessage（消息，选项？）

将自定义消息注入会话中。自定义消息参与 LLM 上下文。对于不应发送至 LLM 的持久 TUI 内容，请使用 [`pi.appendEntry()`](#piappendentrycustomtype-data) 和 [`pi.registerEntryRenderer()`](#piregisterentryrenderercustomtype-renderer)。

```typescript
pi.sendMessage({
  customType: "my-extension",
  content: "Message text",
  display: true,
  details: { ... },
}, {
  triggerTurn: true,
  deliverAs: "steer",
});
```

**选项：**
- `deliverAs` - 交付方式：
  - `"steer"`（默认）- 在流式传输时对消息进行排队。在当前助理轮次完成执行其工具调用后、下一次 LLM 调用之前交付。
  - `"followUp"` - 等待代理完成。仅当代理不再有工具调用时才传送。
  - `"nextTurn"` - 排队等待下一个用户提示。不会中断或触发任何事情。
- `triggerTurn: true` - 如果代理空闲，立即触发 LLM 响应。仅适用于 `"steer"` 和 `"followUp"` 模式（对于 `"nextTurn"` 忽略）。

### pi.sendUserMessage（内容，选项？）

向代理发送用户消息。与发送自定义消息的 `sendMessage()` 不同，这会发送一条实际的用户消息，看起来就像是由用户键入的。总是触发转弯。

```typescript
// Simple text message
pi.sendUserMessage("What is 2+2?");

// With content array (text + images)
pi.sendUserMessage([
  { type: "text", text: "Describe this image:" },
  { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } },
]);

// During streaming - must specify delivery mode
pi.sendUserMessage("Focus on error handling", { deliverAs: "steer" });
pi.sendUserMessage("And then summarize", { deliverAs: "followUp" });
```

**选项：**
- `deliverAs` - 代理流式传输时需要：
  - `"steer"` - 在当前助手轮完成执行其工具调用后将消息排队等待传递
  - `"followUp"` - 等待代理完成所有工具

当不流式传输时，消息会立即发送并触发新一轮。在没有 `deliverAs` 的情况下进行流式传输时，会引发错误。

有关完整示例，请参阅 [send-user-message.ts](../../../examples/extensions/send-user-message.ts)。

### pi.appendEntry（自定义类型，数据？）

保留扩展数据。自定义条目不参与 LLM 上下文。在交互模式下，当与 `pi.registerEntryRenderer()` 配对时，它们还可以在聊天记录内呈现。

```typescript
pi.appendEntry("my-state", { count: 42 });
pi.appendEntry("status-card", { title: "Indexed files", count: 17 });

// Restore on reload
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      // Reconstruct from entry.data
    }
  }
});
```

### pi.setSessionName(名称)

设置会话显示名称（显示在会话选择器中而不是第一条消息中）。

```typescript
pi.setSessionName("Refactor auth module");
```

### pi.getSessionName()

获取当前会话名称（如果已设置）。

```typescript
const name = pi.getSessionName();
if (name) {
  console.log(`Session: ${name}`);
}
```

### pi.setLabel(entryId, 标签)

设置或清除条目上的标签。标签是用户定义的书签和导航标记（显示在 `/tree` 选择器中）。

```typescript
// Set a label
pi.setLabel(entryId, "checkpoint-before-refactor");

// Clear a label
pi.setLabel(entryId, undefined);

// Read labels via sessionManager
const label = ctx.sessionManager.getLabel(entryId);
```

标签在会话中保留并在重新启动后继续存在。使用它们来标记对话树中的重要点（回合、检查点）。

### pi.registerCommand(名称, 选项)

注册命令。

如果多个扩展注册相同的命令名称，pi 会保留所有扩展并按加载顺序分配数字调用后缀，例如 `/review:1` 和 `/review:2`。

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  handler: async (args, ctx) => {
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} entries`, "info");
  }
});
```

可选：为 `/command ...` 添加参数自动完成：

```typescript
import type { AutocompleteItem } from "@earendil-works/pi-tui";

pi.registerCommand("deploy", {
  description: "Deploy to an environment",
  getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
    const envs = ["dev", "staging", "prod"];
    const items = envs.map((e) => ({ value: e, label: e }));
    const filtered = items.filter((i) => i.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`Deploying: ${args}`, "info");
  },
});
```

### pi.getCommands()

获取当前会话中可通过 `prompt` 调用的斜杠命令。包括扩展命令、提示模板和技能命令。
该列表符合 RPC `get_commands` 顺序：首先是扩展，然后是模板，最后是技能。

```typescript
const commands = pi.getCommands();
const bySource = commands.filter((command) => command.source === "extension");
const userScoped = commands.filter((command) => command.sourceInfo.scope === "user");
```

每个条目都有这样的形状：

```typescript
{
  name: string; // Invokable command name without the leading slash. May be suffixed like "review:1"
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: {
    path: string;
    source: string;
    scope: "user" | "project" | "temporary";
    origin: "package" | "top-level";
    baseDir?: string;
  };
}
```

使用 `sourceInfo` 作为规范来源字段。不要从命令名称或临时路径解析推断所有权。

此处不包括内置交互式命令（例如 `/model` 和 `/settings`）。它们仅在交互中处理
模式，如果通过 `prompt` 发送则不会执行。

### pi.registerMessageRenderer(customType, 渲染器)

使用 `customType` 为自定义消息注册自定义 TUI 渲染器。自定义消息使用 `pi.sendMessage()` 创建并参与 LLM 上下文。请参阅[自定义用户界面](#custom-ui)。

### pi.registerEntryRenderer(customType, 渲染器)

使用 `customType` 为自定义条目注册自定义 TUI 渲染器。自定义条目是使用 `pi.appendEntry()` 创建的，不参与 LLM 上下文。

```typescript
import { Box, Text } from "@earendil-works/pi-tui";

pi.registerEntryRenderer("status-card", (entry, { expanded }, theme) => {
  const data = entry.data as { title: string; count: number };
  const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
  box.addChild(new Text(`${theme.bold(data.title)}: ${data.count}`));
  if (expanded) {
    box.addChild(new Text(theme.fg("dim", JSON.stringify(data, null, 2))));
  }
  return box;
});

pi.appendEntry("status-card", { title: "Indexed files", count: 17 });
```

### pi.registerShortcut（快捷方式，选项）

注册键盘快捷键。有关快捷方式格式和内置键绑定，请参阅 [keybindings.md](keybindings.md)。

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "Toggle plan mode",
  handler: async (ctx) => {
    ctx.ui.notify("Toggled!");
  },
});
```

### pi.registerFlag(名称, 选项)

注册 CLI 标志。

```typescript
pi.registerFlag("plan", {
  description: "Start in plan mode",
  type: "boolean",
  default: false,
});

// Check value
if (pi.getFlag("plan")) {
  // Plan mode enabled
}
```

### pi.exec（命令、参数、选项？）

执行外壳命令。

```typescript
const result = await pi.exec("git", ["status"], { signal, timeout: 5000 });
// result.stdout, result.stderr, result.code, result.killed
```

### pi.getActiveTools() / pi.getAllTools() / pi.setActiveTools(names)

管理活动工具。这适用于内置工具和动态注册工具。 `pi.getActiveTools()` 返回活动工具名称为 `string[]`； `pi.getAllTools()` 返回所有已配置工具的元数据。

```typescript
const active = pi.getActiveTools(); // ["read", "bash", ...]
const all = pi.getAllTools();
// all = [{
//   name: "read",
//   description: "Read file contents...",
//   parameters: ...,
//   promptGuidelines: ["Use read to examine files instead of cat or sed."],
//   sourceInfo: { path: "<builtin:read>", source: "builtin", scope: "temporary", origin: "top-level" }
// }, ...]
const builtinTools = all.filter((t) => t.sourceInfo.source === "builtin");
const extensionTools = all.filter((t) => t.sourceInfo.source !== "builtin" && t.sourceInfo.source !== "sdk");
pi.setActiveTools([...new Set([...active, "my_custom_tool"])]); // Keep current tools and enable my_custom_tool
pi.setActiveTools(["read", "bash"]); // Switch to read-only
```

`pi.getAllTools()` 返回 `name`、`description`、`parameters`、`promptGuidelines` 和 `sourceInfo`。

典型 `sourceInfo.source` 值：
- `builtin` 用于内置工具
- `sdk` 用于通过 `createAgentSession({ customTools })` 传递的工具
- 由扩展注册的工具的扩展源元数据

### pi.setModel(模型)

设置当前模型。如果模型没有可用的 API 密钥，则返回 `false`。请参阅 [models.md](models.md) 配置自定义模型。

```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-5");
if (model) {
  const success = await pi.setModel(model);
  if (!success) {
    ctx.ui.notify("No API key for this model", "error");
  }
}
```

### pi.getThinkingLevel() / pi.setThinkingLevel(级别)

获取或设置思维水平。级别受限于模型能力（非推理模型始终使用“关闭”）。更改会发出 `thinking_level_select`。

```typescript
const current = pi.getThinkingLevel();  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
pi.setThinkingLevel("high");
```

### pi.事件

用于扩展之间通信的共享事件总线：

```typescript
pi.events.on("my:event", (data) => { ... });
pi.events.emit("my:event", { ... });
```

### pi.registerProvider(名称, 配置)

动态注册或覆盖模型提供者。对于代理、自定义端点或团队范围的模型配置很有用。

一旦运行程序初始化，扩展工厂函数期间进行的调用就会排队并应用。此后进行的调用（例如，从用户设置流程后的命令处理程序进行的调用）立即生效，无需 `/reload`。

动态提供者可以实现`refreshModels`。 Pi 在模型刷新期间调用它，通过提供者同步发布返回的列表，并传递规范的凭证/存储/网络/信号上下文。扩展通过`context.store`决定是否持久化目录；诸如 llama.cpp 之类的实时服务器可以忽略它。

需要本机提供程序身份验证、过滤、刷新或流行为的扩展可以从 `@earendil-works/pi-ai` 注册完整的 `Provider`。提供者成为组合基础，并且 `models.json` 覆盖仍然适用于其之上。

```typescript
import { createProvider, openAICompletionsApi } from "@earendil-works/pi-ai";

const provider = createProvider({
  id: "local-server",
  name: "Local Server",
  baseUrl: "http://localhost:8080/v1",
  auth: {
    apiKey: {
      name: "Local server setup",
      async login(interaction) {
        return {
          type: "api_key",
          key: await interaction.prompt({ type: "secret", message: "API key" }),
        };
      },
      async resolve({ credential }) {
        return credential?.key
          ? { auth: { apiKey: credential.key }, source: "stored API key" }
          : undefined;
      },
    },
  },
  models: [],
  api: openAICompletionsApi(),
});

pi.registerProvider(provider);

// Register a new provider with custom models
pi.registerProvider("my-proxy", {
  name: "My Proxy",
  baseUrl: "https://proxy.example.com",
  apiKey: "$PROXY_API_KEY",  // env var reference
  api: "anthropic-messages",
  models: [
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude 4 Sonnet (proxy)",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});

// Register a live llama.cpp catalog without persisting discovered models
pi.registerProvider("llama.cpp", {
  baseUrl: "http://localhost:8080/v1",
  apiKey: "local",
  api: "openai-completions",
  async refreshModels({ signal }) {
    const response = await fetch("http://localhost:8080/v1/models", { signal });
    const { data } = await response.json();
    return data.map(({ id }) => ({
      id,
      name: id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384
    }));
  }
});

// Override baseUrl for an existing provider (keeps all models)
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// Register provider with OAuth support for /login
pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",
    async login(callbacks) {
      // Custom OAuth flow
      callbacks.onAuth({ url: "https://sso.corp.com/..." });
      const code = await callbacks.onPrompt({ message: "Enter code:" });
      return { refresh: code, access: code, expires: Date.now() + 3600000 };
    },
    async refreshToken(credentials) {
      // Refresh logic
      return credentials;
    },
    getApiKey(credentials) {
      return credentials.access;
    }
  }
});
```

对象形式接受完整的 pi-ai `Provider`，包括本机 `auth`、`getModels`、`refreshModels`、`filterModels`、`stream` 和 `streamSimple` 行为。

**旧配置选项：**
- `name` - UI 中提供程序的显示名称，例如 `/login`。
- `baseUrl` - API 端点 URL。定义模型时需要。
- `apiKey` - API 密钥文字、环境插值（`$ENV_VAR` 或 `${ENV_VAR}`）或前导 `!command`。定义模型时需要（除非提供了 `oauth`）。 `$$` 转义 `$`，`$!` 转义文字 `!` 而不触发命令执行。
- `api`——API类型：`"anthropic-messages"`、`"openai-completions"`、`"openai-responses"`等
- `headers` - 要包含在请求中的自定义标头。
- `authHeader` - 如果为 true，则自动添加 `Authorization: Bearer` 标头。
- `models` - 模型定义数组。如果提供，则替换该提供商的所有现有模型。模型定义可以设置 `baseUrl` 来覆盖该模型的提供者端点。
- `refreshModels` - 异步动态发现回调。它返回的模型取代了扩展提供的模型。仅当结果应该持续存在时才使用作用域 `context.store`。
- `oauth` - 用于 `/login` 支持的 OAuth 提供程序配置。提供后，提供商会出现在登录菜单中。
- `streamSimple` - 非标准 API 的自定义流实现。

请参阅 [custom-provider.md](custom-provider.md) 了解高级主题：自定义流 API、OAuth 详细信息、模型定义参考。

### pi.unregisterProvider(名称)

删除先前注册的提供程序及其模型。被提供者覆盖的内置模型将被恢复。如果提供商未注册，则无效。

与 `registerProvider` 一样，这在初始加载阶段后调用时立即生效，因此不需要 `/reload`。

```typescript
pi.registerCommand("my-setup-teardown", {
  description: "Remove the custom proxy provider",
  handler: async (_args, _ctx) => {
    pi.unregisterProvider("my-proxy");
  },
});
```

## 状态管理

具有状态的扩展应将其存储在工具结果 `details` 中以获得正确的分支支持：

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // Reconstruct state from session
  pi.on("session_start", async (_event, ctx) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "my_tool") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  });

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push("new item");
      return {
        content: [{ type: "text", text: "Added" }],
        details: { items: [...items] },  // Store for reconstruction
      };
    },
  });
}
```

## 定制工具

注册LLM可以通过`pi.registerTool()`调用的工具。工具出现在系统提示符中，并且可以进行自定义渲染。

在默认系统提示符的 `Available tools` 部分中使用 `promptSnippet` 进行简短的一行输入。如果省略，自定义工具将不包含在该部分中。

使用 `promptGuidelines` 将特定于工具的项目符号添加到默认系统提示 `Guidelines` 部分。这些项目符号仅在该工具处于活动状态时包含（例如，在 `pi.setActiveTools([...])` 之后）。

**重要提示：** `promptGuidelines` 项目符号平铺到 `Guidelines` 部分，没有工具名称前缀或分组。每条指南必须命名它所引用的工具——避免“在......时使用此工具”，因为法学硕士无法分辨“这”意味着哪个工具。写“当...时使用 my_tool”。

注意：有些模型是白痴，在工具路径参数中包含 @ 前缀。内置工具会在解析路径之前去除前导@。如果您的自定义工具接受路径，也请规范化前导@。

如果您的自定义工具会改变文件，请使用 `withFileMutationQueue()`，以便它参与与内置 `edit` 和 `write` 相同的每个文件队列。这很重要，因为默认情况下工具调用是并行运行的。如果没有队列，两个工具可以读取相同的旧文件内容，计算不同的更新，然后最后写入的内容覆盖另一个。

失败案例示例：您的自定义工具编辑 `foo.ts`，而内置 `edit` 也在同一个助手回合中更改 `foo.ts`。如果您的工具不参与队列，则两者都可以读取原始 `foo.ts`，应用单独的更改，并且这些更改之一会丢失。

将真实的目标文件路径传递给 `withFileMutationQueue()`，而不是原始用户参数。首先将其解析为相对于 `ctx.cwd` 或工具工作目录的绝对路径。对于现有文件，帮助程序通过 `realpath()` 进行规范化，因此同一文件的符号链接别名共享一个队列。对于新文件，它会回退到已解析的绝对路径，因为 `realpath()` 还没有任何内容。

将整个突变窗口排队到该目标路径上。这包括读取-修改-写入逻辑，而不仅仅是最终写入。

```typescript
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  const absolutePath = resolve(ctx.cwd, params.path);

  return withFileMutationQueue(absolutePath, async () => {
    await mkdir(dirname(absolutePath), { recursive: true });
    const current = await readFile(absolutePath, "utf8");
    const next = current.replace(params.oldText, params.newText);
    await writeFile(absolutePath, next, "utf8");

    return {
      content: [{ type: "text", text: `Updated ${params.path}` }],
      details: {},
    };
  });
}
```

### 工具定义

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  promptSnippet: "List or add items in the project todo list",
  promptGuidelines: [
    "Use my_tool for todo planning instead of direct file edits when the user asks for a task list."
  ],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),  // Use StringEnum for Google compatibility
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;
    const input = args as { action?: string; oldAction?: string };
    if (typeof input.oldAction === "string" && input.action === undefined) {
      return { ...input, action: input.oldAction };
    }
    return args;
  },

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Check for cancellation
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Cancelled" }] };
    }

    // Stream progress updates
    onUpdate?.({
      content: [{ type: "text", text: "Working..." }],
      details: { progress: 50 },
    });

    // Run commands via pi.exec (captured from extension closure)
    const result = await pi.exec("some-command", [], { signal });

    // Return result
    return {
      content: [{ type: "text", text: "Done" }],  // Sent to LLM
      details: { data: result },                   // For rendering & state
      // usage: nestedModelResponse.usage,          // Optional nested LLM usage
      // Optional: stop after this tool batch when every finalized tool result
      // in the batch also returns terminate: true.
      terminate: true,
    };
  },

  // Optional: Custom rendering
  renderCall(args, theme, context) { ... },
  renderResult(result, options, theme, context) { ... },
});
```

**使用情况统计：** 如果工具进行嵌套 LLM 调用，则将其组合 `Usage` 返回为 `usage`。 Pi 将其保留在工具结果中，并将其包含在页脚、`/session` 和 RPC 会话总计中。 `tool_result` 处理程序可以检查或替换该值。

**信号错误：** 要将工具执行标记为失败（在结果上设置 `isError: true` 并将其报告给 LLM），请从 `execute` 抛出错误。无论返回对象中包含哪些属性，返回值都不会设置错误标志。

**提前终止：** 从 `execute()` 返回 `terminate: true` 以提示应在当前工具批次之后跳过自动后续 LLM 调用。仅当该批次中的每个最终工具结果都终止时，此操作才会生效。有关代理以最终结构化输出工具调用结束的最小示例，请参阅 [examples/extensions/structed-output.ts](../examples/extensions/structured-output.ts)。

```typescript
// Correct: throw to signal an error
async execute(toolCallId, params) {
  if (!isValid(params.input)) {
    throw new Error(`Invalid input: ${params.input}`);
  }
  return { content: [{ type: "text", text: "OK" }], details: {} };
}
```

**重要提示：** 使用 `@earendil-works/pi-ai` 中的 `StringEnum` 进行字符串枚举。 `Type.Union`/`Type.Literal` 不适用于 Google 的 API。

**参数准备：** `prepareArguments(args)` 是可选的。如果定义，它将在模式验证之前和 `execute()` 之前运行。当 pi 恢复其存储的工具调用参数不再与当前模式匹配的旧会话时，使用它来模仿旧的接受的输入形状。返回您想要针对 `parameters` 进行验证的对象。保持公共架构严格。不要仅仅为了保持旧的恢复会话正常工作而将已弃用的兼容性字段添加到 `parameters`。

示例：旧会话可能包含具有顶级 `oldText` 和 `newText` 的 `edit` 工具调用，而当前架构仅接受 `edits: [{ oldText, newText }]`。

```typescript
pi.registerTool({
  name: "edit",
  label: "Edit",
  description: "Edit a single file using exact text replacement",
  parameters: Type.Object({
    path: Type.String(),
    edits: Type.Array(
      Type.Object({
        oldText: Type.String(),
        newText: Type.String(),
      }),
    ),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;

    const input = args as {
      path?: string;
      edits?: Array<{ oldText: string; newText: string }>;
      oldText?: unknown;
      newText?: unknown;
    };

    if (typeof input.oldText !== "string" || typeof input.newText !== "string") {
      return args;
    }

    return {
      ...input,
      edits: [...(input.edits ?? []), { oldText: input.oldText, newText: input.newText }],
    };
  },
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // params now matches the current schema
    return {
      content: [{ type: "text", text: `Applying ${params.edits.length} edit block(s)` }],
      details: {},
    };
  },
});
```

### 覆盖内置工具

扩展可以通过注册具有相同名称的工具来覆盖内置工具（`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`）。发生这种情况时，交互模式会显示警告。

```bash
# Extension's read tool replaces built-in read
pi -e ./tool-override.ts
```

或者，使用 `--no-builtin-tools` 在不使用任何内置工具的情况下启动，同时保持扩展工具启用：
```bash
# No built-in tools, only extension tools
pi --no-builtin-tools -e ./my-extension.ts
```

有关使用日志记录和访问控制覆盖 `read` 的完整示例，请参阅 [examples/extensions/tool-override.ts](../../../examples/extensions/tool-override.ts)。

**渲染：** 内置渲染器继承是按插槽解析的。执行覆盖和渲染覆盖是独立的。如果您的覆盖忽略 `renderCall`，则使用内置 `renderCall`。如果您的覆盖忽略 `renderResult`，则使用内置 `renderResult`。如果您的覆盖忽略两者，则会自动使用内置渲染器（语法突出显示、差异等）。这使您可以封装用于日志记录或访问控制的内置工具，而无需重新实现 UI。

**提示元数据：** `promptSnippet` 和 `promptGuidelines` 不是从内置工具继承的。如果您的覆盖应保留这些提示说明，请在覆盖上明确定义它们。

**您的实现必须与确切的结果形状匹配**，包括 `details` 类型。 UI 和会话逻辑依赖于这些形状来进行渲染和状态跟踪。

内置工具实现：
- [阅读.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/read.ts) - `ReadToolDetails`
- [bash.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/bash.ts) - `BashToolDetails`
- [编辑ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts)
- [写入.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/write.ts)
- [grep.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/grep.ts) - `GrepToolDetails`
- [查找.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/find.ts) - `FindToolDetails`
- [ls.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/ls.ts) - `LsToolDetails`

### 远程执行

内置工具支持可插入操作以委托给远程系统（SSH、容器等）：

```typescript
import { createReadTool, createBashTool, type ReadOperations } from "@earendil-works/pi-coding-agent";

// Create tool with custom operations
const remoteRead = createReadTool(cwd, {
  operations: {
    readFile: (path) => sshExec(remote, `cat ${path}`),
    access: (path) => sshExec(remote, `test -r ${path}`).then(() => {}),
  }
});

// Register, checking flag at execution time
pi.registerTool({
  ...remoteRead,
  async execute(id, params, signal, onUpdate, _ctx) {
    const ssh = getSshConfig();
    if (ssh) {
      const tool = createReadTool(cwd, { operations: createRemoteOps(ssh) });
      return tool.execute(id, params, signal, onUpdate);
    }
    return localRead.execute(id, params, signal, onUpdate);
  },
});
```

**操作接口：** `ReadOperations`、`WriteOperations`、`EditOperations`、`BashOperations`、`LsOperations`、`GrepOperations`、`FindOperations`

对于 `user_bash`，扩展可以通过 `createLocalBashOperations()` 重用 pi 的本地 shell 后端，而不是重新实现本地进程生成、shell 解析和进程树终止。

bash 工具还支持spawn hook 在执行前调整命令、cwd 或env：

```typescript
import { createBashTool } from "@earendil-works/pi-coding-agent";

const bashTool = createBashTool(cwd, {
  spawnHook: ({ command, cwd, env }) => ({
    command: `source ~/.profile\n${command}`,
    cwd: `/mnt/sandbox${cwd}`,
    env: { ...env, CI: "1" },
  }),
});
```

`createBashTool()` 通过 `PI_SESSION_ID`、`PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL` 和 `PI_REASONING_LEVEL` 将当前会话公开给命令。注入发生在 `spawnHook` 之前，因此钩子在 `env` 中接收这些值，并在如上所述传播现有环境时保留它们。设置 `exposeSessionEnvironment: false` 以禁用它们：

```typescript
const bashTool = createBashTool(cwd, {
  exposeSessionEnvironment: false,
});
```

有关变量语义，请参阅[Bash 工具会话环境](environment-variables.md#bash-tool-session-environment)。有关带有 `--ssh` 标志的完整 SSH 示例，请参阅 [examples/extensions/ssh.ts](../../../examples/extensions/ssh.ts)。

### 输出截断

**工具必须截断其输出**以避免压垮 LLM 上下文。大输出可能会导致：
- 上下文溢出错误（提示太长）
- 压实失败
- 模型性能下降

内置限制为 **50KB**（约 10k 代币）和 **2000 行**，以先达到者为准。使用导出的截断实用程序：

```typescript
import {
  truncateHead,      // Keep first N lines/bytes (good for file reads, search results)
  truncateTail,      // Keep last N lines/bytes (good for logs, command output)
  truncateLine,      // Truncate a single line to maxBytes with ellipsis
  formatSize,        // Human-readable size (e.g., "50KB", "1.5MB")
  DEFAULT_MAX_BYTES, // 50KB
  DEFAULT_MAX_LINES, // 2000
} from "@earendil-works/pi-coding-agent";

async execute(toolCallId, params, signal, onUpdate, ctx) {
  const output = await runCommand();

  // Apply truncation
  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let result = truncation.content;

  if (truncation.truncated) {
    // Write full output to temp file
    const tempFile = writeTempFile(output);

    // Inform the LLM where to find complete output
    result += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
    result += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    result += ` Full output saved to: ${tempFile}]`;
  }

  return { content: [{ type: "text", text: result }] };
}
```

**要点：**
- 对于开头很重要的内容（搜索结果、文件读取）使用 `truncateHead`
- 对于结尾重要的内容（日志、命令输出）使用 `truncateTail`
- 当输出被截断时，务必通知法学硕士以及在哪里可以找到完整版本
- 在工具描述中记录截断限制

请参阅 [examples/extensions/truncated-tool.ts](../../../examples/extensions/truncated-tool.ts) 以获取使用适当截断包装 `rg` (ripgrep) 的完整示例。

### 多种工具

一个扩展可以注册多个具有共享状态的工具：

```typescript
export default function (pi: ExtensionAPI) {
  let connection = null;

  pi.registerTool({ name: "db_connect", ... });
  pi.registerTool({ name: "db_query", ... });
  pi.registerTool({ name: "db_close", ... });

  pi.on("session_shutdown", async () => {
    connection?.close();
  });
}
```

### 自定义渲染

工具可以提供`renderCall`和`renderResult`用于自定义TUI显示。有关完整组件 API，请参阅 [tui.md](tui.md)；有关工具行的组成方式，请参阅 [tool-execution.ts](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/modes/interactive/components/tool-execution.ts)。

默认情况下，工具输出包装在处理填充和背景的 `Box` 中。定义的 `renderCall` 或 `renderResult` 必须返回 `Component`。如果未定义槽渲染器，`tool-execution.ts` 会对该槽使用回退渲染。

当工具应该渲染自己的 shell 而不是使用默认的 `Box` 时，设置 `renderShell: "self"`。这对于需要完全控制取景或背景行为的工具非常有用，例如在工具稳定后必须保持视觉稳定的大型预览。

```typescript
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Custom shell example",
  parameters: Type.Object({}),
  renderShell: "self",
  async execute() {
    return { content: [{ type: "text", text: "ok" }], details: undefined };
  },
  renderCall(args, theme, context) {
    return new Text(theme.fg("accent", "my custom shell"), 0, 0);
  },
});
```

`renderCall` 和 `renderResult` 各自接收一个 `context` 对象，其中：
- `args` - 当前工具调用参数
- `state` - 在 `renderCall` 和 `renderResult` 之间共享行本地状态
- `lastComponent` - 该插槽之前返回的组件（如果有）
- `invalidate()` - 请求重新渲染此工具行
- `toolCallId`、`cwd`、`executionStarted`、`argsComplete`、`isPartial`、`expanded`、`showImages`、`isError`

使用 `context.state` 进行跨槽共享状态。当您想要跨渲染重用和改变同一组件时，请在返回的组件实例上保留插槽本地缓存。

#### 渲染调用

呈现工具调用或标头：

```typescript
import { Text } from "@earendil-works/pi-tui";

renderCall(args, theme, context) {
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  let content = theme.fg("toolTitle", theme.bold("my_tool "));
  content += theme.fg("muted", args.action);
  if (args.text) {
    content += " " + theme.fg("dim", `"${args.text}"`);
  }
  text.setText(content);
  return text;
}
```

#### 渲染结果

呈现工具结果或输出：

```typescript
renderResult(result, { expanded, isPartial }, theme, context) {
  if (isPartial) {
    return new Text(theme.fg("warning", "Processing..."), 0, 0);
  }

  if (result.details?.error) {
    return new Text(theme.fg("error", `Error: ${result.details.error}`), 0, 0);
  }

  let text = theme.fg("success", "✓ Done");
  if (expanded && result.details?.items) {
    for (const item of result.details.items) {
      text += "\n  " + theme.fg("dim", item);
    }
  }
  return new Text(text, 0, 0);
}
```

如果槽故意没有可见内容，则返回空 `Component`，例如空 `Container`。

#### 键绑定提示

使用 `keyHint()` 显示遵循活动键绑定配置的键绑定提示：

```typescript
import { keyHint } from "@earendil-works/pi-coding-agent";

renderResult(result, { expanded }, theme, context) {
  let text = theme.fg("success", "✓ Done");
  if (!expanded) {
    text += ` (${keyHint("app.tools.expand", "to expand")})`;
  }
  return new Text(text, 0, 0);
}
```

可用功能：
- `keyHint(keybinding, description)` - 格式化配置的键绑定 ID，例如 `"app.tools.expand"` 或 `"tui.select.confirm"`
- `keyText(keybinding)` - 返回键绑定 id 的原始配置键文本
- `rawKeyHint(key, description)` - 格式化原始密钥字符串

使用命名空间键绑定 ID：
- 编码代理 ID 使用 `app.*` 命名空间，例如 `app.tools.expand`、`app.editor.external`、`app.session.rename`
- 共享 TUI id 使用 `tui.*` 命名空间，例如 `tui.select.confirm`、`tui.select.cancel`、`tui.input.tab`

有关键绑定 ID 和默认值的详尽列表，请参阅 [keybindings.md](keybindings.md)。 `keybindings.json` 使用相同的命名空间 ID。

自定义编辑器和 `ctx.ui.custom()` 组件接收 `keybindings: KeybindingsManager` 作为注入参数。他们应该直接使用注入的管理器，而不是调用 `getKeybindings()` 或 `setKeybindings()`。

#### 最佳实践

- 使用 `Text` 和填充 `(0, 0)`。默认的 Box 处理填充。
- 对于多行内容，请使用 `\n`。
- 处理 `isPartial` 以获取流式传输进度。
- 支持`expanded`详细点播。
- 保持默认视图紧凑。
- 读取 `renderResult` 中的 `context.args`，而不是将 args 复制到 `context.state` 中。
- 仅对必须在调用和结果槽之间共享的数据使用 `context.state`。
- 当可以就地更新相同的组件实例时，重用 `context.lastComponent`。
- 仅当默认盒装 shell 妨碍时才使用 `renderShell: "self"`。在自外壳模式下，该工具负责其自己的框架、填充和背景。

#### 倒退

如果槽渲染器未定义或抛出：
- `renderCall`：显示工具名称
- `renderResult`：显示来自 `content` 的原始文本

### 动态刀具加载

扩展可以注册许多工具，同时仅保持一小部分初始集处于活动状态。然后，工具可以在执行期间使用 `pi.setActiveTools()` 添加更多工具。 Pi 检测纯粹的附加更改，记录该工具结果上新可用的工具名称，并在下一个模型请求之前应用更新的活动集。

这适用于每个型号。具有本机延迟加载支持的模型保留稳定的提示前缀并在工具结果位置加载新定义。其他模型使用下面描述的后备。

生命周期是：

1. 将每个工具注册到 `pi.registerTool()`，以便它出现在 `pi.getAllTools()` 中。
2. 保持加载工具（例如 `search_tools`）处于活动状态，并使可搜索工具处于非活动状态。
3. 在加载器执行期间，调用`pi.setActiveTools([...currentTools, ...matchingTools])`。更改必须是附加的：不要在同一调用中删除当前活动的工具。
4. Pi 记录了加载器的工具结果中添加了哪些工具。
5. 在下一个模型响应之前，Pi 在支持时使用本机延迟加载公开添加的定义，否则使用正常的活动工具列表。

您不需要返回特定于提供程序的工具引用或将加载程序标记为特殊搜索工具。主动换刀就是信号。传递给 `pi.setActiveTools()` 的名称必须已注册；未知的名称将被忽略。

#### 具有本机延迟加载的模型

- **人择**
  - **型号：** Sonnet、Opus、Fable 版本 4.5 或更高版本（不含俳句）
  - **原生表示：** 延迟定义使用 `defer_loading`；加载点使用 `tool_reference` 内容。
- **开放人工智能**
  - **型号：** `gpt-5.4` 和更新系列
  - **本机表示：** Pi 在加载点添加已完成的客户端 `tool_search_call` 和 `tool_search_output` 项。

对于经过验证的自定义模型或代理，可以使用 `compat.supportsToolReferences: true`（对于 `anthropic-messages`）或 `compat.supportsToolSearch: true`（对于 `openai-responses` 和 `openai-codex-responses`）启用本机处理。除非端点和模型接受相应的本机协议，否则将它们保持禁用状态。

#### 回退行为

对于所有其他模型和提供程序，动态激活仍然有效：Pi 通常在下一个请求时发送完整的当前活动工具列表。该模型可以调用新激活的工具，但添加它们的定义可能会使提供程序的缓存提示前缀无效。

当活动集不是纯粹的累加时，例如用一组工具替换另一组工具时，Pi 也会使用这种安全后备。因此，工具删除可以工作，但它们不使用延迟加载。

为了获得最佳缓存行为，请在整个会话中保持加载程序工具处于活动状态并添加工具而不是替换活动集。另请注意，使用 `promptSnippet` 或 `promptGuidelines` 激活工具会重建系统提示符；即使提供程序支持延迟模式，系统提示的更改也可能使前缀无效。延迟加载的工具通常应该依赖于它们的工具 `description` 并省略仅活动的提示元数据。

#### 搜索工具示例

以下扩展注册了两个可搜索工具，将它们从初始活动集中删除，并仅保留 `search_tools` 作为它们的加载程序。该示例使用简单的关键字匹配，但搜索实现可以使用 BM25、嵌入、远程目录或特定于项目的路由。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const SEARCHABLE_TOOL_NAMES = new Set(["lookup_weather", "search_issues"]);

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "lookup_weather",
    label: "Lookup Weather",
    description: "Look up the current weather for a city",
    parameters: Type.Object({ city: Type.String() }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `Weather for ${params.city}: sunny` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "search_issues",
    label: "Search Issues",
    description: "Search project issues by keyword",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `No open issues matching ${params.query}` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "search_tools",
    label: "Search Tools",
    description: "Search for and enable tools relevant to a task",
    promptSnippet: "Search for additional tools when the active tools cannot perform the task",
    promptGuidelines: [
      "Use search_tools when a task requires a capability that is not currently available.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Capability or task to search for" }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
    }),
    async execute(_toolCallId, params) {
      const terms = params.query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const matches = pi.getAllTools()
        .filter((tool) => SEARCHABLE_TOOL_NAMES.has(tool.name))
        .map((tool) => ({
          tool,
          score: terms.reduce(
            (score, term) =>
              score + (`${tool.name} ${tool.description}`.toLowerCase().includes(term) ? 1 : 0),
            0,
          ),
        }))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, params.limit ?? 3)
        .map((match) => match.tool.name);

      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: `No tools found for: ${params.query}` }],
          details: { matches: [] },
        };
      }

      const active = pi.getActiveTools();
      const added = matches.filter((name) => !active.includes(name));
      pi.setActiveTools([...new Set([...active, ...added])]);

      return {
        content: [{
          type: "text",
          text: added.length > 0
            ? `Loaded tools: ${added.join(", ")}`
            : `Matching tools already active: ${matches.join(", ")}`,
        }],
        details: { matches, added },
      };
    },
  });

  pi.on("session_start", () => {
    // Keep searchable tools registered but initially inactive. Preserve built-ins
    // and tools owned by other extensions, and keep the loader itself active.
    const initialTools = pi.getActiveTools().filter(
      (name) => !SEARCHABLE_TOOL_NAMES.has(name),
    );
    pi.setActiveTools([...new Set([...initialTools, "search_tools"])]);
  });
}
```

当 `search_tools` 添加匹配项时，模型会在紧随其后的请求中收到该定义。在支持本机的模型上，定义锚定在搜索结果之后，而不更改初始工具模式前缀。在其他型号上，它会根据相同的以下请求出现在正常工具列表中。

## 自定义用户界面

扩展可以通过 `ctx.ui` 方法与用户交互，并自定义消息/工具的呈现方式。

**对于自定义组件，请参阅 [tui.md](tui.md)**，其中具有以下复制粘贴模式：
- 选择对话框（SelectList）
- 带取消的异步操作 (BorderedLoader)
- 设置切换（设置列表）
- 状态指示器（setStatus）
- 流式传输期间的工作消息、可见性和指示器（`setWorkingMessage`、`setWorkingVisible`、`setWorkingIndicator`）
- 编辑器上方/下方的小部件 (setWidget)
- 自动完成提供程序位于内置斜杠/路径完成之上 (addAutocompleteProvider)
- 自定义页脚 (setFooter)

### 对话框

```typescript
// Select from options
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);

// Confirm dialog
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");

// Text input
const name = await ctx.ui.input("Name:", "placeholder");

// Multi-line editor
const text = await ctx.ui.editor("Edit:", "prefilled text");

// Notification (non-blocking)
ctx.ui.notify("Done!", "info");  // "info" | "warning" | "error"
```

#### 带倒计时的定时对话框

对话框支持 `timeout` 选项，该选项可通过实时倒计时显示自动关闭：

```typescript
// Dialog shows "Title (5s)" → "Title (4s)" → ... → auto-dismisses at 0
const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { timeout: 5000 }
);

if (confirmed) {
  // User confirmed
} else {
  // User cancelled or timed out
}
```

**超时返回值：**
- `select()` 返回 `undefined`
- `confirm()` 返回 `false`
- `input()` 返回 `undefined`

#### 使用 AbortSignal 手动解雇

要进行更多控制（例如，区分超时和用户取消），请使用 `AbortSignal`：

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

const confirmed = await ctx.ui.confirm(
  "Timed Confirmation",
  "This dialog will auto-cancel in 5 seconds. Confirm?",
  { signal: controller.signal }
);

clearTimeout(timeoutId);

if (confirmed) {
  // User confirmed
} else if (controller.signal.aborted) {
  // Dialog timed out
} else {
  // User cancelled (pressed Escape or selected "No")
}
```

有关完整示例，请参阅 [examples/extensions/timed-confirm.ts](../../../examples/extensions/timed-confirm.ts)。

### 小部件、状态和页脚

```typescript
// Status in footer (persistent until cleared)
ctx.ui.setStatus("my-ext", "Processing...");
ctx.ui.setStatus("my-ext", undefined);  // Clear

// Working loader (shown during streaming)
ctx.ui.setWorkingMessage("Thinking deeply...");
ctx.ui.setWorkingMessage();  // Restore default
ctx.ui.setWorkingVisible(false);  // Hide the built-in working loader row entirely
ctx.ui.setWorkingVisible(true);   // Show the built-in working loader row

// Working indicator (shown during streaming)
ctx.ui.setWorkingIndicator({ frames: [ctx.ui.theme.fg("accent", "●")] });  // Static dot
ctx.ui.setWorkingIndicator({
  frames: [
    ctx.ui.theme.fg("dim", "·"),
    ctx.ui.theme.fg("muted", "•"),
    ctx.ui.theme.fg("accent", "●"),
    ctx.ui.theme.fg("muted", "•"),
  ],
  intervalMs: 120,
});
ctx.ui.setWorkingIndicator({ frames: [] });  // Hide indicator
ctx.ui.setWorkingIndicator();  // Restore default spinner

// Widget above editor (default)
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
// Widget below editor
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "belowEditor" });
ctx.ui.setWidget("my-widget", (tui, theme) => new Text(theme.fg("accent", "Custom"), 0, 0));
ctx.ui.setWidget("my-widget", undefined);  // Clear

// Custom footer (replaces built-in footer entirely)
ctx.ui.setFooter((tui, theme) => ({
  render(width) { return [theme.fg("dim", "Custom footer")]; },
  invalidate() {},
}));
ctx.ui.setFooter(undefined);  // Restore built-in footer

// Terminal title
ctx.ui.setTitle("pi - my-project");

// Editor text
ctx.ui.setEditorText("Prefill text");
const current = ctx.ui.getEditorText();

// Paste into editor (triggers paste handling, including collapse for large content)
ctx.ui.pasteToEditor("pasted content");

// Stack custom autocomplete behavior on top of the built-in provider
ctx.ui.addAutocompleteProvider((current) => ({
  triggerCharacters: ["#"],
  async getSuggestions(lines, line, col, options) {
    const beforeCursor = (lines[line] ?? "").slice(0, col);
    const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
    if (!match) {
      return current.getSuggestions(lines, line, col, options);
    }

    return {
      prefix: `#${match[1] ?? ""}`,
      items: [{ value: "#2983", label: "#2983", description: "Extension API for autocomplete" }],
    };
  },
  applyCompletion(lines, line, col, item, prefix) {
    return current.applyCompletion(lines, line, col, item, prefix);
  },
  shouldTriggerFileCompletion(lines, line, col) {
    return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
  },
}));

// Tool output expansion
const wasExpanded = ctx.ui.getToolsExpanded();
ctx.ui.setToolsExpanded(true);
ctx.ui.setToolsExpanded(wasExpanded);

// Custom editor (vim mode, emacs mode, etc.)
ctx.ui.setEditorComponent((tui, theme, keybindings) => new VimEditor(tui, theme, keybindings));
const currentEditor = ctx.ui.getEditorComponent();
ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new WrappedEditor(tui, theme, keybindings, currentEditor?.(tui, theme, keybindings))
);
ctx.ui.setEditorComponent(undefined);  // Restore default editor

// Theme management (see themes.md for creating themes)
const themes = ctx.ui.getAllThemes();  // [{ name: "dark", path: "/..." | undefined }, ...]
const lightTheme = ctx.ui.getTheme("light");  // Load without switching
const result = ctx.ui.setTheme("light");  // Switch by name
if (!result.success) {
  ctx.ui.notify(`Failed: ${result.error}`, "error");
}
ctx.ui.setTheme(lightTheme!);  // Or switch by Theme object
ctx.ui.theme.fg("accent", "styled text");  // Access current theme
```

自定义工作指示器帧逐字​​呈现。如果您需要颜色，请自行将它们添加到框架字符串中，例如使用 `ctx.ui.theme.fg(...)`。

### 自动完成提供者

使用 `ctx.ui.addAutocompleteProvider()` 将自定义自动完成逻辑堆叠在内置斜杠命令和路径提供程序之上。为自定义自然触发器（例如 `$`）设置 `triggerCharacters`。

典型模式：

- 检查光标之前的文本
- 当您的扩展特定语法匹配时返回您自己的建议
- 否则委托给`current.getSuggestions(...)`
- 委托 `applyCompletion(...)` 除非您需要自定义插入行为

```typescript
pi.on("session_start", (_event, ctx) => {
  ctx.ui.addAutocompleteProvider((current) => ({
    triggerCharacters: ["#"],
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const match = beforeCursor.match(/(?:^|[ \t])#([^\s#]*)$/);
      if (!match) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return {
        prefix: `#${match[1] ?? ""}`,
        items: [
          { value: "#2983", label: "#2983", description: "Extension API for registering custom @ autocomplete providers" },
          { value: "#2753", label: "#2753", description: "Reload stale resource settings" },
        ],
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  }));
});
```

请参阅 [github-issue-autocomplete.ts](../../../examples/extensions/github-issue-autocomplete.ts) 了解完整示例，该示例使用 `gh issue list` 预加载最新的开放 GitHub 问题并在本地过滤它们以快速完成 `#...`。它需要 GitHub CLI (`gh`) 和 GitHub 存储库签出。

### 定制组件

对于复杂的 UI，请使用 `ctx.ui.custom()`。这会暂时用您的组件替换编辑器，直到调用 `done()`：

```typescript
import { Text, Component } from "@earendil-works/pi-tui";

const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  const text = new Text("Press Enter to confirm, Escape to cancel", 1, 1);

  text.onKey = (key) => {
    if (key === "return") done(true);
    if (key === "escape") done(false);
    return true;
  };

  return text;
});

if (result) {
  // User pressed Enter
}
```

回调收到：
- `tui` - TUI 实例（用于屏幕尺寸、焦点管理）
- `theme` - 当前的造型主题
- `keybindings` - 应用程序键绑定管理器（用于检查快捷方式）
- `done(value)` - 调用关闭组件并返回值

请参阅 [tui.md](tui.md) 了解完整的组件 API。

#### 叠加模式（实验性）

传递 `{ overlay: true }` 将组件渲染为现有内容之上的浮动模式，而不清除屏幕：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  { overlay: true }
);
```

对于高级定位（锚点、边距、百分比、响应式可见性），请传递 `overlayOptions`。使用 `onHandle` 以编程方式控制焦点或可见性：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  {
    overlay: true,
    overlayOptions: { anchor: "top-right", width: "50%", margin: 2 },
    onHandle: (handle) => {
      handle.focus(); // focus this overlay and bring it to the visual front
      // handle.unfocus({ target: editorComponent }); // release input to a specific component
      // handle.setHidden(true/false); // toggle visibility
      // handle.hide(); // permanently remove
    }
  }
);
```

临时非覆盖自定义 UI 关闭后，聚焦的可见覆盖可以回收输入。如果您有意希望另一个组件在覆盖层保持可见时保持输入，请调用 `handle.unfocus({ target })`。通过 `{ target: null }` 会释放叠加层，而无需聚焦其他组件。

有关完整的 `OverlayOptions` 和 `OverlayHandle` API，请参阅 [tui.md](tui.md)；有关示例，请参阅 [overlay-qa-tests.ts](../../../examples/extensions/overlay-qa-tests.ts)。

### 自定义编辑器

将主输入编辑器替换为自定义实现（vim 模式、emacs 模式等）：

```typescript
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal";
      return;
    }
    if (this.mode === "normal" && data === "i") {
      this.mode = "insert";
      return;
    }
    super.handleInput(data);  // App keybindings + text editing
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new VimEditor(tui, theme, keybindings)
    );
  });
}
```

**要点：**
- 扩展 `CustomEditor`（不是基础 `Editor`）以获取应用程序键绑定（转义以中止、ctrl+d、模型切换）
- 对于您不处理的钥匙，请致电 `super.handleInput(data)`
- 工厂从应用程序接收 `tui`、`theme` 和 `keybindings`
- 在 `setEditorComponent()` 之前使用 `ctx.ui.getEditorComponent()` 来包装之前配置的自定义编辑器
- 通过 `undefined` 恢复默认：`ctx.ui.setEditorComponent(undefined)`

要与已替换编辑器的另一个扩展进行组合，请在设置您的工厂之前捕获以前的工厂：

```typescript
const previous = ctx.ui.getEditorComponent();
ctx.ui.setEditorComponent((tui, theme, keybindings) =>
  new MyEditor(tui, theme, keybindings, { base: previous?.(tui, theme, keybindings) })
);
```

有关模式指示器的完整示例，请参阅 [tui.md](tui.md) 模式 7。

### 消息和条目渲染

使用 `customType` 注册消息的自定义渲染器。对应参与 LLM 上下文的内容使用消息渲染器：

```typescript
import { Text } from "@earendil-works/pi-tui";

pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  const { expanded, outputPad } = options;
  let text = theme.fg("accent", `[${message.customType}] `);
  text += message.content;

  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }

  return new Text(text, outputPad, 0);
});
```

消息通过 `pi.sendMessage()` 发送：

```typescript
pi.sendMessage({
  customType: "my-extension",  // Matches registerMessageRenderer
  content: "Status update",
  display: true,               // Show in TUI
  details: { ... },            // Available in renderer
});
```

对于不应发送到 LLM 的仅限 TUI 的内容，请改为呈现自定义条目：

```typescript
pi.registerEntryRenderer("my-card", (entry, options, theme) => {
  return new Text(theme.fg("accent", JSON.stringify(entry.data)));
});

pi.appendEntry("my-card", { status: "done" });
```

### 主题颜色

所有渲染函数都会接收一个 `theme` 对象。请参阅 [themes.md](themes.md) 创建自定义主题和完整调色板。

```typescript
// Foreground colors
theme.fg("toolTitle", text)   // Tool names
theme.fg("accent", text)      // Highlights
theme.fg("success", text)     // Success (green)
theme.fg("error", text)       // Errors (red)
theme.fg("warning", text)     // Warnings (yellow)
theme.fg("muted", text)       // Secondary text
theme.fg("dim", text)         // Tertiary text

// Text styles
theme.bold(text)
theme.italic(text)
theme.strikethrough(text)
```

对于自定义工具渲染器中的语法突出显示：

```typescript
import { highlightCode, getLanguageFromPath } from "@earendil-works/pi-coding-agent";

// Highlight code with explicit language
const highlighted = highlightCode("const x = 1;", "typescript", theme);

// Auto-detect language from file path
const lang = getLanguageFromPath("/path/to/file.rs");  // "rust"
const highlighted = highlightCode(code, lang, theme);
```

## 错误处理

- 记录扩展错误，代理继续
- `tool_call` 错误阻止工具（故障安全）
- 工具 `execute` 错误必须通过抛出来表示；抛出的错误被捕获，用 `isError: true` 报告给 LLM，然后继续执行

## 模式行为

|模式| `ctx.mode` | `ctx.hasUI` |笔记|
|------|------------|-------------|-------|
|互动| `"tui"` | `true` |带有终端渲染的完整 TUI |
| RPC (`--mode rpc`) | `"rpc"` | `true` |通过 JSON 协议进行对话框和通知； `custom()` 返回 `undefined`。参见[rpc.md](rpc.md) |
| JSON (`--mode json`) | `"json"` | `false` |事件流到标准输出； UI 方法是无操作的 |
|打印 (`-p`) | `"print"` | `false` |扩展程序运行但无法提示 |

在 TUI 特定功能（`custom()`、组件工厂、终端输入）之前使用 `ctx.mode === "tui"`。在 TUI 和 RPC 模式下工作的对话框和通知方法之前使用 `ctx.hasUI`。

## 示例参考

[examples/extensions/](../../../examples/extensions/) 中的所有示例。

|示例|描述 |关键 API |
|---------|-------------|----------|
| **工具** |||
| `hello.ts` |最少的工具注册 | `registerTool` |
| `question.ts` |与用户交互的工具| `registerTool`、`ui.select` |
| `questionnaire.ts` |多步骤向导工具| `registerTool`、`ui.custom` |
| `todo.ts` |具有持久性的有状态工具 | `registerTool`、`appendEntry`、`renderResult`、会话事件 |
| `dynamic-tools.ts` |启动后和命令期间注册工具 | `registerTool`、`session_start`、`registerCommand` |
| `structured-output.ts` |最终的结构化输出工具 `terminate: true` | `registerTool`，终止工具结果 |
| `truncated-tool.ts` |输出截断示例 | `registerTool`、`truncateHead` |
| `tool-override.ts` |覆盖内置读取工具 | `registerTool`（与内置同名）|
| **命令** |||
| `pirate.ts` |每回合修改系统提示 | `registerCommand`、`before_agent_start` |
| `summarize.ts` |对话摘要命令 | `registerCommand`、`ui.custom` |
| `handoff.ts` |跨提供商模型切换 | `registerCommand`、`ui.editor`、`ui.custom` |
| `qna.ts` |自定义 UI 的问答 | `registerCommand`、`ui.custom`、`setEditorText` |
| `send-user-message.ts` |注入用户消息 | `registerCommand`、`sendUserMessage` |
| `reload-runtime.ts` |重新加载命令和LLM工具交接| `registerCommand`、`ctx.reload()`、`sendUserMessage` |
| `shutdown-command.ts` |优雅关机命令 | `registerCommand`、`shutdown()` |
| **活动和大门** |||
| `permission-gate.ts` |阻止危险命令 | `on("tool_call")`、`ui.confirm` |
| `project-trust.ts` |决定或推迟来自用户/全局或 CLI 扩展的项目信任 | `on("project_trust")`，信任UI，需要信任结果 |
| `protected-paths.ts` |阻止写入特定路径 | `on("tool_call")` |
| `confirm-destructive.ts` |确认会话更改 | `on("session_before_switch")`、`on("session_before_fork")` |
| `dirty-repo-guard.ts` |警告肮脏的 git 仓库 | `on("session_before_*")`、`exec` |
| `input-transform.ts` |转换用户输入 | `on("input")` |
| `input-transform-streaming.ts` |流感知输入转换 | `on("input")`、`streamingBehavior` |
| `model-status.ts` |对模型变化做出反应 | `on("model_select")`、`setStatus` |
| `provider-payload.ts` |检查有效负载和提供商响应标头 | `on("before_provider_request")`、`on("after_provider_response")` |
| `system-prompt-header.ts` |显示系统提示信息 | `on("agent_start")`、`getSystemPrompt` |
| `claude-rules.ts` |从文件加载规则 | `on("session_start")`、`on("before_agent_start")` |
| `prompt-customizer.ts` |使用 `systemPromptOptions` 添加上下文感知工具指南 | `on("before_agent_start")`、`BuildSystemPromptOptions` |
| `file-trigger.ts` |文件观察器触发消息 | `sendMessage` |
| **压缩和会话** |||
| `custom-compaction.ts` |自定义压缩总结| `on("session_before_compact")` |
| `trigger-compact.ts` |手动触发压缩 | `compact()` |
| `git-checkpoint.ts` | Git 轮流存储 | `on("turn_start")`、`on("session_before_fork")`、`exec` |
| `git-merge-and-resolve.ts` |获取、合并和解决冲突 | `on("agent_end")`、`exec`、`sendUserMessage` |
| `auto-commit-on-exit.ts` |承诺关闭 | `on("session_shutdown")`、`exec` |
| **用户界面组件** |||
| `status-line.ts` |页脚状态指示器 | `setStatus`，会议事件|
| `working-indicator.ts` |自定义流媒体工作指示灯 | `setWorkingIndicator`、`registerCommand` |
| `github-issue-autocomplete.ts` |通过从 `gh issue list` 预加载最近未解决的问题，在内置自动完成之上添加 `#1234` 问题完成 | `addAutocompleteProvider`、`on("session_start")`、`exec` |
| `custom-footer.ts` |完全替换页脚 | `registerCommand`、`setFooter` |
| `custom-header.ts` |替换启动头 | `on("session_start")`、`setHeader` |
| `modal-editor.ts` | Vim 风格的模态编辑器 | `setEditorComponent`、`CustomEditor` |
| `rainbow-editor.ts` |自定义编辑器样式 | `setEditorComponent` |
| `widget-placement.ts` |编辑器上方/下方的小部件 | `setWidget` |
| `overlay-test.ts` |覆盖组件 | `ui.custom` 带覆盖选项 |
| `overlay-qa-tests.ts` |全面的覆盖测试| `ui.custom`，所有覆盖选项 |
| `notify.ts` |简单的通知 | `ui.notify` |
| `timed-confirm.ts` |超时对话框 | `ui.confirm` 带超时/信号 |
| `mac-system-theme.ts` |自动切换主题 | `setTheme`、`exec` |
| **复杂的扩展** |||
| `plan-mode/` |全计划模式实施 |所有事件类型、`registerCommand`、`registerShortcut`、`registerFlag`、`setStatus`、`setWidget`、`sendMessage`、`setActiveTools` |
| `preset.ts` |可保存的预设（模型、工具、思维）| `registerCommand`、`registerShortcut`、`registerFlag`、`setModel`、`setActiveTools`、`setThinkingLevel`、`appendEntry` |
| `tools.ts` |打开/关闭 UI 工具 | `registerCommand`、`setActiveTools`、`SettingsList`、会话事件 |
| **远程和沙箱** |||
| `ssh.ts` | SSH远程执行| `registerFlag`、`on("user_bash")`、`on("before_agent_start")`、刀具操作|
| `interactive-shell.ts` |持久 shell 会话 | `on("user_bash")` |
| `sandbox/` |沙盒工具执行 |工具操作|
| `gondolin/` |将内置工具和 `!` 命令路由到 Gondolin 微虚拟机 |刀具操作、内置刀具覆盖、`on("user_bash")` |
| `subagent/` |生成子代理 | `registerTool`、`exec` |
| **游戏** |||
| `snake.ts` |贪吃蛇游戏 | `registerCommand`、`ui.custom`、键盘处理|
| `space-invaders.ts` |太空侵略者游戏| `registerCommand`、`ui.custom` |
| `doom-overlay/` |厄运叠加| `ui.custom` 带覆盖 |
| **提供商** |||
| `custom-provider-anthropic/` |自定义 Anthropic 代理 | `registerProvider` |
| `custom-provider-gitlab-duo/` | GitLab Duo 集成 | `registerProvider` 与 OAuth |
| **消息与通信** |||
| `message-renderer.ts` |自定义消息渲染 | `registerMessageRenderer`、`sendMessage` |
| `entry-renderer.ts` |仅限 TUI 的自定义入口渲染 | `registerEntryRenderer`、`appendEntry` |
| `event-bus.ts` |延伸间活动 | `pi.events` |
| **会话元数据** |||
| `session-name.ts` |为选择器命名会话 | `setSessionName`、`getSessionName` |
| `bookmark.ts` | /tree | 的书签条目`setLabel` |
| **杂项** |||
| `inline-bash.ts` |工具调用中的内联 bash | `on("tool_call")` |
| `bash-spawn-hook.ts` |执行前调整bash命令、cwd和env | `createBashTool`、`spawnHook` |
| `with-deps/` |具有 npm 依赖项的扩展 |封装结构与`package.json` |
