# coco

你的个人编码代理，作为 [Pi Coding Agent](https://github.com/earendil-works/pi) 的下游发行版构建，并将 `agnes/agnes-2.5-flash` 和最高思考级别 `max` 设为默认配置。Coco 源码不包含提供商凭据。

[English](../en/README.md) | [简体中文](README.md) | [文档索引](docs/index.md)

## 要求

- Node.js `>=22.19.0`
- 发布版安装程序支持 macOS 或 Linux

## 安装

通过稳定的 Pages 启动器安装最新稳定版本：

```bash
curl -fsSL https://aithernexus.github.io/coco/install.sh | bash
```

或者安装经过明确审阅的固定版本：

```bash
curl -fsSLO https://github.com/aithernexus/coco/releases/download/v0.1.2/install.sh
COCO_VERSION=0.1.2 bash install.sh
```

安装程序会根据固定标签发布的 SHA-256 校验文件验证发行包，安全解压，并在更新或重新安装时保留现有的 `~/.coco/agent` 配置。全新安装默认使用 Agnes max，并包含 Agnes、IDEPub、StepFun 和 Achai 的公开元数据。Coco 不捆绑凭据；请显式提供 `AGNES_API_KEY`，或在安装后配置提供商。

## 启动网络策略

Coco 默认以离线方式启动。它会在 Pi 加载前设置 `PI_OFFLINE=1`，因此直接启动不会检查更新，也不会下载缺失的 `fd` 和 `ripgrep` 二进制文件。这只影响启动阶段；使用 Coco 时，模型和提供商 API 调用仍会正常运行。

如需为一次调用显式启用 Pi 的启动网络行为，请设置 `PI_OFFLINE=0`：

```bash
PI_OFFLINE=0 coco
```

## 认证

通过交互方式为 Coco 的四个受管理提供商之一设置 API 密钥。提示不会回显密钥：

```bash
coco manage auth set idepub
coco manage auth set achai
coco manage auth set agnes
coco manage auth set stepfun
```

自动化时可通过标准输入传入密钥。不要将真实密钥写入 shell 历史、源代码或问题报告：

```bash
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
```

也可以仅为当前进程通过 `IDEPUB_API_KEY`、`ACHAI_API_KEY`、`AGNES_API_KEY` 或 `STEPFUN_API_KEY` 提供凭据。存储的密钥位于 `~/.coco/agent/auth.json`，权限为 `0600`；Coco 不捆绑任何凭据。

## 许可证和上游

Coco 使用 MIT 许可证。它是 `@earendil-works/pi-coding-agent` 的下游发行版，上游作者为 Mario Zechner 和 earendil-works，并使用 MIT 许可证。请参阅源代码中的 [LICENSE](../../LICENSE) 和 [NOTICE](../../NOTICE)。
