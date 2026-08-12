# CoCo 用户手册

本手册面向日常使用 CoCo Agent 的用户，覆盖安装、交互界面、认证、模型、会话、自动化与安全边界。

CoCo 是基于 Pi Coding Agent 的下游发行版，提供编码和终端能力，并增加受管理提供商、持久目标、启动离线策略与资源信任限制。

除非特别说明，命令均在终端中运行；斜线命令在 CoCo 的交互界面编辑器中输入。

## 阅读规则与优先级

本仓库同时附带 CoCo 专用文档和继承的 Pi 文档。

发生冲突时，优先级从高到低如下：

1. CoCo 运行时的原生命令与错误输出。
2. 本手册以及 [CoCo CLI](coco-cli.md) 和 [CoCo 安全](coco-security.md)。
3. 其他随附的 Pi 兼容功能文档。

因此，不要把 Pi 文档中出现的 `pi` 可执行文件、`~/.pi/agent` 路径、项目资源信任、`pi update` 或 `--api-key` 直接套用到 CoCo。

在 CoCo 中使用 `coco` 启动，且状态默认位于 `~/.coco/agent/`。

`--api-key` 被 CoCo 拒绝，无论它写成 `--api-key VALUE` 还是 `--api-key=VALUE`。

`coco update` 也被明确拒绝；升级必须重新运行获准的安装程序。

## 要求、安装与升级

发布版安装程序支持 macOS 和 Linux。

需要 Node.js `>=22.19.0`。

安装最新稳定版：

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

如果需要审阅一个特定发布版，下载该标签对应的安装程序，并显式指定同一版本：

```bash
curl -fsSLO https://github.com/bit-cook/coco/releases/download/v0.5.0/install.sh
COCO_VERSION=0.5.0 bash install.sh
```

安装程序会校验发行包；更新或重装时会保留既有的 `~/.coco/agent` 配置。

首次安装的默认提供商是 Agnes，默认模型为 `agnes/agnes-2.5-flash`，默认思考级别为 `max`。

源代码不捆绑用户提供商凭据。

升级时再次运行稳定安装命令即可：

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

不要运行 `coco update`，该命令会返回 `UPDATE_COMMAND_FORBIDDEN`。

安装后若 shell 找不到 `coco`，请重新打开终端，或确认安装程序创建的启动器所在目录已经在 `PATH` 中。

## 首次运行

### 离线与内网安装

正式发布目前只提供 Linux x64 自包含离线 ZIP。其他平台可使用在线安装器，或在可信联网机器上自行构建并验证对应平台包。ZIP 内含 CoCo 完整软件本体、全部捆绑依赖、私有 Node 运行时、校验文件和 `offline-install.sh`；目标机不会运行 npm，也不会下载组件。

传输或解压前，从同一个精确 Release 下载 ZIP 及其外部 sidecar，并在归档外验证：

```bash
sha256sum --check coco-0.5.0-offline-linux-x64.zip.sha256
```

ZIP 内部的 `SHA256SUMS` 只能检测解压后的损坏，不能单独认证 ZIP。完成外部验证和传输后，解压并运行：

```bash
bash offline-install.sh
```

如需在安装时配置兼容 OpenAI Chat Completions 的内网模型服务：

```bash
COCO_INTRANET_BASE_URL=http://10.0.0.8:8000/v1 \
COCO_INTRANET_MODEL_ID=corp-model \
COCO_INTRANET_PROVIDER=corp-ai \
bash offline-install.sh
```

默认情况下，生成的提供商会在运行时读取 `INTRANET_AI_API_KEY`。可用 `COCO_INTRANET_API_KEY_ENV` 更改变量名；无密钥服务设置 `COCO_INTRANET_AUTH_HEADER=0`。

如需安全持久保存密钥，可通过标准输入传入，避免进入命令行参数：

```bash
printf '%s\n' "$INTRANET_AI_API_KEY" | \
  COCO_INTRANET_BASE_URL=http://10.0.0.8:8000/v1 \
  COCO_INTRANET_MODEL_ID=corp-model \
  COCO_INTRANET_KEY_STDIN=1 \
  bash offline-install.sh
```

还可设置 `COCO_INTRANET_MODEL_NAME`、`COCO_INTRANET_CONTEXT_WINDOW` 和 `COCO_INTRANET_MAX_TOKENS`。安装器不会静默覆盖已有的同名提供商。离线启动器固定设置 `PI_OFFLINE=1`，但仍允许 CoCo 请求已配置的内网模型地址。

发布维护者可用 `npm run build:offline` 生成当前平台 ZIP。构建机可能下载并校验官方 Node 归档，但目标机安装过程不访问公网。

在工作目录中启动交互会话：

```bash
coco
```

传入初始请求也可直接开始：

```bash
coco "检查这个项目的测试失败原因"
```

一次性打印回答并退出：

