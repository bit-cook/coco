# 子代理示例

将任务委派给拥有隔离上下文窗口的专用子代理。

## 功能

- **隔离上下文**：每个子代理在独立的 `pi` 进程中运行
- **流式输出**：实时查看工具调用和进度
- **并行流式输出**：所有并行任务同时流式发送更新
- **Markdown 渲染**：以正确格式渲染最终输出（展开视图）
- **用量跟踪**：显示每个代理的轮次、令牌、成本和上下文用量
- **中止支持**：Ctrl+C 会传播以终止子代理进程

## 结构

```
subagent/
├── README.md            # This file
├── index.ts             # The extension (entry point)
├── agents.ts            # Agent discovery logic
├── agents/              # Sample agent definitions
│   ├── scout.md         # Fast recon, returns compressed context
│   ├── planner.md       # Creates implementation plans
│   ├── reviewer.md      # Code review
│   └── worker.md        # General-purpose (full capabilities)
└── prompts/             # Workflow presets (prompt templates)
    ├── implement.md     # scout -> planner -> worker
    ├── scout-and-plan.md    # scout -> planner (no implementation)
    └── implement-and-review.md  # worker -> reviewer -> worker
```

## 安装

从仓库根目录为这些文件创建符号链接：

```bash
# Symlink the extension (must be in a subdirectory with index.ts)
mkdir -p ~/.pi/agent/extensions/subagent
ln -sf "$(pwd)/packages/coding-agent/examples/extensions/subagent/index.ts" ~/.pi/agent/extensions/subagent/index.ts
ln -sf "$(pwd)/packages/coding-agent/examples/extensions/subagent/agents.ts" ~/.pi/agent/extensions/subagent/agents.ts

# Symlink agents
mkdir -p ~/.pi/agent/agents
for f in packages/coding-agent/examples/extensions/subagent/agents/*.md; do
  ln -sf "$(pwd)/$f" ~/.pi/agent/agents/$(basename "$f")
done

# Symlink workflow prompts
mkdir -p ~/.pi/agent/prompts
for f in packages/coding-agent/examples/extensions/subagent/prompts/*.md; do
  ln -sf "$(pwd)/$f" ~/.pi/agent/prompts/$(basename "$f")
done
```

## 安全模型

此工具使用委派的系统提示词和工具/模型配置执行独立的 `pi` 子进程。

**项目本地代理**（`.pi/agents/*.md`）是由仓库控制的提示词，可指示模型读取文件、运行 bash 命令等。

**默认行为：**仅从 `~/.pi/agent/agents` 加载**用户级代理**。

要启用项目本地代理，请传递 `agentScope: "both"`（或 `"project"`）。仅对你信任的仓库执行此操作。

在交互运行时，工具会在运行项目本地代理前请求确认。设置 `confirmProjectAgents: false` 可禁用此行为。

## 用法

### 单个代理
```
Use scout to find all authentication code
```

### 并行执行
```
Run 2 scouts in parallel: one to find models, one to find providers
```

### 链式工作流
```
Use a chain: first have scout find the read tool, then have planner suggest improvements
```

### 工作流提示
```
/implement add Redis caching to the session store
/scout-and-plan refactor auth to support OAuth
/implement-and-review add input validation to API endpoints
```

## 工具模式

| 模式 | 参数 | 描述 |
|------|-----------|-------------|
| 单个 | `{ agent, task }` | 一个代理，一个任务 |
| 并行 | `{ tasks: [...] }` | 多个代理并发运行（最多 8 个，同时 4 个） |
| 链式 | `{ chain: [...] }` | 使用 `{previous}` 占位符顺序执行 |

## 输出显示

**折叠视图**（默认）：
- Status icon (✓/✗/⏳) 以及 agent name
- Last 5-10 items (tool calls 以及 text)
- 用法 stats: `3 turns ↑input ↓output RcacheRead WcacheWrite $cost ctx:contextTokens model`

**展开视图**（Ctrl+O）：
- Full task text
- 所有带格式化参数的工具调用
- Final output rendered as Markdown
- Per-task usage (用于 chain/parallel)

**并行模式流式输出：**
- Shows all tasks with live status (⏳ running, ✓ done, ✗ failed)
- Updates as each task makes progress
- Shows "2/3 done, 1 running" status
- Returns each completed task's final output to the parent model, capped at 50 KB per task
- 当子代理在产生输出前退出时，从 stderr/错误消息返回失败诊断

**工具调用格式**（模仿内置工具）：
- `$ comm以及` 用于 bash
- `read ~/path:1-10` 用于 read
- `grep /pattern/ in ~/path` 用于 grep
- etc.

## 代理定义

代理是包含 YAML 前置元数据的 Markdown 文件：

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: claude-haiku-4-5
---

System prompt for the agent goes here.
```

**位置：**
- `~/.pi/agent/agents/*.md`：用户级（始终加载）
- `.pi/agents/*.md`：项目级（仅在 `agentScope: "project"` 或 `"both"` 时加载）

当 `agentScope: "both"` 时，项目代理会覆盖同名用户代理。

## 示例代理

| Agent | Purpose | 模型 | 工具 |
|-------|---------|-------|-------|
| `scout` | Fast codebase recon | Haiku | read, grep, find, ls, bash |
| `planner` | Implementation plans | Sonnet | read, grep, find, ls |
| `reviewer` | Code review | Sonnet | read, grep, find, ls, bash |
| `worker` | General-purpose | Sonnet | (all default) |

## 工作流提示词

| Prompt | Flow |
|--------|------|
| `/implement <query>` | scout → planner → worker |
| `/scout-以及-plan <query>` | scout → planner |
| `/implement-以及-review <query>` | worker → reviewer → worker |

## 错误处理

- **退出代码 != 0**：工具返回包含 stderr/output 的错误
- **stopReason "error"**：传播带有错误消息的 LLM 错误
- **stopReason "aborted"**：用户中止（Ctrl+C）会终止子进程并抛出错误
- **链式模式**：在第一个失败步骤停止，并报告失败的步骤

## 限制

- 折叠视图中的输出截断为最后 10 项（展开可查看全部）
- 并行模式中模型可见的输出限制为每个任务 50 KB；完整结果保留在工具详情中
- 每次调用都会重新发现代理（允许在会话中途编辑）
- 并行模式限制为最多 8 个任务，同时 4 个
