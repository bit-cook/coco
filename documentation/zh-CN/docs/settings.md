# 设置

Pi 使用 JSON 设置文件，项目设置覆盖全局设置。

|地点|范围|
|----------|-------|
|`~/.pi/agent/settings.json`|全球（所有项目）|
|`.pi/settings.json`|项目（当前目录）|

直接编辑或使用`/settings`作为常用选项。

## 项目信托

在交互式启动时，pi 在信任包含项目本地设置、资源或项目 `.agents/skills` 的项目文件夹之前会询问，并且在 `~/.pi/agent/trust.json` 中没有保存该文件夹或父文件夹的决定。信任项目允许 pi 加载 `.pi/settings.json` 和 `.pi` 资源、安装缺少的项目包以及执行项目扩展。

非交互模式（`-p`、`--mode json`和`--mode rpc`）不显示信任提示。如果没有适用的已保存信任决策，他们将使用全局设置中的`defaultProjectTrust`：`ask`（默认）和`never`忽略这些项目资源，而`always`信任它们。通过 `--approve`/`-a` 或 `--no-approve`/`-na` 覆盖一次运行的项目信任。

如果没有适用扩展或保存的决定，则`defaultProjectTrust`控制后备行为。将`~/.pi/agent/settings.json`中的`"ask"`、`"always"`或`"never"`设置为`"ask"`、`"always"`或`"never"`，或用`/settings`更改。

`pi config` 和包命令使用相同的项目信任流程，但 `pi update` 从不提示。传递 `--approve` 信任一个命令的项目本地设置，或传递 `--no-approve` 忽略它们。

在交互模式下使用 `/trust` 保存项目信任决策以供将来的会话使用，包括对直接父文件夹的信任。只写`~/.pi/agent/trust.json`；当前会话不会重新加载，因此请重新启动 pi 以使更改生效。

## 所有设置

### 模型与思考

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`defaultProvider`|细绳|-|默认提供商（例如，`"anthropic"`、`"openai"`）|
|`defaultModel`|细绳|-|默认型号 ID|
|`defaultThinkingLevel`|细绳|-|`"off"`、`"minimal"`、`"low"`、`"medium"`、`"high"`、`"xhigh"`、`"max"`|
|`hideThinkingBlock`|布尔值|`false`|在输出中隐藏思维块|
|`showCacheMissNotices`|布尔值|`false`|显示重大提示缓存未命中的记录通知|
|`thinkingBudgets`|目的|-|每个思维级别的自定义代币预算|

#### 思考预算

```json
{
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  }
}
```

### 用户界面与显示

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`theme`|细绳|`"dark"`|主题名称（`"dark"`、`"light"`或自定义）|
|`externalEditor`|细绳|`$VISUAL`，然后`$EDITOR`，然后 Windows 上的记事本或 `nano` 其他地方|Ctrl+G 外部编辑器的命令；优先于环境变量|
|`quietStartup`|布尔值|`false`|隐藏启动标头|
|`defaultProjectTrust`|细绳|`"ask"`|后备项目信任行为：`"ask"`、`"always"`或`"never"`。仅全局设置|
|`collapseChangelog`|布尔值|`false`|更新后显示精简的变更日志|
|`enableInstallTelemetry`|布尔值|`true`|首次安装或更改日志检测到的更新后发送匿名安装/更新版本 ping。这不控制更新检查|
|`enableAnalytics`|布尔值|`false`|选择加入分析数据共享。目前仅在实验性首次设置期间要求 (`PI_EXPERIMENTAL=1`)|
|`trackingId`|细绳|-|分析跟踪标识符，在打开 `enableAnalytics` 时生成|
|`doubleEscapeAction`|细绳|`"tree"`|双转义动作：`"tree"`、`"fork"`或`"none"`|
|`treeFilterMode`|细绳|`"default"`|`/tree` 的默认过滤器：`"default"`、`"no-tools"`、`"user-only"`、`"labeled-only"`、`"all"`|
|`editorPaddingX`|数字|`0`|输入编辑器的水平填充（0-3）|
|`outputPad`|数字|`1`|用户消息、辅助消息和思考的水平填充（0 或 1）|
|`autocompleteMaxVisible`|数字|`5`|自动完成下拉列表中的最大可见项目数 (3-20)|
|`showHardwareCursor`|布尔值|`false`|当 TUI 定位终端光标以支持 IME 时显示终端光标|