```bash
coco -p "概括当前目录的用途"
```

列出当前可用模型：

```bash
coco --list-models
```

没有可用模型时，先检查认证状态：

```bash
coco manage auth status
```

再为所需的受管理提供商设置凭据，或在当前进程设置相应环境变量。

首次运行会使用 CoCo 的全局状态目录；请确保当前用户有权限创建 `~/.coco`。

## 启动离线策略

CoCo 默认离线启动，除非调用环境已经显式设置 `PI_OFFLINE`。

默认情况下 CoCo 在 Pi 加载前设置 `PI_OFFLINE=1`。

这会阻止启动阶段的版本检查，以及缺失 `fd` 和 `ripgrep` 二进制文件的下载。

这不是网络隔离，也不会阻止模型或提供商 API 请求。

需要一次性启用 Pi 的启动网络行为时，显式覆盖为 `0`：

```bash
PI_OFFLINE=0 coco
```

离线时，依赖网络的模型同步不能完成；`coco core check` 的远程注册表检查会显示为跳过或结果不确定，而不是证明远程版本已验证。

## 原生命令概览

`coco --help`、`coco -h` 与 `coco help` 显示 CoCo 原生帮助。

`coco --version` 或 `coco -v` 显示 CoCo 版本。

下表中的命令由 CoCo 自己处理，不会转发给 Pi。

| 命令 | 用途 | 关键选项 |
|---|---|---|
| `coco manage auth set <provider>` | 保存受管理提供商的密钥 | `--stdin`、`--json` |
| `coco manage auth status [provider]` | 查看凭据可用性和来源 | `--json` |
| `coco manage auth remove <provider>` | 删除已存储密钥 | `--yes`、`--json` |
| `coco manage models sync` | 从提供商刷新模型目录 | `--provider`、`--allow-empty`、`--yes`、`--json` |
| `coco manage migrate` | 迁移旧状态 | `--dry-run`、`--yes`、`--json` |
| `coco manage bootstrap` | 建立或修复 CoCo 管理的基础状态 | `--dry-run`、`--yes`、`--json` |
| `coco doctor` | 检查本地 CoCo 状态 | `--connectivity`、`--json` |
| `coco core status` | 校验本地核心身份 | `--json` |
| `coco core check` | 检查本地核心并尝试注册表比较 | `--json` |

原生命令只接受表中列出的语法；多余或未知参数会产生 `NATIVE_USAGE`。

在没有 TTY 的自动化环境中，可能改变状态的原生命令需要 `--yes`，否则会产生 `CONFIRMATION_REQUIRED`。

`--json` 输出机器可读 JSON，适合脚本消费；不要依赖普通文本诊断的列宽或措辞。

除 `manage`、`doctor`、`core` 和帮助/version 外，其他参数会转发给随 CoCo 提供的 Pi 兼容运行时，并自动加载 CoCo 防护和 `/goal` 扩展。

## 受管理提供商与认证

CoCo 仅管理以下五个提供商：`agnes`、`idepub`、`achai`、`stepfun`、`deepseek`。

“管理”指 CoCo 原生命令可为它们保存凭据并同步其模型目录；它不表示 CoCo 会提供你的密钥。

交互式设置会以隐藏输入读取密钥，并要求再次确认：

```bash
coco manage auth set idepub
```

替换提供商名即可：

```bash
coco manage auth set agnes
coco manage auth set achai
coco manage auth set stepfun
coco manage auth set deepseek
```

自动化中从标准输入传入密钥，避免将密钥留下在 shell 历史或进程参数中：

```bash
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
```

检查单个或全部提供商：

```bash
coco manage auth status idepub
coco manage auth status --json
```

状态只报告可用性、来源以及是否需要轮换，绝不显示密钥值。

删除存储的密钥：

```bash
coco manage auth remove idepub
```

交互式删除会要求确认；无 TTY 时使用 `--yes`：

```bash
coco manage auth remove idepub --yes --json
```

当前进程可从环境读取凭据：`AGNES_API_KEY`、`IDEPUB_API_KEY`、`ACHAI_API_KEY`、`STEPFUN_API_KEY` 和 `DEEPSEEK_API_KEY`。

保存的凭据位于 `~/.coco/agent/auth.json`，并以仅用户可读写的 `0600` 权限创建。

对于受管理提供商，已保存凭据优先于环境变量。

不要手工把密钥写入截图、终端回滚日志、项目文件、问题报告或命令行。

## 模型目录、同步与选择

受管理模型的公开元数据在 `~/.coco/agent/models.json` 中。

同步会连接到提供商目录端点，规范化模型条目，并以事务方式更新模型状态和目录记录。

同步全部受管理提供商：

```bash
coco manage models sync
```

仅同步一个提供商：

```bash
coco manage models sync --provider deepseek
```

脚本中加上确认和 JSON 输出：

