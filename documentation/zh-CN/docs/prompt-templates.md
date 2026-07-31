> pi 可以创建提示词模板。让它为你的工作流构建一个。

# 提示词模板

提示词模板是可展开为完整提示词的 Markdown 片段。在编辑器中输入 `/name` 以调用模板，其中 `name` 是不含 `.md` 的文件名。

## 位置

Pi 从以下位置加载提示词模板：

- 全局：`~/.pi/agent/prompts/*.md`
- 项目：`.pi/prompts/*.md`（仅在项目受信任后）
- 包：`prompts/` 目录或 `package.json` 中的 `pi.prompts` 条目
- 设置：含文件或目录的 `prompts` 数组
- CLI：`--prompt-template <path>`（可重复）

使用 `--no-prompt-templates` 禁用发现。

## 格式

```markdown
---
description: Review staged git changes
---
Review the staged changes (`git diff --cached`). Focus on:
- Bugs and logic errors
- Security issues
- Error handling gaps
```

- 文件名会成为命令名。`review.md` 会变成 `/review`。
- `description` 可选。缺少时使用第一个非空行。
- `argument-hint` 可选。设置后，提示会在自动补全下拉菜单中显示在描述之前。

### 参数提示

在前置元数据中使用 `argument-hint`，以在自动补全中显示预期参数。必需参数使用 `<尖括号>`，可选参数使用 `[方括号]`：

```markdown
---
description: Review PRs from URLs with structured issue and code analysis
argument-hint: "<PR-URL>"
---
```

它在自动补全下拉菜单中呈现为：

```
→ pr   <PR-URL>       — Review PRs from URLs with structured issue and code analysis
  is   <issue>        — Analyze GitHub issues (bugs or feature requests)
  wr   [instructions] — Finish the current task end-to-end
  cl   — Audit changelog entries before release
```

## 用法

在编辑器中输入 `/`，后接模板名。自动补全会显示可用模板及其描述。

```
/review                           # 展开 review.md
/component Button                 # 使用参数展开
/component Button "click handler" # 多个参数
```

## 参数

模板支持位置参数、默认值和简单切片：

- `$1`、`$2`、... 为位置参数
- `$@` 或 `$ARGUMENTS` 表示连接后的所有参数
- `${1:-default}` 在参数 1 存在且非空时使用它，否则使用 `default`
- `${@:-default}` 或 `${ARGUMENTS:-default}` 在所有参数存在且非空时使用它们，否则使用 `default`
- `${@:N}` 表示从第 N 个位置开始的参数（从 1 开始计数）
- `${@:N:L}` 表示从 N 开始的 L 个参数

示例：

```markdown
---
description: Create a component
---
Create a React component named $1 with features: $@
```

默认值适用于可选参数：

```markdown
Summarize the current state in ${1:-7} bullet points.
```

用法：`/component Button "onClick handler" "disabled support"`

## 加载规则

- `prompts/` 中的模板发现不会递归进行。
- 若要使用子目录中的模板，请通过 `prompts` 设置或包清单显式添加。
