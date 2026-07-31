# 上下文压缩与分支总结

LLM 的上下文窗口有限。对话变得过长时，pi 使用上下文压缩总结较早的内容，同时保留最近的工作。本页涵盖自动上下文压缩和分支总结。

**源文件**（[pi-mono](https://github.com/earendil-works/pi-mono)）：
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) - 自动上下文压缩逻辑
- [`packages/coding-agent/src/core/compaction/branch-summarization.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) - 分支总结
- [`packages/coding-agent/src/core/compaction/utils.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) - 共享工具（文件跟踪、序列化）
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - 条目类型（`CompactionEntry`、`BranchSummaryEntry`）
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) - 扩展事件类型

如需项目中的 TypeScript 定义，请查看 `node_modules/@earendil-works/pi-coding-agent/dist/`。

## 概览

Pi 有两种总结机制：

| 机制 | 触发条件 | 用途 |
|-----------|---------|---------|
| 上下文压缩 | 上下文超过阈值，或 `/compact` | 总结旧消息以释放上下文 |
| 分支总结 | `/tree` 导航 | 切换分支时保留上下文 |

两者使用相同的结构化总结格式，并累积跟踪文件操作。上下文压缩和分支总结请求使用新的路由会话 ID；在提供商支持时，会禁用提示词缓存写入，因为这些一次性提示词不太可能被重用。

## 上下文压缩

### 何时触发

自动上下文压缩在以下条件满足时触发：

```
contextTokens > contextWindow - reserveTokens
```

默认情况下，`reserveTokens` 为 16384 个 token（可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置）。这会为 LLM 的响应预留空间。

你也可以使用 `/compact [instructions]` 手动触发，其中可选指令用于聚焦总结内容。

### 工作方式

1. **查找截断点**：从最新消息向后遍历，累积 token 估算值，直到达到 `keepRecentTokens`（默认为 20k，可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置）
2. **提取消息**：从上一个保留边界（或会话开始）收集至截断点的消息
3. **生成总结**：调用 LLM 以结构化格式生成总结；若存在上一个总结，则将其作为迭代上下文传入
4. **追加条目**：保存包含总结和 `firstKeptEntryId` 的 `CompactionEntry`
5. **重新加载**：会话重新加载，使用总结加上从 `firstKeptEntryId` 开始的消息

```
上下文压缩前：

  条目：  0     1     2     3      4     5     6      7      8     9
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┘
                └────────┬───────┘ └──────────────┬──────────────┘
               要总结的消息                 保留的消息
                                   ↑
                          firstKeptEntryId（条目 4）

上下文压缩后（追加新条目）：

  条目：  0     1     2     3      4     5     6      7      8     9     10
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│ cmp │
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┴─────┘
               └──────────┬──────┘ └──────────────────────┬───────────────────┘
                 不发送给 LLM                         发送给 LLM
                                                         ↑
                                              从 firstKeptEntryId 开始

LLM 看到的内容：

  ┌────────┬─────────┬─────┬─────┬──────┬──────┬─────┬──────┐
  │ system │ summary │ usr │ ass │ tool │ tool │ ass │ tool │
  └────────┴─────────┴─────┴─────┴──────┴──────┴─────┴──────┘
       ↑         ↑      └─────────────────┬────────────────┘
    提示词   来自 cmp       来自 firstKeptEntryId 的消息
```

重复进行上下文压缩时，已总结范围从上一次上下文压缩的保留边界（`firstKeptEntryId`）开始，而不是从压缩条目本身开始；若无法在路径中找到该保留条目，则回退到上一次压缩之后的条目。这会让上一次上下文压缩中存活的消息也包含在下一次总结中。Pi 还会在写入新的 `CompactionEntry` 前，根据重建的会话上下文重新计算 `tokensBefore`，因此 token 计数反映的是实际将被替换的压缩前上下文。

### 拆分轮次

一个“轮次”从用户消息开始，包含所有助手响应和工具调用，直到下一条用户消息。通常，上下文压缩在轮次边界截断。

当单个轮次超过 `keepRecentTokens` 时，截断点会落在轮次中间的一条助手消息处。这称为“拆分轮次”：

