# Coco CLI

本页是 Coco 的操作参考。如与继承的 Pi 文档冲突，以本页为准。

## 安装与升级

要求：Node.js `>=22.19.0`；发布版安装程序支持 macOS 和 Linux。

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

如需安装已审阅的发布版，请下载该发布版的 `install.sh`，并使用匹配的 `COCO_VERSION` 运行：

```bash
curl -fsSLO https://github.com/bit-cook/coco/releases/download/v0.1.8/install.sh
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

## 持久目标

`/goal` 是内置交互式命令，用于将目标及其执行计划保存在当前会话分支中。它不是 shell 命令，也不是顶层 `coco` CLI 参数。

```text
/goal [status]
/goal <description>
/goal set <description>
/goal plan
/goal pause
/goal resume
/goal done <step>
/goal active <step>
/goal block <step>
/goal reopen <step>
/goal continue
/goal complete
/goal clear
```

- `/goal <description>` 和 `/goal set <description>` 会设置新的活动目标，并清除其现有计划。`/goal` 和 `/goal status` 显示目标及步骤进度。
- `/goal plan` 会要求模型创建并保存简明、可验证的计划，但不会执行该计划。`/goal pause` 会停止注入目标上下文；`/goal resume` 会再次激活现有目标。
- `/goal done <step>` 仅应在该编号步骤的工作和验证完成后将其标为完成。`/goal active <step>`、`/goal block <step>` 和 `/goal reopen <step>` 分别将编号步骤设为活动、受阻或待处理。`/goal continue` 会恢复目标，并要求模型从第一个未完成步骤开始。`/goal complete` 会完成目标并将所有已计划步骤标为完成；`/goal clear` 会移除目标和计划。

目标状态会追加到会话历史中，并从当前分支恢复，因此分叉或恢复的分支拥有各自最新的目标状态，而不是共享全局目标。上下文压缩期间，活动目标上下文会在下一次代理回合前重新生成；压缩后可使用 `/goal status` 查看已持久保存的目标和计划。

模型拥有 `goal` 工具，用于读取和更新当前目标的计划及进度。其操作为 `status`、`set_steps`、`activate_step`、`block_step`、`reopen_step`、`complete_step` 和 `complete`；模型必须使用 `set_steps` 保存有序计划，且不得在工作和验证完成前完成步骤。目标用于引导工作，但不会覆盖当前用户指令或 Coco 安全策略。

## 语言

使用 `/language`、`/language en` 或 `/language zh-CN` 选择内置语言。`/language status` 显示当前选择，`/language list` 会列出有效的用户语言包。选择会在全局持久保存。自定义纯 JSON 语言包放在 `~/.coco/agent/languages/`；语言包结构、支持的消息键、校验规则和制作流程见 [Coco 用户手册](manual.md#多语言切换与语言包)。

语言选择会本地化 Coco 自有命令与模型回复引导。部分继承的 Pi 核心界面仍为英文，当前用户明确提出的语言要求优先。

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