```bash
coco manage models sync --provider idepub --yes --json
```

默认情况下空目录会被拒绝，以免网络或提供商异常覆盖已有目录。

只有在你明确接受空目录结果时使用 `--allow-empty`。

同步需要可用网络；CoCo 默认离线启动不等同于禁用后续模型 API，但你必须提供实际可达的连接。

使用 `--list-models` 查看当前可选模型：

```bash
coco --list-models
coco --list-models deepseek
```

交互会话中输入 `/model` 打开模型选择器。

可用性取决于模型是否已注册，以及所需认证是否可解析。

在 Pi 兼容运行时，可使用 `--provider <name>`、`--model <pattern>`、`--thinking <level>` 与 `--models <patterns>` 选择模型或限制 Ctrl+P 循环范围。

例如：

```bash
coco --provider deepseek --model deepseek-v4-pro "审查这个变更"
coco --model agnes/agnes-2.5-flash:max "解释测试失败"
```

可用思考级别为 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`，具体模型可能隐藏或映射不支持的级别。

不要使用 `--api-key` 来临时让模型可用。CoCo 会在转发前拒绝它，返回 `API_KEY_ARG_FORBIDDEN`。

## 自定义模型与提供商

若使用非受管理的本地或兼容服务，可在全局 `~/.coco/agent/models.json` 配置提供商和模型。

可配置的 API 类型包括 `openai-completions`、`openai-responses`、`anthropic-messages` 和 `google-generative-ai`。

例如，本地 Ollama 配置可使用一个占位 `apiKey`，因为某些本地服务器会忽略它：

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [{ "id": "qwen2.5-coder:7b" }]
    }
  }
}
```

此处的 `apiKey` 是配置文件值，不是 CoCo 顶层 `--api-key` 参数。

模型配置、兼容开关、模型覆盖与值解析的完整字段说明见[自定义模型](models.md)。

使用 `/model` 时会重新加载 `models.json`，所以修改后通常无需重启会话。

自定义模型配置是全局资源，不要在仓库的 `.pi`、`.coco` 或其他项目目录放置期望由 CoCo 加载的副本。

## 交互界面与编辑器

交互模式主要由启动标题、消息区、编辑器和页脚构成。

启动标题会显示快捷信息以及已加载的全局资源。

消息区显示用户消息、助手回答、工具调用、工具结果、通知、错误和扩展 UI。

编辑器是输入区域，边框颜色可反映当前思考级别。

页脚显示工作目录、会话名称、令牌与缓存用量、成本、上下文用量和当前模型。

`/settings` 等内置界面或扩展 UI 可以暂时替换编辑器。

常用编辑器操作如下。

| 操作 | 方法 |
|---|---|
| 引用文件 | 输入 `@`，模糊搜索当前项目文件 |
| 路径补全 | 按 Tab |
| 多行输入 | Shift+Enter；Windows 终端可用 Ctrl+Enter |
| 复制最后助手回答 | Ctrl+X |
| 粘贴或拖入图像 | Windows 可用 Ctrl+V 或 Alt+V，也可拖入终端 |
| 运行并发送 shell 输出 | 输入 `!command` |
| 运行但不发送 shell 输出 | 输入 `!!command` |
| 在外部编辑器编辑 | Ctrl+G |

外部编辑器依次使用 `externalEditor` 设置、`$VISUAL`、`$EDITOR`，以及平台回退值。

为 VS Code 设置外部编辑器时应包含 `--wait`，使 CoCo 等待编辑器关闭：

```json
{ "externalEditor": "code --wait" }
```

完整按键及自定义方式见[键绑定](keybindings.md)。

代理执行期间可继续输入消息。

Enter 将消息作为 steering 排队，在当前助手轮完成其工具调用后交付。

Alt+Enter 将消息作为 follow-up 排队，等待代理完成当前工作后交付。

Escape 取消排队消息并恢复到编辑器，Alt+Up 可把排队消息取回编辑器。

`steeringMode` 与 `followUpMode` 可在设置中控制队列交付方式。

## 交互命令与工具

输入 `/` 可打开命令补全。

常用会话命令包括 `/login`、`/logout`、`/model`、`/settings`、`/resume`、`/new`、`/name`、`/session`、`/tree`、`/fork`、`/clone`、`/compact`、`/export`、`/import`、`/reload`、`/hotkeys` 和 `/quit`。

技能可作为 `/skill:name` 使用，提示模板会以其模板名称成为斜线命令。

## 循环任务

`/loop` 为当前已保存会话创建循环提示，在交互编辑器中输入，不是 shell 命令或顶层 `coco` 参数。

```text
/loop
/loop 检查部署
/loop 5m 检查部署
/loop 检查部署 every 2 hours
/loop list
/loop cancel <id>
```