```
拆分轮次（一个巨大的轮次超过预算）：

  条目：  0     1     2      3     4      5      6     7      8
        ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                ↑                                     ↑
         turnStartIndex = 1                  firstKeptEntryId = 7
                │                                     │
                └──── turnPrefixMessages（1-6）──────┘
                                                      └── 保留（7-8）

  isSplitTurn = true
  messagesToSummarize = []  （前面没有完整轮次）
  turnPrefixMessages = [usr, ass, tool, ass, tool, tool]
```

对于拆分轮次，pi 会生成两份总结并合并：
1. **历史总结**：之前的上下文（如有）
2. **轮次前缀总结**：拆分轮次的早期部分

### 截断点规则

有效的截断点为：
- 用户消息
- 助手消息
- BashExecution 消息
- 自定义消息（custom_message、branch_summary）

绝不在工具结果处截断（它们必须与工具调用保留在一起）。

### CompactionEntry 结构

定义于 [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts)：

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  usage?: Usage;       // 生成总结的 LLM 用量
  fromHook?: boolean;  // 若由扩展提供则为 true（旧字段名称）
  details?: T;         // 实现特定的数据
}

// 默认上下文压缩将此结构用作 details（来自 compaction.ts）：
interface CompactionDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

扩展可以在 `details` 中存储任何可 JSON 序列化的数据。默认上下文压缩会跟踪文件操作，但自定义扩展实现可以使用自己的结构。生成的总结和扩展提供的总结会在可用时存储其 LLM `usage`，以便会话总计包含总结工作。

实现请参阅 [`prepareCompaction()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) 和 [`compact()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts)。若要直接以编程方式进行总结，`generateSummary()` 返回总结文本，`generateSummaryWithUsage()` 返回 `{ text, usage }`。

## 分支总结

### 何时触发

当你使用 `/tree` 导航到其他分支时，pi 会提议总结你即将离开的工作。这会将左侧分支的上下文注入新分支。

### 工作方式

1. **查找共同祖先**：旧位置和新位置共享的最深节点
2. **收集条目**：从旧叶节点回溯至共同祖先
3. **按预算准备**：在 token 预算内包含消息（最新优先）
4. **生成总结**：调用 LLM 以结构化格式生成总结
5. **追加条目**：在导航点保存 `BranchSummaryEntry`

```
导航前的树：

         ┌─ B ─ C ─ D（旧叶节点，即将放弃）
    A ───┤
         └─ E ─ F（目标）

共同祖先：A
要总结的条目：B、C、D

带总结导航后：

         ┌─ B ─ C ─ D ─ [B、C、D 的总结]
    A ───┤
         └─ E ─ F（新叶节点）
```

### 累积文件跟踪

上下文压缩和分支总结都会累积跟踪文件。生成总结时，pi 从以下位置提取文件操作：
- 被总结消息中的工具调用
- 之前上下文压缩或分支总结的 `details`（如有）

这意味着文件跟踪会跨多次上下文压缩或嵌套分支总结累积，从而保留已读取和已修改文件的完整历史。

### BranchSummaryEntry 结构

定义于 [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts)：

```typescript
interface BranchSummaryEntry<T = unknown> {
  type: "branch_summary";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  fromId: string;      // 我们从其导航而来的条目
  usage?: Usage;       // 生成总结的 LLM 用量
  fromHook?: boolean;  // 若由扩展提供则为 true（旧字段名称）
  details?: T;         // 实现特定的数据
}

// 默认分支总结将此结构用作 details（来自 branch-summarization.ts）：
interface BranchSummaryDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

和上下文压缩一样，扩展可以在 `details` 中存储自定义数据。

实现请参阅 [`collectEntriesForBranchSummary()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts)、[`prepareBranchEntries()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) 和 [`generateBranchSummary()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts)。

## 总结格式

上下文压缩和分支总结使用相同的结构化格式：

```markdown
## Goal
[用户尝试完成的目标]

## Constraints & Preferences
- [用户提到的要求]

## Progress
### Done
- [x] [已完成的任务]

### In Progress
- [ ] [当前工作]

### Blocked
- [问题，如有]

## Key Decisions
- **[决策]**: [理由]

## Next Steps
1. [接下来应发生的事]

## Critical Context
- [继续工作所需的数据]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

### 消息序列化

总结前，消息通过 [`serializeConversation()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) 序列化为文本：

