# CoCo CLI

本页是 CoCo Agent 的操作参考。如与继承的 Pi 文档冲突，以本页为准。

## 安装与升级

要求：Node.js `>=22.19.0`；发布版安装程序支持 macOS 和 Linux。

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

如需安装已审阅的发布版，请下载该发布版的 `install.sh`，并使用匹配的 `COCO_VERSION` 运行：

```bash
curl -fsSLO https://github.com/bit-cook/coco/releases/download/v0.7.2/install.sh
COCO_VERSION=0.7.2 bash install.sh
```

升级时再次运行稳定安装程序。它会验证发行包，并在更新和重新安装时保留现有的 `~/.coco/agent` 配置。`coco update` 不可用。

## 启动与离线行为

```bash
coco
coco -p "hello"
coco --list-models
```

除非已设置 `PI_OFFLINE`，CoCo 会以 `PI_OFFLINE=1` 启动。因此启动时不会检查更新，也不会下载缺失的 `fd` 和 `ripgrep` 二进制文件。这不会禁用模型或提供商 API 调用。如需仅为一次运行启用 Pi 启动网络行为：

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

模型拥有 `goal` 工具，用于读取和更新当前目标的计划及进度。其操作为 `status`、`set_steps`、`activate_step`、`block_step`、`reopen_step`、`complete_step` 和 `complete`；模型必须使用 `set_steps` 保存有序计划，且不得在工作和验证完成前完成步骤。目标用于引导工作，但不会覆盖当前用户指令或 CoCo 安全策略。

## 循环任务

`/loop` 为当前已保存会话安排循环代理提示，不是 shell 命令或顶层 `coco` 参数。

```text
/loop
/loop 检查部署
/loop 5m 检查部署
/loop 检查部署 every 2 hours
/loop list
/loop cancel <id>
```

- 时长支持前置紧凑 `s`、`m`、`h`、`d`，以及后置自然语言 `seconds`、`minutes`、`hours`、`days`（单复数）。最短一分钟；秒会向上取整到一分钟。固定循环使用经过时间间隔，不使用 Claude cron 归一化。
- 任务按精确保存会话文件保存于 `~/.coco/agent/loops.json`，每会话最多 50 个活动任务，ID 为 8 字符，七天后过期。打开的匹配会话会在过期时最终触发一次，即使在下一个常规到期时间之前；恢复时发现的过期任务会被静默删除。恢复时会把错过的时间推进到未来，不补跑也不突发。
- `list` 和 `status` 显示此会话的循环任务。`cancel` 接受无歧义的 ID 前缀；有歧义的前缀会被拒绝。
- 空提示和仅时长任务每次触发只读取全局 `~/.coco/agent/loop.md`（普通非符号链接文件，最多 25,000 字节），否则使用保守的内置维护提示；绝不读取项目本地 loop 文件。
- 仅提示的动态循环初始为 10 分钟。结果回合可用 `loop_wakeup` 带理由重排 1 分钟至 1 小时，或停止；未调用会约 20 分钟后回退一次，再次未重排即停止。固定循环无需工具调用。
- 结果回合继承 CoCo 现有 guard 和权限。以 `/` 开始的计划提示作为文本发送，不执行扩展命令。

## 语言

使用 `/language`、`/language en` 或 `/language zh-CN` 选择内置语言。`/language status` 显示当前选择，`/language list` 会列出有效的用户语言包。选择会在全局持久保存。自定义纯 JSON 语言包放在 `~/.coco/agent/languages/`；语言包结构、支持的消息键、校验规则和制作流程见 [CoCo 用户手册](manual.md#多语言切换与语言包)。

语言选择会本地化 CoCo 自有命令与模型回复引导。部分继承的 Pi 核心界面仍为英文，当前用户明确提出的语言要求优先。

## 受管理提供商与认证

CoCo 仅管理以下提供商：`agnes`、`idepub`、`achai`、`stepfun` 和 `deepseek`。全新安装会将 Agnes 设为默认提供商（`agnes/agnes-2.5-flash`，思考级别为 `max`）；源码不捆绑提供商凭据。

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

使用只读 Provider 状态命令统一查看本地配置、模型、credential source、rotation 和 readiness：

```bash
coco manage providers status
coco manage providers status agnes --json
```

该命令不联网、不恢复 transaction、不修改状态，也不显示 credential、环境变量名、endpoint 或文件路径。`localStatus: ready` 只表示本地配置、所需模型和非 rotation credential 候选齐备，不表示 Provider 接受 credential 或 inference 可用；需要显式网络检查时使用 `coco doctor --connectivity`。

已配置的自定义 OpenAI-compatible Provider 会在 managed Providers 后按 ID 排序显示。Custom status 仅用于观察；`coco manage auth` 仍严格只管理 CoCo managed Providers。

Doctor 会报告 custom default Provider 的本地 readiness，但 `--connectivity` 永远不会自动访问 custom endpoint。若 managed Providers 有 credential，仍正常检查其 frozen endpoint；custom verification 保持 `not-checked`。

当前进程也可使用 `AGNES_API_KEY`、`IDEPUB_API_KEY`、`ACHAI_API_KEY`、`STEPFUN_API_KEY` 或 `DEEPSEEK_API_KEY` 提供凭据。已存储的凭据位于 `~/.coco/agent/auth.json`，权限为 `0600`。

## 配置范围

CoCo 使用 `~/.coco/agent/` 下的全局资源，包括 `settings.json`、`models.json`、`auth.json`、`skills/`、`prompts/` 和 `extensions/`。不会加载项目本地设置、扩展、技能、提示词或系统提示文件。请参阅 [CoCo 安全](coco-security.md)。

## CoCo Web（coweb）

```bash
coco coweb [--port <端口>] [--hostname <地址>] [--password <密码>] [--update]
```

在本地浏览器启动 CoCo 会话前端，默认地址 `http://127.0.0.1:30141`（可用 `--port` 覆盖）。首次运行会安装到 `~/.coco/webui/`（绝不装入全局）；`--update` 可升级到最新版。

工作区支持按项目浏览历史会话、继续或分叉对话、切换模型与思考级别，并在 agent 运行时预览项目文件。会话与 CLI 使用同一批 JSONL 文件，两边始终同步。

- 默认仅绑定回环地址；仅在可信网络下使用 `--hostname 0.0.0.0`。
- `--password` 为所有端点启用 HTTP Basic Auth（用户名 `pi`）。明文HTTP不加密——远程访问请使用可信反向代理或VPN。
- Ctrl-C 停止。任务管理控制台仍是 `coco control start`。