循环保存于 `~/.coco/agent/loops.json`，绑定精确会话文件，仅在匹配 CoCo 进程/会话保持打开时运行。恢复时，错过的时间会推进至下一未来间隔，不补跑也不突发。每会话最多 50 个活动循环任务，每项 ID 为 8 字符，七天后过期；打开的匹配会话会在过期时最终触发一次，即使在下一个常规到期时间之前，恢复时发现的过期任务会被静默删除。

`/loop list` 和 `/loop status` 显示当前会话的循环任务。`/loop cancel <id>` 接受无歧义 ID 前缀；有歧义的前缀会被拒绝。

时长支持前置紧凑 `s`、`m`、`h`、`d`，以及后置自然语言 seconds、minutes、hours、days。秒会向上取整，最短一分钟。固定间隔有意使用经过时间语义，而非 Claude cron 归一化。

空提示或仅时长循环每次触发只加载全局 `~/.coco/agent/loop.md`，最多 25,000 字节，符号链接或非普通文件会被拒绝；否则使用保守内置维护提示。绝不加载项目本地 `.claude/loop.md` 或 `.coco/loop.md`。仅提示动态循环从 10 分钟开始，可用 `loop_wakeup` 带理由延后 1 分钟至 1 小时，或停止。未调用工具会约 20 分钟后回退一次，下一次仍未重排即停止。计划回合继承 CoCo 既有 guard 和权限；以 `/` 开始的提示仍是文本。

## 多语言切换与语言包

CoCo 默认内置英文（`en`）和简体中文（`zh-CN`），默认语言为英文。可在交互界面中使用：

```text
/language
/language en
/language zh-CN
/language status
/language list
```

`/language` 会在交互 UI 中打开语言选择器。成功选择后，语言会保存到 `~/.coco/agent/language.json`，重启后继续生效。设置 `COCO_CODING_AGENT_DIR` 时，语言选择文件和语言包目录会跟随该 agent 目录。

所选语言适用于 CoCo 自有命令和文案，包括 `/language`、`/goal`、安全确认标题，以及要求模型使用该语言回答的系统引导。命令名、代码、标识符、路径、API 名称和引用原文不会翻译。部分尚未接入 CoCo 翻译层的 Pi 核心界面仍可能显示英文。模型回复语言属于引导而非强制；用户当前明确要求使用其他语言时，以用户要求为准。

### 制作语言包

用户语言包是纯 JSON 数据文件，放在：

```text
~/.coco/agent/languages/<locale>.json
```

语言包属于全局用户数据。CoCo 不加载项目本地语言包，不联网下载语言包，也不会执行语言包中的代码。

示例 `~/.coco/agent/languages/es.json`：

```json
{
  "schemaVersion": 1,
  "locale": "es",
  "name": "Español",
  "messages": {
    "agent.responseInstruction": "Responde en español salvo que el usuario pida otro idioma. Conserva sin cambios el código, los identificadores, las rutas, los comandos, los nombres de API y el texto citado.",
    "goal.label": "Objetivo",
    "language.commandDescription": "Elegir idioma"
  }
}
```

保存后运行：

```text
/language list
/language es
```

语言包规则：

- 文件名去掉 `.json` 后必须与 `locale` 完全一致。
- `schemaVersion` 必须为 `1`。
- locale 使用字母和可选的连字符分段，例如 `pt-BR`。
- `name` 是供用户查看的语言名称。
- `messages` 是扁平的字符串键值对象。
- 用户语言包可以只翻译部分键；缺失内容自动回退到内置英文。
- 超过 1 MiB、符号链接、未知消息键、非字符串值、NUL 字节或终端转义字符会被拒绝。
- 无效语言包会被忽略，不会阻止 CoCo 启动。
- 英文原文中的 `{locale}`、`{name}`、`{status}`、`{completed}`、`{total}`、`{goal}`、`{locales}` 等占位符应原样保留。

已安装 CoCo 中的 `resources/languages/en.json` 是权威语言包模板，`resources/languages/zh-CN.json` 是完整示例。建议按以下步骤制作：

1. 将 `resources/languages/en.json` 复制到安装目录之外。
2. 修改 `locale` 和 `name`。
3. 只翻译 message 值，不修改消息键、命令名和占位符。
4. 保存为 `~/.coco/agent/languages/<locale>.json`，权限建议设为 `0600`。
5. 运行 `/language list`，再运行 `/language <locale>`。
6. 运行 `/language status`，并测试 `/goal status` 和一次普通模型回复。

不要直接修改软件包中的内置语言文件：运行时完整性检查会保护这些文件，升级也会替换软件包内容。自定义语言包应始终保存在全局用户语言目录。

内置工具是 `read`、`bash`、`edit`、`write`、`grep`、`find` 和 `ls`。

Pi 兼容选项可控制工具范围：

