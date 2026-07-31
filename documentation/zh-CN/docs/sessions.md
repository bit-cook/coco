# 会话

Pi 将对话保存为会话，因此你可以继续工作、从较早的轮次创建分支，并重新查看以前的路径。

## 会话存储

会话会按工作目录自动保存到 `~/.pi/agent/sessions/`。每个会话都是具有树结构的 JSONL 文件。

```bash
pi -c                  # 继续最近的会话
pi -r                  # 浏览并从过去的会话中选择
pi --no-session        # 临时模式；不保存
pi --name "my task"    # 在启动时设置会话显示名称
pi --session <path|id> # 使用特定会话文件或部分会话 ID
pi --fork <path|id>    # 将会话文件或部分会话 ID 分叉到新会话
```

在交互模式中使用 `/session` 查看当前会话文件、会话 ID、消息数、token 和费用。

有关 JSONL 文件格式和 SessionManager API，请参阅[会话文件格式](session-format.md)。

## 会话命令

| 命令 | 说明 |
|---------|-------------|
| `/resume` | 浏览并选择以前的会话 |
| `/new` | 开始新会话 |
| `/name <name>` | 设置当前会话显示名称 |
| `/session` | 显示会话信息 |
| `/tree` | 导航当前会话树 |
| `/fork` | 从以前的用户消息创建新会话 |
| `/clone` | 将当前活动分支复制到新会话 |
| `/compact [prompt]` | 总结较早的上下文；参阅[上下文压缩](compaction.md) |
| `/export [file]` | 将会话导出为 HTML |
| `/share` | 上传为私有 GitHub gist，并提供可分享的 HTML 链接 |

## 恢复和删除会话

`/resume` 会打开当前项目的交互式会话选择器。`pi -r` 在启动时打开相同的选择器。

在选择器中，你可以：

- 通过输入搜索
- 使用 Ctrl+P 切换路径显示
- 使用 Ctrl+S 切换排序模式
- 使用 Ctrl+N 筛选已命名会话
- 使用 Ctrl+R 重命名
- 使用 Ctrl+D 删除，然后确认

可用时，pi 使用 `trash` CLI 删除，而不是永久移除文件。

## 命名会话

使用 `/name <name>` 设置易读的会话名称：

```text
/name Refactor auth module
```

在启动时使用 `--name` 或 `-n` 设置名称：

```bash
pi --name "Refactor auth module"
pi --name "CI audit" -p "Review this build failure"
```

已命名会话更容易在 `/resume` 和 `pi -r` 中找到。

## 使用 `/tree` 创建分支

会话以树的形式存储。每个条目都有 `id` 和 `parentId`，当前位置是活动叶节点。`/tree` 让你跳转到以前的任意位置，并从那里继续而不创建新文件。

<p align="center"><img src="images/tree-view.png" alt="树视图" width="600"></p>

示例形状：

```text
├─ user: "Hello, can you help..."
│  └─ assistant: "Of course! I can..."
│     ├─ user: "Let's try approach A..."
│     │  └─ assistant: "For approach A..."
│     │     └─ user: "That worked..."  ← 活动
│     └─ user: "Actually, approach B..."
│        └─ assistant: "For approach B..."
```

### 树控件

| 按键 | 操作 |
|-----|--------|
| ↑/↓ | 导航可见条目 |
| ←/→ | 向上/下翻页 |
| Ctrl+←/Ctrl+→ 或 Alt+←/Alt+→ | 折叠/展开，或在分支段之间跳转 |
| Shift+L | 设置或清除选定条目的标签 |
| Shift+T | 切换标签时间戳 |
| Enter | 选择条目 |
| Escape/Ctrl+C | 取消 |
| Ctrl+O | 循环筛选模式 |

筛选模式为：默认、无工具、仅用户、仅已标记和全部。使用[设置](settings.md)中的 `treeFilterMode` 配置默认值。

### 选择行为

选择用户消息或自定义消息：

1. 将叶节点移至选定消息的父节点。
2. 将选定消息的文本放入编辑器。
3. 允许你编辑并重新提交，创建新分支。

选择助手、工具、上下文压缩或其他非用户条目：

1. 将叶节点移至该条目。
2. 保持编辑器为空。
3. 允许你从该点继续。

选择根用户消息会将叶节点重置为一个空对话，并将原始提示词放入编辑器。

## `/tree`、`/fork` 和 `/clone`

| 功能 | `/tree` | `/fork` | `/clone` |
|---------|---------|---------|----------|
| 输出 | 同一会话文件 | 新会话文件 | 新会话文件 |
| 视图 | 完整树 | 用户消息选择器 | 当前活动分支 |
| 典型用途 | 原地探索替代方案 | 从较早的提示词开始新会话 | 继续前复制当前工作 |
| 总结 | 可选分支总结 | 无 | 无 |

想将不同方案保留在一起时使用 `/tree`。想要独立会话文件时使用 `/fork` 或 `/clone`。

## 分支总结

当 `/tree` 从一个分支切换到另一个分支时，pi 可以总结被放弃的分支，并将该总结附加在新位置。这会保留你离开的路径中的重要上下文，而无需重放整个分支。

出现提示时，选择以下之一：

1. 不总结
2. 使用默认提示词总结
3. 使用自定义聚焦指令总结

有关分支总结内部机制和扩展钩子，请参阅[上下文压缩](compaction.md)。

## 会话格式

会话文件为 JSONL，包含消息条目、模型变更、思考级别变更、标签、上下文压缩、分支总结和扩展条目。

有关解析器、扩展、SDK 用法和完整的 SessionManager API，请参阅[会话文件格式](session-format.md)。
