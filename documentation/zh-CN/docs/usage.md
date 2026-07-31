# 使用圆周率

此页面收集不适合快速入门页面的日常使用详细信息。

## 互动模式

<palign="center"><img src="images/interactive-mode.png" alt="交互模式" width="600"></p>

该界面有四个主要区域：

- **启动标题** - 快捷方式、加载的上下文文件、提示模板、技能和扩展
- **消息** - 用户消息、助手响应、工具调用、工具结果、通知、错误和扩展 UI
- **编辑器** - 您输入的位置；边框颜色表示当前思维水平
- **页脚** - 工作目录、会话名称、令牌/缓存使用情况、成本、上下文使用情况和当前模型。总计包括助理响应、工具报告的使用情况以及摘要生成。

编辑器可以暂时替换为内置 UI（如 `/settings`）或自定义扩展 UI。

### 编辑器功能

|特征|如何|
|---------|-----|
|文件参考|输入 `@` 模糊搜索项目文件|
|路径补全|按 T​​ab 键完成路径|
|多行输入|Shift+Enter，或 Windows 终端上的 Ctrl+Enter|
|复制回复|Ctrl+X 复制最后一条助手消息；在`/tree`中，它复制所选消息|
|图片|在 Windows 上使用 Ctrl+V、Alt+V 粘贴，或拖到终端中|
|外壳命令|`!command` 运行并将输出发送到模型|
|隐藏的 shell 命令|`!!command` 运行而不将输出发送到模型|
|外部编辑|Ctrl+G 在 Windows 上打开 `externalEditor`、`$VISUAL`、`$EDITOR`、记事本，或在其他地方打开 `nano`|

有关所有快捷键和自定义，请参阅 [Keybindings](keybindings.md)。

## 斜线命令

在编辑器中输入 `/` 打开命令补全。扩展可以注册自定义命令，技能可通过`/skill:name`使用，提示模板可通过`/templatename`扩展。

|命令|描述|
|---------|-------------|
|`/login`, `/logout`|管理 OAuth 或 API 密钥凭据|
|[`/llama`](llama-cpp.md)|下载、加载和卸载 llama.cpp 路由器模型|
|`/model`|切换型号|
|`/scoped-models`|启用/禁用 Ctrl+P 循环模型|
|`/settings`|思维层次、主题、信息传递、传输|
|`/resume`|从之前的会话中选择|
|`/new`|开始新会话|
|`/name <name>`|设置会话显示名称|
|`/session`|显示会话文件、ID、消息、令牌和成本|
|`/tree`|跳转到会话中的任意一点并从那里继续|
|`/trust`|保存项目信任决策以供未来会议使用|
|`/fork`|根据先前的用户消息创建新会话|
|`/clone`|将当前活动分支复制到新会话中|
|`/compact [prompt]`|手动压缩上下文，可选择使用自定义指令|
|`/copy`|将最后一条助理消息复制到剪贴板|
|`/export [file]`|将会话导出为 HTML 或 JSONL|
|`/import <file>`|从 JSONL 文件导入并恢复会话|
|`/share`|上传为带有可共享 HTML 链接的私有 GitHub gist|
|`/reload`|重新加载键绑定、扩展、技能、提示、主题和上下文文件|
|`/hotkeys`|显示所有键盘快捷键|
|`/changelog`|显示版本历史记录|
|`/quit`|退出圆周率|

## 消息队列

您可以在代理仍在工作时提交消息：

- **Enter** 将转向消息排队，在当前助手轮完成执行其工具调用后传递。
- **Alt+Enter** 将后续消息排队，在代理完成所有工作后发送。
- **Escape** 中止排队消息并将其恢复到编辑器。
- **Alt+Up** 将排队的消息检索回编辑器。

在 Windows 终端上，Alt+Enter 默认为全屏。如果您希望 pi 接收快捷方式，请按照[终端设置](terminal-setup.md)中的说明重新映射它。

在[设置](settings.md)中使用`steeringMode`和`followUpMode`配置交付。

## 会议

会话自动保存到`~/.pi/agent/sessions/`，按工作目录组织。

```bash
pi -c                  # Continue most recent session
pi -r                  # Browse and select a session
pi --no-session        # Ephemeral mode; do not save
pi --name "my task"    # Set session display name at startup
pi --session <path|id> # Use a specific session file or session ID
pi --fork <path|id>    # Fork a session into a new session file
```

有用的会话命令：