```bash
coco --tools read,grep,find,ls -p "只审查代码，不要修改"
coco --exclude-tools bash "分析此项目"
coco --no-builtin-tools "仅使用已加载的扩展工具"
coco --no-tools -p "给出不执行工具的建议"
```

`--tools` 是白名单；`--exclude-tools` 禁用指定工具；`--no-builtin-tools` 只关闭内置工具；`--no-tools` 关闭全部工具。

工具选择能减少模型可调用的能力，但不是对宿主环境的隔离。

## CoCo guard 与安全边界

转发给 Pi 的会话会在最前面加载 CoCo guard 与目标扩展。

CoCo guard 对部分敏感路径写入和 shell 命令采取尽力而为的阻止或确认策略。

guard 不是沙箱，也不是安全边界。

CoCo、Pi 工具、扩展和你执行的命令均以启动 CoCo 的用户权限运行。

不可信仓库、无人值守任务或高价值凭据场景，应使用容器、VM、microVM 或远程沙箱等真实隔离机制。

隔离环境应只提供必要的工作区、凭据和网络访问；将结果移回可信系统前应审查它们。

仓库中的代码、文档、注释、生成物、提示词和工具输出均可能含有提示注入，应视为不可信输入。

有关策略和建议见[CoCo 安全](coco-security.md)与[容器化](containerization.md)。

## `/goal` 持久目标

`/goal` 是交互命令，不是 shell 命令，也不是 `coco` 的顶层参数。

它将目标和计划保存在当前会话分支，用来持续引导代理工作。

完整语法如下：

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

`/goal` 和 `/goal status` 显示当前目标、状态和步骤进度。

`/goal <description>` 与 `/goal set <description>` 建立新的活动目标，并清除原目标的既有计划。

`/goal plan` 要求模型生成并保存简明且可验证的计划，但不会因此执行计划。

`/goal pause` 暂停向模型注入目标上下文；它不会删除目标或计划。

`/goal resume` 重新激活已暂停的目标。

`/goal done <step>` 只应在该编号步骤的工作和验证都完成后使用。

`/goal active <step>` 将指定编号步骤标为活动。

`/goal block <step>` 将指定编号步骤标为受阻。

`/goal reopen <step>` 将指定编号步骤重新设为待处理。

`/goal continue` 恢复目标，并要求代理从第一个未完成步骤继续。

`/goal complete` 完成整个目标，并将已计划步骤标为完成。

`/goal clear` 删除目标和计划。

模型还有 `goal` 工具，可读取和更新当前目标。

该工具的操作包括 `status`、`set_steps`、`activate_step`、`block_step`、`reopen_step`、`complete_step` 与 `complete`。

模型必须用 `set_steps` 保存有序计划，不应在工作和验证前完成步骤。

目标状态会追加到会话历史，因此恢复或分叉后，每条分支拥有自己的最新目标状态，而非共享的全局状态。

上下文压缩后，活动目标上下文会在下一代理轮前重新生成；可运行 `/goal status` 核实持久状态。

当前用户指令优先于目标。

目标不是授权机制，不能覆盖 CoCo 的安全策略或 guard。

目标文本、计划、模型的工具更新、仓库内容和工具输出都应按不可信输入处理。

## 会话、恢复与分支

CoCo 会使用其全局代理目录保存会话，并按工作目录组织。

默认状态根是 `~/.coco/agent/`；若设置 `COCO_CODING_AGENT_DIR`，CoCo 使用该变量指定的绝对状态目录。

会话是有树结构的 JSONL 文件。

启动时的兼容会话选项包括：

```bash
coco -c                  # 继续最近会话
coco -r                  # 浏览并选择会话
coco --no-session        # 临时模式，不保存
coco --name "我的任务"   # 设置显示名称
coco --session <path|id> # 使用指定会话文件或部分 ID
coco --fork <path|id>    # 从会话创建新文件
```

使用 `/session` 查看当前会话文件、ID、消息数、令牌与费用。

`/resume` 打开当前项目的会话选择器，`-r` 在启动时打开同一选择器。

选择器支持输入搜索、Ctrl+P 切换路径显示、Ctrl+S 切换排序、Ctrl+N 筛选命名会话、Ctrl+R 重命名和 Ctrl+D 删除后确认。

可用时会优先使用 `trash` CLI，而非直接永久删除。

`/new` 建立新会话，`/name <name>` 更改显示名称。

`/tree` 在同一会话文件中浏览树并从早期位置继续。

选择以前的用户消息时，编辑器会预填该文本，重新提交会形成分支。

选择助手、工具、压缩或其他非用户条目时，会直接从该点继续，编辑器保持为空。

`/fork` 从以前的用户消息建立一个新的会话文件。

`/clone` 将当前活动分支复制到一个新的会话文件。

| 需求 | 推荐命令 |
|---|---|
| 在同一个文件探索替代方案 | `/tree` |
| 从旧提示开始独立工作 | `/fork` |
| 复制当前进度后继续 | `/clone` |

