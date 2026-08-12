# CoCo Agent

CoCo Agent 是通用 AI 助手，具备强大的编码和终端能力。它作为 [Pi Coding Agent](https://github.com/earendil-works/pi) 的下游发行版构建，并将 `agnes/agnes-2.5-flash` 和最高思考级别 `max` 设为默认配置。CoCo 源码不包含提供商凭据。

[English](https://github.com/bit-cook/coco/blob/main/README.md) | [简体中文](README.md) | [文档](../README.md)

## 安装

要求：Node.js `>=22.19.0`；发布版安装程序支持 macOS 和 Linux。

通过稳定的 Pages 启动器安装最新稳定版本：

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

或者安装经过明确审阅的固定版本：

```bash
curl -fsSLO https://github.com/bit-cook/coco/releases/download/v0.3.8/install.sh
COCO_VERSION=0.3.8 bash install.sh
```

安装程序会根据已发布的 SHA-256 值验证固定标签发行包和公开 Agnes 凭据，安全解压 CoCo，并在更新或重新安装时保留现有的 `~/.coco/agent` 配置。

全新安装可立即使用 Agnes max，并显示 Agnes、IDEPub、StepFun、Achai 和 DeepSeek 模型，包括 `deepseek-v4-flash` 与 `deepseek-v4-pro`。Achai 凭据来自 `ACHAI_API_KEY` 或现有的 OpenCode secret；CoCo 不捆绑 Achai 密钥。设置 `AGNES_API_KEY` 可覆盖默认 Agnes 凭据；在全新安装时设置 `DEEPSEEK_API_KEY` 可导入 DeepSeek 凭据，也可以在安装后配置其他提供商。

升级时再次运行稳定安装程序命令。不要使用 `coco update`；CoCo 有意不提供该命令。

## 快速开始

安装后运行 CoCo：

```bash
coco
coco -p "hello"
coco --list-models
```

## 文档

- 用户手册：[简体中文](docs/manual.md) | [English](../en/docs/manual.md)
- 操作参考：[CoCo CLI](docs/coco-cli.md) | [CoCo 安全](docs/coco-security.md)
- 语言包：[中文说明](docs/manual.md#多语言切换与语言包) | [English instructions](../en/docs/manual.md#language-switching-and-language-packs)
- 文档索引：[简体中文](README.md) | [English](../en/README.md)

如与继承的 Pi 文档冲突，以 CoCo 专用文档为准。

## 核心工作流

使用内置交互式 `/goal` 命令为当前会话分支设置并跟踪目标。目标和计划会随该分支持久保存，在上下文压缩后仍会保留，并用于引导代理，但不会覆盖当前用户指令或 CoCo 安全策略。命令语法请参阅 [CoCo CLI](docs/coco-cli.md#持久目标)，信任边界请参阅 [CoCo 安全](docs/coco-security.md#目标的指令与安全边界)。

使用交互式 `/loop` 为当前已保存会话创建循环任务。它仅在匹配的 CoCo 会话保持打开时运行，遵循正常的 CoCo guard 和权限行为，并且不会加载项目本地的循环提示。语法、时间和安全语义见 [CoCo CLI](docs/coco-cli.md#循环任务)。

CoCo 可通过 `/language` 在英文和简体中文之间切换，也可以安装全局 JSON 语言包来增加其他语言。

## 认证

通过交互方式为 CoCo 的五个受管理提供商之一设置 API 密钥。提示不会回显密钥：

```bash
coco manage auth set idepub
coco manage auth set achai
coco manage auth set agnes
coco manage auth set stepfun
coco manage auth set deepseek
```

自动化时可通过标准输入传入密钥。不要将真实密钥写入 shell 历史、源代码或问题报告：

```bash
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
```

也可以仅为当前进程通过 `IDEPUB_API_KEY`、`ACHAI_API_KEY`、`AGNES_API_KEY`、`STEPFUN_API_KEY` 或 `DEEPSEEK_API_KEY` 提供凭据。存储的密钥位于 `~/.coco/agent/auth.json`，权限为 `0600`；CoCo 不捆绑任何凭据。

## 配置与安全

| 路径 | 用途 |
|------|------|
| `~/.coco/agent/settings.json` | 默认提供商、模型和界面设置 |
| `~/.coco/agent/models.json` | 公开的提供商和模型元数据 |
| `~/.coco/agent/auth.json` | 本地存储的凭据（`0600`） |
| `~/.coco/agent/loops.json` | 已保存会话的循环任务 |
| `~/.coco/agent/loop.md` | 可选的全局默认循环提示 |
| `~/.coco/agent/skills/` | Skills |
| `~/.coco/agent/prompts/` | 提示模板 |
| `~/.coco/agent/extensions/` | TypeScript 扩展 |
| `~/.coco/agent/languages/` | 仅包含数据的用户语言包 |

CoCo 对项目资源实施仅信任全局配置的策略。项目本地设置、扩展、skills、提示和系统提示文件不会被加载；该策略由 `resources/project-resource-policy.v1.json` 强制执行。

## 网络与离线使用

CoCo 默认以离线方式启动。它会在 Pi 加载前设置 `PI_OFFLINE=1`，因此直接启动不会检查更新，也不会下载缺失的 `fd` 和 `ripgrep` 二进制文件。这只影响启动阶段；使用 CoCo 时，模型和提供商 API 调用仍会正常运行。

如需为一次调用显式启用 Pi 的启动网络行为，请设置 `PI_OFFLINE=0`：

```bash
PI_OFFLINE=0 coco
```

离线和内网部署可使用特定平台的自包含 ZIP；请参阅[中文说明](docs/manual.md#离线与内网安装)或 [English instructions](../en/docs/manual.md#offline-and-intranet-installation)。

## 许可证和上游

CoCo 使用 MIT 许可证。它是 `@earendil-works/pi-coding-agent` 的下游发行版，上游作者为 Mario Zechner 和 earendil-works，并使用 MIT 许可证。请参阅源代码中的 [LICENSE](../../LICENSE) 和 [NOTICE](../../NOTICE)。