对于 VS Code，请包含 `--wait`，以便 pi 在编辑器退出后恢复：

```json
{
  "externalEditor": "code --wait"
}
```

### 遥测和更新检查

`enableInstallTelemetry` 仅控制对`https://pi.dev/api/report-install` 的匿名安装/更新 ping。选择退出遥测不会禁用更新检查； Pi 仍然可以获取 `https://pi.dev/api/latest-version` 来查找最新版本。

设置 `PI_SKIP_VERSION_CHECK=1` 禁用 Pi 版本更新检查。使用 `--offline` 或 `PI_OFFLINE=1` 禁用此处描述的所有启动网络操作，包括更新检查、包更新检查和安装/更新遥测。

### 网络

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`httpProxy`|细绳|-|HTTP 代理 URL 应用为 `HTTP_PROXY` 和 `HTTPS_PROXY`。仅全局设置。|

```json
{
  "httpProxy": "http://127.0.0.1:7890"
}
```

### 警告

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`warnings.anthropicExtraUsage`|布尔值|`true`|当 Anthropic 订阅身份验证可能使用付费额外使用时显示警告|

```json
{
  "warnings": {
    "anthropicExtraUsage": false
  }
}
```

### 压实

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`compaction.enabled`|布尔值|`true`|启用自动压缩|
|`compaction.reserveTokens`|数字|`16384`|为 LLM 响应保留的令牌|
|`compaction.keepRecentTokens`|数字|`20000`|最近要保留的令牌（未汇总）|

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

### 分行概要

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`branchSummary.reserveTokens`|数字|`16384`|为分支汇总保留的令牌|
|`branchSummary.skipPrompt`|布尔值|`false`|跳过“总结分支？” `/tree`导航提示（默认无摘要）|

### 重试

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`retry.enabled`|布尔值|`true`|对暂时性错误启用自动代理级重试|
|`retry.maxRetries`|数字|`3`|最大代理级别重试尝试次数|
|`retry.baseDelayMs`|数字|`2000`|代理级指数退避的基本延迟（2s、4s、8s）|
|`retry.provider.timeoutMs`|数字|SDK默认|提供商/SDK 请求超时（以毫秒为单位）|
|`retry.provider.maxRetries`|数字|`0`|提供商/SDK 重试尝试|
|`retry.provider.maxRetryDelayMs`|数字|`60000`|失败前服务器请求的最大延迟（60 秒）|

当提供者请求重试延迟超过`retry.provider.maxRetryDelayMs`时，请求会立即失败并出现信息性错误，而不是静默等待。将其设置为 `0` 以禁用限制。