`/tree` 切换分支时可选择总结被放弃的分支，以保留重要上下文。

详细树控件和会话格式见[会话](sessions.md)与[会话文件格式](session-format.md)。

## 上下文压缩

上下文接近窗口限制时，CoCo 兼容运行时可自动压缩较早消息。

也可用 `/compact [prompt]` 手动总结旧上下文，并可附加聚焦指令。

压缩旨在保留可继续工作的摘要，并不保证逐字保留旧消息。

`compaction.enabled`、`compaction.reserveTokens` 和 `compaction.keepRecentTokens` 可在全局设置中控制。

分支总结与压缩不同：前者服务于 `/tree` 在分支间切换，后者服务于会话上下文容量。

完整机制、阈值和扩展钩子见[上下文压缩](compaction.md)。

## 打印、JSON 与 RPC

打印模式适合单次命令或脚本：

```bash
coco -p "列出需要修复的测试"
```

打印模式会读取管道标准输入并合并到初始提示中：

```bash
cat README.md | coco -p "用中文总结此文本"
```

JSON 事件模式把会话事件逐行输出到 stdout：

```bash
coco --mode json "列出文件"
```

每行都是一个 JSON 对象，第一行是会话头，随后会流出代理、回合、消息、工具和压缩事件。

不要把普通日志混入 JSON stdout；将诊断和过滤处理放在 stderr 或下游程序中。

示例：

```bash
coco --mode json "列出文件" 2>/dev/null | jq -c 'select(.type == "message_end")'
```

RPC 模式通过 stdin/stdout 上的 JSONL 协议运行无头代理：

```bash
coco --mode rpc
```

RPC 输入每行一个 JSON 命令，输出同时包含带 `type: "response"` 的响应和实时代理事件。

协议记录分隔符只能是 LF（`\n`）；客户端可去掉末尾 `\r`，但不应按其他 Unicode 行分隔符切分。

最小提示请求如下：

```json
{"id":"req-1","type":"prompt","message":"Hello, world!"}
```

当代理正在输出时，使用 `streamingBehavior: "steer"` 或 `"followUp"` 排队 `prompt`；未指定时请求会被拒绝。

也可分别使用 `steer` 和 `follow_up` RPC 命令。

JSON 的完整事件定义见[JSON 事件流模式](json.md)，RPC 的全部命令、生命周期和 UI 子协议见[RPC 模式](rpc.md)。

## 设置与全局状态路径

CoCo 的默认全局配置根为 `~/.coco/agent/`。

可通过 `COCO_CODING_AGENT_DIR` 指向另一个绝对代理目录，适合隔离测试或多个独立配置。

下表列出 CoCo 相关的确切默认路径。

| 路径 | 用途 |
|---|---|
| `~/.coco/agent/settings.json` | 默认提供商、模型、界面和运行设置 |
| `~/.coco/agent/models.json` | 自定义及受管理的模型元数据 |
| `~/.coco/agent/auth.json` | 已保存凭据，权限为 `0600` |
| `~/.coco/agent/loops.json` | 已保存会话的循环任务 |
| `~/.coco/agent/ownership.json` | CoCo 管理文件的所有权元数据 |
| `~/.coco/agent/migration.json` | 迁移状态与需要轮换的提供商 |
| `~/.coco/agent/catalogs/` | 受管理提供商的当前与先前目录记录 |
| `~/.coco/agent/transactions/` | 状态事务日志 |
| `~/.coco/agent/skills/` | 全局技能 |
| `~/.coco/agent/prompts/` | 全局提示模板 |
| `~/.coco/agent/extensions/` | 全局 TypeScript 扩展 |
| `~/.coco/agent/languages/` | 纯 JSON 用户语言包 |

设置文件是 JSON，可直接编辑；常用交互设置可用 `/settings` 修改。

常用模型设置是 `defaultProvider`、`defaultModel`、`defaultThinkingLevel`、`enabledModels` 与 `thinkingBudgets`。

常用界面设置是 `theme`、`externalEditor`、`quietStartup`、`doubleEscapeAction` 和 `treeFilterMode`。

会话默认保存在 `~/.coco/agent/sessions/`；需要为一次运行指定其他目录时，使用命令行 `--session-dir`。

常用网络设置是 `httpProxy`，它会应用为 `HTTP_PROXY` 与 `HTTPS_PROXY`。

常用重试设置是 `retry.enabled`、`retry.maxRetries`、`retry.baseDelayMs` 以及 `retry.provider` 子项。

使用下列结构设置默认模型和主题：

```json
{
  "defaultProvider": "agnes",
  "defaultModel": "agnes-2.5-flash",
  "defaultThinkingLevel": "max",
  "theme": "dark"
}
```

所有可用设置、默认值和示例见[设置](settings.md)。