```
[User]: 用户所说的内容
[Assistant thinking]: 内部推理
[Assistant]: 响应文本
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: 工具的输出
```

这可防止模型将其视为应继续的对话。

工具结果在序列化期间会截断为 2000 个字符。超出该限制的内容会替换为一个标记，指明被截断的字符数。这使总结请求保持在合理的 token 预算内，因为工具结果（尤其是 `read` 和 `bash` 的结果）通常是上下文大小的最大贡献者。

## 通过扩展自定义总结

扩展可以拦截并自定义上下文压缩和分支总结。事件类型定义请参阅 [`extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts)。

### session_before_compact

在自动上下文压缩或 `/compact` 前触发。可以取消或提供自定义总结。请参阅类型文件中的 `SessionBeforeCompactEvent` 和 `CompactionPreparation`。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, reason, willRetry, signal } = event;

  // preparation.messagesToSummarize - 要总结的消息
  // preparation.turnPrefixMessages - 拆分轮次前缀（若 isSplitTurn）
  // preparation.previousSummary - 上一次上下文压缩总结
  // preparation.fileOps - 提取出的文件操作
  // preparation.tokensBefore - 上下文压缩前的上下文 token
  // preparation.firstKeptEntryId - 保留消息的起点
  // preparation.settings - 上下文压缩设置

  // branchEntries - 当前分支上的所有条目（供自定义状态使用）
  // reason - "manual"（/compact）、"threshold" 或 "overflow"
  // willRetry - 中止的轮次是否在上下文压缩后重试（溢出恢复）
  // signal - AbortSignal（传给 LLM 调用）

  // 取消：
  return { cancel: true };

  // 自定义总结：
  return {
    compaction: {
      summary: "你的总结...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      // usage: summaryResponse.usage, // 可选；包含在会话总计中
      details: { /* 自定义数据 */ },
    }
  };
});
```

#### 将消息转换为文本

要使用自己的模型生成总结，请使用 `serializeConversation` 将消息转换为文本：

```typescript
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  
  // 将 AgentMessage[] 转换为 Message[]，再序列化为文本
  const conversationText = serializeConversation(
    convertToLlm(preparation.messagesToSummarize)
  );
  // 返回：
  // [User]: 消息文本
  // [Assistant thinking]: 思考内容
  // [Assistant]: 响应文本
  // [Assistant tool calls]: read(path="..."); bash(command="...")
  // [Tool result]: 输出文本

  // 现在将其发送给你的模型进行总结
  const { summary, usage } = await myModel.summarize(conversationText);
  
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      usage,
    }
  };
});
```

如需使用不同模型的完整示例，请参阅 [custom-compaction.ts](../../../examples/extensions/custom-compaction.ts)。

### session_before_tree

在 `/tree` 导航前触发。无论用户是否选择总结都会触发。可以取消导航或提供自定义总结。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;

  // preparation.targetId - 正在导航到的位置
  // preparation.oldLeafId - 当前位置（即将放弃）
  // preparation.commonAncestorId - 共享祖先
  // preparation.entriesToSummarize - 将被总结的条目
  // preparation.userWantsSummary - 用户是否选择总结

  // 完全取消导航：
  return { cancel: true };

  // 提供自定义总结（仅在 userWantsSummary 为 true 时使用）：
  if (preparation.userWantsSummary) {
    return {
      summary: {
        summary: "你的总结...",
        // usage: summaryResponse.usage, // 可选；包含在会话总计中
        details: { /* 自定义数据 */ },
      }
    };
  }
});
```

请参阅类型文件中的 `SessionBeforeTreeEvent` 和 `TreePreparation`。

## 设置

在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置上下文压缩：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

| 设置 | 默认值 | 说明 |
|---------|---------|-------------|
| `enabled` | `true` | 启用自动上下文压缩 |
| `reserveTokens` | `16384` | 为 LLM 响应预留的 token |
| `keepRecentTokens` | `20000` | 要保留（不总结）的最近 token |

使用 `"enabled": false` 禁用自动上下文压缩。你仍可使用 `/compact` 手动压缩。