- `/session` 显示当前会话文件和 ID。
- `/tree` 导航文件内会话树并可以总结废弃的分支。
- `/fork` 根据较早的用户消息创建新会话。
- `/clone` 将当前活动分支复制到新的会话文件中。
- `/compact` 将旧消息总结为自由上下文。

详细信息请参见[Sessions](sessions.md)和[Compaction](compaction.md)。

## 上下文文件

Pi 在启动时从以下位置加载 `AGENTS.md` 或 `CLAUDE.md`：

- `~/.pi/agent/AGENTS.md` 全局指令
- 父目录，从当前工作目录向上走
- 当前目录

使用项目约定、命令、安全规则和首选项的上下文文件。使用 `--no-context-files` 或 `-nc` 禁用加载。

### 系统提示文件

将默认的系统提示替换为：

- `.pi/SYSTEM.md` 项目
- `~/.pi/agent/SYSTEM.md` 全球

附加到默认提示，而不在任一位置将其替换为 `APPEND_SYSTEM.md`。

### 项目信托

在交互式启动时，pi 在信任包含项目本地设置、资源或项目 `.agents/skills` 的项目文件夹之前会询问，并且在 `~/.pi/agent/trust.json` 中没有保存该文件夹或父文件夹的决定。信任项目允许 pi 加载 `.pi/settings.json` 和 `.pi` 资源、安装缺少的项目包以及执行项目扩展。

在做出信任决定之前，pi 仅加载上下文文件、用户/全局扩展和 CLI `-e` 扩展，以便它们可以处理 `project_trust` 事件。仅在项目受信任后才会加载项目本地扩展、项目包管理的扩展和项目设置。当从当前进程中尚未解析信任的不同 cwd 切换到会话时，此分割也适用。

非交互模式（`-p`、`--mode json`和`--mode rpc`）不显示信任提示。如果没有适用的已保存信任决策，他们将使用全局设置中的`defaultProjectTrust`：`ask`（默认）和`never`忽略这些项目资源，而`always`信任它们。通过 `--approve`/`-a` 或 `--no-approve`/`-na` 覆盖一次运行的项目信任。

如果没有适用扩展或保存的决定，则`defaultProjectTrust`控制后备行为。将`~/.pi/agent/settings.json`中的`"ask"`、`"always"`或`"never"`设置为`"ask"`、`"always"`或`"never"`，或用`/settings`更改。

`pi config` 和包命令使用相同的项目信任流程，但 `pi update` 从不提示。传递 `--approve` 信任一个命令的项目本地设置，或传递 `--no-approve` 忽略它们。

在交互模式下使用 `/trust` 保存项目信任决策以供将来的会话使用，包括对直接父文件夹的信任。只写`~/.pi/agent/trust.json`；当前会话不会重新加载，因此请重新启动 pi 以使更改生效。


## 导出和共享会话

使用 `/export [file]` 将会话写入 HTML。

使用 `/share` 上传带有可共享 HTML 链接的私有 GitHub 要点。

如果您使用 pi 进行开源工作，并希望发布模型、提示、工具和评估研究的会话，请参阅 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)。它将会话发布到 Hugging Face 数据集。

## CLI 参考

```bash
pi [options] [@files...] [messages...]
```

### 包命令

```bash
pi install <source> [-l]     # Install package, -l for project-local
pi remove <source> [-l]      # Remove package
pi uninstall <source> [-l]   # Alias for remove
pi update [source|self|pi]   # Update pi only, or one package source
pi update --all              # Update pi and packages; reconcile pinned git refs
pi update --extensions       # Update packages only; reconcile pinned git refs
pi update --models           # Refresh model catalogs only
pi update --self             # Update pi only
pi update --extension <src>  # Update one package
pi list                      # List installed packages
pi config                    # Enable/disable package resources
```