## 扩展、技能、提示与主题

CoCo 仅从全局代理目录加载可执行或可影响行为的用户资源。

允许的全局位置是 `~/.coco/agent/extensions/`、`~/.coco/agent/skills/`、`~/.coco/agent/prompts/` 和由全局设置引用的路径。

项目本地设置、扩展、技能、提示模板和系统提示文件不会被 CoCo 加载。

换言之，仓库中的 `.pi/settings.json`、`.pi` 资源、`.agents/skills`、项目 `.coco` 资源或项目本地可执行资源不能通过 CoCo 自动生效。

项目本地可执行资源不会被加载，即使仓库看起来可信，或 Pi 的继承文档描述了项目资源信任流程。

这是 CoCo 强制的 global-only 策略，而不是一个可以用 `--approve`、`/trust` 或项目设置绕过的选择。

`-e`/`--extension`、`--skill`、`--prompt-template` 和 `--theme` 是 Pi 兼容的显式资源选项；只应为你已审阅且位于可信位置的资源使用它们。

`--no-extensions`、`--no-skills`、`--no-prompt-templates`、`--no-themes` 可关闭相应发现。

扩展加载、事件和 API 见[扩展](extensions.md)。

技能格式与 `/skill:name` 见[技能](skills.md)。

模板语法见[提示模板](prompt-templates.md)，主题格式见[主题](themes.md)。

不要将 CoCo 的 `settings.json`、`models.json`、`auth.json` 或 managed state 放入版本控制。

## 诊断、核心检查、bootstrap 与迁移

先运行本地诊断以排查安装、权限、所有权、提示所有权、认证状态和打包 guard：

```bash
coco doctor
```

需要结构化结果：

```bash
coco doctor --json
```

`coco doctor --connectivity` 请求提供商连通性检查；离线时会明确报告跳过，不会暗中打开网络。

检查本地核心身份和版本：

```bash
coco core status
```

检查核心并尝试与注册表比较：

```bash
coco core check
```

默认离线状态下，`core check` 的注册表检查会被标为跳过或不确定；这不代表本地完整性失败。

`coco manage bootstrap` 初始化 CoCo 管理的状态和受管基线。

先预览其效果：

```bash
coco manage bootstrap --dry-run --json
```

确认执行：

```bash
coco manage bootstrap --yes
```

`coco manage migrate` 用于将旧状态迁移到当前 CoCo 状态结构。

同样应先预览：

```bash
coco manage migrate --dry-run --json
coco manage migrate --yes
```

迁移可能标记需要重新轮换的提供商；之后用 `coco manage auth status` 查看并重新设置相应密钥。

不要手动编辑 `ownership.json`、事务目录或目录元数据来绕过检查；请用 bootstrap、migrate 或 doctor 找到可恢复的状态。

## 故障排除

| 现象或错误 | 可能原因 | 建议操作 |
|---|---|---|
| `coco: API_KEY_ARG_FORBIDDEN` | 使用了 `--api-key` | 删除该参数，改用 `coco manage auth set`、`--stdin` 或当前进程环境变量 |
| `coco: UPDATE_COMMAND_FORBIDDEN` | 运行了 `coco update` | 重新运行稳定安装程序升级 |
| `NATIVE_USAGE` | 原生命令语法、提供商或选项无效 | 运行 `coco --help`，只使用原生表列出的参数 |
| `CONFIRMATION_REQUIRED` | 无 TTY 下执行改变状态的命令 | 确认意图后加 `--yes`，或使用 `--dry-run` |
| `AUTH_TTY_UNAVAILABLE` | 交互式密钥输入不在 TTY | 用受保护的标准输入和 `--stdin` |
| `AUTH_CONFIRMATION_MISMATCH` | 两次隐藏输入不同 | 重新执行设置，仔细输入两次 |
| `AUTH_KEY_INVALID` | 密钥为空、带换行/空白、NUL 或过大 | 提供单行有效密钥；不要包含前后空白 |
| `AUTH_PROVIDER_INVALID` | 不是五个受管理提供商之一 | 使用 `agnes`、`idepub`、`achai`、`stepfun` 或 `deepseek` |
| 模型未出现在 `/model` | 没有认证、模型未注册或目录未同步 | 运行 `coco manage auth status`，再检查 `--list-models` 或同步目录 |
| 模型同步失败 | 离线、网络、凭据、目录响应或完整性问题 | 检查网络和认证，运行 `coco doctor`；不要用 `--allow-empty` 掩盖异常 |
| `EMPTY_CATALOG_REJECTED` | 同步得到空模型列表 | 修复提供商或网络问题；仅在确认空目录正确时使用 `--allow-empty` |
| `PROJECT_RESOURCE_PREFLIGHT_FAILED` | 当前项目含不符合 CoCo 资源策略的可执行资源或预检失败 | 不要尝试让项目资源加载；检查仓库资源类型与 CoCo 安全策略 |
| `STATE_PERMISSION_INVALID` | 状态目录或文件权限不安全 | 确认 `~/.coco/agent` 由当前用户拥有且不对组/其他用户开放 |
| `UNOWNED_SYSTEM_OVERRIDE` 或提示所有权失败 | 全局提示覆盖或受管附加提示已漂移 | 先运行 `coco doctor`，再按诊断使用 bootstrap 或审查全局文件 |
| core check 显示注册表跳过 | CoCo 正在离线启动 | 若需要远程比较，使用 `PI_OFFLINE=0 coco core check` |
| 工具动作被确认或拒绝 | CoCo guard 命中尽力而为规则 | 审查操作；guard 不是沙箱，敏感工作应移入真实隔离环境 |
| 项目扩展或 `.pi` 设置未生效 | CoCo 的 global-only 策略 | 将已审阅资源移到 CoCo 全局目录，或不要依赖该项目资源 |

