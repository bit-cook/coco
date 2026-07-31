# 快速入门

本页将带你从安装开始，完成第一个有用的 pi 会话。

## 安装

Pi 以 npm 包形式发布：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 会在安装期间禁用依赖生命周期脚本。普通 npm 安装不需要安装脚本。

### 卸载

使用安装 pi 时所用的包管理器。curl 安装程序使用全局 npm，因此 curl 和 npm 安装都用 npm 删除：

```bash
# curl 安装程序或 npm install -g
npm uninstall -g @earendil-works/pi-coding-agent

# pnpm
pnpm remove -g @earendil-works/pi-coding-agent

# Yarn
yarn global remove @earendil-works/pi-coding-agent

# Bun
bun uninstall -g @earendil-works/pi-coding-agent
```

卸载 pi 后，设置、凭据、会话和已安装的 pi 包仍保留在 `~/.pi/agent/`。

然后在希望 pi 操作的项目目录中启动它：

```bash
cd /path/to/project
pi
```

## 认证

Pi 可以通过 `/login` 使用订阅提供商，也可以通过环境变量或认证文件使用 API 密钥提供商。

### 选项 1：订阅登录

启动 pi 并运行：

```text
/login
```

然后选择提供商。内置订阅登录包括 Claude Pro/Max、ChatGPT Plus/Pro (Codex) 和 GitHub Copilot。

### 选项 2：API 密钥

在启动 pi 前设置 API 密钥：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

也可以运行 `/login`，选择 API 密钥提供商，将密钥存储到 `~/.pi/agent/auth.json`。

所有支持的提供商、环境变量和云提供商设置请参阅 [提供商](providers.md)。

## 第一个会话

Pi 启动后，输入请求并按 Enter：

```text
总结此仓库，并告诉我如何运行检查。
```

默认情况下，pi 为模型提供四个工具：

- `read` - 读取文件
- `write` - 创建或覆盖文件
- `edit` - 修改文件
- `bash` - 运行 Shell 命令

其他内置只读工具（`grep`、`find`、`ls`）可通过工具选项使用。Pi 在当前工作目录中运行，并可以修改其中的文件。如果希望轻松回滚，请使用 git 或其他检查点工作流。

## 为 pi 提供项目指令

Pi 会在启动时加载上下文文件。在项目中添加 `AGENTS.md`，告诉它应如何工作：

```markdown
# 项目指令

- 代码更改后运行 `npm run check`。
- 不要在本地运行生产环境迁移。
- 保持回复简洁。
```

Pi 会加载：

- `~/.pi/agent/AGENTS.md`，全局指令
- 当前目录及其父目录中的 `AGENTS.md` 或 `CLAUDE.md`

修改上下文文件后，请重启 pi，或运行 `/reload`。

## 可以尝试的常用操作

### 参考文件

在编辑器中输入 `@` 模糊搜索文件，或在命令行中传入文件：

```bash
pi @README.md "Summarize this"
pi @src/app.ts @src/app.test.ts "Review these together"
```

可以使用 Ctrl+V（Windows 上为 Alt+V）粘贴图片或文本，也可以将图片拖入支持的终端。

### 运行 Shell 命令

在交互模式中：

```text
!npm run lint
```

命令输出会发送给模型。使用 `!!command` 可运行命令而不将其输出加入模型上下文。

### 切换模型

使用 `/model` 或 Ctrl+L 选择模型。使用 Shift+Tab 循环切换思考级别。使用 Ctrl+P / Shift+Ctrl+P 循环切换作用域模型。

### 稍后继续

会话会自动保存：

```bash
pi -c                  # 继续最近的会话
pi -r                  # 浏览以前的会话
pi --name "my task"    # 启动时设置会话显示名称
pi --session <path|id> # 打开指定会话
```

在 pi 内部，使用 `/resume`、`/new`、`/tree`、`/fork` 和 `/clone` 管理会话。

### 非交互模式

用于单次提示词：

```bash
pi -p "总结此代码库"
cat README.md | pi -p "总结这段文本"
pi -p @screenshot.png "这张图片中有什么？"
```

使用 `--mode json` 输出 JSON 事件，或使用 `--mode rpc` 集成进程。

## 后续步骤

- [使用 Pi](usage.md) - 交互模式、斜杠命令、会话、上下文文件和 CLI 参考。
- [提供商](providers.md) - 认证和模型设置。
- [设置](settings.md) - 全局和项目配置。
- [键绑定](keybindings.md) - 快捷键和自定义。
- [Pi 包](packages.md) - 安装共享扩展、技能、提示词和主题。

平台说明：[Windows](windows.md)、[Termux](termux.md)、[tmux](tmux.md)、[终端设置](terminal-setup.md)、[Shell 别名](shell-aliases.md)。