这些命令管理 pi 包，`pi update` 可以更新 pi CLI 安装。要卸载 pi 本身，请参阅[快速入门](quickstart.md#uninstall)。 `pi config` 和项目包命令接受 `--approve`/`--no-approve` 以信任或忽略一个命令的项目本地设置。 `pi update` 从不提示项目信任。

有关包来源和安全说明，请参阅 [Pi Packages](packages.md)。

### 模式

|旗帜|描述|
|------|-------------|
|默认|交互模式|
|`-p`, `--print`|打印响应并退出|
|`--mode json`|将所有事件输出为 JSON 行；参见[JSON模式](json.md)|
|`--mode rpc`|通过 stdin/stdout 的 RPC 模式；参见[RPC模式](rpc.md)|
|`--export <in> [out]`|将会话导出为 HTML|

在打印模式下，pi 还读取管道标准输入并将其合并到初始提示中：

```bash
cat README.md | pi -p "Summarize this text"
```

### 型号选项

|选项|描述|
|--------|-------------|
|`--provider <name>`|提供商，例如 `anthropic`、`openai` 或 `google`|
|`--model <pattern>`|型号图案或 ID；支持`provider/id`和可选的`:<thinking>`|
|`--api-key <key>`|API 密钥，覆盖环境变量|
|`--thinking <level>`|`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`|
|`--models <patterns>`|用于 Ctrl+P 循环的逗号分隔模式|
|`--list-models [search]`|列出可用型号|

### 会话选项

|选项|描述|
|--------|-------------|
|`-c`, `--continue`|继续最近的会话|
|`-r`, `--resume`|浏览并选择一个会话|
|`--会话<路径\|id>`|使用特定的会话文件或部分UUID|
|`--fork <路径\|id>`|将会话文件或部分 UUID 分叉到新会话中|
|`--session-dir <dir>`|自定义会话存储目录|
|`--no-session`|短暂模式；不保存|
|`--name <name>`, `-n <name>`|设置启动时的会话显示名称|

### 工具选项

|选项|描述|
|--------|-------------|
|`--tools <list>`, `-t <list>`|将特定内置、扩展和自定义工具列入白名单|
|`--exclude-tools <list>`, `-xt <list>`|禁用特定的内置、扩展和自定义工具|
|`--no-builtin-tools`, `-nbt`|禁用内置工具但保持扩展/自定义工具启用|
|`--no-tools`, `-nt`|禁用所有工具|

内置工具：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`。

### 资源选项

|选项|描述|
|--------|-------------|
|`-e`, `--extension <source>`|从路径、npm 或 git 加载扩展；可重复的|
|`--no-extensions`|禁用扩展发现|
|`--skill <path>`|加载技能；可重复的|
|`--no-skills`|禁用技能发现|
|`--prompt-template <path>`|加载提示模板；可重复的|
|`--no-prompt-templates`|禁用提示模板发现|
|`--theme <path>`|加载主题；可重复的|
|`--no-themes`|禁用主题发现|
|`--no-context-files`, `-nc`|禁用 `AGENTS.md` 和 `CLAUDE.md` 发现|

将 `--no-*` 与显式标志结合起来即可准确加载您需要的内容，忽略设置。例子：

```bash
pi --no-extensions -e ./my-extension.ts
```

### 其他选项

|选项|描述|
|--------|-------------|
|`--system-prompt <text>`|替换默认提示；上下文文件和技能仍然附加|
|`--append-system-prompt <text>`|附加到系统提示符|
|`--verbose`|强制详细启动|
|`-a`, `--approve`|信任本次运行的项目本地文件|
|`-na`, `--no-approve`|忽略本次运行的项目本地文件|
|`-h`, `--help`|显示帮助|
|`-v`, `--version`|显示版本|

### 文件参数

使用 `@` 作为文件前缀，将其包含在消息中：

```bash
pi @prompt.md "Answer this"
pi -p @screenshot.png "What's in this image?"
pi @code.ts @test.ts "Review these files"
```

### 示例

```bash
# Interactive with initial prompt
pi "List all .ts files in src/"

# Non-interactive
pi -p "Summarize this codebase"

# Non-interactive with piped stdin
cat README.md | pi -p "Summarize this text"

# Named one-shot session
pi --name "release audit" -p "Audit this repository"

# Different model
pi --provider openai --model gpt-4o "Help me refactor"

# Model with provider prefix
pi --model openai/gpt-4o "Help me refactor"

# Model with thinking level shorthand
pi --model sonnet:high "Solve this complex problem"

# Limit model cycling
pi --models "claude-*,gpt-4o"

# Read-only mode
pi --tools read,grep,find,ls -p "Review the code"

# Disable one extension or built-in tool while keeping the rest available
pi --exclude-tools ask_question
```

## 设计原则

Pi 保持核心较小，并将特定于工作流的行为推送到扩展、技能、提示模板和包中。

它故意不包括内置 MCP、子代理、权限弹出窗口、计划模式、待办事项或后台 bash。您可以将这些工作流程构建或安装为扩展或包，或者使用容器和 tmux 等外部工具。

要了解完整的原理，请阅读[博客文章](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)。
