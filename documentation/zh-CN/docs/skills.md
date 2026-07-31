> pi 可以创建技能。让它为你的用例构建一个。

# 技能

技能是代理按需加载的自包含能力包。技能为特定任务提供专门工作流、设置说明、辅助脚本和参考文档。

Pi 实现了 [Agent Skills 标准](https://agentskills.io/specification)，会警告大多数违规情况，但保持宽松。尽管标准不允许，Pi 允许技能名称不同于其父目录；该规则不适合由多个代理框架共享的技能目录。

## 目录

- [位置](#位置)
- [技能如何工作](#技能如何工作)
- [技能命令](#技能命令)
- [技能结构](#技能结构)
- [前置元数据](#前置元数据)
- [验证](#验证)
- [示例](#示例)
- [技能仓库](#技能仓库)

## 位置

> **安全性：** 技能可指示模型执行任何操作，也可能包含模型调用的可执行代码。使用前请审查技能内容。

Pi 从以下位置加载技能：

- 全局：
  - `~/.pi/agent/skills/`
  - `~/.agents/skills/`
- 项目（仅在项目受信任后）：
  - `.pi/skills/`
  - `cwd` 和祖先目录中的 `.agents/skills/`（最多到 git 仓库根目录；不在仓库中时最多到文件系统根目录）
- 包：`skills/` 目录或 `package.json` 中的 `pi.skills` 条目
- 设置：含文件或目录的 `skills` 数组
- CLI：`--skill <path>`（可重复，即使带有 `--no-skills` 也会追加）

发现规则：
- 在 `~/.pi/agent/skills/` 和 `.pi/skills/` 中，直接位于根目录的 `.md` 文件会被发现为单独技能
- 在所有技能位置中，包含 `SKILL.md` 的目录会被递归发现
- 在 `~/.agents/skills/` 和项目 `.agents/skills/` 中，根目录 `.md` 文件会被忽略

使用 `--no-skills` 禁用发现（显式 `--skill` 路径仍会加载）。

### 使用其他框架的技能

要使用 Claude Code 或 OpenAI Codex 的技能，请将其目录添加到设置：

```json
{
  "skills": [
    "~/.claude/skills",
    "~/.codex/skills"
  ]
}
```

对于项目级 Claude Code 技能，添加到 `.pi/settings.json`：

```json
{
  "skills": ["../.claude/skills"]
}
```

## 技能如何工作

1. 启动时，pi 扫描技能位置并提取名称和描述。
2. 系统提示词会依照[规范](https://agentskills.io/integrate-skills)以 XML 格式包含可用技能。
3. 当任务匹配时，代理使用 `read` 加载完整的 SKILL.md（模型并不总会这样做；使用提示词或 `/skill:name` 强制执行）。
4. 代理遵循指令，使用相对路径引用脚本和资源。

这是渐进式披露：始终只有描述在上下文中，完整指令按需加载。

## 技能命令

技能注册为 `/skill:name` 命令：

```bash
/skill:brave-search           # 加载并执行技能
/skill:pdf-tools extract      # 使用参数加载技能
```

命令后的参数会作为 `User: <args>` 追加到技能内容。

通过交互模式中的 `/settings` 或 `settings.json` 切换技能命令：

```json
{
  "enableSkillCommands": true
}
```

## 技能结构

技能是包含 `SKILL.md` 文件的目录。其他所有内容均可自由定义。

```
my-skill/
├── SKILL.md              # 必需：前置元数据 + 指令
├── scripts/              # 辅助脚本
│   └── process.sh
├── references/           # 按需加载的详细文档
│   └── api-reference.md
└── assets/
    └── template.json
```

### SKILL.md 格式

````markdown
---
name: my-skill
description: What this skill does and when to use it. Be specific.
---

# My Skill

## Setup

首次使用前运行一次：
```bash
cd /path/to/skill && npm install
```

## Usage

```bash
./scripts/process.sh <input>
```
````

使用相对于技能目录的路径：

```markdown
See [the reference guide](references/REFERENCE.md) for details.
```

## 前置元数据

根据 [Agent Skills 规范](https://agentskills.io/specification#frontmatter-required)：

| 字段 | 必需 | 说明 |
|-------|----------|-------------|
| `name` | 是 | 最多 64 个字符。小写 a-z、0-9、连字符。与标准不同，Pi 不要求它与父目录匹配，因为该标准要求不适合共享技能目录。 |
| `description` | 是 | 最多 1024 个字符。说明技能的功能和使用时机。 |
| `license` | 否 | 许可证名称或对随附文件的引用。 |
| `compatibility` | 否 | 最多 500 个字符。环境要求。 |
| `metadata` | 否 | 任意键值映射。 |
| `allowed-tools` | 否 | 预先批准工具的空格分隔列表（实验性）。 |
| `disable-model-invocation` | 否 | 为 `true` 时，技能会从系统提示词中隐藏。用户必须使用 `/skill:name`。 |

### 名称规则

- 1-64 个字符
- 仅限小写字母、数字和连字符
- 不能以连字符开头或结尾
- 不允许连续连字符

Pi 不要求名称与父目录匹配。Agent Skills 标准要求匹配，但该要求不适合多个工具使用的共享技能目录。

有效：`pdf-processing`、`data-analysis`、`code-review`
无效：`PDF-Processing`、`-pdf`、`pdf--processing`

### 描述最佳实践

描述决定代理何时加载技能。请具体说明。

良好：
```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents.
```

较差：
```yaml
description: Helps with PDFs.
```

## 验证

Pi 根据 Agent Skills 标准验证技能。大多数问题会产生警告，但仍加载技能：

- 名称超过 64 个字符或包含无效字符
- 名称以连字符开头/结尾或包含连续连字符
- 描述超过 1024 个字符

未知前置元数据字段会被忽略。

**例外：** 缺少 description 的技能不会加载。

名称冲突（来自不同位置的相同名称）会发出警告并保留最先找到的技能。

## 示例

```
brave-search/
├── SKILL.md
├── search.js
└── content.js
```

**SKILL.md：**
````markdown
---
name: brave-search
description: Web search and content extraction via Brave Search API. Use for searching documentation, facts, or any web content.
---

# Brave Search

## Setup

```bash
cd /path/to/brave-search && npm install
```

## Search

```bash
./search.js "query"              # Basic search
./search.js "query" --content    # Include page content
```

## Extract Page Content

```bash
./content.js https://example.com
```
````

## 技能仓库
- [Anthropic Skills](https://github.com/anthropics/skills) - 文档处理（docx、pdf、pptx、xlsx）、Web 开发
- [Pi Skills](https://github.com/badlogic/pi-skills) - Web 搜索、浏览器自动化、Google API、转录