将 `retry.provider.maxRetries` 保持在 `0` 除非明确需要提供者级重试。将其设置为高于 `0` 可以使 SDK/提供程序在 Pi 看到错误之前重试处理超出使用限制的错误，这可能会阻止代理，直到在某些情况下提供程序配额重置。

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "timeoutMs": 3600000,
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  }
}
```

### 消息传递

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`steeringMode`|细绳|`"one-at-a-time"`|如何发送转向消息：`"all"` 或 `"one-at-a-time"`|
|`followUpMode`|细绳|`"one-at-a-time"`|如何发送后续消息：`"all"` 或 `"one-at-a-time"`|
|`transport`|细绳|`"auto"`|支持多种传输的提供商的首选传输：`"sse"`、`"websocket"`、`"websocket-cached"`或`"auto"`|
|`httpIdleTimeoutMs`|数字|`300000`|HTTP header/body 空闲超时（以毫秒为单位），也由具有显式流空闲超时的提供者使用。设置为 `0` 禁用。|
|`websocketConnectTimeoutMs`|数字|`15000`|对于支持 WebSocket 传输的提供程序，WebSocket 连接/打开握手超时（以毫秒为单位）。设置为 `0` 禁用。|

### 终端与图像

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`terminal.showImages`|布尔值|`true`|在终端中显示图像（如果支持）|
|`terminal.imageWidthCells`|数字|`60`|终端单元格中的首选内联图像宽度|
|`terminal.clearOnShrink`|布尔值|`false`|内容缩小时清除空行（可能导致闪烁）|
|`images.autoResize`|布尔值|`true`|将图像大小调整为最大 2000x2000|
|`images.blockImages`|布尔值|`false`|阻止所有图像发送至 LLM|

### 壳

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`shellPath`|细绳|-|自定义 shell 路径（例如，Windows 上的 Cygwin）；支持主目录前导 `~`|
|`shellCommandPrefix`|细绳|-|每个 bash 命令的前缀（例如，`"shopt -s expand_aliases"`）|
|`npmCommand`|细绳[]|-|用于 npm 包查找/安装操作的命令 argv（例如，`["mise", "exec", "node@20", "--", "npm"]`）|

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

`npmCommand` 用于所有 npm 包管理器操作，包括安装、卸载以及 git 包内的依赖项安装。用户范围的 npm 软件包安装在 `~/.pi/agent/npm/` 下；项目范围的 npm 包安装在 `.pi/npm/` 下。完全按照应启动的流程使用 argv 样式条目。配置 `npmCommand` 时，git 包依赖项安装使用普通 `install` 以避免包装器或备用包管理器中的 npm 特定标志。

### 会议

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`sessionDir`|细绳|-|存储会话文件的目录。接受绝对路径或相对路径，加上`~`。|

```json
{ "sessionDir": ".pi/sessions" }
```

当多个源指定会话目录时，settings.json 中的优先级为`--session-dir`、`PI_CODING_AGENT_SESSION_DIR`，然后是`sessionDir`。

### 模型自行车

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`enabledModels`|细绳[]|-|Ctrl+P 循环的模型模式（与 `--models` CLI 标志相同的格式）|

```json
{
  "enabledModels": ["claude-*", "gpt-4o", "gemini-2*"]
}
```

### 降价

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`markdown.codeBlockIndent`|细绳|`"  "`|代码块的缩进|

### 资源

这些设置定义从何处加载扩展、技能、提示和主题。

`~/.pi/agent/settings.json` 中的路径相对于 `~/.pi/agent` 进行解析。 `.pi/settings.json` 中的路径相对于`.pi` 进行解析。支持绝对路径和`~`。

|环境|类型|默认|描述|
|---------|------|---------|-------------|
|`packages`|大批|`[]`|用于加载资源的 npm/git 包|
|`extensions`|细绳[]|`[]`|本地扩展文件路径或目录|
|`skills`|细绳[]|`[]`|本地技能文件路径或目录|
|`prompts`|细绳[]|`[]`|本地提示模板路径或目录|
|`themes`|细绳[]|`[]`|本地主题文件路径或目录|
|`enableSkillCommands`|布尔值|`true`|将技能注册为`/skill:name`命令|

数组支持 glob 模式和排除。使用`!pattern`排除。使用 `+path` 强制包含精确路径，使用 `-path` 强制排除精确路径。

#### 包

字符串形式加载包中的所有资源：

```json
{
  "packages": ["pi-skills", "@org/my-extension"]
}
```

对象形式过滤要加载的资源：

```json
{
  "packages": [
    {
      "source": "pi-skills",
      "skills": ["brave-search", "transcribe"],
      "extensions": []
    }
  ]
}
```

有关包管理的详细信息，请参阅 [packages.md](packages.md)。

## 例子

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultThinkingLevel": "medium",
  "theme": "dark",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3
  },
  "enabledModels": ["claude-*", "gpt-4o"],
  "warnings": {
    "anthropicExtraUsage": true
  },
  "packages": ["pi-skills"]
}
```

## 项目覆盖

项目设置 (`.pi/settings.json`) 覆盖全局设置。嵌套对象被合并：

```json
// ~/.pi/agent/settings.json (global)
{
  "theme": "dark",
  "compaction": { "enabled": true, "reserveTokens": 16384 }
}

// .pi/settings.json (project)
{
  "compaction": { "reserveTokens": 8192 }
}

// Result
{
  "theme": "dark",
  "compaction": { "enabled": true, "reserveTokens": 8192 }
}
```
