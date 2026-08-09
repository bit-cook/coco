# coco

Coco 是通用 AI 助手，具备强大的编码和终端能力。它作为 [Pi Coding Agent](https://github.com/earendil-works/pi) 的下游发行版构建，并将 `agnes/agnes-2.5-flash` 和最高思考级别 `max` 设为默认配置。Coco 源码不包含提供商凭据。

[English](../en/README.md) | [简体中文](README.md) | [文档索引](docs/index.md)

完整用户手册：[简体中文](docs/manual.md) | [English](../en/docs/manual.md)

操作参考：[Coco CLI](docs/coco-cli.md) | [Coco 安全](docs/coco-security.md)。如与继承的 Pi 文档冲突，以 Coco 专用文档为准。

## 持久目标

使用内置交互式 `/goal` 命令为当前会话分支设置并跟踪目标。目标和计划会随该分支持久保存，在上下文压缩后仍会保留，并用于引导代理，但不会覆盖当前用户指令或 Coco 安全策略。命令语法请参阅 [Coco CLI](docs/coco-cli.md#持久目标)，信任边界请参阅 [Coco 安全](docs/coco-security.md#目标的指令与安全边界)。

## 要求

- Node.js `>=22.19.0`
- 发布版安装程序支持 macOS 或 Linux

## 安装

通过稳定的 Pages 启动器安装最新稳定版本：

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

或者安装经过明确审阅的固定版本：

```bash
curl -fsSLO https://github.com/bit-cook/coco/releases/download/v0.1.8/install.sh
COCO_VERSION=0.1.8 bash install.sh
```

安装程序会根据固定 SHA-256 值验证固定标签发行包和公开 Agnes 凭据，安全解压 Coco，并在更新或重新安装时保留现有的 `~/.coco/agent` 配置。全新安装可立即使用 Agnes max，并显示 Agnes、IDEPub、StepFun、Achai 和 DeepSeek 模型，包括 `deepseek-v4-flash` 与 `deepseek-v4-pro`。Achai 凭据来自 `ACHAI_API_KEY` 或现有的 OpenCode secret；Coco 不捆绑 Achai 密钥。设置 `AGNES_API_KEY` 可覆盖默认 Agnes 凭据；在全新安装时设置 `DEEPSEEK_API_KEY` 可导入 DeepSeek 凭据，也可以在安装后配置其他提供商。

升级时再次运行稳定安装程序命令。不要使用 `coco update`；Coco 有意不提供该命令。

## 启动网络策略

Coco 默认以离线方式启动。它会在 Pi 加载前设置 `PI_OFFLINE=1`，因此直接启动不会检查更新，也不会下载缺失的 `fd` 和 `ripgrep` 二进制文件。这只影响启动阶段；使用 Coco 时，模型和提供商 API 调用仍会正常运行。

如需为一次调用显式启用 Pi 的启动网络行为，请设置 `PI_OFFLINE=0`：

```bash
PI_OFFLINE=0 coco
```

## 认证

通过交互方式为 Coco 的五个受管理提供商之一设置 API 密钥。提示不会回显密钥：

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

也可以仅为当前进程通过 `IDEPUB_API_KEY`、`ACHAI_API_KEY`、`AGNES_API_KEY`、`STEPFUN_API_KEY` 或 `DEEPSEEK_API_KEY` 提供凭据。存储的密钥位于 `~/.coco/agent/auth.json`，权限为 `0600`；Coco 不捆绑任何凭据。

## 许可证和上游

Coco 使用 MIT 许可证。它是 `@earendil-works/pi-coding-agent` 的下游发行版，上游作者为 Mario Zechner 和 earendil-works，并使用 MIT 许可证。请参阅源代码中的 [LICENSE](../../LICENSE) 和 [NOTICE](../../NOTICE)。
