# CoCo 文档

- [任务、Agent 与控制后台](tasks.md) - 后台任务、活跃 Agent、工作树、触发器、MCP、控制后台、远程控制和 VS Code。

## CoCo 操作文档

CoCo Agent 是 Pi 的下游发行版。[CoCo CLI](coco-cli.md) 和 [CoCo 安全](coco-security.md) 说明 CoCo 的行为；如与下方继承的 Pi 页面冲突，以它们为准。其余页面是继承的 Pi 参考资料，其中可能包含 CoCo 已更改或禁用的命令、提供商、路径、项目资源或更新行为。

Pi 是一个精简的终端编码框架。它的核心保持小巧，并通过 TypeScript 扩展、技能、提示词模板、主题和 pi 包进行扩展。

## 快速开始

使用 npm 安装 Pi：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 会在安装期间禁用依赖生命周期脚本。普通 npm 安装不需要安装脚本。

在 Linux 或 macOS 上，也可以使用安装程序：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

要卸载 pi 本身，curl 和 npm 安装都使用 npm：

```bash
npm uninstall -g @earendil-works/pi-coding-agent
```

对于 pnpm、Yarn 或 Bun 安装，请使用对应的全局删除命令：`pnpm remove -g @earendil-works/pi-coding-agent`、`yarn global remove @earendil-works/pi-coding-agent` 或 `bun uninstall -g @earendil-works/pi-coding-agent`。

然后在项目目录中运行：

```bash
pi
```

订阅提供商使用 `/login` 完成认证，或者在启动 pi 前设置 API 密钥，例如 `ANTHROPIC_API_KEY`。

完整的首次运行流程请参阅 [快速入门](quickstart.md)。

## 从这里开始

- [快速入门](quickstart.md) - 安装、认证并运行第一个会话。
- [使用 Pi](usage.md) - 交互模式、斜杠命令、上下文文件和 CLI 参考。
- [提供商](providers.md) - 内置提供商的订阅和 API 密钥设置。
- [llama.cpp](llama-cpp.md) - 运行本地路由器并使用 `/llama` 管理模型。
- [安全](security.md) - 项目信任、沙箱边界和漏洞报告。
- [容器化](containerization.md) - 使用 Gondolin、Docker 或 OpenShell 为 pi 提供沙箱。
- [设置](settings.md) - 全局和项目设置。
- [键绑定](keybindings.md) - 默认快捷键和自定义键绑定。
- [会话](sessions.md) - 会话管理、分支和树导航。
- [压缩](compaction.md) - 上下文压缩和分支摘要。

## 自定义

- [扩展](extensions.md) - 用于工具、命令、事件和自定义 UI 的 TypeScript 模块。
- [技能](skills.md) - 可复用的按需 Agent Skills。
- [提示词模板](prompt-templates.md) - 从斜杠命令展开的可复用提示词。
- [主题](themes.md) - 内置和自定义终端主题。
- [Pi 包](packages.md) - 打包和共享扩展、技能、提示词和主题。
- [自定义模型](models.md) - 为支持的提供商 API 添加模型条目。
- [自定义提供商](custom-provider.md) - 实现自定义 API 和 OAuth 流程。

## 编程方式使用

- [SDK](sdk.md) - 将 pi 嵌入 Node.js 应用。
- [RPC 模式](rpc.md) - 通过 stdin/stdout JSONL 集成。
- [JSON 事件流模式](json.md) - 使用结构化事件的打印模式。
- [TUI 组件](tui.md) - 为扩展构建自定义终端 UI。

## 参考

- [环境变量](environment-variables.md) - Pi 进程配置以及 bash 工具可用的会话元数据。
- [会话格式](session-format.md) - JSONL 会话文件格式、条目类型和 SessionManager API。

## 平台设置

- [Windows](windows.md)
- [Android 上的 Termux](termux.md)
- [tmux](tmux.md)
- [终端设置](terminal-setup.md)
- [Shell 别名](shell-aliases.md)

## 开发

- [开发](development.md) - 本地设置、项目结构和调试。