诊断输出会避免回显秘密；如需共享结果，仍应先审阅其中是否包含路径、项目名或其他敏感元数据。

## 卸载

使用发行版附带的 `uninstall.sh` 卸载。

该脚本会识别受 CoCo 管理的安装，删除安装目录、CoCo 的 XDG 配置/缓存/状态目录、受管理启动器和安装临时目录。

它会删除默认 `~/.coco` 安装，因此其中包括 `~/.coco/agent` 内的认证、模型、会话及其他用户状态。

卸载前如需保留会话或配置，请先自行审阅并备份所需内容到安全位置。

脚本拒绝删除无法识别的安装、`HOME`、根目录或状态目录祖先，以避免错误删除。

如果 `/usr/local/bin/coco` 需要特权才能删除，脚本会在可用时请求 `sudo`；否则会提示需要相应权限。

卸载后若仍可运行 `coco`，脚本会报告另一个可执行文件仍在 `PATH` 中；检查 `command -v coco` 的输出，避免误删非 CoCo 管理的程序。

## 快速命令清单

```bash
# 启动与帮助
coco
coco --help
coco --version

# 单次回答和模型
coco -p "解释这个错误"
coco --list-models
coco --provider deepseek --model deepseek-v4-pro "审查代码"

# 认证
coco manage auth set idepub
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
coco manage auth status
coco manage auth remove idepub --yes

# 受管理模型
coco manage models sync
coco manage models sync --provider agnes --yes --json

# 诊断与状态维护
coco doctor
coco doctor --connectivity --json
coco core status
PI_OFFLINE=0 coco core check
coco manage bootstrap --dry-run --json
coco manage migrate --dry-run --json

# 会话与自动化
coco -c
coco -r
coco --no-session -p "一次性分析"
coco --mode json "列出文件"
coco --mode rpc
```

交互界面内的快速命令：

```text
/model
/settings
/resume
/tree
/compact
/goal set 为发布准备修复并验证测试
/goal plan
/goal done 1
/goal status
```

## 本地参考

以下链接均为本仓库内的详细参考；若与本手册冲突，优先使用 CoCo 专用页面。

- [CoCo CLI](coco-cli.md)：安装、离线、原生命令、认证和 `/goal` 的简明权威参考。
- [CoCo 安全](coco-security.md)：全局资源策略、guard 限制和目标的安全边界。
- [设置](settings.md)：Pi 兼容设置字段、界面、重试、压缩和资源配置细节；将其中 `~/.pi/agent` 路径替换为 CoCo 全局路径，并忽略项目本地加载说明。
- [自定义模型](models.md)：`models.json`、兼容 API、模型字段与本地服务配置。
- [会话](sessions.md)：恢复选择器、会话树、分支和删除行为。
- [上下文压缩](compaction.md)：自动压缩、手动压缩和分支总结。
- [JSON 事件流模式](json.md)：JSONL 输出事件和脚本示例。
- [RPC 模式](rpc.md)：无头协议、所有命令和事件。
- [扩展](extensions.md)：扩展 API；仅采用适用于 CoCo 全局扩展的部分。
- [技能](skills.md)：技能格式与命令使用；仅放在 CoCo 全局位置。
- [提示模板](prompt-templates.md)：模板格式与调用方式；仅使用 CoCo 全局模板。
- [主题](themes.md)：主题创建和选择。
- [键绑定](keybindings.md)：快捷键查找和自定义。
- [环境变量](environment-variables.md)：Pi 兼容环境变量；CoCo 的认证和目录变量以本手册为准。
- [容器化](containerization.md)：为不可信或高风险工作建立真实隔离环境。
- [终端设置](terminal-setup.md)：终端快捷键与 Windows 终端配置。

使用 `coco --help` 核对当前安装版本实际支持的 CoCo 原生命令；对转发的 Pi 兼容功能，再查对应本地参考页面。
