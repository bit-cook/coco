# Coco CLI

本页是 Coco 的操作参考。如与继承的 Pi 文档冲突，以本页为准。

## 安装与升级

要求：Node.js `>=22.19.0`；发布版安装程序支持 macOS 和 Linux。

```bash
curl -fsSL https://aithernexus.github.io/coco/install.sh | bash
```

如需安装已审阅的发布版，请下载该发布版的 `install.sh`，并使用匹配的 `COCO_VERSION` 运行：

```bash
curl -fsSLO https://github.com/aithernexus/coco/releases/download/v0.1.8/install.sh
COCO_VERSION=0.1.8 bash install.sh
```

升级时再次运行稳定安装程序。它会验证发行包，并在更新和重新安装时保留现有的 `~/.coco/agent` 配置。`coco update` 不可用。

## 启动与离线行为

```bash
coco
coco -p "hello"
coco --list-models
```

除非已设置 `PI_OFFLINE`，Coco 会以 `PI_OFFLINE=1` 启动。因此启动时不会检查更新，也不会下载缺失的 `fd` 和 `ripgrep` 二进制文件。这不会禁用模型或提供商 API 调用。如需仅为一次运行启用 Pi 启动网络行为：

```bash
PI_OFFLINE=0 coco
```

## 受管理提供商与认证

Coco 仅管理以下提供商：`agnes`、`idepub`、`achai`、`stepfun` 和 `deepseek`。全新安装会将 Agnes 设为默认提供商（`agnes/agnes-2.5-flash`，思考级别为 `max`）；源码不捆绑提供商凭据。

不要在命令行传入凭据：`--api-key` 会被拒绝。使用不会回显密钥的交互命令存储密钥，避免泄露到 shell 历史：

```bash
coco manage auth set idepub
```

自动化时通过标准输入传入密钥：

```bash
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
```

将 `idepub` 替换为任一受管理提供商。使用以下命令查看或删除已存储的凭据：

```bash
coco manage auth status
coco manage auth remove idepub
```

当前进程也可使用 `AGNES_API_KEY`、`IDEPUB_API_KEY`、`ACHAI_API_KEY`、`STEPFUN_API_KEY` 或 `DEEPSEEK_API_KEY` 提供凭据。已存储的凭据位于 `~/.coco/agent/auth.json`，权限为 `0600`。

## 配置范围

Coco 使用 `~/.coco/agent/` 下的全局资源，包括 `settings.json`、`models.json`、`auth.json`、`skills/`、`prompts/` 和 `extensions/`。不会加载项目本地设置、扩展、技能、提示词或系统提示文件。请参阅 [Coco 安全](coco-security.md)。
