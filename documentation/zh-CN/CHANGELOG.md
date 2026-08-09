# 更新日志

## [0.2.0] - 2026-08-09

- 新增原生 Subagents、持久后台与工作树任务、定时任务、认证 Webhook 和 GitHub 事件触发。
- 新增本地可视化控制后台、令牌认证远程控制 API、原生 MCP 客户端和 VS Code 客户端。
- 新增运行中 Agent/PID 查看，以及通过 `coco task active` 和 `coco task stop-all` 验证完整进程组终止。

## [0.82.1] - 2026-07-25

### 新功能

- **Claude Opus 5** — 已在 Anthropic 和 Amazon Bedrock 上提供，支持自适应思考（包括 `xhigh`）、推理配置文件和提示缓存。参见 [提供商](docs/providers.md#api-keys)。
- **Anthropic 网关 Bearer 认证** — `ANTHROPIC_AUTH_TOKEN` 可针对要求 `Authorization: Bearer` 的 Anthropic 兼容网关进行认证，包括压缩和分支摘要。参见 [环境变量或认证文件](docs/providers.md#environment-variables-or-auth-file)。
- **更快、更具韧性的模型目录** — pi.dev 目录通过 `If-None-Match` 重新验证，未变化的提供商返回空的 `304`，llama.cpp 模型也会在重启后继续列出。参见 [llama.cpp](docs/llama-cpp.md)。

### 新增

- 向自定义消息渲染器公开了 `outputPad` 设置。参见 [扩展](docs/extensions.md)（[#7045](https://github.com/earendil-works/pi/pull/7045)，作者 [@xl0](https://github.com/xl0)）。
- 为 Anthropic 兼容网关新增继承的 `ANTHROPIC_AUTH_TOKEN` Bearer 认证。参见 [提供商](docs/providers.md#environment-variables-or-auth-file)（[#5871](https://github.com/earendil-works/pi/issues/5871)）。
- 为 Anthropic 和 Amazon Bedrock 新增继承的 Claude Opus 5 支持，包含自适应思考、推理配置文件、提示缓存，以及保留的 AWS 验证消息（[#7081](https://github.com/earendil-works/pi/pull/7081)，作者 [@unexge](https://github.com/unexge)，[#7083](https://github.com/earendil-works/pi/pull/7083)，作者 [@davidbrai](https://github.com/davidbrai)）。

### 变更

- 将 pi.dev 模型目录刷新改为使用 `If-None-Match` 重新验证，因此未变化的提供商目录返回空的 `304`，而非完整下载。
- 将继承的 Radius OAuth 设备授权、令牌交换和刷新请求改为直接使用配置的网关。
- 将继承的模型加载错误改为附加底层原因，因此诸如 `OAuth refresh failed for openai-codex` 的认证失败会报告提供商响应，而不只是包装消息。

### 修复

- 修复了认证完全解析为请求头的提供商的压缩和分支摘要（[#5871](https://github.com/earendil-works/pi/issues/5871)）。
- 修复了作用域模型不可用时会从 `/models` 隐藏的问题，现在无需手动编辑设置即可移除（[#6949](https://github.com/earendil-works/pi/issues/6949)，[#7032](https://github.com/earendil-works/pi/pull/7032)，作者 [@christianklotz](https://github.com/christianklotz)）。
- 修复了启动上下文文件发现：跳过与 `AGENTS.md` 等上下文文件名匹配的目录，避免产生 `EISDIR` 警告（[#7106](https://github.com/earendil-works/pi/pull/7106)，作者 [@mrexodia](https://github.com/mrexodia)）。
- 修复了 llama.cpp 扩展以持久化模型目录，使 llama.cpp 模型在首次成功刷新前仍会列出。参见 [llama.cpp](docs/llama-cpp.md)（[#7072](https://github.com/earendil-works/pi/pull/7072)，作者 [@davidbrai](https://github.com/davidbrai)）。

## [0.82.0] - 2026-07-24

### 新功能

- **受约束的工具采样** — 工具可偏好或要求严格 JSON Schema 采样，或使用 OpenAI Lark/regex 语法；模型能力元数据会阻止不受支持的请求。参见 [工具的受约束采样](../ai/README.md#constrained-sampling-for-tools)。
- **OpenRouter 和 Kimi Code 登录** — 使用 `/login` 授权 OpenRouter 或 Kimi Code 订阅，无需手动配置 API 密钥。参见 [OpenRouter](docs/providers.md#openrouter)。
- **感知会话的流式 bash 集成** — Bash 工具接收当前会话/模型元数据，直接 RPC bash 命令则流式传输关联输出。参见 [Bash 工具会话环境](docs/environment-variables.md#bash-tool-session-environment) 和 [RPC bash 事件](docs/rpc.md#bash_execution_update)。

### 新增

- 在 OpenAI、Anthropic、Amazon Bedrock、Google Gemini 和 Mistral 中新增继承的 `Tool.constrainedSampling`，支持严格 JSON Schema（`prefer`/`require`）及 OpenAI Lark/regex 语法变体。参见 [工具的受约束采样](../ai/README.md#constrained-sampling-for-tools)。
- 新增继承的 `supportsGrammarTools` 和 `supportsStrictTools` 兼容性标志，扩展 `supportsStrictMode` 覆盖范围，并生成模型能力元数据以控制受约束采样。
- 为 Kimi For Coding 提供商新增继承的 Kimi Code 订阅 OAuth 登录，包含设备授权和自动令牌刷新（[#6935](https://github.com/earendil-works/pi/pull/6935)，作者 [@zaycruz](https://github.com/zaycruz)）。
- 通过 `/login` 新增继承的 OpenRouter OAuth PKCE 登录，生成用户控制的 API 密钥。参见 [OpenRouter](docs/providers.md#openrouter)（[#6927](https://github.com/earendil-works/pi/pull/6927)，作者 [@rsaryev](https://github.com/rsaryev)）。
- 将 `PI_SESSION_ID`、`PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL` 和 `PI_REASONING_LEVEL` 公开给内置及工厂创建 bash 工具运行的命令。参见 [Bash 工具会话环境](docs/environment-variables.md#bash-tool-session-environment)。
- 为直接 RPC bash 命令新增流式 `bash_execution_update` 事件，并与请求 ID 关联。参见 [RPC bash 事件](docs/rpc.md#bash_execution_update)（[#6971](https://github.com/earendil-works/pi/pull/6971)，作者 [@ananthakumaran](https://github.com/ananthakumaran)）。

### 变更

- 将继承的生成模型目录改为仅公开来自 models.dev、经提供商验证的推理工作量级别（[#6928](https://github.com/earendil-works/pi/pull/6928)，作者 [@davidbrai](https://github.com/davidbrai)）。

### 修复

- 修复继承的 `getaddrinfo`、`ENOTFOUND` 和 `EAI_AGAIN` 等 DNS 查询失败，使其触发自动助手重试（[#6946](https://github.com/earendil-works/pi/pull/6946)，作者 [@christianklotz](https://github.com/christianklotz)）。
- 修复继承的 OpenRouter Anthropic 缓存断点，使其经过工具结果推进，并为 `~anthropic/*-latest` 别名启用缓存控制（[#6941](https://github.com/earendil-works/pi/pull/6941)，作者 [@mteam88](https://github.com/mteam88)）。
- 修复继承的 OpenAI Codex WebSocket 会话，在 `previous_response_not_found` 错误后缺少先前响应续接时重试一次（[#6955](https://github.com/earendil-works/pi/pull/6955)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复 TUI 调试和崩溃日志，使其遵守自定义代理目录而非始终写入 `~/.pi/agent`（[#6958](https://github.com/earendil-works/pi/pull/6958)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复系统临时目录有大量条目时 Ctrl+G 外部编辑器启动缓慢的问题（[#6903](https://github.com/earendil-works/pi/pull/6903)，作者 [@christianklotz](https://github.com/christianklotz)）。
- 修复包加载同级 npm 扩展时启动资源显示未保留相对路径的问题（[#6964](https://github.com/earendil-works/pi/pull/6964)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复压缩和分支摘要请求：使用新的路由会话 ID，并在支持时禁用提示缓存（[#6618](https://github.com/earendil-works/pi/pull/6618)，作者 [@tmustier](https://github.com/tmustier)）。
- 修复设置 `PI_SKIP_VERSION_CHECK` 时的显式自更新（[#6977](https://github.com/earendil-works/pi/issues/6977)）。
- 修复含方括号的作用域模型 ID，使其在 glob 匹配前解析为字面精确匹配（[#6210](https://github.com/earendil-works/pi/issues/6210)）。
- 修复继承的 OpenAI 和 Anthropic 提供商重试等待，使其遵守中止信号和配置的延迟限制（[#6980](https://github.com/earendil-works/pi/pull/6980)，作者 [@petrroll](https://github.com/petrroll)）。
- 修复全新安装因包文件 mtime 较新而优先使用捆绑模型目录、而非较新远程目录的问题（[#7016](https://github.com/earendil-works/pi/pull/7016)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复继承的编辑器滚动指示器在窄终端溢出的问题（[#7015](https://github.com/earendil-works/pi/pull/7015)，作者 [@christianklotz](https://github.com/christianklotz)）。
- 修复 llama.cpp 模型使用已加载上下文窗口作为输出令牌限制，而非限制为 16K（[#7034](https://github.com/earendil-works/pi/pull/7034)，作者 [@christianklotz](https://github.com/christianklotz)）。
- 修复发布源归档，使其包含构建独立二进制文件所用的生成提供商模型数据。
- 将打包的 `protobufjs` 依赖更新至 7.6.5，以解决 GHSA-j3f2-48v5-ccww（[#7005](https://github.com/earendil-works/pi/issues/7005)）。
- 修复 Wayland 上的 `/copy`：`wl-copy` 失败时回退到 X11 或 OSC 52（[#7009](https://github.com/earendil-works/pi/pull/7009)，作者 [@rkfshakti](https://github.com/rkfshakti)）。
- 修复 `/model`：打开模型选择器时重新加载已更新的 `models.json` 配置（[#6999](https://github.com/earendil-works/pi/issues/6999)）。

## [0.81.1] - 2026-07-21

### 新功能

- **可验证的发布源归档** — GitHub 发布现在包含确定性、带校验和的源归档及重建独立二进制文件的说明。参见 [从发布源构建独立二进制文件](../../README.md#building-standalone-binaries-from-release-source)。
- **具韧性的压缩和分支摘要** — 短暂的提供商失败现在遵循配置的重试策略，交互、JSON、RPC 和 SDK 使用者可获得重试生命周期事件。参见 [压缩和分支摘要](docs/compaction.md) 和 [RPC 重试事件](docs/rpc.md#summarization_retry_scheduled--summarization_retry_attempt_start--summarization_retry_finished)。

### 新增

- 为 GitHub 发布新增确定性、带校验和的源归档及文档化的独立二进制重建说明（[#6913](https://github.com/earendil-works/pi/pull/6913)，作者 [@christianklotz](https://github.com/christianklotz)）。

### 修复

- 修复压缩和分支摘要，使其按配置的重试策略重试短暂提供商失败，并向交互、JSON、RPC 和 SDK 使用者公开重试生命周期事件（[#6901](https://github.com/earendil-works/pi/pull/6901)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复交互式启动：在计算页脚提供商数量时不再等待后台模型目录刷新。
- 恢复使用 0.81 前 agent-core API 的扩展的默认流回退（[#6915](https://github.com/earendil-works/pi/issues/6915)）。
- 修复继承的 Moonshot AI 和 Moonshot AI China Kimi K3 模型，使其使用 OpenAI 思考格式并公开推理工作量支持。

## [0.81.0] - 2026-07-21

### 新功能

- **本地 llama.cpp 模型管理** — 连接 llama.cpp 路由器，搜索和下载 Hugging Face 模型，并以实时进度显式加载或卸载模型。参见 [llama.cpp](docs/llama-cpp.md)。
- **完整提供商扩展** — 扩展可注册包含认证、模型刷新、筛选和自定义流的完整 pi-ai 提供商。参见 [注册新提供商](docs/custom-provider.md#register-new-provider)。
- **Qwen Token Plan 提供商** — 使用具区域端点和 API 密钥认证的内置国际版及中国版订阅提供商。参见 [API 密钥](docs/providers.md#api-keys)。
- **扩展的用量核算** — 工具、压缩和分支摘要用量会持久化并计入会话总数。参见 [压缩和分支摘要](docs/compaction.md)。

### 新增

- 将 Qwen Token Plan 和 Qwen Token Plan China 新增至内置提供商设置、默认模型解析和提供商文档（[#6858](https://github.com/earendil-works/pi/pull/6858)，作者 [@QuintinShaw](https://github.com/QuintinShaw)）。
- 新增 `get_available_thinking_levels` RPC 命令和 `RpcClient.getAvailableThinkingLevels()` 方法（[#6865](https://github.com/earendil-works/pi/pull/6865)，作者 [@cristinaponcela](https://github.com/cristinaponcela)）。
- 从包根导出消息和工具执行生命周期事件类型（[#6772](https://github.com/earendil-works/pi/pull/6772)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 新增内置 llama.cpp 路由器支持，提供 `/login` 连接设置以及 `/llama` Hugging Face 模型搜索、下载、显式加载、卸载和实时进度。参见 [llama.cpp](docs/llama-cpp.md)。
- 新增对完整 pi-ai 提供商的扩展注册，包含原生认证、模型刷新、筛选和流式行为。
- 为持久会话、页脚总计和会话统计新增工具、压缩和分支摘要的用量核算（[#6671](https://github.com/earendil-works/pi/pull/6671)，作者 [@davidbrai](https://github.com/davidbrai)）。

### 修复

- 将打包的 `brace-expansion` 依赖更新至 5.0.7（[#6896](https://github.com/earendil-works/pi/pull/6896)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复持久远程模型目录在升级后覆盖较新捆绑目录的问题。
- 修复继承的已存 API 密钥凭据应用提供商作用域 `env` 值的问题，包括 Amazon Bedrock 配置文件（[#6864](https://github.com/earendil-works/pi/pull/6864)，作者 [@cristinaponcela](https://github.com/cristinaponcela)）。
- 修复继承的 OpenAI 兼容跨提供商重放：多个调用共享提供商调用 ID 时保持工具调用 ID 唯一（[#6854](https://github.com/earendil-works/pi/pull/6854)，作者 [@cristinaponcela](https://github.com/cristinaponcela)）。
- 修复继承的 Kimi K3 思考级别，公开 low、high 和 max，并将 `k2p7` 别名规范化为 `kimi-for-coding`。
- 修复经 OpenAI Responses API 路由的继承 OpenCode Go 模型。
- 修复继承的 `pi-ai` 包元数据，避免反复变更使用者锁文件（[#6812](https://github.com/earendil-works/pi/pull/6812)，作者 [@jmfederico](https://github.com/jmfederico)）。
- 修复继承的终端关闭：恢复硬件光标前清除编辑器反色软件光标（[#6790](https://github.com/earendil-works/pi/pull/6790)，作者 [@dam9000](https://github.com/dam9000)）。
- 修复继承的 ANSI 感知文本换行，使其识别 CRLF 和 CR 行尾并保留样式（[#6764](https://github.com/earendil-works/pi/pull/6764)，作者 [@xz-dev](https://github.com/xz-dev)）。
- 修复继承的编辑器粘贴注册表：删除并撤销粘贴标记后不再损坏，避免提交的提示中出现字面或不匹配粘贴标记（[#6844](https://github.com/earendil-works/pi/issues/6844)）。
- 修复无会话 OpenAI Codex WebSocket 请求使用 UUIDv7 请求 ID（[#6834](https://github.com/earendil-works/pi/pull/6834)，作者 [@xl0](https://github.com/xl0)）。
- 修复继承的 GPT-5.6 Codex 模型默认使用 272K 上下文窗口，避免自动长上下文定价（[#6853](https://github.com/earendil-works/pi/pull/6853)，作者 [@aadishv](https://github.com/aadishv)）。
- 修复压缩期间排队的消息，以保留引导和后续交付行为（[#6730](https://github.com/earendil-works/pi/pull/6730)，作者 [@dannote](https://github.com/dannote)）。
- 修复 read 工具错误被当作文件内容进行语法高亮的问题（[#6731](https://github.com/earendil-works/pi/pull/6731)，作者 [@dannote](https://github.com/dannote)）。
- 修复 llama.cpp 路由器下载进度更新，并从模型操作确认中移除冗余措辞。
- 将自动模型目录网络刷新从启动初始化移至正在运行的交互和 RPC 模式。
- 修复打开持久会话时被读取和解析两次的问题，降低大型会话启动延迟（[#6793](https://github.com/earendil-works/pi/issues/6793)）。
- 修复所有参数的提示模板默认值（`${@:-default}` 和 `${ARGUMENTS:-default}`）（[#6695](https://github.com/earendil-works/pi/issues/6695)）。
- 修复扩展文档中过时的自定义 UI、自定义工具和自定义编辑器示例（[#6735](https://github.com/earendil-works/pi/issues/6735)）。
- 修复 Kimi Coding 会话显示含订阅指示器的 API 等效隐含成本。
- 修复 OpenAI Responses 过早结束的流，使其触发自动重试而不是结束代理运行（[#6727](https://github.com/earendil-works/pi/issues/6727)）。

## [0.80.10] - 2026-07-16

### 新功能

- **Kimi Coding 思考兼容性** — Kimi Coding 模型现可正确使用自适应思考；K3 公开其支持的 `max` 级别，并支持重放空签名的思考块。参见 [Kimi For Coding 设置](docs/providers.md#api-keys) 和 [模型选项](docs/usage.md#model-options)。

### 修复

- 修复继承的 Kimi Coding 请求：使用不带令牌预算的 Anthropic 自适应思考工作量，并为 K3 和 `kimi-for-coding` 启用空思考签名。
- 修复继承的 Moonshot AI 和 Moonshot AI China Kimi K3 定价元数据。
- 修复继承的 Kimi Coding K3 思考级别元数据，仅公开支持的 `max` 级别（[#6737](https://github.com/earendil-works/pi/issues/6737)）。
- 修复继承的目录生成，恢复在 0.80.9 中移除的 xAI 模型（[#6736](https://github.com/earendil-works/pi/issues/6736)）。

## [0.80.9] - 2026-07-16

### 新功能

- **Kimi K3 和延迟工具加载** — 跨内置提供商使用 Kimi K3，包含通过 Kimi 原生协议逐步激活扩展工具。参见 [动态工具加载](docs/extensions.md#dynamic-tool-loading)、[OpenAI 兼容性](docs/models.md#openai-compatibility) 和 [`kimi-deferred-tools.ts`](examples/extensions/kimi-deferred-tools.ts) 示例。

### 新增

- 为 Kimi Coding、Moonshot AI、Moonshot AI China、OpenRouter 和 Vercel AI Gateway 新增继承的 Kimi K3 支持。
- 新增 Kimi 延迟工具加载以支持扩展驱动的工具激活。参见 [动态工具加载](docs/extensions.md#dynamic-tool-loading)、[OpenAI 兼容性](docs/models.md#openai-compatibility) 和 [`kimi-deferred-tools.ts`](examples/extensions/kimi-deferred-tools.ts) 示例。

### 变更

- 将 xAI 登录改为使用预填的设备授权链接，标签为“使用 SuperGrok 或 X Premium 登录”，并将默认 xAI 模型改为 Grok 4.5（[#6734](https://github.com/earendil-works/pi-mono/pull/6734)，作者 [@Jaaneek](https://github.com/Jaaneek)）。

### 修复

- 修复继承的 Vercel AI Gateway 和 OpenRouter 模型的 Kimi K3 输出限制。
- 修复在首次助手响应前克隆或派生会话时，说明必须先保存会话。

### 移除

- 从内置 xAI 模型目录移除 Grok 3、Grok 3 Fast、Grok 4.20 变体和 Grok Code Fast 1（[#6734](https://github.com/earendil-works/pi-mono/pull/6734)，作者 [@Jaaneek](https://github.com/Jaaneek)）。

## [0.80.8] - 2026-07-16

### 新功能

- **统一模型运行时和提供商认证** — `ModelRuntime` 集中处理模型配置、提供商拥有的 `/login` 和动态提供商目录。参见 [提供商](docs/providers.md)。
- **实时模型目录刷新** — `/model` 在后台刷新已配置提供商，`pi update --models` 强制立即刷新。参见 [安装和管理](docs/packages.md#install-and-manage)。
- **xAI 设备码 OAuth 和 Grok 4.5 Responses 支持** — 使用设备码登录 xAI，并使用低、中或高思考级别的 Grok 4.5。参见 [xAI](docs/providers.md#xai-grokx-subscription)。

### 破坏性变更

- 将 SDK 的 `CreateAgentSessionOptions.authStorage` 和 `modelRegistry` 选项替换为异步 `modelRuntime` 选项。`AuthStorage` 及其存储后端不再导出；请使用 `ModelRuntime`（或自定义 pi-ai `CredentialStore`），或使用 `readStoredCredential()` 一次性读取 auth.json。
- 移除冗余的 `ModelRuntime.getAll()`、`find()`、`getSnapshot()` 和 `getAuthOptions()` 投影。请直接使用 pi-ai `Models` 方法 `getModels()`、`getModel()`、`getProviders()` 和 `checkAuth()`。
- 通过 `ModelRegistry.getApiKeyAndHeaders()` 组装 SDK 请求认证的方式替换为 `ModelRuntime.getAuth()`。传入提供商 ID 返回提供商作用域认证；传入模型还会解析内置、`models.json` 和扩展模型头。
- 将面向扩展的 `ModelRegistry.refresh()` 从同步 `void` 改为 `Promise<void>`，因为 `models.json` 加载是异步的。扩展必须在进行同步注册表读取前 await 它。
- 将规范的动态目录刷新移至异步 `ModelRuntime.refresh()`/pi-ai `Models.refresh()`。旧版扩展 OAuth `modifyModels` 在凭据初始化后仍作为同步兼容投影支持。

### 新增

- 新增 `ModelRuntime`，作为规范的异步 SDK 和内部模型/认证门面，同时保留同步、面向扩展的 `ModelRegistry` API。`ModelRuntime.create()` 通过 `credentials` 选项接受任意 pi-ai `CredentialStore`。
- 从已注册的 pi-ai 提供商直接新增提供商拥有的 `/login` 发现功能，包括环境认证状态和信息链接。
- 在 `models-store.json` 中新增文件支持的动态目录、每提供商 pi.dev 目录叠加层，以及 Radius 网关支持，包括从旧版凭据缓存目录的离线迁移。
- 新增扩展提供商 `refreshModels(context)` 支持，用于动态模型发现及可选的提供商控制持久化。
- 新增 `pi update --models`，无需更新 pi 或扩展即可强制立即刷新模型目录。
- 新增继承的 xAI 设备码 OAuth 登录和 Grok 4.5 OpenAI Responses 支持，具备低、中和高思考级别（[#6651](https://github.com/earendil-works/pi-mono/pull/6651)，作者 [@Jaaneek](https://github.com/Jaaneek)）。

### 变更

- 将 `ModelRuntime` 改为通过临时 pi-ai 提供商方法组合内置提供商、不可变 `models.json` 配置和扩展叠加层。
- 将 `ModelRuntime` 改为负责最终请求组装：`getAuth(model)` 包含已配置模型头，流方法仅解析一次认证，`before_provider_headers` 在提供商分派前作为仅 Models 的头转换运行。
- 将 `/model` 改为立即渲染当前模型快照、后台刷新已配置提供商，并用部分结果或超时错误更新打开的选择器。

### 修复

- 修复已配置提供商目录刷新：解析 pi.dev 的模型 ID 键控响应、限制为每四小时一次检查、发送带版本的 pi 用户代理、将未实现路由视为不可用叠加层，并在 `/model` 显示简洁刷新状态。
- 修复相邻助手思考块渲染为一个思考区段。
- 修复继承的长度超过 64 字符的 OpenAI Codex 会话 ID，以符合 API 限制（[#6630](https://github.com/earendil-works/pi-mono/issues/6630)）。
- 修复继承的终端输出，以一致地规范化制表符（[#6697](https://github.com/earendil-works/pi-mono/pull/6697)，作者 [@xz-dev](https://github.com/xz-dev)）。
- 修复检查 npm 包后 Windows 终端标题（[#6629](https://github.com/earendil-works/pi-mono/issues/6629)）。
- 修复 Bun 独立二进制文件，捆绑用于交互登录的 OAuth 适配器。

## [0.80.7] - 2026-07-14

### 破坏性变更

- 从 `models.json` 移除 `openai-responses` `compat.sendSessionIdHeader` 标志。会话亲和行为现由 `compat.sessionAffinityFormat`（`"openai"`、`"openai-nosession"` 或 `"openrouter"`）控制。请将 `sendSessionIdHeader: false` 替换为 `sessionAffinityFormat: "openai-nosession"`（[#6496](https://github.com/earendil-works/pi-mono/pull/6496)，作者 [@petrroll](https://github.com/petrroll)）。

### 新功能

- **缓存友好的动态工具加载** - 扩展可在执行期间添加工具，同时支持的 Anthropic 和 OpenAI Responses 模型保留提示缓存前缀。参见 [动态工具加载](docs/extensions.md#dynamic-tool-loading)。
- **消息复制快捷键** - `Ctrl+X` 可复制记录中最后一条助手消息或 `/tree` 中选定的消息，使较旧和分支消息可直接复制。参见 [显示和消息队列](docs/keybindings.md#display-and-message-queue)。
- **Fable 5 `xhigh` 和 `max` 思考** - 所有生成的提供商目录中均可使用原生 `xhigh` 和 `max` 思考级别。参见 [模型选项](docs/usage.md#model-options)。

### 新增

- 为由工具结果激活的扩展工具新增缓存友好的动态工具加载。支持的 Anthropic 和 OpenAI Responses 模型会在定义可用时加载它们，保留缓存的提示前缀。参见 [动态工具加载](docs/extensions.md#dynamic-tool-loading)（[#6474](https://github.com/earendil-works/pi-mono/pull/6474)）。
- 为所有生成的提供商目录新增继承的 Claude Fable 5 原生 `xhigh` 和 `max` 思考级别（[#6490](https://github.com/earendil-works/pi-mono/pull/6490)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 新增 `Ctrl+X`，用于复制最后一条助手消息或 `/tree` 中选定的消息。
- 为 OpenAI 和 Codex Responses 新增继承的 `toolChoice` 支持，包括必需和命名工具选择（[#6588](https://github.com/earendil-works/pi-mono/pull/6588)，作者 [@xl0](https://github.com/xl0)）。

### 修复

- 修复继承的 OpenRouter 模型上下文窗口，使用顶级提供商的实际上下文长度（[#6481](https://github.com/earendil-works/pi-mono/pull/6481)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复继承的 OpenRouter OpenAI 兼容会话 ID，使用 `x-session-id` 头而非 OpenAI 特定会话亲和字段（[#6496](https://github.com/earendil-works/pi-mono/pull/6496)，作者 [@petrroll](https://github.com/petrroll)）。
- 修复 `Ctrl+V`，当剪贴板不含图像时粘贴剪贴板文本。
- 修复 `/login amazon-bedrock`：提示并保存 Bedrock API 密钥，而非仅显示环境 AWS 凭据设置说明。
- 修复继承的 Amazon Bedrock 环境 AWS 凭据持续使用 SigV4 认证，包括自定义模型 ID（[#6532](https://github.com/earendil-works/pi-mono/pull/6532)，作者 [@ribelo](https://github.com/ribelo)）。
- 修复继承的 Cloudflare Workers AI 和 AI Gateway 认证：已存凭据仅含 API 密钥时使用环境账户和网关 ID（[#6292](https://github.com/earendil-works/pi-mono/pull/6292)，作者 [@markphelps](https://github.com/markphelps)）。
- 修复继承的旧版终端对 `Alt+,`、`Alt+.` 等 Alt+符号组合键的解码（[#6523](https://github.com/earendil-works/pi-mono/pull/6523)，作者 [@ribelo](https://github.com/ribelo)）。
- 修复 GitHub Copilot `mai-code-1-flash-picker` 模型经 `/responses` 端点路由（[#6544](https://github.com/earendil-works/pi-mono/pull/6544)，作者 [@petrroll](https://github.com/petrroll)）。
- 修复分支摘要，使其适用于使用环境认证而非 API 密钥的提供商（[#6595](https://github.com/earendil-works/pi-mono/pull/6595)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复继承的 Amazon Bedrock 错误：报告未处理的提供商停止原因，而非仅 `An unknown error occurred`（[#6598](https://github.com/earendil-works/pi-mono/pull/6598)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复安装包存在冲突 peer 依赖时 npm 包移除的问题（[#6604](https://github.com/earendil-works/pi-mono/pull/6604)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复继承的 Azure OpenAI Responses 推理重放：`encrypted_content` 仅出现在终端响应事件时仍可正常处理（[#6608](https://github.com/earendil-works/pi-mono/pull/6608)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复继承的 Anthropic 兼容代理省略 `message_delta` 事件中的 `usage` 的问题（[#6611](https://github.com/earendil-works/pi-mono/pull/6611)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复继承的 OpenCode OpenAI Responses 模型：省略不支持的 `session-id` 头，同时保留其他缓存亲和数据（[#6645](https://github.com/earendil-works/pi-mono/pull/6645)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 通过从默认提示中移除当前日期，修复跨日期的系统提示缓存失效（[#6621](https://github.com/earendil-works/pi/issues/6621)）。

## [0.80.6] - 2026-07-09

### 新功能

- **`max` 思考级别** - 位于 `xhigh` 之上的新可选思考级别，GPT-5.6 和自适应 Claude 模型原生支持，可通过 CLI（`--thinking max`）、SDK、RPC 和模型选择使用。自定义主题可定义 `thinkingMax`。参见 [CLI 参考](docs/usage.md#cli-reference)。
- **基于输入的定价层级** - 请求级输入令牌定价层级，提供准确的长上下文成本核算（例如 GPT-5.4/5.5/5.6 长上下文费率），也可在 `models.json` 和 `modelOverrides` 中为自定义模型配置。参见 [模型配置](docs/models.md#model-configuration)。

### 新增

- 在 CLI、SDK、RPC、模型选择和主题中新增可选的 `max` 思考级别。自定义主题可定义 `thinkingMax`；现有主题会回退到 `thinkingXhigh`。
- 在 `models.json`、`modelOverrides` 和扩展注册的提供商中，为自定义模型成本新增请求级输入令牌定价层级。
- 为 `shellPath` 设置新增 `~`（主目录）展开（[#6470](https://github.com/earendil-works/pi/pull/6470)，作者 [@aaronkyriesenbach](https://github.com/aaronkyriesenbach)）。

### 修复

- 修复继承的压缩后输出令牌预算：忽略压缩边界前过时的助手用量（[#6464](https://github.com/earendil-works/pi/issues/6464)）。
- 修复继承的 GPT-5.4 和 GPT-5.5 长上下文成本核算，同时保留需要显式覆盖的模型有意设置的 272K 默认上下文限制。
- 修复继承的 GPT-5.6 元数据：直接 OpenAI 请求保持在 272K 短上下文层级，同时公开 Codex 后端的 372K 上下文窗口及长上下文定价，并移除不存在的裸 `gpt-5.6` 别名。
- 修复继承的 Anthropic 消息转换：保留思考文本为空但签名有效的思考块而非丢弃，避免较新 Claude 模型发生思考块错误（[#6457](https://github.com/earendil-works/pi/pull/6457)，作者 [@davidbrai](https://github.com/davidbrai)）。

## [0.80.5] - 2026-07-09

## [0.80.4] - 2026-07-09

### 新功能

- **提示缓存未命中可见性** - 可通过 `showCacheMissNotices` 在记录中显示显著缓存未命中。参见 [模型和思考](docs/settings.md#model--thinking)。
- **项目本地资源配置** - `pi config -l` 和 Tab 切换可管理全局与项目本地包资源。参见 [启用和禁用资源](docs/packages.md#enable-and-disable-resources)。
- **扩展生命周期和提供商钩子** - 扩展可获得 `agent_settled`、`before_provider_headers`、条目渲染器和 `InlineExtension`。参见 [agent_start / agent_end / agent_settled](docs/extensions.md#agent_start--agent_end--agent_settled)、[before_provider_headers](docs/extensions.md#before_provider_headers) 和 [InlineExtension](docs/sdk.md#inlineextension)。
- **新增继承模型和传输支持** - GPT-5.6 元数据、Copilot Claude Sonnet 5 和 zstd Codex SSE 传输可通过继承的提供商支持使用。参见 [提供商](docs/providers.md) 和 [模型选项](docs/usage.md#model-options)。

### 新增

- 为 `gpt-5.6`、`gpt-5.6-sol`、`gpt-5.6-terra` 和 `gpt-5.6-luna` 新增继承的 OpenAI GPT-5.6 模型元数据，以及经验证的 `openai-codex` 对 `gpt-5.6-sol`、`gpt-5.6-terra` 和 `gpt-5.6-luna` 的支持。
- 将继承的 Claude Sonnet 5 新增至 GitHub Copilot 模型目录（[#6200](https://github.com/earendil-works/pi/issues/6200)）。
- 为 OpenAI Codex Responses SSE 传输新增继承的 zstd 请求体压缩。
- 新增 `/login <provider>` 支持及提供商自动补全。
- 为等同 CLI 的模型和作用域模型解析新增公共 SDK 导出（[#6201](https://github.com/earendil-works/pi/issues/6201)）。
- 新增扩展和 RPC `agent_settled` 事件，以及对完全稳定代理运行的会话级空闲等待（[#6363](https://github.com/earendil-works/pi/issues/6363)）。
- 新增 `before_provider_headers` 扩展钩子支持，以注入提供商请求头（[#6350](https://github.com/earendil-works/pi/pull/6350)，作者 [@pmateusz](https://github.com/pmateusz)）。
- 新增用于命名内联扩展工厂的 `InlineExtension` 类型（[#6267](https://github.com/earendil-works/pi/pull/6267)，作者 [@any-victor](https://github.com/any-victor)）。
- 新增扩展条目渲染器，用于在交互模式中渲染但不发送到模型上下文的持久、仅显示会话条目。
- 为 `pi config` 新增项目本地资源覆盖管理，包括以 `pi config -l` 启动项目模式和通过 Tab 在全局与项目作用域间切换（[#6309](https://github.com/earendil-works/pi/pull/6309)）。
- 从代理框架新增继承的 `InMemorySessionStorage` 和 `JsonlSessionStorage` 导出（[#6435](https://github.com/earendil-works/pi/issues/6435)）。
- 为 JSONL 会话头新增继承的自定义元数据支持（[#6417](https://github.com/earendil-works/pi/pull/6417)，作者 [@ArcadiaLin](https://github.com/ArcadiaLin)）。
- 新增 `showCacheMissNotices` 设置和 `/settings` 切换，以显示显著提示缓存未中记录通知。

### 修复

- 修复继承的 gRPC `ResourceExhausted` 提供商错误重试分类，例如 NVIDIA NIM 短暂耗尽响应（[#6449](https://github.com/earendil-works/pi/pull/6449)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复继承的 Cloudflare 524 超时响应重试分类（[#6239](https://github.com/earendil-works/pi/issues/6239)）。
- 修复继承的 GitHub Copilot 设备码登录轮询：首次令牌轮询前等待并遵守服务器提供的 `slow_down` 间隔，避免浏览器授权后的错误失败或表面挂起（[#6187](https://github.com/earendil-works/pi/issues/6187)）。
- 修复继承的 OpenAI Codex WebSocket 会话，在后端 60 分钟限制前轮换缓存连接，避免长会话连接限制失败（[#6268](https://github.com/earendil-works/pi/issues/6268)）。
- 修复继承的 DS4 服务器上下文溢出检测，适配 `Prompt has ... tokens, but the configured context size is ... tokens` 错误（[#6262](https://github.com/earendil-works/pi/issues/6262)）。
- 修复继承的 Fireworks GLM 5.2 Fast，使用 OpenAI 兼容端点和 `thinkingLevelMap`，使其与 GLM 5.2 对齐（[#6195](https://github.com/earendil-works/pi/issues/6195)）。
- 修复派生菜单忽略同一条目的重复选择（[#6430](https://github.com/earendil-works/pi/pull/6430)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复 Bun 独立发行版中的原生剪贴板支持（[#6418](https://github.com/earendil-works/pi/pull/6418)，作者 [@davidbrai](https://github.com/davidbrai)）。
- 修复继承的 GitHub Copilot 扩展上下文窗口模型，使用 `contextWindow: 1000000`，避免过早压缩和预算不足（[#6439](https://github.com/earendil-works/pi/issues/6439)）。
- 修复继承的编辑器粘贴标记核算：删除粘贴标记或清除终端状态时正常处理（[#6397](https://github.com/earendil-works/pi/pull/6397)，作者 [@affanali2k3](https://github.com/affanali2k3)）。
- 修复导入记录或自定义客户端的 `null` 消息内容：在摄取边界规范化，而非在构建上下文期间失败（[#6343](https://github.com/earendil-works/pi/pull/6343)）。
- 修复继承的长度截断助手消息中的工具调用：失败而非等待缺失的工具结果（[#6285](https://github.com/earendil-works/pi/pull/6285)）。
- 修复继承的 OpenAI Completions 和 Responses 提供商：工具结果文本为空且无图像内容时发送 `(no tool output)` 而非 `(see attached image)`。
- 修复继承的 OpenAI Responses 和 Azure OpenAI Responses 请求，避免发送低于提供商最低值的 `max_output_tokens`（[#6265](https://github.com/earendil-works/pi/issues/6265)）。
- 修复继承的 Claude Fable 5 和 Claude Sonnet 5 Amazon Bedrock 提示缓存点（[#6235](https://github.com/earendil-works/pi/issues/6235)）。
- 修复继承的 Amazon Bedrock Claude 5 提示缓存定价元数据，移除过时回退覆盖。
- 修复继承的 OpenAI Codex 用户代理构建：同步加载 Node OS 元数据，避免启动竞态报告 Node/Bun 中的 `pi (browser)`。
- 修复 pnpm 安装的 `pi update`：可执行文件指向已移除缓存版本时建议清理 pnpm 自更新缓存（[#6279](https://github.com/earendil-works/pi/pull/6279)，作者 [@rajp152k](https://github.com/rajp152k)）。
- 修复 Xiaomi Token Plan 模型元数据，使其遵循上游 models.dev token-plan 目录，移除不受支持的 `mimo-v2-omni` 变体（[#6204](https://github.com/earendil-works/pi/issues/6204)）。
- 修复启动模型选择，跳过未认证的已保存默认值，以便选择配置的本地自定义模型（[#6231](https://github.com/earendil-works/pi/issues/6231)）。
- 修复问题扩展示例，依序运行问题工具调用，使单个助手回合中的多个问题仍可回答（[#6189](https://github.com/earendil-works/pi/issues/6189)）。
- 修复 `/login`：`auth.json` 被锁定时报告认证存储持久化失败，而非声称凭据已保存（[#6223](https://github.com/earendil-works/pi/issues/6223)）。
- 修复分回合压缩，串行化摘要请求，以免单并发本地提供商因 429 错误失败（[#5536](https://github.com/earendil-works/pi/issues/5536)）。
- 修复压缩保留令牌预算，计入上下文可见的自定义消息（[#6326](https://github.com/earendil-works/pi/issues/6326)）。
- 修复助手流式期间追加的自定义会话条目，在实时助手消息之前渲染以匹配持久会话顺序。
- 修复非正或过大的 bash 工具超时：以清晰验证错误失败而非钳制为立即超时（[#6181](https://github.com/earendil-works/pi/issues/6181)）。
- 修复编辑工具 schema，允许模型虚构的额外替换字段，而非拒绝本来有效的编辑（[#6278](https://github.com/earendil-works/pi/issues/6278)）。
- 修复新会话重置，清除缓存标签时间戳（[#6354](https://github.com/earendil-works/pi/issues/6354)）。
- 修复 Bun fetch 报告为 `socket connection was closed` 的套接字断开错误自动重试，因此短暂提供商断连不会在无头运行中未经重试即结束（[#6431](https://github.com/earendil-works/pi/issues/6431)）。
- 修复 `models.json` `modelOverrides` 应用于扩展注册提供商模型（[#6367](https://github.com/earendil-works/pi/issues/6367)）。
- 修复项目上下文文件发现，在 Windows 上使用稳定父级遍历，启动加载 AGENTS.md 或 CLAUDE.md 时不再挂起（[#6369](https://github.com/earendil-works/pi/issues/6369)）。
- 修复 `--session-id` 启动：不存在具有该 ID 的项目会话且 pi 创建新会话时发出警告（[#6407](https://github.com/earendil-works/pi/issues/6407)）。
- 修复 `/reload` 帮助文本和文档，统一提及主题和上下文文件（[#6395](https://github.com/earendil-works/pi/issues/6395)）。

### 移除

- 从 Vercel AI Gateway 请求中移除默认归属头。

## [0.80.3] - 2026-06-30

### 新功能

- **Anthropic Claude Sonnet 5 支持** - Claude Sonnet 5 可通过继承的 Anthropic 兼容和 Bedrock 提供商目录使用，并启用自适应思考。参见 [提供商](docs/providers.md) 和 [模型选项](docs/usage.md#model-options)。
- **可配置的输出间距** - `outputPad` 控制用户消息、助手消息和思考块的水平内边距。参见 [设置](docs/settings.md#ui--display)。
- **外部编辑器配置** - `externalEditor` 让 Ctrl+G 在 `$VISUAL`/`$EDITOR` 回退前使用已配置编辑器。参见 [设置](docs/settings.md#ui--display) 和 [按键绑定](docs/keybindings.md)。
- **更丰富的 RPC 会话树访问** - RPC 客户端可使用 `get_entries` 和 `get_tree` 检查会话条目和树快照。参见 [get_entries](docs/rpc.md#get_entries) 和 [get_tree](docs/rpc.md#get_tree)。
- **扩展会话元数据更新** - 扩展可通过 `session_info_changed` 观察会话名称变更。参见 [session_info_changed](docs/extensions.md#session_info_changed)。
- **现代 Azure Foundry 端点支持** - Azure OpenAI Responses 提供商设置支持当前 Microsoft Foundry 端点 URL。参见 [Azure OpenAI](docs/providers.md#azure-openai)。

### 新增

- 新增继承的 Anthropic Claude Sonnet 5 模型支持。
- 新增用于通过 RPC 读取会话条目和树快照的 `get_entries` 和 `get_tree` RPC 命令（[#6078](https://github.com/earendil-works/pi/pull/6078)，作者 [@geraschenko](https://github.com/geraschenko)）。
- 新增用于直接以 RPC 模式启动 Pi 的包 `./rpc-entry` 导出。
- 为扩展新增会话名称变更事件（[#6175](https://github.com/earendil-works/pi/pull/6175)，作者 [@xl0](https://github.com/xl0)）。
- 为现代 Microsoft Foundry 端点 URL 新增继承的 Azure OpenAI Responses 支持（[#6004](https://github.com/earendil-works/pi/pull/6004)，作者 [@gukoff](https://github.com/gukoff)）。
- 为报告推理/思考令牌用量的提供商新增继承的 `Usage.reasoning` 令牌计数（[#6057](https://github.com/earendil-works/pi/issues/6057)）。
- 为 Ctrl+G 外部编辑器命令新增 `externalEditor` settings.json 覆盖，默认回退为 Windows 上的 Notepad 和其他平台上的 `nano`（[#6122](https://github.com/earendil-works/pi/issues/6122)）。
- 新增用于用户消息、助手消息和思考水平内边距的 `outputPad` 设置（[#6168](https://github.com/earendil-works/pi/issues/6168)）。

### 变更

- 将默认 OpenAI 模型改为 `gpt-5.5`。
- 将继承的 OpenAI Codex Responses SSE 响应头等待改为使用配置的 HTTP 超时而非此前固定的 20 秒超时，减少慢连接上的误超时（[#4945](https://github.com/earendil-works/pi/issues/4945)）。

### 修复

- 修复继承的 Claude Sonnet 5 元数据，对 Anthropic 兼容和 Bedrock 请求使用自适应思考负载。
- 修复继承的生成 Xiaomi MiMo 模型定价，使其匹配 models.dev 当前按量付费定价（[#6138](https://github.com/earendil-works/pi/issues/6138)）。
- 修复继承的提供商 HTTP 错误包含响应体，而非不透明 SDK 消息（[#5832](https://github.com/earendil-works/pi/pull/5832)，作者 [@stephanmck](https://github.com/stephanmck)）。
- 修复继承的 `streamSimple()` 最大令牌上限，使输入和输出计入同一上下文窗口的提供商不会拒绝长请求（[#5595](https://github.com/earendil-works/pi/issues/5595)）。
- 修复继承的 OpenAI Responses 流，在输出项乱序完成时保留推理重放状态（[#6009](https://github.com/earendil-works/pi/issues/6009)）。
- 修复继承的 Z.AI 保留思考请求：启用思考时发送 `thinking.clear_thinking: false`，使重放的 `reasoning_content` 可参与提供商缓存（[#6083](https://github.com/earendil-works/pi/issues/6083)）。
- 修复提示前压缩，使其在压缩后停止而非立即继续（[#6074](https://github.com/earendil-works/pi/pull/6074)，作者 [@yzhg1983](https://github.com/yzhg1983)）。
- 修复恢复会话时资源通知保持在消息之前（[#6048](https://github.com/earendil-works/pi/pull/6048)，作者 [@haoqixu](https://github.com/haoqixu)）。
- 修复启动基准计时输出，在 TUI 关闭后打印、保留扩展计时，并在停止基准模式前清空终端查询回复（[#6030](https://github.com/earendil-works/pi/pull/6030)，作者 [@xl0](https://github.com/xl0)，[#6063](https://github.com/earendil-works/pi/pull/6063)，作者 [@xl0](https://github.com/xl0)）。
- 修复扩展工具变更，在同一代理运行的下一次提供商请求前应用，而不丢弃 `before_agent_start` 系统提示覆盖（[#6162](https://github.com/earendil-works/pi/issues/6162)）。
- 修复 undici 在终止流中 HTTP 响应时发出内部客户端错误导致的崩溃（[#6133](https://github.com/earendil-works/pi/issues/6133)）。
- 修复压缩事件回归测试，覆盖状态指示器清理并保持 CI 通过。
- 修复交互状态指示器：启用 clear-on-shrink 时，结束工作、重试、压缩或分支摘要指示器不再使 TUI 缩小（[#6026](https://github.com/earendil-works/pi/pull/6026)）。
- 修复 `--session` 和 `SessionManager.open()`，拒绝非空无效会话文件而不覆盖它们（[#6002](https://github.com/earendil-works/pi/issues/6002)）。
- 修复用户消息记录渲染，保留 Markdown 转义序列（如 `\"`）中可见的反斜杠（[#6105](https://github.com/earendil-works/pi/issues/6105)）。
- 修复因输出长度停止的助手消息，显示可见的不完整响应错误（[#4290](https://github.com/earendil-works/pi/issues/4290)）。
- 修复 `--no-session --session-id`，让临时 CLI 运行可为提供商缓存亲和使用确定性会话 ID（[#6070](https://github.com/earendil-works/pi/issues/6070)）。
- 修复磁盘 BMP 图像文件被检测、转换为 PNG，并通过 `read` 和 CLI `@file` 输入附加（[#6047](https://github.com/earendil-works/pi/issues/6047)）。
- 修复显式要求调用者重试请求的提供商流错误自动重试（[#6019](https://github.com/earendil-works/pi/issues/6019)）。

## [0.80.2] - 2026-06-23

### 变更

- 将继承的 pi-ai `ApiKeyCredential` 改为使用与 `auth.json` 兼容的鉴别器 `type: "api_key"` 和提供商作用域 `env` 值，而非 `type: "api-key"` 和元数据。
- 将继承的 agent-core 公共框架 shell 执行选项类型从 `ExecutionEnvExecOptions` 重命名为 `ShellExecOptions`。

### 修复

- 修复继承的 Anthropic 兼容自定义模型，使用显式兼容性元数据而非提供商名称启发式规则处理会话亲和头和不支持工具字段的省略。
- 修复继承的请求作用域 `apiKey` 和 `env` 值参与提供商认证解析，使 Cloudflare 等提供商可从显式调用选项派生请求特定基础 URL（[#6021](https://github.com/earendil-works/pi/issues/6021)）。
- 恢复继承的临时旧版逐 API 流别名，如 pi-ai compat 入口点上的 `streamSimpleOpenAICompletions`（[#6016](https://github.com/earendil-works/pi/issues/6016)，[#6017](https://github.com/earendil-works/pi/issues/6017)）。
- 恢复 `openai-completions` 对缺少显式 compat 元数据模型的继承运行时 `detectCompat` 回退（[#6020](https://github.com/earendil-works/pi/issues/6020)）。

## [0.80.1] - 2026-06-23

### 修复

- 修复继承的 Amazon Bedrock 作用域 `AWS_PROFILE` 对内置推理配置文件端点的解析。
- 修复继承的 Fireworks Anthropic 兼容请求，为自定义 Fireworks 模型应用会话亲和和不支持工具字段默认值。
- 修复继承的 Together MiniMax M2.7 元数据，避免不支持的 Together 推理开关。

## [0.80.0] - 2026-06-23

### 变更

- 将 `Ctrl+J` 新增为与 `Shift+Enter` 并列的默认换行按键绑定。
- 为清晰起见，将显示的 `zai` 提供商标签重命名为 ZAI Coding Plan (Global)（[#5965](https://github.com/earendil-works/pi/issues/5965)）。
- pi-ai 的旧全局 API（`stream`/`complete`/`completeSimple`、`getModel`/`getModels`/`getProviders`、`registerApiProvider`、`getEnvApiKey` 等）从 `@earendil-works/pi-ai` 根入口移至 `@earendil-works/pi-ai/compat`。扩展在运行时不受影响：扩展加载器将 pi-ai 根解析到 compat 入口点（严格超集），因此现有扩展可保持不变地工作。针对 pi-ai 已发布类型进行类型检查的扩展源应将这些导入切换为 `@earendil-works/pi-ai/compat`（或迁移到新的 `createModels()`/提供商工厂 API）。compat 入口点和加载器别名将在未来版本中连同迁移指南一并移除。

### 修复

- 修复会话名称，在存储或显示标签前规范化换行符（[#5999](https://github.com/earendil-works/pi/pull/5999)，作者 [@haoqixu](https://github.com/haoqixu)）。
- 修复会话选择器，按每个子树任意位置的最新活动排序线程会话树（[#5784](https://github.com/earendil-works/pi/pull/5784)，作者 [@Perlence](https://github.com/Perlence)）。
- 修复扩展相关崩溃和启动失败报告，建议使用 `pi -ne` 重启。
- 修复继承的 OpenAI Responses 流，在缺少终端事件前失败；并修复上下文用量和压缩估算，忽略截断响应后格式错误的全零助手用量（[#5526](https://github.com/earendil-works/pi/pull/5526)，作者 [@dmmulroy](https://github.com/dmmulroy)）。
- 修复继承的 OpenAI Codex Responses WebSocket 会话，在输出开始前达到 OpenAI 连接限制时重连一次（[#5973](https://github.com/earendil-works/pi/issues/5973)）。
- 修复继承的 Amazon Bedrock 端点解析，遵守作用域 `AWS_PROFILE` 值。
- 修复继承的 Cloudflare 提供商，要求账户/网关配置并通过提供商认证路由内置 compat 调用。
- 修复提供商作用域认证环境值传递至继承的 `Models`/`ImagesModels` API 调用和 compat API 密钥注入。
- 修复继承的 OpenCode Go GLM-5.2 元数据，公开 `xhigh` 推理并发送提供商的最大推理工作量（[#5967](https://github.com/earendil-works/pi/issues/5967)）。
- 修复 `pi --resume`，加载用户包主题并解析自动浅色/深色主题设置。
- 修复 `models.json` 自定义提供商，使已存凭据无需冗余的提供商级 `apiKey` 即可满足认证（[#5953](https://github.com/earendil-works/pi/issues/5953)）。

### 移除

- 移除继承的选择性提供商 `@earendil-works/pi-ai/base` 和 `@earendil-works/pi-agent-core/base` 入口点；请改用带显式 `Models` 提供商工厂的根包。

## [0.79.10] - 2026-06-22

### 新功能

- **扩展压缩事件上下文** - 扩展 `session_before_compact` 和 `session_compact` 事件现包含 `reason` 和 `willRetry`，因此扩展可区分手动 `/compact`、阈值自动压缩和溢出重试流程。参见 [session_before_compact / session_compact](docs/extensions.md#session_before_compact--session_compact) 和 [通过扩展自定义摘要](docs/compaction.md#custom-summarization-via-extensions)。
- **更安全的更新流程** - `pi update` 安装精确的已检查 Pi 版本，更新通知显示更新日志 URL，使升级更可预测。参见 [安装和管理](docs/packages.md#install-and-manage)。

### 新增

- 为扩展 `session_before_compact` 和 `session_compact` 事件新增 `reason` 和 `willRetry` 元数据，以区分手动、阈值和溢出压缩流程（[#5962](https://github.com/earendil-works/pi/pull/5962)，作者 [@PizzaMarinara](https://github.com/PizzaMarinara)）。

### 修复

- 修复 `find` 工具，使父级 `.gitignore` 规则忽略嵌套仓库时遵守嵌套 git 仓库边界（[#5960](https://github.com/earendil-works/pi/issues/5960)）。
- 修复用量文档斜杠命令表，包含 `/trust` 和 `/import`（[#5959](https://github.com/earendil-works/pi/issues/5959)）。
- 修复继承的 OpenAI 兼容流，保留匹配工具调用 delta 前到达的加密 `reasoning_details`（[#5114](https://github.com/earendil-works/pi/issues/5114)）。
- 修复指向计划模式扩展示例的失效 TUI 文档链接（[#5957](https://github.com/earendil-works/pi/issues/5957)）。
- 修复会话替换或重载期间发出的短暂扩展 UI 和会话启动消息，使其保持可见；并保持重载输入被阻止直至重载完成（[#5943](https://github.com/earendil-works/pi/issues/5943)）。
- 修复计划模式示例：保留活动自定义工具、未找到计划时跳过操作提示，并从 `agent_end` 正确排队细化/执行后续操作（[#5940](https://github.com/earendil-works/pi/issues/5940)）。
- 修复 `pi update`：安装 Pi 更新检查返回的精确版本，使 `--force` 重装该已检查版本；无版本时失败而非回退到无版本重装，并同时报告旧版和更新后版本。
- 修复更新通知，以实际更新日志 URL 作为超链接文本显示。

## [0.79.9] - 2026-06-20

### 新功能

- **聊天模板思考兼容性** - OpenAI 兼容自定义提供商可将 Pi 思考级别映射到 `chat_template_kwargs`，使 vLLM/Hugging Face 聊天模板模型（如 DeepSeek）使用提供商原生思考控件。参见 [自定义提供商 API 类型](docs/custom-provider.md#api-types) 和 [OpenAI 兼容性](docs/models.md#openai-compatibility)。
- **GLM-5.2 提供商改进** - GLM-5.2 现在具备修正后的 Fireworks OpenAI 兼容路由和 OpenRouter `xhigh` 思考支持，改善 GLM-5.2 用户的 `/model` 行为和高工作量推理。参见 [模型选项](docs/usage.md#model-options)。

### 新增

- 为使用 `chat_template_kwargs` 的 OpenAI 兼容提供商新增继承的可配置 `chat-template` 思考支持，例如 vLLM 后的 DeepSeek 模型（[#5673](https://github.com/earendil-works/pi/issues/5673)）。

### 修复

- 修复继承的 Fireworks GLM-5.2 元数据，使用带 `reasoning_effort` 支持的 OpenAI 兼容 Chat Completions 端点（[#5923](https://github.com/earendil-works/pi/issues/5923)）。
- 修复同目录会话切换，重用已导入扩展模块，同时保留新的扩展实例和生命周期事件（[#5905](https://github.com/earendil-works/pi/issues/5905)）。
- 修复深层会话分支构建上下文或分支路径耗时二次方的问题（[#5909](https://github.com/earendil-works/pi/issues/5909)）。
- 修复继承的 OpenRouter GLM-5.2 元数据，公开 `xhigh` 推理并发送 OpenRouter 原生 `xhigh` 工作量（[#5770](https://github.com/earendil-works/pi/issues/5770)）。
- 修复继承的 Markdown 流式代码围栏渲染，使部分闭合围栏不再导致内容流式传输时代码块缩小或闪烁（[#5846](https://github.com/earendil-works/pi/pull/5846)，作者 [@xl0](https://github.com/xl0)）。
- 修复模糊 `edit` 匹配，保留未触及的行块而非通过规范化内容重写整个文件（[#5899](https://github.com/earendil-works/pi/issues/5899)）。
- 修复通过旧版 WSL `bash.exe` 的 bash 命令，通过 stdin 传递脚本，使 shell 变量在目标 bash 中展开（[#5893](https://github.com/earendil-works/pi/issues/5893)）。
- 修复 `/model` 隐藏认证账户不可用的 GitHub Copilot 模型（[#5897](https://github.com/earendil-works/pi/issues/5897)）。
- 修复 `/model` 选择器搜索，在代理提供商模型 ID 匹配前排列精确的提供商前缀匹配（[#5892](https://github.com/earendil-works/pi/issues/5892)）。

## [0.79.8] - 2026-06-19

### 新功能

- **选择性提供商 base 入口点** - SDK 用户可将 `@earendil-works/pi-ai/base` 和 `@earendil-works/pi-agent-core/base` 与显式提供商注册配对，避免捆绑应用包含未使用的提供商传输。参见 [`pi-ai` Base 入口点](../ai/README.md#base-entry-point) 和 [`pi-agent-core` Base 入口点](../agent/README.md#base-entry-point)。
- **Mistral 提示缓存** - Mistral 会话现在使用具有会话亲和以及缓存令牌用量/成本核算的提供商侧提示缓存。参见 [API 密钥](docs/providers.md#api-keys) 和 [环境变量](docs/usage.md#environment-variables)。
- **压缩后令牌估算** - 压缩结果和压缩事件现在包括估算的压缩后令牌计数，以便客户端显示大致上下文缩减。参见 [RPC compact](docs/rpc.md#compact) 和 [压缩事件](docs/rpc.md#compaction_start--compaction_end)。
- **OpenRouter Fusion 别名** - `openrouter/fusion` 可作为内置 OpenRouter 模型别名使用。参见 [API 密钥](docs/providers.md#api-keys)。

### 新增

- 为捆绑应用中的选择性提供商注册新增继承的 `@earendil-works/pi-ai/base` 和 `@earendil-works/pi-agent-core/base` 入口点（[#5348](https://github.com/earendil-works/pi/pull/5348)，作者 [@FredKSchott](https://github.com/FredKSchott)）。
- 新增继承的 Mistral 提示缓存，使用 pi 会话 ID 作为 `prompt_cache_key`，包括缓存令牌用量和成本核算（[#5854](https://github.com/earendil-works/pi/issues/5854)）。
- 为压缩结果和压缩事件新增估算的压缩后令牌计数（[#5877](https://github.com/earendil-works/pi/issues/5877)）。
- 新增继承的 OpenRouter Fusion 别名 `openrouter/fusion`（[#5866](https://github.com/earendil-works/pi/pull/5866)，作者 [@dannote](https://github.com/dannote)）。

### 修复

- 更新易受攻击的运行时依赖，包括 `undici` 和打包的 `protobufjs` 传递依赖。
- 修复压缩：拒绝没有合格消息的会话，而非生成空摘要（[#4811](https://github.com/earendil-works/pi/issues/4811)）。
- 修复成功的溢出触发自动压缩，避免重试已完成的助手响应（[#5720](https://github.com/earendil-works/pi/issues/5720)）。

## [0.79.7] - 2026-06-18

### 新功能

- **自动主题模式** - `/settings` 可选择独立的浅色和深色主题，并跟随终端配色方案变化。参见 [选择主题](docs/themes.md#selecting-a-theme)。
- **默认仅更新自身** - `pi update` 现在仅更新 pi；使用 `pi update --all` 可同时更新 pi 和包。参见 [安装和管理](docs/packages.md#install-and-manage)。
- **扩展 API 助手** - 扩展可使用 `CONFIG_DIR_NAME` 获取项目配置路径，并导入编辑 diff 助手以生成编辑式 diff。参见 [`ctx.cwd`](docs/extensions.md#ctxcwd) 和 [SDK 导出](docs/sdk.md#exports)。
- **Warp 内联图像** - Warp 终端现在通过 Kitty 图形检测获得内联图像渲染。参见 [图像](docs/tui.md#image)。

### 新增

- 新增自动主题模式，使 `/settings` 可使用独立浅色和深色主题并跟随终端配色方案变化（[#5874](https://github.com/earendil-works/pi/pull/5874)）。
- 新增继承的 Warp 终端图像能力检测，使内联图像通过 Warp 的 Kitty 图形支持渲染（[#5841](https://github.com/earendil-works/pi/pull/5841)，作者 [@dodiego](https://github.com/dodiego)）。
- 从 coding-agent 公共 API 导出 `CONFIG_DIR_NAME`，使扩展无需硬编码 `.pi` 即可解析项目配置路径（[#5869](https://github.com/earendil-works/pi/pull/5869)，作者 [@xl0](https://github.com/xl0)）。
- 从公共 API 导出编辑 diff 助手（`generateDiffString`、`generateUnifiedPatch` 和 `EditDiffResult`），供需要编辑式 diff 的扩展使用（[#5756](https://github.com/earendil-works/pi/pull/5756)，作者 [@xl0](https://github.com/xl0)）。

### 变更

- 将裸 `pi update` 改为仅更新 pi，新增 `pi update --all` 以同时更新 pi 和扩展，并澄清扩展更新提示。
- 在主题名称中保留 `/`，用于自动浅色/深色主题设置。
- 更新扩展文档、示例、运行时帮助、信任提示和配置标签，使用配置的项目配置目录而非硬编码 `.pi` 路径。

### 修复

- 修复 RPC 未知命令错误包含请求 ID，避免客户端等待响应时挂起（[#5868](https://github.com/earendil-works/pi/issues/5868)）。
- 修复 `/model` 自动补全和模型选择搜索：无论先输入提供商还是模型令牌均可匹配提供商/模型查询。
- 修复树导航器水平平移深层条目，使所选项保持可读（[#5830](https://github.com/earendil-works/pi/issues/5830)）。

## [0.79.6] - 2026-06-16

### 修复

- 修复 HTTP dispatcher 配置，保留调用者有意的 `fetch` 覆盖，而非在其上重新安装 undici 全局 fetch。
- 修复继承的 OpenCode Go DeepSeek V4 关闭思考请求，发送提供商的 `thinking: { type: "disabled" }` 兼容参数。

## [0.79.5] - 2026-06-16

### 新功能

- **提供商作用域 API 密钥环境** - `auth.json` API 密钥条目现在可包含 `env` 覆盖，用于特定提供商的 Cloudflare、Azure OpenAI、Google Vertex、Amazon Bedrock、缓存保留和代理设置，无需更改项目 shell。参见 [认证文件](docs/providers.md#auth-file)。
- **全局 HTTP 代理设置** - 在全局设置中一次配置 `httpProxy`，即可向 Pi 管理的 HTTP 客户端应用 `HTTP_PROXY` 和 `HTTPS_PROXY`。参见 [网络](docs/settings.md#network)。
- **Vercel AI Gateway 归属** - Vercel AI Gateway 请求现在默认包含 Pi 归属头。参见 [API 密钥](docs/providers.md#api-keys)。

### 新增

- 为 Vercel AI Gateway 模型新增 Vercel AI Gateway 请求归属头（`http-referer` 和 `x-title`）（[#5798](https://github.com/earendil-works/pi/pull/5798)，作者 [@rwachtler](https://github.com/rwachtler)）。
- 启用实验性功能时新增 `xp` 页脚标记。
- 新增全局 `httpProxy` 设置，作为 Pi 管理 HTTP 客户端的 `HTTP_PROXY` 和 `HTTPS_PROXY` 应用（[#5790](https://github.com/earendil-works/pi/issues/5790)）。
- 新增 `auth.json` API 密钥 `env` 值，使提供商特定环境覆盖可限定至 Pi 并传播至继承的提供商配置（[#5728](https://github.com/earendil-works/pi/issues/5728)）。

### 变更

- 将 HTML 会话导出使用的供应 Markdown 解析器更新至 `marked` 18.0.5。

### 修复

- 修复继承的 OpenAI Responses 流，在工具调用前容忍 OpenAI 兼容服务器提供的 null 消息内容（[#5819](https://github.com/earendil-works/pi/issues/5819)）。
- 修复继承的 OpenCode DeepSeek V4 思考请求，避免同时发送 `thinking` 和 `reasoning_effort`（[#5818](https://github.com/earendil-works/pi/issues/5818)）。
- 修复设备码登录不再自动打开浏览器。
- 修复继承的编辑器 Cursor Up 处理，非空草稿在浏览输入历史前跳到行首（[#5789](https://github.com/earendil-works/pi/pull/5789)，作者 [@4h9fbZ](https://github.com/4h9fbZ)）。
- 修复继承的 Z.AI GLM-5.2 思考请求，发送按提供商 `high`/`max` 工作量映射的 `reasoning_effort`（[#5770](https://github.com/earendil-works/pi/issues/5770)）。
- 修复 Windows 上成功的 `pi update` 自然退出而非调用 `process.exit(0)`，避免版本检查网络请求后的 Node.js/libuv 断言（[#5805](https://github.com/earendil-works/pi/issues/5805)）。
- 修复继承的 Google 和 `google-vertex` Gemini 模型元数据：将 `latest` 别名映射至当前模型、为 Vertex 添加 Gemini 3.5 Flash、修正 Gemini 2.5 Flash Vertex 缓存定价，并移除已关闭的 Vertex 预览模型（[#5761](https://github.com/earendil-works/pi/issues/5761)）。
- 修复会话选择器：当前文件夹和全部作用域会话列表均为空时保持打开并显示所有会话空状态（[#5747](https://github.com/earendil-works/pi/issues/5747)）。
- 修复继承的 Moonshot AI China 模型元数据，包含 Kimi K2.7 Code，并省略 Kimi K2.7 Code 模型不支持的关闭思考负载（[#5760](https://github.com/earendil-works/pi/issues/5760)）。

## [0.79.4] - 2026-06-15

### 新功能

- **自动首次运行主题选择** - pi 在首次运行时检测终端背景，并默认使用 `dark` 或 `light` 主题。参见 [选择主题](docs/themes.md#selecting-a-theme)。
- **独立二进制完整性校验和** - GitHub 发布资产现包含用于验证独立二进制下载的 `SHA256SUMS` 文件。参见 [快速安装](docs/quickstart.md#install)。

### 新增

- 向独立二进制 GitHub 发布资产新增 `SHA256SUMS` 完整性文件（[#5739](https://github.com/earendil-works/pi/issues/5739)）。
- 新增从终端背景进行的首次运行交互主题检测（[#5385](https://github.com/earendil-works/pi/pull/5385)，作者 [@vegarsti](https://github.com/vegarsti)）。

### 修复

- 修复 bash 工具输出收集：子进程退出后后代仍写入时继续排空 stdout/stderr，避免截断迟到输出（[#5753](https://github.com/earendil-works/pi/pull/5753)，作者 [@Mearman](https://github.com/Mearman)）。
- 修复 `/tree` 帮助渲染，在窄终端显示紧凑换行控件而非截断（[#5055](https://github.com/earendil-works/pi/issues/5055)）。
- 修复 SIGTERM/SIGHUP 交互关闭，直至终端清理完成始终安装信号处理器，避免 `signal-exit` 重新发送信号并使终端保持 raw/Kitty 键盘模式（[#5724](https://github.com/earendil-works/pi/issues/5724)）。
- 修复扩展文档，澄清 `pi.getActiveTools()` 返回活动工具名称而 `pi.getAllTools()` 返回工具元数据（[#5729](https://github.com/earendil-works/pi/issues/5729)）。
- 修复问题和问卷扩展示例，使长提示、选项和帮助文本换行而非截断（[#5708](https://github.com/earendil-works/pi/pull/5708)，作者 [@xl0](https://github.com/xl0)）。
- 修复 `pi list`、`pi install` 和 `pi update` 等包命令，即使扩展留下后台句柄，完成后也会终止（[#5687](https://github.com/earendil-works/pi/issues/5687)）。
- 修复 pnpm 全局安装的 `pi update`，其配置的 `global-bin-dir` 不再匹配活动 pnpm home 时仍可正常运行（[#5689](https://github.com/earendil-works/pi/issues/5689)）。
- 修复使用范围或标签的 npm 包规格（例如 `@^1.2.7`），使已安装包资源不再被视为不匹配的精确 pin，仍能加载（[#5695](https://github.com/earendil-works/pi/issues/5695)）。
- 修复继承的 Anthropic 1 小时提示缓存写入成本核算，以输入的 2 倍而非 5 分钟缓存写入费率为 1 小时缓存写入定价（[#5738](https://github.com/earendil-works/pi/pull/5738)，作者 [@theBucky](https://github.com/theBucky)）。
- 修复继承的 GitHub Copilot Claude 自适应思考工作量元数据，使其匹配手动检查的 Copilot 模型能力（[#4637](https://github.com/earendil-works/pi/issues/4637)）。
- 修复继承的 OpenCode/OpenCode Go completion 模型元数据，对拒绝 `prompt_cache_retention` 的路由省略长期保留缓存字段（[#5702](https://github.com/earendil-works/pi/issues/5702)）。
- 修复继承的 CJK 宽字符叠加合成，叠加从全宽单元格内开始时边框保持对齐（[#5297](https://github.com/earendil-works/pi/issues/5297)）。
- 修复继承的 WezTerm 全量重绘回退期间的内联 Kitty 图像渲染：在绘制放置前保留图像内边距行，且不回归高图像放置（[#5618](https://github.com/earendil-works/pi/issues/5618)，[#4415](https://github.com/earendil-works/pi/issues/4415)）。
- 修复自定义提供商配置，纯大写 API 密钥和头值保持字面量而非视为旧环境引用；环境变量请使用明确的 `$ENV_VAR` 语法（[#5661](https://github.com/earendil-works/pi/issues/5661)）。

## [0.79.3] - 2026-06-13

### 修复

- 修复继承的 OpenAI GPT-5.4/GPT-5.5 以及 OpenAI Codex GPT-5.4/GPT-5.4 mini/GPT-5.5 上下文窗口元数据，使用观察到的 272k 令牌 Codex 后端限制，避免高于 Codex 接受限制的提示产生计费风险（由 [@trethore](https://github.com/trethore) 报告）。

## [0.79.2] - 2026-06-12

### 新功能

- **更清晰的 Bedrock 验证指引** - Amazon Bedrock 数据保留验证错误现在链接到 AWS 数据保留文档。参见 [Amazon Bedrock](docs/providers.md#amazon-bedrock)。

### 新增

- 在默认代理目录首次启动时，新增由 `PI_EXPERIMENTAL=1` 控制的实验性首次设置流程：询问深色/浅色主题选择（预选检测到的外观）和选择加入的分析数据共享；选择加入会在 `settings.json` 中保存 `trackingId`（[#5587](https://github.com/earendil-works/pi/pull/5587)，作者 [@vegarsti](https://github.com/vegarsti)）。
- 为继承的 Amazon Bedrock 不支持数据保留模式验证错误新增 AWS 数据保留文档链接（[#5561](https://github.com/earendil-works/pi/pull/5561)，作者 [@unexge](https://github.com/unexge)）。

### 修复

- 修复项目可信检测：从 `$HOME` 运行时忽略全局 `~/.pi/agent` 状态；并使 `pi update` 仅使用已保存或显式项目可信，无需提示（[#5619](https://github.com/earendil-works/pi/issues/5619)）。
- 修复实验性首次设置，跳过派生会话而非重新运行设置提示（[#5627](https://github.com/earendil-works/pi/pull/5627)，作者 [@vegarsti](https://github.com/vegarsti)）。
- 修复继承的 OpenAI 兼容上下文溢出检测，适配带括号的 `maximum context length (N)` 错误（[#5677](https://github.com/earendil-works/pi/issues/5677)）。
- 修复继承的 OpenAI GPT-5.4/GPT-5.5 和 OpenAI Codex GPT-5.4/GPT-5.4 mini/GPT-5.5 上下文窗口元数据，使其匹配当前 OpenAI 限制（[#5644](https://github.com/earendil-works/pi/issues/5644)）。
- 修复继承的 Anthropic 拒绝停止，在错误消息中保留提供商 `stop_details` 说明（[#5666](https://github.com/earendil-works/pi/pull/5666)，作者 [@rwachtler](https://github.com/rwachtler)）。
- 将继承的 OpenAI Codex Responses SSE 响应头超时增加至 20 秒，在保留针对零事件挂起引入的有界等待的同时减少误报停滞（[#4945](https://github.com/earendil-works/pi/issues/4945)）。
- 修复继承的 Claude Fable 5 关闭思考请求，省略 Anthropic 不支持的 `thinking.type: "disabled"` 负载（[#5567](https://github.com/earendil-works/pi/pull/5567)，作者 [@tmustier](https://github.com/tmustier)）。
- 修复继承的工具稳定后的迟到工具进度回调：忽略而非发出过时 `tool_execution_update` 事件（[#5573](https://github.com/earendil-works/pi/issues/5573)）。
- 修复继承的用户消息记录渲染，使独立的 `+` 消息不再渲染为 `-`（[#5657](https://github.com/earendil-works/pi/issues/5657)）。
- 修复继承的以斜杠分隔的模糊查询，使提供商/模型补全在插入后仍可匹配。
- 修复继承的 WezTerm 内联 Kitty 图像渲染，使保留行清除不再擦除除工具图像预览顶部条带外的所有内容（[#5618](https://github.com/earendil-works/pi/issues/5618)）。
- 修复继承的 CJK 文本编辑器换行，在字符边界换行而非留下大量尾随空隙（[#5585](https://github.com/earendil-works/pi/pull/5585)，作者 [@haoqixu](https://github.com/haoqixu)）。
- 修复继承的宽松 Markdown 列表渲染，保留列表项之间的空行分隔（[#5562](https://github.com/earendil-works/pi/pull/5562)，作者 [@Perlence](https://github.com/Perlence)）。
- 修复 `--model` 解析：认证的自定义模型 ID 的斜杠前缀匹配未认证内置提供商时仍可正常解析（[#5643](https://github.com/earendil-works/pi/issues/5643)）。
- 修复 `/fork`，派生路径包含标签时保持会话父链连接（[#5669](https://github.com/earendil-works/pi/issues/5669)）。
- 修复 `/share` 和 `/export` HTML 导出，在已配置自定义主题不再存在时使用活动回退主题（[#5596](https://github.com/earendil-works/pi/issues/5596)）。
- 修复带 `:<thinking>` 后缀的自定义回退模型 ID：提供商模板模型未声明推理时保留请求的思考级别（[#5560](https://github.com/earendil-works/pi/pull/5560)，作者 [@haoqixu](https://github.com/haoqixu)）。

## [0.79.1] - 2026-06-09

### 新功能

- **Claude Fable 5** - Claude Fable 5 现可通过 Anthropic 和 Amazon Bedrock 提供商使用，支持自适应思考和 `xhigh` 工作量。
- **提示模板默认值** - 提示模板可为可选值使用 `${1:-7}` 等默认位置参数。参见 [提示模板参数](docs/prompt-templates.md#arguments)。
- **可配置的项目可信默认值** - `defaultProjectTrust` 让用户选择未解析项目可信默认询问、始终信任或从不信任，扩展可检查有效可信决定。参见 [项目可信](docs/security.md#project-trust) 和 [`ctx.isProjectTrusted()`](docs/extensions.md#ctxisprojecttrusted)。
- **自然扩展自动补全触发器** - 扩展自动补全提供商可声明 `#` 或 `$` 等触发字符，使建议无需斜杠命令前缀即可打开。参见 [自动补全提供商](docs/extensions.md#autocomplete-providers)。

### 新增

- 为提示模板位置参数新增默认值展开，例如 `${1:-7}`（[#5553](https://github.com/earendil-works/pi/pull/5553)，作者 [@dannote](https://github.com/dannote)）。
- 新增 `areExperimentalFeaturesEnabled` 功能守卫，使用户可选择加入早期功能（[#5547](https://github.com/earendil-works/pi/pull/5547)，作者 [@vegarsti](https://github.com/vegarsti)）。
- 为扩展新增 `ctx.isProjectTrusted()`，用于观察有效项目可信决定，包括临时可信决定（[#5523](https://github.com/earendil-works/pi/issues/5523)）。
- 新增全局 `defaultProjectTrust` 设置，以选择未解析项目可信默认询问、始终信任或从不信任。
- 为 `ctx.ui.addAutocompleteProvider()` 包装器新增扩展自动补全触发字符支持（[#4703](https://github.com/earendil-works/pi/issues/4703)）。
- 为 Anthropic 和 Amazon Bedrock 提供商新增从 `@earendil-works/pi-ai` 继承的 Claude Fable 5 模型支持，支持自适应思考和 `xhigh` 工作量。

### 修复

- 修复继承的 Amazon Bedrock 推理配置文件 ARN 区域解析，优先使用 ARN 内嵌区域而非 `AWS_REGION`（[#5527](https://github.com/earendil-works/pi/pull/5527)，作者 [@AJM10565](https://github.com/AJM10565)）。
- 修复继承的 IME 硬件光标定位：斜杠命令自动补全可见时正常定位（[#5283](https://github.com/earendil-works/pi/pull/5283)，作者 [@smoosex](https://github.com/smoosex)）。
- 修复继承的 z.ai 关闭思考请求，发送提供商的 `thinking: { type: "disabled" }` 兼容参数（[#5330](https://github.com/earendil-works/pi/issues/5330)）。
- 修复继承的 OpenCode completions 模型元数据，将显式 `maxTokens` 作为 `max_tokens` 发送（[#5331](https://github.com/earendil-works/pi/issues/5331)）。
- 修复继承的 Moonshot Kimi 关闭思考请求，发送提供商的 `thinking: { type: "disabled" }` 兼容参数（[#5531](https://github.com/earendil-works/pi/issues/5531)）。
- 修复继承的 Azure OpenAI Responses 请求，禁用服务端响应存储（[#5530](https://github.com/earendil-works/pi/issues/5530)）。
- 修复继承的 Azure GPT-5.4 和 GPT-5.5 上下文窗口元数据为 1,050,000 令牌，匹配 Azure Foundry 部署而非 OpenAI 的 272k 限制（[#5559](https://github.com/earendil-works/pi/issues/5559)）。
- 修复继承的 OpenAI 和 Azure GPT-5 Pro `maxTokens` 元数据为 128,000，修正了将输入子限制重复为输出限制的上游值（[#5559](https://github.com/earendil-works/pi/issues/5559)）。
- 修复继承的提示历史导航，结束历史浏览时恢复当前草稿（[#5494](https://github.com/earendil-works/pi/issues/5494)）。
- 修复继承的混合拉丁和 CJK 文本换行，使无空格 CJK 连续文本可在字素边界断开而不留下大量尾随空隙（[#5495](https://github.com/earendil-works/pi/issues/5495)）。
- 修复扩展 OAuth 登录提示，保持先前已提交提示行稳定而非镜像活动输入值（[#5433](https://github.com/earendil-works/pi/issues/5433)）。
- 修复 `/reload`，将更新的 `steeringMode` 和 `followUpMode` 设置应用于当前会话（[#5377](https://github.com/earendil-works/pi/issues/5377)）。
- 修复无效 `models.json` 语法，跳过启动配置迁移并报告常规的含文件路径模型错误，而非原始 JSON 解析堆栈跟踪（[#5418](https://github.com/earendil-works/pi/issues/5418)）。
- 修复 GitHub 发布说明和交互式更新日志链接，正确解析包相对文档 URL（[#5516](https://github.com/earendil-works/pi/issues/5516)）。
- 修复 CLI 帮助和版本输出，包括普通重定向的 `--help`/`--version` 输出以及简化的 `list`/`config` 帮助文本。
- 修复临时会话中的 `/new`，使新会话保持临时而非默认持久化（[#5045](https://github.com/earendil-works/pi/issues/5045)）。
- 澄清自定义模型文档：`name` 和 `modelOverrides.name` 不会替换页脚或主模型列表中的模型 ID（[#4841](https://github.com/earendil-works/pi/issues/4841)）。

## [0.79.0] - 2026-06-08

### 新功能

- **本地输入的项目可信任机制** - Pi 现在会在加载项目本地设置、资源、指令和包之前询问，并为非交互模式提供已保存的决定以及 `--approve` / `--no-approve` 控件。参见 [Project Trust](README.md#project-trust)。
- **由扩展控制的信任决定** - 全局和 CLI 扩展可在加载项目本地资源前处理 `project_trust`、决定、记住或推迟项目可信任性。参见 [`project_trust`](docs/extensions.md#project_trust)。
- **页脚中的缓存命中可见性** - 交互式页脚现在显示最新提示缓存命中率 (`CH`)。参见 [Interactive Mode](README.md#interactive-mode)。
- **更丰富的 SDK 和 RPC 扩展接口** - 公开导出现在包括 RPC 扩展 UI 请求/响应类型和包资源路径辅助工具。参见 [Extension UI Protocol](docs/rpc.md#extension-ui-protocol) 和 [SDK Exports](docs/sdk.md#exports)。

### 新增

- 新增 `project_trust` 扩展事件，让全局和 CLI 扩展可在启动和运行时 cwd 切换期间决定或推迟项目可信任性。
- 为项目本地设置、资源、指令和包新增项目可信任性门控（[#5332](https://github.com/earendil-works/pi/pull/5332)）。
- 将最新提示缓存命中率加入交互式页脚。
- 从公共 API 导出 RPC 扩展 UI 请求和响应类型（[#5455](https://github.com/earendil-works/pi/issues/5455)）。
- 从公共 API 导出 coding-agent 包资源路径辅助工具（[#5415](https://github.com/earendil-works/pi/issues/5415)）。

### 修复

- 通过移除指向不存在构建输出的过时 `./hooks` 子路径，修复包导出。
- 修复继承的 TUI 渲染：当内容缩小到零时清除过时行。
- 修复继承的自动补全建议，使其在编辑器光标移动后刷新（[#5499](https://github.com/earendil-works/pi/pull/5499) by [@Roman-Galeev](https://github.com/Roman-Galeev)）。
- 修复 `/reload`：当隐式受信任会话创建项目 `.pi` 目录时持久化项目可信任性。
- 修复项目可信任输入发现，以可移植方式遍历父目录。
- 修复继承的间歇性 Shift+Enter 处理：使 Kitty 键盘协议回退由响应驱动而非超时驱动（[#5188](https://github.com/earendil-works/pi/issues/5188)）。
- 修复压缩摘要系统提示，以便为非编码 agent 使用中性的 AI 助手措辞（[#5401](https://github.com/earendil-works/pi/issues/5401)）。
- 修复 `models.json` 架构支持，以及继承的 OpenAI Responses 自定义 provider 对 `compat.supportsDeveloperRole: false` 的处理（[#5456](https://github.com/earendil-works/pi/issues/5456)）。
- 修复继承的提示历史导航：向上浏览时将光标置于开头，向下浏览时置于结尾（[#5454](https://github.com/earendil-works/pi/issues/5454)）。
- 修复 tmux 设置文档：`extended-keys-format csi-u` 需要 tmux 3.5，并记录 tmux 3.2-3.4 的回退方案（[#5432](https://github.com/earendil-works/pi/issues/5432)）。
- 修复继承的 OpenRouter 路由首选项，使 OpenAI 兼容自定义 provider 在其基础 URL 未直接指向 OpenRouter 时仍可工作（[#5347](https://github.com/earendil-works/pi/issues/5347)）。
- 修复内置工具展开提示，使右括号样式一致（[#5359](https://github.com/earendil-works/pi/issues/5359)）。
- 修复技能包装的提示，在技能指令与用户消息之间插入间距（[#5371](https://github.com/earendil-works/pi/pull/5371) by [@Perlence](https://github.com/Perlence)）。

## [0.78.1] - 2026-06-04

### 新功能

- **更多内置 provider 覆盖** - 新增 Ant Ling 和 NVIDIA NIM provider 设置，以及直接 MiniMax provider 的 MiniMax-M3 支持。参见 [Providers](docs/providers.md)。
- **更丰富的扩展上下文** - 扩展可使用 `ctx.mode` 和 `ctx.getSystemPromptOptions()` 适配 TUI、RPC、JSON 和 print 模式，并检查基础系统提示输入。参见 [Extensions](docs/extensions.md)。

### 新增

- 新增容器化文档和 Gondolin 扩展示例，用于将内置工具路由到本地 micro-VM。
- 新增 Ant Ling provider 选择和设置文档。
- 为 `minimax` 和 `minimax-cn` 直接 provider 新增继承自 `@earendil-works/pi-ai` 的 MiniMax-M3 模型支持（[#5313](https://github.com/earendil-works/pi/issues/5313)）。
- 新增 NVIDIA NIM provider 选择、设置文档和直接 NIM 请求归因标头。
- 将 `ctx.mode` 加入扩展上下文，使扩展可区分 TUI、RPC、JSON 和 print 模式。
- 为扩展命令新增 `ctx.getSystemPromptOptions()`，以检查当前基础系统提示输入（[#5306](https://github.com/earendil-works/pi/pull/5306) by [@xl0](https://github.com/xl0)）。

### 修复

- 修复临时扩展包安装：使用权限为 `0700` 的私有 `~/.pi/agent/tmp/extensions` 目录，而非 `os.tmpdir()/pi-extensions`。
- 修复 git 包源处理，拒绝不安全的主机/路径组件，并使受管克隆路径位于安装根目录内。
- 修复 HTML 会话导出中的存储型 XSS：去除控制字符后，使用 scheme 允许列表清理 Markdown 链接和图像 URL。
- 修复打包 Node 应用中的 SDK 嵌入：当 bundle 入口点旁不存在 `package.json` 时不再因 `ENOENT` 失败。包元数据读取器现在会优雅处理缺失的 `package.json` 并使用默认值，使 `createAgentSession()` 在运行时无需相邻包文件（[#5226](https://github.com/earendil-works/pi/issues/5226)）。
- 修复非 Codex provider（如通过 OpenAI 兼容 API 的 llama.cpp）不遵守 HTTP 超时设置。`httpIdleTimeoutMs` 设置（通过 `/settings` 的 HTTP timeout 设置）现在作为所有支持它的 provider 的默认 SDK 请求超时，而不只适用于 OpenAI Codex Responses。禁用超时（HTTP timeout = false）现在会通过发送最大 int32 值（实际上无限）而非 0，正确禁用所有受支持 provider 的 SDK 超时，因为 SDK 将 timeout=0 视为立即超时（[#5294](https://github.com/earendil-works/pi/issues/5294)）。
- 修复继承的 Amazon Bedrock 请求：以占位符替换空的必需 user/tool-result 文本，并跳过空的重放文本块（[#4975](https://github.com/earendil-works/pi/issues/4975)）。
- 修复继承的 Anthropic Claude Opus 4.7+ 请求以抑制已弃用的 temperature 参数（[#5251](https://github.com/earendil-works/pi/pull/5251) by [@yzhg1983](https://github.com/yzhg1983)）。
- 修复继承的 OpenAI GPT-5.5 生成元数据以省略不支持的 minimal thinking（[#5243](https://github.com/earendil-works/pi/issues/5243)）。
- 修复继承的 OpenRouter Kimi K2.6 thinking 重放和 developer-role 指令处理（[#5309](https://github.com/earendil-works/pi/issues/5309)）。
- 修复继承的 OpenRouter reasoning 指令请求，以在需要时保留 system 角色（[#5221](https://github.com/earendil-works/pi/pull/5221) by [@PriNova](https://github.com/PriNova)）。
- 修复继承的 overlay 焦点恢复，使非捕获 overlay 在 UI 重新渲染和显式释放焦点后保持可交互（[#5235](https://github.com/earendil-works/pi/pull/5235) by [@nicobailon](https://github.com/nicobailon)）。
- 修复继承的列切片和 overlay 合成中的制表符宽度计算，使含制表符输出不会超出终端宽度（[#5218](https://github.com/earendil-works/pi/issues/5218)）。
- 修复打开和列出超大 JSONL 会话文件：逐行读取会话条目而非将整个文件实体化为一个字符串（[#5231](https://github.com/earendil-works/pi/issues/5231)）。
- 修复 WSL `/mnt/...` 仓库中的页脚分支显示，使其在分支变化后刷新（[#5264](https://github.com/earendil-works/pi/pull/5264) by [@psoukie](https://github.com/psoukie)）。
- 修复不生成组件行的 `renderShell: "self"` 工具渲染器留下空白聊天行的问题（[#5299](https://github.com/earendil-works/pi/issues/5299)）。
- 恢复继承的 NVIDIA Qwen 3.5 122B NIM 模型支持。

## [0.78.0] - 2026-05-29

### 新功能

- **命名的启动会话** - `--name` / `-n` 在交互、print、JSON 和 RPC 模式启动前设置会话显示名称。参见 [Naming Sessions](docs/sessions.md#naming-sessions) 和 [Session Options](docs/usage.md#session-options)。
- **可点击的文件工具路径** - 当终端支持时，内置文件工具标题会渲染 OSC 8 `file://` 超链接，包括受支持的 tmux 客户端。

### 新增

- 为扩展作者导出 `convertToPng`（[#5167](https://github.com/earendil-works/pi-mono/pull/5167) by [@xl0](https://github.com/xl0)）。
- 为扩展作者导出 `parseArgs` 和类型 `Args`（[#5202](https://github.com/earendil-works/pi-mono/pull/5202) by [@xl0](https://github.com/xl0)）。
- 新增 `--name` / `-n`，以在启动时设置会话显示名称（[#5153](https://github.com/earendil-works/pi-mono/issues/5153)）。
- 在退出交互会话时新增恢复命令提示（[#5176](https://github.com/earendil-works/pi-mono/pull/5176) by [@yzhg1983](https://github.com/yzhg1983)）。
- 为内置文件工具标题中显示的文件路径新增 OSC 8 `file://` 超链接（[#5189](https://github.com/earendil-works/pi-mono/pull/5189) by [@mpazik](https://github.com/mpazik)）。
- 新增继承自 `@earendil-works/pi-ai` 的自定义 Amazon Bedrock 请求标头支持（[#5178](https://github.com/earendil-works/pi-mono/pull/5178) by [@stephanmck](https://github.com/stephanmck)）。

### 修复

- 澄清 WezTerm/WSL IME 硬件光标文档，说明光标可见性仍需选择启用（[#5200](https://github.com/earendil-works/pi-mono/issues/5200)）。
- 修复 GitLab Duo 自定义 provider 示例：为 Claude 模型使用 adaptive thinking、暴露 xhigh thinking，并包含较新的已验证模型 ID（[#5201](https://github.com/earendil-works/pi-mono/issues/5201)）。
- 修复 Bun 发布归档创建：安装并复制匹配的 `@mariozechner/clipboard` 基础包及原生 sidecar（[#5184](https://github.com/earendil-works/pi-mono/issues/5184)）。
- 修复在提示循环启动前键入的早期交互输入，使其被缓冲而非丢弃（[#5195](https://github.com/earendil-works/pi-mono/pull/5195) by [@yzhg1983](https://github.com/yzhg1983)）。
- 修复 OpenRouter Moonshot Kimi K2.6 请求，使用 `system` 而非不支持的 `developer` 消息（[#5159](https://github.com/earendil-works/pi-mono/issues/5159)）。
- 修复 OpenCode Go Kimi K2.6 thinking 请求：发送 `thinking` 对象而非无效字符串值；并修复 OpenCode Zen Grok Build thinking 请求以省略不支持的 `reasoning_effort`（[#5169](https://github.com/earendil-works/pi-mono/issues/5169)）。
- 修复 OpenAI Codex Responses SSE 流，在终止事件后中止响应正文读取。
- 修复 OpenCode Kimi K2.6 生成元数据，使用 Anthropic 风格 thinking 元数据而非无效 reasoning-effort 参数。
- 修复 OSC 8 超链接，使其在客户端支持时可通过 tmux 传递（[#5189](https://github.com/earendil-works/pi-mono/pull/5189) by [@mpazik](https://github.com/mpazik)）。
- 修复 ANSI 文本换行，以避免在极长换行行上发生栈溢出（[#5185](https://github.com/earendil-works/pi-mono/issues/5185)）。

## [0.77.0] - 2026-05-28

### 新功能

- **Claude Opus 4.8 支持** - 新增 Anthropic Claude Opus 4.8 元数据并更新 Opus adaptive-thinking 覆盖。
- **选择性禁用工具** - `--exclude-tools` / `-xt` 可禁用特定内置、扩展或自定义工具，同时保留其余工具。参见 [Tool Options](docs/usage.md#tool-options)。
- **无头 Codex 订阅登录** - `/login` 可对 ChatGPT Plus/Pro Codex 订阅使用设备代码认证。参见 [Subscriptions](docs/providers.md#subscriptions) 和 [OpenAI Codex](docs/providers.md#openai-codex)。
- **感知流式状态的扩展输入** - 扩展可通过 `InputEvent.streamingBehavior` 区分空闲提示、流中引导和排队的后续输入。参见 [Input Events](docs/extensions.md#input-events)。

### 新增

- 新增 `--exclude-tools` / `-xt` 以禁用特定内置、扩展或自定义工具，同时保留其余工具（[#5109](https://github.com/earendil-works/pi/issues/5109)）。
- 新增 OpenAI Codex 订阅设备代码登录，作为可选无头替代方案，同时保留浏览器登录为默认值（[#4911](https://github.com/earendil-works/pi/pull/4911) by [@vegarsti](https://github.com/vegarsti)）。
- 将 `streamingBehavior` 加入扩展输入事件，使扩展可区分空闲提示、流中引导和排队的后续输入（[#5107](https://github.com/earendil-works/pi/pull/5107) by [@DanielThomas](https://github.com/DanielThomas)）。
- 新增 Anthropic 的 Claude Opus 4.8 模型元数据，并更新 Opus adaptive-thinking 覆盖以使用它。

### 修复

- 修复启动计时输出，使 `readPipedStdin` 不再包含 `createAgentSessionRuntime` 工作（[#4829](https://github.com/earendil-works/pi/issues/4829)）。
- 修复 OpenRouter DeepSeek V4 `xhigh` reasoning 元数据，以保留 OpenRouter 的原生 effort，而非发送 DeepSeek 的 `max` effort（[#4801](https://github.com/earendil-works/pi/issues/4801)）。
- 修复自定义会话目录，使当前文件夹的 resume/continue 查找限定于活动 cwd，而所有会话列表涵盖自定义目录。
- 修复 SIGTERM/SIGHUP 退出，以运行扩展 `session_shutdown` 清理并恢复终端：信号触发的关闭现在会在任何终端写入前发出 `session_shutdown`，且 SIGHUP 不再硬退出，因此即使终端消失也会释放扩展资源（如 socket）（[#5080](https://github.com/earendil-works/pi/issues/5080)）。
- 修复键盘协议协商，忽略不匹配或延迟的终端响应，避免错误检测到 Kitty 键盘协议（[#5091](https://github.com/earendil-works/pi/pull/5091) by [@mitsuhiko](https://github.com/mitsuhiko)）。
- 通过将原生 clipboard addon 更新到 napi-rs 3.x，修复 MSYS2 ucrt64 Node.js 下的 Windows 启动崩溃（[#5028](https://github.com/earendil-works/pi/issues/5028)）。
- 修复 API key 和 header 配置解析：将纯字符串视为字面量，支持 `$ENV_VAR` / `${ENV_VAR}` 插值及 `$!` bang 转义，并要求配置文件使用显式 env 语法，从而避免 Windows 不区分大小写的 env 匹配损坏字面 key（[#5095](https://github.com/earendil-works/pi/issues/5095)）。
- 修复会话释放，以中止进行中的 agent、压缩、分支摘要、重试和 bash 工作（[#5029](https://github.com/earendil-works/pi/pull/5029) by [@TerminallyChilI](https://github.com/TerminallyChilI)）。
- 修复 `pi.getAllTools()`，为需要按工具归属指引的扩展暴露各工具的 `promptGuidelines`（[#4879](https://github.com/earendil-works/pi/issues/4879)）。
- 修复在从 Anthropic extended-thinking 会话切换后 OpenAI Codex Responses 的重放：为转换后的 thinking/text 块生成唯一后备消息 item ID（[#5148](https://github.com/earendil-works/pi/issues/5148)）。
- 修复 Anthropic 兼容重放：通过新增选择性启用的 `allowEmptySignature` 兼容标志，支持返回空 thinking 签名的 provider（[#4464](https://github.com/earendil-works/pi/issues/4464)）。
- 修复 OpenAI 和 OpenRouter GPT-5.5 Pro thinking level 元数据，仅暴露受支持的 medium、high 和 xhigh effort。
- 修复 OpenCode Go Kimi K2.6 关闭 thinking 的请求，发送 `thinking: "none"`（[#5078](https://github.com/earendil-works/pi/issues/5078)）。
- 修复 Xiaomi Token Plan 模型元数据，省略不支持的 `mimo-v2-flash` 变体（[#5075](https://github.com/earendil-works/pi/issues/5075)）。
- 修复由 `agent_end` 扩展处理器排队的后续消息，使其在 agent 变为空闲前排空（[#5115](https://github.com/earendil-works/pi/pull/5115) by [@DanielThomas](https://github.com/DanielThomas)）。
- 修复扩展输入事件，仅为实际在流式期间排队的提示报告 `streamingBehavior`（[#5107](https://github.com/earendil-works/pi/pull/5107) by [@DanielThomas](https://github.com/DanielThomas)）。
- 修复系统提示工具选择指引，避免偏好不可用的文件探索工具（[#5132](https://github.com/earendil-works/pi/issues/5132)）。
- 修复围栏 `diff` 代码块和其他 highlight.js scope，使其在替换 `cli-highlight` 后仍保留感知主题的语法颜色（[#5092](https://github.com/earendil-works/pi/issues/5092)）。

## [0.76.0] - 2026-05-27

### 新功能

- **面向自动化的显式会话 ID** - `--session-id <id>` 让脚本创建或恢复确切的项目本地会话。参见 [Sessions](docs/usage.md#sessions)。
- **RPC bash 输出可不进入模型上下文** - RPC 客户端可向 `bash` 传递 `excludeFromContext`，使不应随下一条提示发送的命令输出不进入上下文。参见 [RPC mode](docs/rpc.md#bash)。
- **更可预测的 provider 重试与超时** - Codex WebSocket/SSE 等待有界，且 `retry.provider.maxRetries` 控制 provider 重试而非隐藏的 SDK 默认值。参见 [Retry settings](docs/settings.md#retry)。
- **跨环境更好的终端编辑** - Apple Terminal Shift+Enter、Windows/JetBrains 能力检测和感知 Unicode 的词导航改善了交互编辑。参见 [Terminal setup](docs/terminal-setup.md) 和 [Keybindings](docs/keybindings.md)。

### 新增

- 新增 `--session-id`，让 CLI 调用者使用确切的项目本地会话 ID，缺失时创建它（[#4874](https://github.com/earendil-works/pi/issues/4874)）。
- 为 `bash` RPC 命令新增 `excludeFromContext` 标志，以与内部 `executeBash` API 保持一致（[#5039](https://github.com/earendil-works/pi/issues/5039)）。

### 修复

- 修复用户消息转录渲染，以保留用户编写的有序列表标记（[#5013](https://github.com/earendil-works/pi/issues/5013)）。
- 修复自更新命令：显式 `pi update` 运行可绕过 npm、pnpm 和 Bun 最低发布年龄门槛（[#4929](https://github.com/earendil-works/pi/issues/4929)）。
- 修复上下文 token 估算，以与工具结果图像一致地计算用户图像附件（[#4983](https://github.com/earendil-works/pi/issues/4983)）。
- 修复 `httpIdleTimeoutMs` 以应用于 OpenAI Codex Responses WebSocket 空闲等待，新增 `websocketConnectTimeoutMs` 用于有界 WebSocket 连接等待，并新增 10 秒 Codex SSE 响应标头超时（[#4945](https://github.com/earendil-works/pi/issues/4945)）。
- 修复 `RpcClient`，以在子进程意外退出时拒绝待处理请求并消费 stdin pipe 错误（[#4764](https://github.com/earendil-works/pi/issues/4764)）。
- 修复受管 npm 扩展更新，避免包管理器将 pi host 包安装或解析为 peer dependency（[#4907](https://github.com/earendil-works/pi/issues/4907)）。
- 修复 RPC 模式原始 stdout 写入，以重试瞬时背压错误并在关闭期间刷新排队协议输出（[#4897](https://github.com/earendil-works/pi/issues/4897)）。
- 修复 OpenAI Codex Responses 缓存亲和性标头，发送 `session-id` 而非代理不兼容的 `session_id`（[#4967](https://github.com/earendil-works/pi/issues/4967)）。
- 修复 `openai-codex/gpt-5.3-codex-spark` 模型元数据，使用其 128k 上下文窗口（[#4969](https://github.com/earendil-works/pi/issues/4969)）。
- 修复 OpenRouter/Poolside 对 `maximum allowed input length` 错误的上下文溢出检测（[#4943](https://github.com/earendil-works/pi/issues/4943)）。
- 修复 provider 重试控制，使 `retry.provider.maxRetries` 生效、SDK 重试默认 `0`，且不在 Pi 重试处理之后重试 quota/billing 429（[#4991](https://github.com/earendil-works/pi-mono/pull/4991) by [@mitsuhiko](https://github.com/mitsuhiko)）。
- 修复 Apple Terminal `Shift+Enter`，在 Terminal.app 发送普通 Return 时检测本地 macOS modifier 状态。
- 修复 Windows Terminal 能力检测，启用 OSC 8 超链接并保留换行行中的可点击长 URL（[#4923](https://github.com/earendil-works/pi/issues/4923)）。
- 修复 JetBrains 终端能力检测，启用 truecolor 的同时禁用不支持的 OSC 8 超链接（[#5037](https://github.com/earendil-works/pi-mono/pull/5037) by [@Perlence](https://github.com/Perlence)）。
- 修复编辑器和输入的词导航/删除，使用 Unicode 单词边界，同时保留 ASCII 标点边界（[#5022](https://github.com/earendil-works/pi-mono/pull/5022) by [@haoqixu](https://github.com/haoqixu), [#5067](https://github.com/earendil-works/pi-mono/pull/5067) by [@haoqixu](https://github.com/haoqixu), [#5068](https://github.com/earendil-works/pi-mono/pull/5068) by [@haoqixu](https://github.com/haoqixu)）。
- 修复开发文档 `AGENTS.md` 链接，使其指向 pi-mono 指引（[#5041](https://github.com/earendil-works/pi/issues/5041)）。

## [0.75.5] - 2026-05-23

### 新功能

- **更整洁的 read 工具输出** - 折叠的 `read` 工具卡片现在默认只显示读取行，而 `Ctrl+O` 仍会展开完整文件内容。
- **Windows 上更快的文件工具** - 内置文件工具现在在流式期间使用异步文件系统操作，图像调整大小则在 worker 中脱离主 TUI 线程运行。
- **更可靠的包更新** - `pi update` 和 git 包安装现在会协调固定的 git ref 并保持包设置不变。参见 [Packages](docs/packages.md)。
- **自定义 Anthropic 兼容 adaptive thinking** - 自定义 provider 模型配置可通过 `compat.forceAdaptiveThinking` 选择加入 adaptive-thinking Claude 行为。参见 [Custom providers](docs/custom-provider.md) 和 [Models](docs/models.md)。

### 新增

- 将 `compat.forceAdaptiveThinking` 支持加入自定义 Anthropic 兼容模型配置文档和验证（[#4797](https://github.com/earendil-works/pi-mono/pull/4797) by [@mbazso](https://github.com/mbazso)）。
- 为 SDK 使用者新增标准 unified patch，以编辑工具结果详情（[#4821](https://github.com/earendil-works/pi/issues/4821)）。
- 新增 Codex 订阅登录方式选择器，为无头环境提供设备代码认证。

### 变更

- 更改折叠的 read 工具卡片，使其仅在展开前显示读取行（[#4916](https://github.com/earendil-works/pi/issues/4916)）。
- 用一个微型 vendored 原生辅助工具替换继承的可选 `koffi` Windows VT 输入依赖，在保留 Shift+Tab 处理的同时减小安装体积（[#4480](https://github.com/earendil-works/pi/issues/4480)）。
- 更改根开发安装文档以使用 `npm install --ignore-scripts`（[#4868](https://github.com/earendil-works/pi/issues/4868)）。

### 修复

- 修复 `pi update`，使 git 固定包协调至其配置的 ref（[#4869](https://github.com/earendil-works/pi/issues/4869)）。
- 修复 Windows 和 glob/pattern 解析的包/资源路径处理（[#4873](https://github.com/earendil-works/pi-mono/pull/4873) by [@mitsuhiko](https://github.com/mitsuhiko)）。
- 修复配置模式匹配，使其从正确的基础目录解析模式（[#4898](https://github.com/earendil-works/pi-mono/pull/4898) by [@haoqixu](https://github.com/haoqixu)）。
- 修复主题选择器，使其按内容名称而非文件 stem 列出主题（[#4830](https://github.com/earendil-works/pi-mono/pull/4830) by [@Perlence](https://github.com/Perlence)）。
- 修复 OpenCode Zen/Go 请求，发送每会话 OpenCode 路由标头（[#4847](https://github.com/earendil-works/pi/issues/4847)）。
- 修复严格包管理器下的 Amazon Bedrock provider 加载：从 `@earendil-works/pi-ai` 继承声明的 `@smithy/node-http-handler` 依赖（[#4842](https://github.com/earendil-works/pi/issues/4842)）。
- 修复继承的 Amazon Bedrock Claude 请求，默认发送模型输出 token 上限，避免 Bedrock 的 4096-token 默认截断（[#4848](https://github.com/earendil-works/pi/issues/4848)）。
- 修复导出的会话 HTML，在属性值中转义引号字符（[#4832](https://github.com/earendil-works/pi/issues/4832)）。
- 修复 GitHub Copilot 设备代码登录：在支持浏览器的环境中继续打开验证 URL，同时忽略无头使用时的浏览器启动失败（[#4788](https://github.com/earendil-works/pi-mono/pull/4788) by [@vegarsti](https://github.com/vegarsti)）。
- 修复 git 包安装，使现有 checkout 协调至请求的 ref，并更新包设置而不丢失 filter（[#4870](https://github.com/earendil-works/pi/issues/4870)）。
- 发布 0.74.2 补救版本，告知 Node 20 用户在更新到较新 Pi 版本前升级 Node（[#4876](https://github.com/earendil-works/pi/issues/4876)）。
- 修复最终 bash 工具卡片，避免渲染重复的完整输出截断路径（[#4819](https://github.com/earendil-works/pi/issues/4819)）。
- 修复 bash 工具截断行计数，忽略末尾换行符作为额外输出行（[#4818](https://github.com/earendil-works/pi/issues/4818)）。
- 修复页脚主目录缩写，避免缩短仅共享相同前缀的同级路径（[#4878](https://github.com/earendil-works/pi/issues/4878)）。
- 修复 macOS Bun 发布二进制文件以解析原生 clipboard sidecar，使 Ctrl+V 图像粘贴可加载 `@mariozechner/clipboard`（[#4307](https://github.com/earendil-works/pi/issues/4307)）。
- 修复 coding-agent 工具，以避免流式期间的同步文件系统操作，并将图像调整大小移出主 TUI 线程（[#4756](https://github.com/earendil-works/pi-mono/pull/4756) by [@mitsuhiko](https://github.com/mitsuhiko)）。

## [0.75.4] - 2026-05-20

### 新功能

- **强化的 npm 安装与发布路径** - Pi 现在为传递依赖随 CLI 提供生成的 shrinkwrap，阻止意外 lockfile 变更，在检查中验证依赖固定和生命周期脚本允许列表，在支持时为自更新和本地发布安装禁用生命周期脚本，并在发布前冒烟测试隔离的 npm 和 Bun 安装。参见 [Supply-chain hardening](../../README.md#supply-chain-hardening)。

### 新增

- 在 `pi update` 运行后新增交互式更新说明，使用户可在继续前查看已安装版本的 changelog（[#4724](https://github.com/earendil-works/pi-mono/pull/4724) by [@mitsuhiko](https://github.com/mitsuhiko)）。
- 从包根目录导出图像调整大小工具，供 SDK 使用者使用（[#4775](https://github.com/earendil-works/pi-mono/pull/4775) by [@xl0](https://github.com/xl0)）。

### 变更

- 更改源语法以避免需要 JavaScript emit 的 TypeScript 构造，使核心源与 Node.js 仅剥离 TypeScript 检查兼容。
- 从 CLI 包中移除 web UI workspace 引用，并删除包级开发 watch 脚本。
- 发布的 npm 安装现在包含 `npm-shrinkwrap.json`，以锁定 CLI 包的传递依赖。
- 改善终端主题对 light/dark 和 truecolor 的检测。
- 更改自更新包管理器命令，在重新安装期间禁用生命周期脚本。

### 修复

- 修复系统提示，告诉模型在读取主题特定相对引用前，先在绝对包路径下解析 pi 文档和示例（[#4752](https://github.com/earendil-works/pi/issues/4752)）。
- 修复工具调用预检期间的扩展 `ctx.abort()`，使其停止后续确认并像 Escape 一样恢复排队的交互输入（[#4276](https://github.com/earendil-works/pi/issues/4276)）。
- 修复 AgentSession 重试、压缩和事件完成：使用等待的 agent 生命周期而非单独的事件队列，并将 `willRetry` 加入 `agent_end` 会话事件。
- 修复 fork 会话运行时状态，使活动会话 id 与 fork 目标保持一致（[#4799](https://github.com/earendil-works/pi-mono/pull/4799) by [@Perlence](https://github.com/Perlence)）。
- 修复 subagent 扩展的并行模式，向父模型返回有用的每任务输出和失败任务诊断，而非 100 字符预览（[#4710](https://github.com/earendil-works/pi/issues/4710)）。
- 修复 Windows 本地 bash 执行，在从后台 SDK 进程启动时隐藏辅助控制台窗口（[#4699](https://github.com/earendil-works/pi/issues/4699)）。
- 修复受管 npm 扩展文件夹，在支持时设置 cloud-sync ignore 元数据（[#4763](https://github.com/earendil-works/pi/issues/4763)）。
- 修复 HTTP 空闲超时配置，使长时间运行的 provider 流避免过早空闲断开（[#4759](https://github.com/earendil-works/pi-mono/pull/4759) by [@mitsuhiko](https://github.com/mitsuhiko)）。
- 修复默认系统提示边界，使用显式 XML 标签以获得更清晰的文件分隔（[#4709](https://github.com/earendil-works/pi-mono/pull/4709) by [@herrnel](https://github.com/herrnel)）。
- 修复 HTML 分享/导出侧栏对共享工具条目的点击，使其滚动到已渲染的工具调用（[#4664](https://github.com/earendil-works/pi-mono/pull/4664) by [@yzhg1983](https://github.com/yzhg1983)）。
- 修复主题调色板，设置显式文本颜色以避免终端默认颜色漂移。
- 修复 truecolor 检测，以对齐终端图像渲染和交互主题决定。
- 修复继承自 `@earendil-works/pi-tui` 的 loader 指示器启动，使初始化不会在 frame 可用前运行。
- 修复继承自 `@earendil-works/pi-ai` 的 OpenAI 兼容默认输出 token 请求，避免在 vLLM 等服务器上保留不可能的上下文窗口（[#4675](https://github.com/earendil-works/pi/issues/4675)）。
- 修复继承自 `@earendil-works/pi-ai` 的 OpenAI 提示缓存 key，使其保持在 64 字符 provider 限制内（[#4720](https://github.com/earendil-works/pi/issues/4720)）。
- 修复 fnm 管理的 Node.js 安装的 Windows npm 系列包命令，它们同时暴露无扩展名 Unix 脚本和 `.cmd` shim（[#4793](https://github.com/earendil-works/pi/issues/4793)）。

## [0.75.3] - 2026-05-18

### 修复

- 修复 undici 8 HTTP/2 已销毁会话竞争导致 Node CLI 崩溃：保留之前仅 HTTP/1.1 的 fetch dispatcher 行为（[#4681](https://github.com/earendil-works/pi/issues/4681)）。

## [0.75.2] - 2026-05-18

### 修复

- 修复 Bun 编译的发布二进制文件启动失败：Bun 内置 undici shim 缺少 npm undici 的 `install` 导出（[#4661](https://github.com/earendil-works/pi-mono/pull/4661) by [@dmasiero](https://github.com/dmasiero)）。
- 修复 Xiaomi MiMo 生成模型元数据，使其为 thinking-mode 多轮请求以 `reasoning_content` 重放 assistant 工具调用消息，继承自 `@earendil-works/pi-ai`（[#4678](https://github.com/earendil-works/pi/issues/4678)）。
- 修复 Windows 外部编辑器交接，使 vim/nvim 在从 TUI 打开后可接收输入（[#4612](https://github.com/earendil-works/pi/issues/4612)）。
- 修复 Windows npm 自更新，在重新安装 pi 前将已加载的原生依赖包移出活动安装目录（[#4157](https://github.com/earendil-works/pi/issues/4157)）。
- 修复 pnpm v11 全局安装的 `pi update --self` 检测，其包路径通过 pnpm store 解析（[#4647](https://github.com/earendil-works/pi/issues/4647)）。
- 修复 Windows pnpm 自更新，以解析 pnpm 命令 shim 并通过 pnpm 运行，而非要求手动更新（[#4157](https://github.com/earendil-works/pi/issues/4157)）。
- 修复 Windows npm 系列命令执行，使用 cross-spawn 而非解析 `.cmd` shim 内部结构（[#4665](https://github.com/earendil-works/pi/issues/4665)）。

## [0.75.1] - 2026-05-18

### 修复

- 修复配置选择器，使其可见行数随终端高度缩放（[#4243](https://github.com/earendil-works/pi-mono/pull/4243) by [@samjonester](https://github.com/samjonester)）。
- 修复 Anthropic 兼容 API-key 请求以忽略无关 `ANTHROPIC_AUTH_TOKEN` 环境值，避免为 Xiaomi MiMo 等 provider 使用无效 bearer 凭据，继承自 `@earendil-works/pi-ai`（[#4342](https://github.com/earendil-works/pi/issues/4342)）。
- 修复 Amazon Bedrock 消息转换，跳过未知内容块而非使流失败，继承自 `@earendil-works/pi-ai`（[#4223](https://github.com/earendil-works/pi/issues/4223)）。
- 修复 Azure OpenAI Responses 和 OpenAI Responses 错误格式化，将 HTTP 状态代码加到 `errorMessage` 前缀，因此 agent 层自动重试分类器可正确匹配瞬时 5xx 和 429 错误，继承自 `@earendil-works/pi-ai`（[#4232](https://github.com/earendil-works/pi/issues/4232)）。
- 修复 OpenCode Go Kimi reasoning 重放：仅对 OpenCode Go 将流式 `reasoning` 字段标准化回 `reasoning_content`，继承自 `@earendil-works/pi-ai`（[#4251](https://github.com/earendil-works/pi/issues/4251)）。
- 修复 Xiaomi MiMo 模型元数据，使用 OpenAI 兼容端点和 `openai-completions` API，恢复多轮 thinking/tool-call 会话，继承自 `@earendil-works/pi-ai`（[#4505](https://github.com/earendil-works/pi/issues/4505)）。
- 修复 Node 26.0 下压缩 fetch 响应的 JSON 解析失败：随 pi 的全局 dispatcher 安装 undici fetch globals（[#4650](https://github.com/earendil-works/pi/issues/4650), [#4652](https://github.com/earendil-works/pi/issues/4652), [#4653](https://github.com/earendil-works/pi/issues/4653)）。
- 修复 Windows 上的 npm 系列包命令，以避免安装前缀包含空格时 shell 参数拆分（[#4623](https://github.com/earendil-works/pi/issues/4623)）。

### 移除

- 移除继承自 `@earendil-works/pi-ai` 的不可用 OpenAI Codex fast 模型变体。

## [0.75.0] - 2026-05-17

### 破坏性变更

- 将最低受支持 Node.js 版本提升至 22.19.0。

### 修复

- 修复压缩摘要调用以使用自定义 agent 流函数，保留代理支持的 LLM 路由（[#4484](https://github.com/earendil-works/pi/issues/4484)）。
- 修复系统提示和上下文文件边界，使用显式 XML 标签而非 Markdown 标题，减少模型对边界的不一致摄取（[#4541](https://github.com/earendil-works/pi-mono/pull/4541) by [@herrnel](https://github.com/herrnel)）。
- 修复 OpenAI Codex 生成模型元数据，使用继承自 `@earendil-works/pi-ai` 的当前上游模型列表（[#4603](https://github.com/earendil-works/pi-mono/pull/4603) by [@mattiacerutti](https://github.com/mattiacerutti)）。
- 修复继承自 `@earendil-works/pi-ai` 的 GitHub Copilot GPT 模型 thinking 元数据，将不支持的 minimal thinking 映射为 low（[#4622](https://github.com/earendil-works/pi-mono/pull/4622) by [@mattiacerutti](https://github.com/mattiacerutti)）。
- 修复用户作用域的 npm pi 包，使其安装在 `~/.pi/agent/npm/` 而非 npm 的全局包根目录，从而避免系统管理 Node 安装中的权限错误（[#4587](https://github.com/earendil-works/pi/issues/4587)）。
- 修复全局 fetch 代理/超时变通方案后 Mistral 请求失败：移除自定义 fetch 覆盖，改用 undici 8 dispatcher 支持（[#4619](https://github.com/earendil-works/pi/issues/4619)）。
- 修复所宣称输出限制实际等于完整上下文窗口的模型的默认输出 token 请求，避免不可能的 provider 请求，继承自 `@earendil-works/pi-ai`（[#4614](https://github.com/earendil-works/pi/issues/4614)）。

## [0.74.1] - 2026-05-16

### 新功能

- **图像生成支持** - 新增继承自 `@earendil-works/pi-ai` 的图像生成 API、生成图像模型元数据和内置 OpenRouter 图像生成支持。
- **Together AI provider** - 新增 Together AI 作为内置 provider，具有 `/login` API-key 认证、默认模型解析和设置文档。参见 [README.md#providers--models](README.md#providers--models) 和 [docs/providers.md](docs/providers.md)。
- **Windows ARM64 独立二进制文件** - 新增 Windows ARM64 独立发布构件。
- **改进的终端和 markdown 渲染** - 新增 markdown 列表缩进、任务列表复选框渲染、大型 markdown 健壮性和内联图像放置修复，继承自 `@earendil-works/pi-tui`。

### 新增

- 新增来自 `@earendil-works/pi-ai` 的图像生成支持，包括图像生成 API、图像模型元数据和内置 OpenRouter 图像生成支持（[#3887](https://github.com/earendil-works/pi-mono/pull/3887) by [@cristinaponcela](https://github.com/cristinaponcela)）。
- 将 Together AI 加入内置 provider 设置、`/login` API-key 认证和默认模型解析（[#3624](https://github.com/earendil-works/pi-mono/pull/3624) by [@Nutlope](https://github.com/Nutlope)）。
- 新增 Windows ARM64 独立二进制发布构件（[#4458](https://github.com/earendil-works/pi/pull/4458) by [@brianmichel](https://github.com/brianmichel)）。

### 修复

- 修复 Node 26 OpenAI 兼容流在空闲五分钟后超时：通过 pi 的 undici dispatcher 路由全局 fetch（[#4519](https://github.com/earendil-works/pi/issues/4519)）。
- 修复 pnpm 全局包安装：从 pnpm 布局解析全局包根目录。
- 修复 sandboxed pasteboard 拒绝下的 macOS clipboard 访问错误，使其不再中止进程（[#4492](https://github.com/earendil-works/pi/issues/4492)）。
- 修复 scoped 模型启动提示，显示配置的模型循环 keybinding（[#4508](https://github.com/earendil-works/pi/issues/4508)）。
- 修复资源路径显示，以区分跨包位置冲突的包/资源名称。
- 修复 macOS x86_64 的 `fd` 自动下载，固定到最后一个发布 Intel macOS 二进制文件的版本（[#4559](https://github.com/earendil-works/pi/issues/4559)）。
- 修复 skill 诊断，当 skill 名称与父目录不同时停止警告（[#4534](https://github.com/earendil-works/pi/issues/4534)）。
- 修复提示模板参数解析，将未加引号的多行输入按换行符拆分（[#4553](https://github.com/earendil-works/pi/issues/4553)）。
- 修复 `--resume` 会话列表，对进行中的会话元数据加载设上限，避免大型会话历史 OOM（[#4583](https://github.com/earendil-works/pi/issues/4583)）。
- 修复交互错误消息，使其带有尾部间距渲染，避免 reload 错误与资源列表连在一起（[#4510](https://github.com/earendil-works/pi/issues/4510)）。
- 修复 `.agents` 包出处元数据，使其能在包管理器扫描后保留。
- 修复 Termux 设置文档中的嵌套代码围栏，使示例 AGENTS.md 正确渲染（[#4503](https://github.com/earendil-works/pi/issues/4503)）。
- 修复扩展确认对话框聚焦时的工具输出展开（[#4429](https://github.com/earendil-works/pi/issues/4429)）。
- 修复在 `message_stop` 前结束的 Anthropic 流的自动重试（[#4433](https://github.com/earendil-works/pi/issues/4433)）。
- 修复压缩摘要调用，将请求的输出 token 限制在模型上限内。
- 修复未捕获的交互模式异常，在退出前恢复终端（[#4426](https://github.com/earendil-works/pi-mono/pull/4426) by [@ofa1](https://github.com/ofa1)）。
- 修复 ANSI 剥离，使其在移除依赖后匹配 `strip-ansi` 行为。
- 修复在移除依赖后由会话 ID 共享的 UUIDv7 序列生成。
- 修复继承自 `@earendil-works/pi-ai` 的 OpenRouter 缓存 token 用量计算、Fireworks 缓存兼容性和 OpenAI Codex WebSocket 代理处理。
- 修复继承自 `@earendil-works/pi-tui` 的 markdown 列表换行、任务列表复选框、大型 markdown 渲染、WezTerm Kitty 键盘 escape 处理和短视口内联图像放置。
- 修复跨包 scope 的主题共享，使扩展不再因 `Theme not initialized` 崩溃（[#4333](https://github.com/earendil-works/pi/issues/4333)）。
- 修复 keybinding 提示，在 macOS 上显示 Option 而非 Alt（[#4289](https://github.com/earendil-works/pi/issues/4289)）。
- 修复交互更新通知，使其在终端支持超链接时将 changelog 渲染为 OSC 8 超链接（[#4280](https://github.com/earendil-works/pi/issues/4280)）。

## [0.74.0] - 2026-05-07

### 变更

- 为迁移至 `earendil-works/pi-mono` 和 `@earendil-works/*` 包 scope 更新仓库链接和包引用。

## [0.73.1] - 2026-05-07

### 新功能

- **npm scope 迁移的自更新支持**：`pi update --self` 现在支持即将从 `@mariozechner/pi-coding-agent` 重命名为 `@earendil-works/pi-coding-agent` 的包。新包发布后，现有全局安装可通过正常自更新流程更新；pi 将卸载旧全局包并安装版本检查端点返回的包名称。
- **交互式 OAuth 登录选择**：OAuth provider 现在可在 `/login` 中展示多个登录选项，从而启用 provider 特定的交互认证流程。参见 [Providers](docs/providers.md)。
- **JSONC 风格 `models.json` 解析**：`models.json` 现在允许注释和尾随逗号，使自定义 provider 和模型配置更易维护。参见 [Providers](docs/providers.md) 和 [Custom Providers](docs/custom-provider.md)。

### 新增

- 新增交互式登录选择支持，使 OAuth provider 可展示多个登录选项（[#4190](https://github.com/earendil-works/pi-mono/pull/4190) by [@mitsuhiko](https://github.com/mitsuhiko)）。

### 变更

- 更改 `pi update --self`，以遵循 Pi 版本检查端点返回的活动包名称，省略时默认当前包，并在安装重命名包前卸载旧全局包。
- 更改扩展加载以使用上游 `jiti` 2.7，而非 `@mariozechner/jiti` fork（[#4244](https://github.com/earendil-works/pi-mono/pull/4244) by [@pi0](https://github.com/pi0)）。
- 更改 `models.json` 解析以允许注释和尾随逗号（[#4162](https://github.com/earendil-works/pi-mono/pull/4162) by [@julien-c](https://github.com/julien-c)）。

### 修复

- 修复 `pi -p`：将以 YAML frontmatter 开头的提示视为扩展标志而非用户消息（[#4163](https://github.com/badlogic/pi-mono/issues/4163)）。
- 修复在工具运行时切换 thinking 块可见性后，待处理工具结果不在实时 TUI 更新的问题（[#4167](https://github.com/badlogic/pi-mono/issues/4167)）。
- 修复 `/copy` 在 Linux 上报告成功但未在仅 Wayland compositor（Hyprland、Niri、...）写入 clipboard：跳过 Linux 上仅 X11 的原生 addon，改经 `wl-copy`/`xclip`/`xsel` 路由（[#4177](https://github.com/badlogic/pi-mono/issues/4177)）。
- 修复 HTML 会话导出，从渲染后的用户消息剥离 skill wrapper XML（[#4234](https://github.com/earendil-works/pi-mono/pull/4234) by [@aliou](https://github.com/aliou)）。
- 修复在同一 choice 中交错内容与工具调用 delta 的 OpenAI 兼容 chat completion 流。
- 修复 OpenAI Codex OAuth 刷新失败在 TUI 活动时直接写入 stderr（[#4141](https://github.com/badlogic/pi-mono/issues/4141)）。
- 修复 OpenAI Codex Responses 请求，发送非空系统提示（[#4184](https://github.com/earendil-works/pi-mono/issues/4184)）。
- 修复 Kimi K2 P6 别名的 Kimi For Coding 模型解析（[#4218](https://github.com/earendil-works/pi-mono/issues/4218)）。
- 修复 Kitty 内联图像重绘，使其保持在 TUI 拥有的终端区域内，避免写入活动 viewport 以下。
- 修复 Kitty 内联图像渲染，让终端分配图像 ID 并将已解析图像 ID 限制为有效值。
- 修复内联图像能力检测，在 cmux 终端中禁用内联图像。

## [0.73.0] - 2026-05-04

### 新功能

- **Xiaomi MiMo API 计费和区域 Token Plan provider** - `xiaomi` 现在使用 API 计费，并提供独立的 `xiaomi-token-plan-{cn,ams,sgp}` provider。参见 [docs/providers.md#api-keys](docs/providers.md#api-keys) 和 [README.md#providers--models](README.md#providers--models)。（[#4112](https://github.com/badlogic/pi-mono/pull/4112) by [@Phoen1xCode](https://github.com/Phoen1xCode)）
- **增量 bash 输出流式传输** - Bash 工具输出现在在命令运行时出现，而非仅在完成后出现。（[#4145](https://github.com/badlogic/pi-mono/issues/4145)）
- **紧凑 read 渲染** - Pi 文档、上下文文件和 skill 的交互式 `read` 输出默认折叠，并显示选定行范围。

### 破坏性变更

- 将内置 `xiaomi` provider 从 Token Plan AMS 切换至 Xiaomi 的 API 计费端点，并将其 `/login` 显示从 “Xiaomi MiMo Token Plan” 重命名为 “Xiaomi MiMo”。`XIAOMI_API_KEY` 现在指向 [platform.xiaomimimo.com](https://platform.xiaomimimo.com) 的 API 计费 key。Token Plan 用户应切换到适当的 `xiaomi-token-plan-*` provider 并设置相应 env var（[#4112](https://github.com/badlogic/pi-mono/pull/4112) by [@Phoen1xCode](https://github.com/Phoen1xCode)）。

### 新增

- 新增三个在 `/login` 中可见的 Xiaomi MiMo Token Plan 区域 provider：`xiaomi-token-plan-cn` (`XIAOMI_TOKEN_PLAN_CN_API_KEY`)、`xiaomi-token-plan-ams` (`XIAOMI_TOKEN_PLAN_AMS_API_KEY`)、`xiaomi-token-plan-sgp` (`XIAOMI_TOKEN_PLAN_SGP_API_KEY`)。每个默认使用 `mimo-v2.5-pro`（[#4112](https://github.com/badlogic/pi-mono/pull/4112) by [@Phoen1xCode](https://github.com/Phoen1xCode)）。

### 变更

- 更改 `read` 工具渲染，使 Pi 文档、AGENTS/CLAUDE 上下文文件和 `SKILL.md` 内容在交互输出中默认折叠。

### 修复

- 修复 Qwen 3.5/3.6 和 MiniMax M2.7 的生成 OpenAI 兼容模型元数据，使这些模型可通过内置 provider 目录工作（[#4110](https://github.com/badlogic/pi-mono/pull/4110) by [@jsynowiec](https://github.com/jsynowiec)）。
- 修复 Bedrock Claude Opus 4.7 `xhigh` thinking 请求，保留 provider 的原生 effort 值。
- 修复 OpenAI Codex WebSocket 传输：当流式开始前设置失败时回退至 SSE，并在 assistant 消息中显示传输诊断（[#4133](https://github.com/badlogic/pi-mono/issues/4133)）。
- 修复 OpenAI Codex WebSocket 传输在会话关闭时关闭缓存 WebSocket 会话，避免 `--print` 和 JSON 模式进程在响应后保持存活（[#4103](https://github.com/badlogic/pi-mono/issues/4103)）。
- 修复紧凑 `read` 工具调用，使其直接渲染并在交互输出中包含选定行范围。
- 修复交互会话，使其在终端输入丢失时退出，而非继续处于损坏状态。
- 修复 bash 工具输出，使其在命令运行时增量流式传输而非等待命令完成（[#4145](https://github.com/badlogic/pi-mono/issues/4145)）。
- 修复 selector 和 autocomplete fuzzy 排名，以优先精确匹配。

## [0.72.1] - 2026-05-02

## [0.72.0] - 2026-05-01

### 新功能

- **Xiaomi MiMo Token Plan provider** - 新 Anthropic 兼容 provider，具有 `XIAOMI_API_KEY` 认证、默认模型 (`mimo-v2.5-pro`) 和 `/login` 显示。参见 [docs/providers.md](docs/providers.md)。（[#4005](https://github.com/badlogic/pi-mono/pull/4005) by [@Phoen1xCode](https://github.com/Phoen1xCode)）。
- **模型 thinking level 元数据** - 模型现在可通过 `thinkingLevelMap` 声明其支持的 thinking level，替换旧的 `reasoningEffortMap`。参见 [docs/models.md#thinking-level-map](docs/models.md#thinking-level-map) 和 [docs/custom-provider.md](docs/custom-provider.md)。（[#3208](https://github.com/badlogic/pi-mono/issues/3208)）。
- **自定义 provider 基础 URL 覆盖** - `pi.registerProvider()` 现在遵守每模型 `baseUrl` 设置。参见 [docs/custom-provider.md](docs/custom-provider.md)。（[#4063](https://github.com/badlogic/pi-mono/issues/4063)）。
- **回合后停止回调** - agent loop 现在可通过 `shouldStopAfterTurn` 在完成一个回合后优雅退出。参见 [`packages/agent/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md)。
- **自更新检测修复** - `pi` 现在可正确识别并应用可用更新。（[#3942](https://github.com/badlogic/pi-mono/issues/3942), [#3980](https://github.com/badlogic/pi-mono/issues/3980), [#3922](https://github.com/badlogic/pi-mono/issues/3922)）。

### 破坏性变更

- 在 `models.json` 和 `pi.registerProvider()` 模型定义中，将 `compat.reasoningEffortMap` 替换为模型级 `thinkingLevelMap`（[#3208](https://github.com/badlogic/pi-mono/issues/3208)）。迁移：将旧映射从 `compat.reasoningEffortMap` 移至 `thinkingLevelMap`。对 provider 特定 thinking 值使用字符串值，对应隐藏且在循环中跳过的不支持 pi level 使用 `null`。参见 `docs/models.md#thinking-level-map` 和 `docs/custom-provider.md`。

### 新增

- 新增 Xiaomi MiMo Token Plan provider 支持，包括 `XIAOMI_API_KEY`、默认模型解析、`/login` 显示支持和 provider 文档（[#4005](https://github.com/badlogic/pi-mono/pull/4005) by [@Phoen1xCode](https://github.com/Phoen1xCode)）。
- 在 `models.json` 和 `pi.registerProvider()` 中新增模型级 `thinkingLevelMap` 支持，允许模型仅暴露实际支持的 thinking level（[#3208](https://github.com/badlogic/pi-mono/issues/3208)）。
- 新增 `shouldStopAfterTurn` agent loop 回调以控制回合后停止，继承自 `@mariozechner/pi-agent-core`。参见 [`packages/agent/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md)。

### 修复

- 修复默认传输设置以使用 `auto`，使 OpenAI Codex 在可用时使用缓存 WebSocket 上下文（[#4083](https://github.com/badlogic/pi-mono/issues/4083)）。
- 修复 `pi.registerProvider()`，遵守每模型 `baseUrl` 覆盖（[#4063](https://github.com/badlogic/pi-mono/issues/4063)）。
- 修复自更新检测，使 `pi` 正确识别较新版本可用并应用更新（[#3942](https://github.com/badlogic/pi-mono/issues/3942), [#3980](https://github.com/badlogic/pi-mono/issues/3980), [#3922](https://github.com/badlogic/pi-mono/issues/3922)）。

## [0.71.1] - 2026-05-01

### 新增

- 将 `websocket-cached` 加入与 ChatGPT 订阅认证配合使用的 OpenAI Codex provider 传输设置选项。这会为一个会话保持同一 WebSocket 打开，并在首次请求后尽可能只发送新的会话项，而非重发完整聊天历史。

## [0.71.0] - 2026-04-30

### 破坏性变更

- 移除内置 Google Gemini CLI 和 Google Antigravity 支持。使用这些 provider 的现有配置必须切换至另一受支持 provider。

### 新功能

- Cloudflare AI Gateway provider 支持，具有 `CLOUDFLARE_API_KEY`/`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_GATEWAY_ID`、默认模型解析和 `/login` 显示。参见 [docs/providers.md#cloudflare-ai-gateway](docs/providers.md#cloudflare-ai-gateway)。（[#3856](https://github.com/badlogic/pi-mono/pull/3856) by [@mchenco](https://github.com/mchenco)）。
- Moonshot AI provider 支持，具有 `MOONSHOT_API_KEY`、默认模型解析和 `/login` 显示。
- Mistral Medium 3.5 内置模型支持。参见 [docs/providers.md#api-keys](docs/providers.md#api-keys)。（[#4009](https://github.com/badlogic/pi-mono/pull/4009) by [@technocidal](https://github.com/technocidal)）。
- 扩展 API 可替换最终的 `message_end` 消息、通过 `ctx.ui.getEditorComponent()` 包装自定义 editor factory，并观察 thinking level 变化。参见 [docs/extensions.md#message_start--message_update--message_end](docs/extensions.md#message_start--message_update--message_end)、[docs/extensions.md#widgets-status-and-footer](docs/extensions.md#widgets-status-and-footer) 和 [docs/extensions.md#thinking_level_select](docs/extensions.md#thinking_level_select)。
- `PI_CODING_AGENT_SESSION_DIR` 从环境配置会话存储。参见 [docs/usage.md#environment-variables](docs/usage.md#environment-variables)。

### 新增

- 新增 Cloudflare AI Gateway 作为内置 provider，具有 `CLOUDFLARE_API_KEY`/`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_GATEWAY_ID` 设置、默认模型解析、`/login` 显示支持和 provider 文档（[#3856](https://github.com/badlogic/pi-mono/pull/3856) by [@mchenco](https://github.com/mchenco)）。
- 新增 Moonshot AI 作为内置 provider，具有 `MOONSHOT_API_KEY` 设置、默认模型解析和 `/login` 显示支持。
- 通过 `@mariozechner/pi-ai` 新增 Mistral Medium 3.5 内置模型支持（[#4009](https://github.com/badlogic/pi-mono/pull/4009) by [@technocidal](https://github.com/technocidal)）。
- 在 assistant 消息中新增路由的 OpenAI 兼容响应模型元数据，使 OpenRouter 等 provider 可暴露实际使用的模型（[#3968](https://github.com/badlogic/pi-mono/pull/3968) by [@purrgrammer](https://github.com/purrgrammer)）。
- 新增 `PI_CODING_AGENT_SESSION_DIR` 作为 `--session-dir` 的环境等效项（[#4027](https://github.com/badlogic/pi-mono/issues/4027)）。
- 新增 `message_end` 扩展结果支持以替换最终消息，使扩展可覆盖 assistant 用量成本（[#3982](https://github.com/badlogic/pi-mono/issues/3982)）。
- 为 `pi.registerProvider()` 新增顶级 `name` 支持，使扩展注册的 provider 可在 `/login` 中显示友好名称（[#3956](https://github.com/badlogic/pi-mono/issues/3956)）。
- 新增 `ctx.ui.getEditorComponent()`，使扩展可包装当前配置的自定义 editor factory（[#3935](https://github.com/badlogic/pi-mono/issues/3935)）。
- 新增 `thinking_level_select` 扩展事件，用于观察 thinking level 变化（[#3888](https://github.com/badlogic/pi-mono/issues/3888)）。

### 修复

- 修复 WSL clipboard 图像粘贴，直接传递 PowerShell 保存路径而非通过自定义环境变量（[#2469](https://github.com/badlogic/pi-mono/issues/2469)）。
- 修复无签名工具调用的 Google Vertex Gemini 3 工具调用重放（[#4032](https://github.com/badlogic/pi-mono/issues/4032)）。
- 修复被阻止的 `edit` 工具结果：在交互扩展确认后重复渲染拒绝原因（[#3830](https://github.com/badlogic/pi-mono/issues/3830)）。
- 修复扩展触发的 thinking level 变化，立即刷新交互 editor 边框（[#3888](https://github.com/badlogic/pi-mono/issues/3888)）。
- 修复 coding-agent README 的 See Also 链接，使其指向 `@mariozechner/pi-agent-core`（[#4023](https://github.com/badlogic/pi-mono/issues/4023)）。
- 修复 `grep` 和 `find` 工具对类 flag 搜索模式的参数注入（[#4018](https://github.com/badlogic/pi-mono/issues/4018)）。
- 修复 Windows 上的 PowerShell shell 命令输出，仅在 Unix 上生成 detached 进程（[#4013](https://github.com/badlogic/pi-mono/pull/4013) by [@picasso250](https://github.com/picasso250)）。
- 修复配置 `npmCommand` 使用 Bun 时 Bun 包管理器的 `node_modules` 发现（[#3998](https://github.com/badlogic/pi-mono/pull/3998) by [@thirtythreeforty](https://github.com/thirtythreeforty)）。
- 修复 edit 和 edit-preview 访问失败，以正确报告文件系统错误（[#3955](https://github.com/badlogic/pi-mono/pull/3955) by [@rwachtler](https://github.com/rwachtler)）。
- 修复 `ProcessTerminal` 大小调整：先使用 `COLUMNS` 和 `LINES`，再回退到 80x24（[#4004](https://github.com/badlogic/pi-mono/issues/4004)）。
- 更新 `@anthropic-ai/sdk` 以清除 GHSA-p7fg-763f-g4gf 审计发现（[#3992](https://github.com/badlogic/pi-mono/issues/3992)）。
- 更新 `@mariozechner/clipboard` 至经证明的发布版本，使具有信任策略的包管理器不会拒绝安装（[#3946](https://github.com/badlogic/pi-mono/issues/3946)）。
- 修复项目上下文发现，同时加载 `AGENTS.MD` 文件和 `AGENTS.md`（[#3949](https://github.com/badlogic/pi-mono/issues/3949)）。
- 修复 `/handoff`，使用压缩后的会话上下文而非压缩前的原始消息（[#3945](https://github.com/badlogic/pi-mono/issues/3945)）。
- 修复 DeepSeek V4 Flash `xhigh` thinking 支持，使请求映射至 DeepSeek 的 `max` reasoning effort（[#3944](https://github.com/badlogic/pi-mono/issues/3944)）。
- 修复在 `message_stop` 前结束的 Anthropic 流，将其视为错误而非成功的部分响应（[#3936](https://github.com/badlogic/pi-mono/issues/3936)）。
- 修复直接 DeepSeek provider 以外的生成 OpenAI 兼容 DeepSeek V4 reasoning 兼容性（[#3940](https://github.com/badlogic/pi-mono/issues/3940)）。
- 修复空闲后续提交，使其像正常消息提交一样清除 editor（[#3926](https://github.com/badlogic/pi-mono/issues/3926)）。
- 修复 Thai Sara Am 和 Lao AM 元音字符的 editor 渲染伪影（[#3904](https://github.com/badlogic/pi-mono/issues/3904)）。
- 修复 DeepSeek V4 Flash 和 V4 Pro 定价元数据以匹配当前官方费率（[#3910](https://github.com/badlogic/pi-mono/issues/3910)）。
- 更新 sandbox 扩展示例 lockfile，以解析有漏洞的 `lodash-es` 传递依赖（[#3901](https://github.com/badlogic/pi-mono/issues/3901)）。
- 修复 DeepSeek 提示缓存命中，以根据 OpenAI 兼容用量响应进行跟踪（[#3880](https://github.com/badlogic/pi-mono/issues/3880)）。

### 移除

- 移除已停用的 Qwen CLI OAuth 自定义 provider 扩展示例（[#3832](https://github.com/badlogic/pi-mono/pull/3832) by [@4h9fbZ](https://github.com/4h9fbZ)）。
- 移除 Google Gemini CLI 和 Google Antigravity 内置登录、默认模型、文档和示例扩展支持。

## [0.70.6] - 2026-04-28

### 新功能

- Cloudflare Workers AI provider 支持，具有 `CLOUDFLARE_API_KEY`/`CLOUDFLARE_ACCOUNT_ID` 设置。参见 [docs/providers.md#api-keys](docs/providers.md#api-keys)。（[#3851](https://github.com/badlogic/pi-mono/pull/3851) by [@mchenco](https://github.com/mchenco)）
- Pi 更新检查现在使用 `pi.dev` 并以 `pi/<version>` user agent 标识 Pi。参见 [docs/packages.md](docs/packages.md)。（[#3877](https://github.com/badlogic/pi-mono/pull/3877) by [@mitsuhiko](https://github.com/mitsuhiko)）

### 新增

- 新增 Cloudflare Workers AI 作为内置 provider，具有 `CLOUDFLARE_API_KEY`/`CLOUDFLARE_ACCOUNT_ID` 设置、默认模型解析、`/login` 支持和 provider 文档（[#3851](https://github.com/badlogic/pi-mono/pull/3851) by [@mchenco](https://github.com/mchenco)）。

### 变更

- 更改 Pi 版本检查，以 `pi/<version>` user agent 标识 Pi（[#3877](https://github.com/badlogic/pi-mono/pull/3877) by [@mitsuhiko](https://github.com/mitsuhiko)）。

### 修复

- 修复配置选择器滚动指示器，显示项目计数而非行计数（[#3820](https://github.com/badlogic/pi-mono/pull/3820) by [@aliou](https://github.com/aliou)）。
- 修复导出的 HTML，转义嵌入图像数据和会话元数据，防止构造的会话内容注入标记（[#3819](https://github.com/badlogic/pi-mono/pull/3819) by [@justinpbarnett](https://github.com/justinpbarnett), [#3883](https://github.com/badlogic/pi-mono/pull/3883) by [@justinpbarnett](https://github.com/justinpbarnett)）。
- 修复基于 Bun 的包管理器启动：相对于 Bun 安装布局定位全局 `node_modules`（[#3861](https://github.com/badlogic/pi-mono/pull/3861) by [@thirtythreeforty](https://github.com/thirtythreeforty)）。
- 修复 Bedrock inference profile 能力检查，通过将 profile ARN 标准化为底层模型名称。
- 修复文件发现，在 `fd` 不可用时回退至 `fdfind`。
- 修复 `pi update`，当已安装版本已是当前版本时跳过自更新重新安装（[#3853](https://github.com/badlogic/pi-mono/issues/3853)）。
- 修复 Cloudflare Workers AI 归因标头，遵循安装 telemetry 设置。
- 修复 Windows 包管理器 shim 安装的 `pi update --self` 检测和执行，包括符号链接的全局包根目录，并在自更新失败时打印手动回退命令（[#3857](https://github.com/badlogic/pi-mono/issues/3857)）。

## [0.70.5] - 2026-04-27

### 修复

- 修复 HTML 导出，将 ANSI-renderer 尾部填充保留为额外空白换行行。

## [0.70.4] - 2026-04-27

### 修复

- 修复打包的 `pi` 启动失败，原因是会话选择器导入了仅源代码 utility 路径。

## [0.70.3] - 2026-04-27

### 新功能

- `pi update` 现在除了已安装的 pi 包外，还可更新 pi 自身。参见 [docs/packages.md](docs/packages.md)。（[#3680](https://github.com/badlogic/pi-mono/pull/3680) by [@mitsuhiko](https://github.com/mitsuhiko)）
- Azure OpenAI Responses 部署的 Azure Cognitive Services endpoint 支持。参见 [docs/providers.md#api-keys](docs/providers.md#api-keys)。（[#3799](https://github.com/badlogic/pi-mono/pull/3799) by [@marcbloech](https://github.com/marcbloech)）
- 可通过 `/settings` 中的 `warnings.anthropicExtraUsage` 抑制 Anthropic 额外用量计费警告。参见 [docs/settings.md](docs/settings.md)。（[#3808](https://github.com/badlogic/pi-mono/issues/3808)）
- 通过 `ctx.ui.setWorkingVisible()` 由扩展控制 working row 可见性，允许扩展隐藏内置 loader row 并渲染自定义 working state。参见 [docs/extensions.md](docs/extensions.md) 和 [examples/extensions/border-status-editor.ts](examples/extensions/border-status-editor.ts)。（[#3674](https://github.com/badlogic/pi-mono/issues/3674)）

### 新增

- 新增 `pi update` 支持，以在已安装的 pi 包外更新 pi 自身（[#3680](https://github.com/badlogic/pi-mono/pull/3680) by [@mitsuhiko](https://github.com/mitsuhiko)）。
- 为 Azure OpenAI Responses base URL 新增 Azure Cognitive Services endpoint 支持（[#3799](https://github.com/badlogic/pi-mono/pull/3799) by [@marcbloech](https://github.com/marcbloech)）。
- 新增 `warnings.anthropicExtraUsage` 和 `/settings` warnings 子菜单，以抑制 Anthropic 额外用量计费警告（[#3808](https://github.com/badlogic/pi-mono/issues/3808)）
- 新增 `ctx.ui.setWorkingVisible()`，使扩展可隐藏内置交互 working loader row 而不保留布局空间，并新增将 working state 移到自定义 editor 边框的 border-status editor 示例（[#3674](https://github.com/badlogic/pi-mono/issues/3674)）

### 修复

- 修复 Kitty 键盘协议 CSI-u 加原始字符输入导致的重复可打印字符，适用于意大利语等布局（[#3780](https://github.com/badlogic/pi-mono/issues/3780)）。
- 修复 API-key 环境发现和 Bun 启动，在 Bun sandbox 使 `process.env` 为空时回退至 `/proc/self/environ`（[#3801](https://github.com/badlogic/pi-mono/pull/3801) by [@mdsjip](https://github.com/mdsjip)）。
- 修复 Bun sandboxed 包管理器命令，当 `process.env` 为空时仍可运行（[#3807](https://github.com/badlogic/pi-mono/pull/3807) by [@mdsjip](https://github.com/mdsjip)）。
- 修复符号链接的包、资源、skill 和会话在 selector 和 loader 中重复出现（[#3818](https://github.com/badlogic/pi-mono/pull/3818) by [@aliou](https://github.com/aliou)）。
- 修复 inference profile ARN 的 Bedrock prompt-caching 和 adaptive-thinking 能力检查（[#3527](https://github.com/badlogic/pi-mono/pull/3527) by [@anirudhmarc](https://github.com/anirudhmarc)）。
- 修复 OpenAI Codex Responses 默认 verbosity，在未指定 verbosity 时使用 `low`。
- 当工具被禁用时，停止向会拒绝它们的 provider 发送空 `tools` 数组（[#3650](https://github.com/badlogic/pi-mono/pull/3650) by [@HQidea](https://github.com/HQidea)）。
- 修复 Anthropic SSE 解析，以忽略 OpenAI 风格 `done` 终止符等未知代理事件（[#3708](https://github.com/badlogic/pi-mono/issues/3708)）。
- 修复带仅覆盖 `models.json` 条目的 provider 注册，以保留内置模型列表（[#3651](https://github.com/badlogic/pi-mono/issues/3651)）。
- 修复 `/login`，显示由 `models.json` provider 定义提供的认证。
- 修复扩展渲染工具输出和可展开输出提示周围的 HTML 导出空白。
- 修复 bash executor 临时输出流：当输出按行数截断时泄漏文件描述符（[#3786](https://github.com/badlogic/pi-mono/issues/3786)）
- 修复扩展 `pi.setSessionName()` 更新，立即刷新交互终端标题（[#3686](https://github.com/badlogic/pi-mono/issues/3686)）
- 修复通过 `session_before_tree` 取消 `/tree` 后会话卡在压缩状态（[#3688](https://github.com/badlogic/pi-mono/issues/3688)）
- 修复扩展隐藏内置 working loader row 时的 Escape 中断处理（[#3674](https://github.com/badlogic/pi-mono/issues/3674)）
- 修复 coding-agent 测试预期，以适配当前默认模型和缺失认证指引。
- 修复长时间本地 LLM SSE 流在 5 分钟时因 `UND_ERR_BODY_TIMEOUT` 中止：在全局 dispatcher 上禁用 undici `bodyTimeout`/`headersTimeout`；provider SDK 仍通过 `retry.provider.timeoutMs` 强制执行自己的 deadline（[#3715](https://github.com/badlogic/pi-mono/issues/3715)）

## [0.70.2] - 2026-04-24

### 修复

- 修复 provider 重试/超时转发，省略未定义的 provider 请求控制，避免在未配置 `retry.provider.timeoutMs` 时出现 `timeout must be an integer` 等下游 SDK 验证错误（[#3627](https://github.com/badlogic/pi-mono/issues/3627)）

## [0.70.1] - 2026-04-24

### 新功能

- DeepSeek provider 支持，具有 V4 Flash/Pro 模型和 `DEEPSEEK_API_KEY` 认证。参见 [README.md#providers--models](README.md#providers--models) 和 [docs/providers.md#api-keys](docs/providers.md#api-keys)。
- 通过 `retry.provider.{timeoutMs,maxRetries,maxRetryDelayMs}` 提供 provider 请求超时/重试控制，适用于长时间运行的本地推理和 provider SDK 重试行为。参见 [docs/settings.md#retry](docs/settings.md#retry)。（[#3627](https://github.com/badlogic/pi-mono/issues/3627)）

### 新增

- 将 DeepSeek 加入内置 provider 设置、默认模型解析和 provider 文档。

### 修复

- 修复 `/copy`，避免无界 OSC 52 写入和 clipboard 竞争，以免破坏终端渲染或使原生 clipboard addon panic（[#3639](https://github.com/badlogic/pi-mono/issues/3639)）
- 修复扩展 flag 文档，展示 `pi.getFlag()` 使用注册的 flag 名称而非 CLI `--` 前缀（[#3614](https://github.com/badlogic/pi-mono/issues/3614)）
- 修复 provider 重试/超时设置连接：新增 `retry.provider.{timeoutMs,maxRetries,maxRetryDelayMs}`、迁移旧版 `retry.maxDelayMs`，并将 provider 控制转发至 `streamSimple` 请求选项（[#3627](https://github.com/badlogic/pi-mono/issues/3627)）
- 修复 Windows git 包安装：对原生 git 命令绕过 `cmd.exe`，因此包含空格的安装路径不再使 `pi install git:...` 因 `fatal: Too many arguments` 失败（[#3642](https://github.com/badlogic/pi-mono/issues/3642)）
- 修复 DeepSeek V4 会话重放 400 错误：发送 DeepSeek 兼容 thinking 控制和重放的 assistant `reasoning_content` 字段（[#3636](https://github.com/badlogic/pi-mono/issues/3636)）
- 修复 GPT-5.5 生成上下文窗口元数据，使用观察到的 272k 限制。
- 修复 bracketed paste 内的 CSI-u Ctrl+letter 解码，使粘贴的修改键 escape 序列不再变为字面 editor 文本（[#3623](https://github.com/badlogic/pi-mono/pull/3623) by [@Exrun94](https://github.com/Exrun94)）

## [0.70.0] - 2026-04-23

### 新功能

- 可搜索认证 provider 登录流程：`/login` provider selector 现在支持 fuzzy 搜索/过滤，在配置许多 provider 时可更快找到 provider。参见 [docs/providers.md](docs/providers.md)。（[#3572](https://github.com/badlogic/pi-mono/pull/3572) by [@mitsuhiko](https://github.com/mitsuhiko)）
- GPT-5.5 Codex 支持：`openai-codex/gpt-5.5` 可作为模型选项，包括 `xhigh` reasoning 支持和已修正的 priority-tier 定价。
- 终端进度指示器现在需要选择启用：流式/压缩期间的 OSC 9;4 进度报告默认关闭，可通过 `/settings` 中的 `terminal.showTerminalProgress` 切换（[#3588](https://github.com/badlogic/pi-mono/issues/3588)）
- `--no-builtin-tools` / `createAgentSession({ noTools: "builtin" })` 现在正确地仅禁用内置工具，同时保持扩展工具活跃。参见 [docs/extensions.md](docs/extensions.md) 和 [README.md](README.md)（[#3592](https://github.com/badlogic/pi-mono/issues/3592)）

### 破坏性变更

- 默认禁用 OSC 9;4 终端进度指示器。在 `/settings` 中将 `terminal.showTerminalProgress` 设为 `true` 以重新启用（[#3588](https://github.com/badlogic/pi-mono/issues/3588)）

### 新增

- 在 provider selector 中新增带 fuzzy 过滤的可搜索认证 provider 登录流程（[#3572](https://github.com/badlogic/pi-mono/pull/3572) by [@mitsuhiko](https://github.com/mitsuhiko)）
- 新增 GPT-5.5 Codex 模型
- 在 `/login` 中新增认证来源标签，使 provider 条目可显示认证来自 `--api-key`、环境变量还是自定义 provider 回退，而不会暴露机密。

### 变更

- 更新跨 provider 的默认模型选择，使用当前推荐模型。
- 改进会话替换或 reload 后过时扩展上下文错误，告知扩展作者避免捕获 `pi`/命令 `ctx`，并对替换后的工作使用 `withSession`。

### 修复

- 修复 `/model` selector 取消，使其请求渲染而非错误触发登录 selector。
- 更改 login、OAuth 和扩展 selector，以实现更一致的样式。
- 将 Amazon Bedrock 设置指引加入 `/login`，并更新 `/model` 文案以指向已配置 provider 而非仅 API key。
- 改进无模型和缺失认证警告，使其指向 `/login` 进行 OAuth 或 API key 设置。
- 修复 `/quit` 关闭顺序：在扩展 UI teardown 可重绘前停止 TUI，保留最终渲染 frame，同时仍在进程退出前发出 `session_shutdown`。
- 修复 `SettingsManager.inMemory()` 初始设置在 SDK 资源加载触发 reload 后丢失（[#3616](https://github.com/badlogic/pi-mono/issues/3616)）
- 修复 `models.json` provider 兼容性以接受 `compat.supportsLongCacheRetention`，使代理可在需要时选择退出 long-retention cache 字段，而请求时仍默认启用 long retention（[#3543](https://github.com/badlogic/pi-mono/issues/3543)）
- 修复 `openai-codex` `gpt-5.5` 的 `--thinking xhigh`，使其不再降级为 `high`。
- 修复使用 `pnpm` 等自定义 `npmCommand` 值的 git 包安装，在该兼容路径中避免 npm 特定 production flag（[#3604](https://github.com/badlogic/pi-mono/issues/3604)）
- 修复第一条用户消息在压缩摘要或状态消息等现有通知后渲染时缺少间距。
- 修复 handoff 扩展示例，在创建新会话后使用替换会话上下文，避免其安装生成提示时出现过时 `ctx` 错误（[#3606](https://github.com/badlogic/pi-mono/issues/3606)）
- 修复会话替换和 `/quit` teardown 顺序：在 `session_shutdown` handler 完成后、使旧扩展上下文失效前同步运行 host 拥有的扩展 UI 清理，防止过时扩展 UI 针对已释放会话渲染（[#3597](https://github.com/badlogic/pi-mono/pull/3597) by [@vegarsti](https://github.com/vegarsti)）
- 修复当扩展注册自定义 footer 且其 `render()` 访问 `ctx` 时 `/quit` 崩溃：关闭期间在使扩展 runner 失效前拆除扩展提供的 UI（[#3595](https://github.com/badlogic/pi-mono/issues/3595)）
- 修复自动重试，将 Bedrock/Smithy HTTP/2 传输失败（如 `http2 request did not get a response`）视为瞬时错误，因此 agent 会自动重试而非等待手动推动（[#3594](https://github.com/badlogic/pi-mono/issues/3594)）
- 修复 CLI/SDK 工具选择分割，使 `--no-builtin-tools` 和 `createAgentSession({ noTools: "builtin" })` 仅禁用内置默认工具，同时保持扩展/自定义工具启用，而非落入与 `--no-tools` 相同的“全部禁用”路径（[#3592](https://github.com/badlogic/pi-mono/issues/3592)）
- 修复剩余硬编码的 `pi` / `.pi` 品牌以通过 `APP_NAME` 和 `CONFIG_DIR_NAME` 扩展点路由，使 SDK rebrand 在 `/quit` 描述、`process.title` 和项目本地扩展目录中具有一致命名（[#3583](https://github.com/badlogic/pi-mono/pull/3583) by [@jlaneve](https://github.com/jlaneve)）
- 修复 `pi-coding-agent` 附带 `uuid@11`，该版本会为下游安装触发 `npm audit` 中等级漏洞报告；包现在依赖 `uuid@14`（[#3577](https://github.com/badlogic/pi-mono/issues/3577)）
- 修复 `openai-completions` 流式工具调用组装，当 OpenAI 兼容 gateway 在流中改变工具调用 ID 时按稳定工具索引合并 delta，防止畸形的 Kimi K2.6/OpenCode 工具流将一次调用拆分为多个虚假工具调用（[#3576](https://github.com/badlogic/pi-mono/issues/3576)）
- 修复 `ctx.ui.setWorkingMessage()`，使其在 loader 重建后持久化，与 `ctx.ui.setWorkingIndicator()` 的行为一致（[#3566](https://github.com/badlogic/pi-mono/issues/3566)）
- 修复 coding-agent 对 theme 和 git-footer watcher 的 `fs.watch` 错误处理，在 `EMFILE` 等瞬时 watcher 失败后重试，避免大型仓库中启动崩溃（[#3564](https://github.com/badlogic/pi-mono/issues/3564)）
- 修复内置 `kimi-coding` 模型生成，附加预期的 `User-Agent` 标头，使直接 Kimi Coding 请求使用 provider 期望的客户端身份（[#3586](https://github.com/badlogic/pi-mono/issues/3586)）
- 修复扩展快捷键冲突诊断，使其在启动时而非仅 reload 时显示，因此扩展作者立即发现保留 keybinding 冲突，而非稍后通过用户反馈发现（[#3617](https://github.com/badlogic/pi-mono/issues/3617)）
- 修复 `models.json` Anthropic 兼容 provider 配置以接受 `compat.supportsEagerToolInputStreaming`，使拒绝每工具 `eager_input_streaming` 的代理可改用旧版细粒度工具流 beta 标头（[#3575](https://github.com/badlogic/pi-mono/issues/3575)）
- 修复启动 banner 扩展标签，剥离尾随 `index.js`/`index.ts` 后缀（[#3596](https://github.com/badlogic/pi-mono/pull/3596) by [@aliou](https://github.com/aliou)）
- 修复 OSC 9;4 终端进度更新，使其在 Ghostty 等终端的长时间 agent 工作期间保持活跃（[#3610](https://github.com/badlogic/pi-mono/issues/3610)）
- 修复 OpenAI 兼容 completion 用量解析，避免重复计算已包含在 `completion_tokens` 中的 reasoning token（[#3581](https://github.com/badlogic/pi-mono/issues/3581)）
- 修复严格 OpenAI 兼容代理的 `openai-responses` 兼容性，允许 `models.json` 通过 `compat.sendSessionIdHeader: false` 禁用包含下划线的 `session_id` 标头（[#3579](https://github.com/badlogic/pi-mono/issues/3579)）
- 修复 GPT-5.5 Codex 能力处理，将不支持的 minimal reasoning 限制为 `low`，并应用模型的 2.5x priority service-tier 定价乘数（[#3618](https://github.com/badlogic/pi-mono/pull/3618) by [@markusylisiurunen](https://github.com/markusylisiurunen)）

## [0.69.0] - 2026-04-22

### 新功能

- 面向扩展和 SDK 集成迁移至 TypeBox 1.x，包括现可在 Cloudflare Workers 等受 eval 限制的运行时中工作的原生 TypeBox 工具参数验证。参见 [docs/extensions.md](docs/extensions.md) 和 [docs/sdk.md](docs/sdk.md)。
- 通过 `ctx.ui.addAutocompleteProvider(...)` 叠加扩展自动补全提供程序，使扩展能够在内置的斜杠和路径补全之上分层添加自定义补全逻辑。参见 [docs/extensions.md#autocomplete-providers](docs/extensions.md#autocomplete-providers) 和 [examples/extensions/github-issue-autocomplete.ts](examples/extensions/github-issue-autocomplete.ts)。
- 通过 `terminate: true` 提供终止工具结果，使自定义工具能够在最终工具调用时结束，无需承担自动追加 LLM 回合的成本。参见 [docs/extensions.md](docs/extensions.md) 和 [examples/extensions/structured-output.ts](examples/extensions/structured-output.ts)。
- 在代理流式传输和压缩期间为受支持的终端提供 OSC 9;4 终端进度指示器。

### 破坏性变更

- 将第一方编码代理代码、SDK/示例/文档以及包元数据从 `@sinclair/typebox` 0.34.x 迁移至 `typebox` 1.x。新的扩展、SDK 集成和 pi 包应依赖并从 `typebox` 导入。旧版扩展加载仍会为根 `@sinclair/typebox` 包创建别名，但不再填充 `@sinclair/typebox/compiler`。此迁移还采用了新的 `@mariozechner/pi-ai` 原生 TypeBox 验证器路径，因此工具参数验证现可在 Cloudflare Workers 等受 eval 限制的运行时中工作，而非被跳过（[#3112](https://github.com/badlogic/pi-mono/issues/3112)）
- 会话替换命令现会在 `ctx.newSession()`、`ctx.fork()` 和 `ctx.switchSession()` 后使捕获的替换前会话绑定扩展对象失效。旧的 `pi` 和命令 `ctx` 引用现在会抛出错误，而不是静默地定位到替换后的会话。迁移方式：如果代码需要在其中一次调用后继续在替换后的会话中工作，请将 `withSession` 传给同一方法，并在其中执行切换后的工作。实际上，应将切换后的 `pi.sendUserMessage()`、`pi.sendMessage()` 和 command-ctx/session-manager 访问移入 `withSession`，且仅使用传给该回调的 `ReplacedSessionContext` 执行会话绑定操作。陷阱：`withSession` 在旧扩展实例已经收到 `session_shutdown` 后运行，旧清理逻辑可能已使捕获的状态失效，捕获的旧 `pi` / 旧命令 `ctx` 已过期，并且先前提取的原始对象（例如 `const sm = ctx.sessionManager`）仍由调用方负责，不得在切换后复用。

### 新增

- 新增通过 `terminate: true` 终止工具结果的支持，使自定义工具无需自动追加 LLM 调用即可结束当前工具批次；还新增 `structured-output.ts` 扩展示例及展示该模式的扩展文档（[#3525](https://github.com/badlogic/pi-mono/issues/3525)）
- 新增代理流式传输和压缩期间的 OSC 9;4 终端进度指示器，因此 iTerm2、WezTerm、Windows Terminal 和 Kitty 等终端会在其标签栏中显示活动状态
- 新增 `ctx.ui.addAutocompleteProvider(...)`，可在内置斜杠/路径提供程序之上叠加扩展自动补全提供程序；还新增 `github-issue-autocomplete.ts` 示例和扩展文档（[#2983](https://github.com/badlogic/pi-mono/issues/2983)）

### 修复

- 修复导出的会话 HTML：在将 Markdown 链接 URL 渲染为锚点标签前对其进行清理，在保留共享/导出会话中安全链接的同时阻止 `javascript:` 风格的载荷（[#3532](https://github.com/badlogic/pi-mono/issues/3532)）
- 修复 `ctx.getSystemPrompt()`，使其在 `before_agent_start` 中反映较早处理程序进行的链式系统提示变更，并澄清有关提供程序载荷重写以及该方法会和不会报告的内容的扩展文档（[#3539](https://github.com/badlogic/pi-mono/issues/3539)）
- 修复内置 `google-gemini-cli` 模型列表和选择器条目以纳入 `gemini-3.1-flash-lite-preview`，因此 Cloud Code Assist 用户不再需要手动选择 `--model` 回退项才能使用它（[#3545](https://github.com/badlogic/pi-mono/issues/3545)）
- 修复扩展会话替换流程：`ctx.newSession()`、`ctx.fork()`、`ctx.switchSession()` 和导入会话替换会在切换后工作运行前完成完全重新绑定；新增带有全新 `ReplacedSessionContext` 助手的 `withSession` 替换回调，并使过期的替换前 `pi` / `ctx` 会话绑定访问抛出错误，而非静默定位到错误会话（[#2860](https://github.com/badlogic/pi-mono/issues/2860)）
- 修复 `models.json` 内置提供程序覆盖项，使其无需 `baseUrl` 也可接受 `headers`，因此仅请求头的覆盖项现在可正确加载和应用（[#3538](https://github.com/badlogic/pi-mono/issues/3538)）

## [0.68.1] - 2026-04-22

### 新功能

- 支持 Fireworks 提供程序，包含内置模型和 `FIREWORKS_API_KEY` 认证。参见 [README.md#providers--models](README.md#providers--models) 和 [docs/providers.md](docs/providers.md)。
- 通过 `/settings` 中的 `terminal.imageWidthCells` 可配置内联工具图像宽度。参见 [docs/settings.md#terminal--images](docs/settings.md#terminal--images)。

### 新增

- 新增内置 Fireworks 提供程序支持，包括 `FIREWORKS_API_KEY` 设置/文档及默认 Fireworks 模型 `accounts/fireworks/models/kimi-k2p6`（[#3519](https://github.com/badlogic/pi-mono/issues/3519)）

### 修复

- 修复交互式内联工具图像，使其通过 `/settings` 中可配置的 `terminal.imageWidthCells` 生效，因此工具输出图像不再被硬性限制为 60 个终端单元格（[#3508](https://github.com/badlogic/pi-mono/issues/3508)）
- 修复 `settings.json` 中的 `sessionDir` 以展开 `~`，因此可移植会话目录设置不再需要 shell 包装器（[#3514](https://github.com/badlogic/pi-mono/issues/3514)）
- 修复并行工具调用行，使每个工具一完成便离开待处理状态，同时仍按助手源顺序追加持久化的工具结果（[#3503](https://github.com/badlogic/pi-mono/issues/3503)）
- 修复导出的会话 Markdown：渲染 Markdown 的同时原样显示 `<file name="...">...</file>` 等类 HTML 消息内容，使共享会话与 TUI 一致，而非让浏览器解释消息文本（[#3484](https://github.com/badlogic/pi-mono/issues/3484)）
- 修复导出的会话 HTML，使 `grep` 和 `find` 输出通过其现有 TUI 渲染器渲染，`ls` 输出通过原生模板渲染器渲染，从而避免共享会话中缺少格式和间距伪影（[#3491](https://github.com/badlogic/pi-mono/pull/3491) 由 [@aliou](https://github.com/aliou)）
- 修复 `@` 自动补全模糊搜索，使其跟随符号链接目录并在结果中包含符号链接路径（[#3507](https://github.com/badlogic/pi-mono/issues/3507)）
- 修复代理流的转发，使其保留流选项中对代理安全且可序列化的子集，包括会话、传输、重试延迟、元数据、请求头、缓存保留和思考预算设置（[#3512](https://github.com/badlogic/pi-mono/issues/3512)）
- 通过拥有带防御性 JSON 修复的 SSE 解析来强化 Anthropic 流式传输，将已弃用的 `fine-grained-tool-streaming` beta 请求头替换为每个工具的 `eager_input_streaming`，并更新过期的测试模型引用（[#3175](https://github.com/badlogic/pi-mono/issues/3175)）
- 修复 Bedrock 运行时端点解析，停止通过 `AWS_REGION` / `AWS_PROFILE` 固定内置区域端点，在保留自定义 VPC/代理端点覆盖的同时，恢复 v0.68.0 后的 `us.*` 和 `eu.*` 推理配置文件支持（[#3481](https://github.com/badlogic/pi-mono/issues/3481), [#3485](https://github.com/badlogic/pi-mono/issues/3485), [#3486](https://github.com/badlogic/pi-mono/issues/3486), [#3487](https://github.com/badlogic/pi-mono/issues/3487), [#3488](https://github.com/badlogic/pi-mono/issues/3488)）

## [0.68.0] - 2026-04-20

### 新功能

- 通过 `ctx.ui.setWorkingIndicator()` 为扩展提供可配置的流式工作指示器，包括动画、静态和隐藏指示器。参见 [docs/tui.md#working-indicator](docs/tui.md#working-indicator)、[docs/extensions.md](docs/extensions.md) 和 [examples/extensions/working-indicator.ts](examples/extensions/working-indicator.ts)。
- `before_agent_start` 现公开 `systemPromptOptions`（`BuildSystemPromptOptions`），因此扩展无需重新发现资源即可检查结构化系统提示输入。参见 [docs/extensions.md#before_agent_start](docs/extensions.md#before_agent_start) 和 [examples/extensions/prompt-customizer.ts](examples/extensions/prompt-customizer.ts)。
- 可为作用域模型选择器操作和会话树筛选操作配置键绑定。参见 [docs/keybindings.md](docs/keybindings.md)。
- `/clone` 将当前活动分支复制到新会话，而扩展可通过 `ctx.fork(..., { position })` 选择在条目 `before` 或 `at` 处派生。参见 [README.md](README.md)、[docs/extensions.md](docs/extensions.md) 和 [docs/session.md](docs/session.md)。

### 破坏性变更

- 将 SDK 和 CLI 工具选择从绑定 cwd 的内置工具实例改为工具名称允许列表。`createAgentSession({ tools })` 现期望 `string[]` 名称，例如 `"read"` 和 `"bash"`，而非 `Tool[]`；`--tools` 现通过名称允许内置、扩展和自定义工具；`--no-tools` 现默认禁用所有工具，而不仅是内置工具。将 SDK 代码从 `tools: [readTool, bashTool]` 迁移为 `tools: ["read", "bash"]`（[#2835](https://github.com/badlogic/pi-mono/issues/2835), [#3452](https://github.com/badlogic/pi-mono/issues/3452)）
- 从 `@mariozechner/pi-coding-agent` 移除预构建的绑定 cwd 工具和工具定义导出，包括 `readTool`、`bashTool`、`editTool`、`writeTool`、`grepTool`、`findTool`、`lsTool`、`readOnlyTools`、`codingTools` 和相应的 `*ToolDefinition` 值。请改用显式工厂导出，例如 `createReadTool(cwd)`、`createBashTool(cwd)`、`createCodingTools(cwd)` 和 `createReadToolDefinition(cwd)`（[#3452](https://github.com/badlogic/pi-mono/issues/3452)）
- 从公共资源助手移除环境式 `process.cwd()` / 默认 agent-dir 回退行为。`DefaultResourceLoader`、`loadProjectContextFiles()` 和 `loadSkills()` 现要求显式 cwd/agent-dir 风格的输入，且导出的系统提示选项类型现在要求显式 `cwd`。请显式传入会话或项目 cwd，而非依赖进程全局默认值（[#3452](https://github.com/badlogic/pi-mono/issues/3452)）

### 新增

- 新增扩展支持，可通过 `ctx.ui.setWorkingIndicator()` 自定义交互式流式工作指示器，包括自定义动画帧、静态指示器、隐藏指示器、新的 `working-indicator.ts` 示例扩展和更新后的扩展/TUI/RPC 文档（[#3413](https://github.com/badlogic/pi-mono/issues/3413)）
- 向 `before_agent_start` 扩展事件新增 `systemPromptOptions`（`BuildSystemPromptOptions`），因此扩展可检查用于构建当前系统提示的结构化输入（[#3473](https://github.com/badlogic/pi-mono/pull/3473) 由 [@dljsjr](https://github.com/dljsjr)）
- 新增 `/clone`，将当前活动分支复制到新会话，同时保持 `/fork` 专注于从先前用户消息派生（[#2962](https://github.com/badlogic/pi-mono/issues/2962)）
- 新增 `ctx.fork()` 对 `position: "before" | "at"` 的支持，因此扩展和集成可在用户消息之前分支，或复制对话中的当前点；交互式 clone/fork UX 构建在该运行时支持之上（[#3431](https://github.com/badlogic/pi-mono/pull/3431) 由 [@mitsuhiko](https://github.com/mitsuhiko)）
- 新增用于作用域模型选择器操作和树筛选操作的可配置键绑定 ID，因此可在 `keybindings.json` 中重新映射这些交互式快捷键（[#3343](https://github.com/badlogic/pi-mono/pull/3343) 由 [@mpazik](https://github.com/mpazik)）
- 新增内置 OAuth 登录流程的 `PI_OAUTH_CALLBACK_HOST` 支持，使 `pi auth` 使用的本地回调服务器可绑定到自定义接口，而非硬编码的 `127.0.0.1`（[#3409](https://github.com/badlogic/pi-mono/pull/3409) 由 [@Michaelliv](https://github.com/Michaelliv)）
- 向 `session_shutdown` 扩展事件新增 `reason` 和 `targetSessionFile` 元数据，因此扩展可区分退出、重载、新会话、恢复和派生拆除路径（[#2863](https://github.com/badlogic/pi-mono/issues/2863)）

### 变更

- 将 `pi update` 改为按作用域批量更新 npm 包，并以受限并行度运行 git 包更新，在保留固定版本和已是最新版本包的跳过行为的同时，减少多包更新时间（[#2980](https://github.com/badlogic/pi-mono/issues/2980)）
- 修改 Bedrock 会话请求：模型令牌限制未知时省略 `maxTokens`，未设置时省略 `temperature`，让 Bedrock 使用提供程序默认值并避免不必要的 TPM 配额预留（[#3400](https://github.com/badlogic/pi-mono/pull/3400) 由 [@wirjo](https://github.com/wirjo)）

### 修复

- 修复 `AgentSession` 系统提示选项初始化，避免构造无效的空 `BuildSystemPromptOptions`，因此在 `cwd` 成为必填项后 `npm run check` 能够通过。
- 修复 shell 路径解析，使其在 bash 执行期间停止查阅环境式 `process.cwd()` 状态，因此会话/项目特定的 `shellPath` 设置现在遵循活动编码代理会话 cwd，而不是启动器 cwd（[#3452](https://github.com/badlogic/pi-mono/issues/3452)）
- 修复 `ctx.ui.setWorkingIndicator()` 自定义帧，使其按原样渲染而非强制使用主题强调色，因此扩展自定义工作指示器时现在拥有其颜色控制权（[#3467](https://github.com/badlogic/pi-mono/issues/3467)）
- 修复 `pi update`：通过在运行 `npm install <pkg>@latest` 前检查已安装包版本，避免重新安装已处于最新发布版本的 npm 包（[#3000](https://github.com/badlogic/pi-mono/issues/3000)）
- 修复 `@` 自动补全普通查询，使其停止与完整 cwd/基路径匹配，因此工作树名称中的路径片段不再挤占 `@plan` 等预期结果（[#2778](https://github.com/badlogic/pi-mono/issues/2778)）
- 修复内置工具包装，使其使用与扩展工具相同的扩展运行器上下文路径，因此内置工具会收到执行上下文，并且当前模型不支持图像时 `read` 可以发出警告（[#3429](https://github.com/badlogic/pi-mono/issues/3429)）
- 修复 `openai-completions` 助手重放，使其保留 `compat.requiresThinkingAsText` 文本部分序列化，避免先前助手消息混合思考和文本时发生同模型后续调用崩溃（[#3387](https://github.com/badlogic/pi-mono/issues/3387)）
- 修复直接 OpenAI Chat Completions 会话，将 `sessionId` 和 `cacheRetention` 映射至提示缓存字段：启用缓存时发送 `prompt_cache_key`，直接 `api.openai.com` 请求采用长保留期时发送 `prompt_cache_retention: "24h"`（[#3426](https://github.com/badlogic/pi-mono/issues/3426)）
- 修复 OpenAI 兼容 Chat Completions 会话，使其可通过 `compat.sendSessionAffinityHeaders` 从 `sessionId` 发送对齐的 `session_id`、`x-client-request-id` 和 `x-session-affinity` 请求头，改善 Fireworks 等后端的缓存亲和路由（[#3430](https://github.com/badlogic/pi-mono/issues/3430)）
- 修复线程式 `/resume` 会话关系和当前会话检测：在选择器比较期间规范化符号链接会话路径，因此共享会话目录不再破坏父子匹配或活动会话删除保护（[#3364](https://github.com/badlogic/pi-mono/issues/3364)）
- 修复 `/session`、Sessions 文档和 CLI 帮助，以一致地说明会话复用同时支持文件路径和会话 ID，且 `/session` 显示当前会话 ID（[#3390](https://github.com/badlogic/pi-mono/issues/3390)）
- 修复 Windows pnpm 全局安装检测以识别 `\\.pnpm\\` 存储路径，因此更新通知现在会建议 `pnpm install -g @mariozechner/pi-coding-agent`，而不是回退到 npm（[#3378](https://github.com/badlogic/pi-mono/issues/3378)）
- 修复 `@mariozechner/pi-coding-agent` 缺失的 `@sinclair/typebox` 运行时依赖，因此严格 pnpm 安装在启动 `pi` 时不再因 `ERR_MODULE_NOT_FOUND` 失败（[#3434](https://github.com/badlogic/pi-mono/issues/3434)）
- 通过解码可打印的 `modifyOtherKeys` 输入并规范化带 Shift 字母匹配，修复交互式编辑器中的 xterm 大写输入，因此 `Shift+letter` 不再在 `pi` 中消失（[#3436](https://github.com/badlogic/pi-mono/issues/3436)）
- 修复 `/compact`，使其复用会话思考级别生成压缩摘要而非强制设为 `high`，避免在配置为 `medium` 思考的 `github-copilot/claude-opus-4.7` 会话上发生无效的推理强度错误（[#3438](https://github.com/badlogic/pi-mono/issues/3438)）
- 修复共享/导出的纯文本工具输出以保留缩进，而非在网页分享页中折叠前导空白（[#3440](https://github.com/badlogic/pi-mono/issues/3440)）
- 修复导出的分享页，使其使用浏览器安全的 `T` 和 `O` 快捷键以及可点击的标题切换控件来控制思考和工具可见性，而不是浏览器保留的 `Ctrl+T` / `Ctrl+O` 绑定（[#3374](https://github.com/badlogic/pi-mono/pull/3374) 由 [@vekexasia](https://github.com/vekexasia)）
- 修复技能解析：按规范路径对符号链接别名去重，因此当 `~/.pi/agent/skills` 指向 `~/.agents/skills` 时，`pi config` 不再显示重复技能条目（[#3417](https://github.com/badlogic/pi-mono/pull/3417) 由 [@rwachtler](https://github.com/rwachtler)）
- 修复 OpenRouter 请求归属：当通过编码代理 SDK 创建会话且启用安装遥测时，包含 Pi 应用请求头（`HTTP-Referer: https://pi.dev`、`X-OpenRouter-Title: pi`、`X-OpenRouter-Categories: cli-agent`）（[#3414](https://github.com/badlogic/pi-mono/issues/3414)）
- 修复自定义模型 `compat` 架构/文档，以支持为通过 `cache_control` 标记公开 Anthropic 风格提示缓存的 OpenAI 兼容提供程序使用 `cacheControlFormat: "anthropic"`（[#3392](https://github.com/badlogic/pi-mono/issues/3392)）
- 修复 Cloud Code Assist 工具架构：在提供程序转换前移除 JSON Schema 元声明键，避免使用 `$schema`、`$defs` 和相关元数据的启用工具会话发生验证失败（[#3412](https://github.com/badlogic/pi-mono/pull/3412) 由 [@vladlearns](https://github.com/vladlearns)）
- 修复直接 Bedrock 会话，使其将 `model.baseUrl` 作为运行时客户端端点，恢复对自定义 Bedrock VPC 或代理路由的支持（[#3402](https://github.com/badlogic/pi-mono/pull/3402) 由 [@wirjo](https://github.com/wirjo)）
- 修复 `edit` 工具，使其在验证前强制转换字符串化的 `edits` JSON，因此以 JSON 字符串形式发送数组载荷的模型不再回退到临时 shell 编辑（[#3370](https://github.com/badlogic/pi-mono/pull/3370) 由 [@dannote](https://github.com/dannote)）
- 修复包清单中的正向 glob 条目，使其在加载打包资源前展开，恢复 `skills/**/*.md` 等清单模式（[#3350](https://github.com/badlogic/pi-mono/pull/3350) 由 [@neonspectra](https://github.com/neonspectra)）

## [0.67.68] - 2026-04-17

## [0.67.67] - 2026-04-17

### 新功能

- Bedrock 会话现在可使用 `AWS_BEARER_TOKEN_BEDROCK` 认证，无需本地 SigV4 凭据即可启用 Converse API 访问。参见 [docs/providers.md#amazon-bedrock](docs/providers.md#amazon-bedrock)。

### 新增

- 新增通过 `AWS_BEARER_TOKEN_BEDROCK` 的 Bedrock 持有者令牌认证支持，使编码代理会话无需本地 SigV4 凭据即可使用 Bedrock Converse（[#3125](https://github.com/badlogic/pi-mono/pull/3125) 由 [@wirjo](https://github.com/wirjo)）

### 修复

- 修复 `/scoped-models` Alt+Up/Down，使其在隐式的 `all enabled` 状态下保持无操作，而不是生成完整的显式启用模型列表并将选择器标记为已修改（[#3331](https://github.com/badlogic/pi-mono/issues/3331)）
- 修复 Mistral Small 4 默认思考请求以使用模型支持的推理控制，避免在 `mistral-small-2603` 和 `mistral-small-latest` 上启动会话时发生 `400` 错误（[#3338](https://github.com/badlogic/pi-mono/issues/3338)）
- 修复 Qwen 聊天模板思考重放以保留跨回合的既有思考，因此受影响的 OpenAI 兼容模型会保留多回合工具调用参数，而非退化为空 `{}` 载荷（[#3325](https://github.com/badlogic/pi-mono/issues/3325)）
- 修复导出的 HTML 文稿，使文本选择不再触发基于点击的展开/折叠切换（[#3332](https://github.com/badlogic/pi-mono/pull/3332) 由 [@xu0o0](https://github.com/xu0o0)）
- 修复不稳定的 git 包更新通知：等待捕获的 git 命令 stdio 完全排空后再比较本地和远程提交 SHA（[#3027](https://github.com/badlogic/pi-mono/issues/3027)）
- 修复系统提示日期，使用稳定的 `YYYY-MM-DD` 格式而不是依赖区域设置的输出，使提示在运行时和区域设置之间保持确定性（[#2814](https://github.com/badlogic/pi-mono/issues/2814)）
- 修复自动重试的瞬态错误检测，将 `Network connection lost.` 视为可重试，因此断开的提供程序连接会重试而非终止代理（[#3317](https://github.com/badlogic/pi-mono/issues/3317)）
- 修复紧凑的交互式扩展启动摘要：通过使用感知包的标签和使本地条目唯一所需的最短父路径，消除包扩展和重复本地 `index.ts` 条目间的歧义（[#3308](https://github.com/badlogic/pi-mono/issues/3308)）
- 修复 git 包依赖安装：在安装和更新流程中均使用生产安装（`npm install --omit=dev`），因此扩展运行时依赖必须来自 `dependencies` 而非 `devDependencies`（[#3009](https://github.com/badlogic/pi-mono/issues/3009)）
- 修复错误结果的 `tool_result` / `afterToolCall` 扩展处理：通过 `AgentSession` 转发 `details` 和 `isError` 覆盖，而不是在 `isError` 已为 true 时丢弃它们（[#3051](https://github.com/badlogic/pi-mono/issues/3051)）
- 修复 `@mariozechner/pi-coding-agent` 中 `RpcClient` 和 RPC 协议类型缺失的根导出，因此 ESM 使用者可从主包入口导入它们（[#3275](https://github.com/badlogic/pi-mono/issues/3275)）
- 修复 OpenAI Codex 服务层级成本核算：当 API 在响应中回显默认层级时，信任显式请求的层级，使会话成本显示与所选层级保持一致（[#3307](https://github.com/badlogic/pi-mono/pull/3307) 由 [@markusylisiurunen](https://github.com/markusylisiurunen)）
- 修复并行工具调用最终化：将 `afterToolCall` 钩子抛出转换为错误工具结果，而不是中止其余工具批次（[#3084](https://github.com/badlogic/pi-mono/issues/3084)）
- 修复 Bun 二进制资产路径解析以遵循内置主题、HTML 导出模板和交互式捆绑资产的 `PI_PACKAGE_DIR`（[#3074](https://github.com/badlogic/pi-mono/issues/3074)）
- 修复交互模式中的用户消息回合间距：恢复用户回合前的消息间隔符（首条用户消息除外），防止助手和用户块紧贴渲染。
- 修复交互式 `/import` 处理：支持带空格的带引号 JSONL 路径，将缺失的 JSONL 文件路由至非致命的 `SessionImportFileNotFoundError` 路径，并记录 `importFromJsonl()` 异常（`SessionImportFileNotFoundError`、`MissingSessionCwdError`）。

## [0.67.6] - 2026-04-16

### 新功能

- 提示模板支持 `argument-hint` frontmatter 字段，该字段在 `/` 自动补全下拉菜单中显示在描述之前，必填参数使用 `<angle>`，可选参数使用 `[square]`。参见 [docs/prompt-templates.md#argument-hints](docs/prompt-templates.md#argument-hints)。
- 新的 `after_provider_response` 扩展钩子让扩展可在收到每个提供程序响应后、开始消费流之前立即检查提供程序 HTTP 状态代码和请求头。参见 [docs/extensions.md](docs/extensions.md)。
- 紧凑的交互式启动标题，使用逗号分隔的视图展示已加载的 AGENTS.md 文件、提示模板、技能和扩展。按 `Ctrl+O` 切换展开列表。
- 助手输出中的 Markdown 链接现在会在声明支持的终端上渲染为 OSC 8 超链接；未知终端和 tmux/screen 默认使用纯文本，因此 URL 绝不会被静默丢弃。

### 新增

- 为提示模板新增 `argument-hint` frontmatter 字段，在自动补全下拉菜单中显示于描述之前（[#2780](https://github.com/badlogic/pi-mono/pull/2780) 由 [@andresvi94](https://github.com/andresvi94)）
- 新增 `after_provider_response` 扩展钩子，使扩展可在收到每个提供程序响应后、开始消费流之前检查提供程序 HTTP 状态代码和请求头（[#3128](https://github.com/badlogic/pi-mono/issues/3128)）
- 当终端声明支持时，为 Markdown 链接新增 OSC 8 超链接渲染（[#3248](https://github.com/badlogic/pi-mono/pull/3248) 由 [@ofa1](https://github.com/ofa1)）

### 变更

- 将交互式启动标题改为紧凑、逗号分隔的视图，展示已加载的 AGENTS.md 文件、提示模板、技能和扩展，并可通过 `Ctrl+O` 切换展开列表（[#3267](https://github.com/badlogic/pi-mono/pull/3267)）
- 收紧超链接能力检测：未知终端默认 `hyperlinks: false`，并在 tmux/screen 下（包括嵌套会话）强制关闭，从而防止 Markdown 链接 URL 在静默吞没 OSC 8 序列的终端中消失（[#3248](https://github.com/badlogic/pi-mono/pull/3248)）

### 修复

- 修复交互式用户消息渲染：在受 OSC 133 提示标记影响的终端中保持底部内边距可见，同时不在后续助手消息前添加额外空行（[#3090](https://github.com/badlogic/pi-mono/issues/3090)）
- 修复 `--verbose` 启动输出，使其在紧凑启动标题变更后以展开的启动帮助和已加载资源列表开始（[#3147](https://github.com/badlogic/pi-mono/issues/3147)）
- 修复 `find` 工具对 `src/**/*.spec.ts` 或 `some/parent/child/**` 等基于路径的 glob 模式不返回结果的问题：将 fd 切换到全路径模式，并在模式包含 `/` 时将其规范化（[#3302](https://github.com/badlogic/pi-mono/issues/3302)）
- 修复 `find` 工具在同级目录间应用嵌套 `.gitignore` 规则的问题（例如 `a/.gitignore` 中的规则隐藏 `b/` 下的匹配文件）：移除手动 `--ignore-file` 收集，改为通过 `--no-require-git` 委托给 fd 的分层 `.gitignore` 处理（[#3303](https://github.com/badlogic/pi-mono/issues/3303)）
- 修复非 `api.openai.com` 基础 URL（OpenAI 兼容代理，如 litellm、theclawbay）的 OpenAI Responses 提示缓存：提供 `sessionId` 时无条件发送 `session_id` 和 `x-client-request-id` 缓存亲和请求头，与官方 Codex CLI 行为一致（[#3264](https://github.com/badlogic/pi-mono/pull/3264) 由 [@vegarsti](https://github.com/vegarsti)）
- 修复 `preset` 示例扩展：在首次应用预设时快照活动模型、思考级别和工具集，并在循环回 `(none)` 时恢复该状态，而非回退至硬编码的默认工具列表（[#3272](https://github.com/badlogic/pi-mono/pull/3272) 由 [@stembi](https://github.com/stembi)）

## [0.67.5] - 2026-04-16

### 修复

- 修复 Anthropic 和 Bedrock 提供程序中的 Opus 4.7 自适应思考配置：识别 Opus 4.7 自适应思考支持，并将 `xhigh` 推理映射到提供程序支持的强度值（[#3286](https://github.com/badlogic/pi-mono/pull/3286) 由 [@markusylisiurunen](https://github.com/markusylisiurunen)）
- 修复 Zellij `Shift+Enter` 回归：还原 Zellij 特定的 Kitty 键盘查询绕过，并恢复先前的键盘协商行为（[#3259](https://github.com/badlogic/pi-mono/issues/3259)）

## [0.67.4] - 2026-04-16

### 新功能

- 当需要无项目上下文注入的干净运行时，`--no-context-files`（`-nc`）可禁用自动 `AGENTS.md` / `CLAUDE.md` 发现。参见 [README.md#context-files](README.md#context-files)。
- `loadProjectContextFiles()` 现作为独立工具导出，供需要检查与 CLI 相同上下文文件解析顺序的扩展和 SDK 风格集成使用。参见 [README.md#context-files](README.md#context-files)。
- 新的 `after_provider_response` 扩展钩子让扩展可在响应创建后、开始消费流之前立即检查提供程序 HTTP 状态代码和请求头。参见 [docs/extensions.md](docs/extensions.md)。

### 新增

- 新增 `--no-context-files`（`-nc`），用于禁用 `AGENTS.md` 和 `CLAUDE.md` 上下文文件发现和加载（[#3253](https://github.com/badlogic/pi-mono/issues/3253)）
- 将 `loadProjectContextFiles()` 导出为独立工具，因此扩展无需实例化完整 `DefaultResourceLoader` 即可发现项目上下文文件（[#3142](https://github.com/badlogic/pi-mono/issues/3142)）
- 新增 `after_provider_response` 扩展钩子，使扩展可在收到每个提供程序响应后、开始消费流之前检查提供程序 HTTP 状态代码和请求头（[#3128](https://github.com/badlogic/pi-mono/issues/3128)）

### 变更

- 为 Anthropic 新增 `claude-opus-4-7` 模型。
- 修改 Anthropic 提示缓存，在最后一个工具定义上添加 `cache_control` 断点，因此工具架构可独立于文稿更新进行缓存，同时保留现有缓存保留行为（[#3260](https://github.com/badlogic/pi-mono/issues/3260)）

### 修复

- 修复交互式渲染和 HTML 导出中的 Markdown 删除线解析，要求严格的双波浪线分隔符（`~~text~~`）以及非空白边界。
- 修复关闭处理，使其在退出信号时终止受跟踪的分离 `bash` 工具子进程，防止遗留孤儿后台进程。
- 修复不稳定的 `edit-tool-no-full-redraw` TUI 测试：等待异步预览和预检错误渲染，而非依赖固定渲染 tick。
- 修复 `kimi-coding` 默认模型选择，使用 `kimi-for-coding` 而非 `kimi-k2-thinking`（[#3242](https://github.com/badlogic/pi-mono/issues/3242)）
- 修复原生 Windows 上的 `ctrl+z`，避免交互模式崩溃、在那里禁用默认挂起绑定，并在手动调用挂起时显示状态消息（[#3191](https://github.com/badlogic/pi-mono/issues/3191)）
- 修复 `find` 工具在广泛搜索时的取消和响应性：使 `.gitignore` 发现和 `fd` 执行完全感知中止且非阻塞（[#3148](https://github.com/badlogic/pi-mono/issues/3148)）
- 修复 `grep` 在 `context=0` 时的广泛搜索停滞：从 ripgrep JSON 输出格式化匹配行，而非为每个匹配项同步读取文件（[#3205](https://github.com/badlogic/pi-mono/issues/3205)）

## [0.67.3] - 2026-04-15

### 新功能

- 为自定义和内置工具渲染器提供 `renderShell: "self"`，使工具可拥有自己的外层 shell，而非使用默认盒式 shell。适用于编辑差异等稳定的大型预览。参见 [docs/extensions.md#custom-rendering](docs/extensions.md#custom-rendering)。
- 交互式自动重试状态现在会在退避期间显示实时倒计时，而不是静态重试延迟消息。

### 新增

- 为自定义和内置工具渲染器新增 `renderShell: "self"`，使工具可拥有自己的外层 shell，而非使用默认盒式 shell。这适用于编辑差异等稳定的大型预览（[#3134](https://github.com/badlogic/pi-mono/issues/3134)）

### 修复

- 修复编辑差异预览，使其在编辑权限对话框和会话重放期间保持可见，同时不重新引入大结果重绘闪烁（[#3134](https://github.com/badlogic/pi-mono/issues/3134)）
- 修复 `/reload`，使其渲染静态重载状态框而非动画加载器，避免交互式重载期间的重绘不稳定。
- 修复 `plan-mode` 示例扩展，使其在只读 bash 允许列表中允许 `eza`，而非已弃用的 `exa` 命令（[#3240](https://github.com/badlogic/pi-mono/pull/3240) 由 [@rwachtler](https://github.com/rwachtler)）
- 修复 `google-vertex` API 密钥解析，将 `gcp-vertex-credentials` 视为应用默认凭据标记而非字面 API 密钥，因此基于标记的设置会正确回退至 ADC（[#3221](https://github.com/badlogic/pi-mono/pull/3221) 由 [@deepkilo](https://github.com/deepkilo)）
- 修复 RPC `prompt`，使其在发出唯一权威响应前等待提示预检成功，同时仍将已处理和排队的提示视为成功（[#3049](https://github.com/badlogic/pi-mono/issues/3049)）
- 修复 `/scoped-models` 重新排序，使其传播到 `/model` 作用域标签页，保留用户定义的作用域模型顺序而非重新排序（[#3217](https://github.com/badlogic/pi-mono/issues/3217)）
- 修复 `session_shutdown`，使其在交互式、打印和 RPC 模式中响应 `SIGHUP` 和 `SIGTERM`，从而扩展可在这些信号驱动的退出时运行关闭清理（[#3212](https://github.com/badlogic/pi-mono/issues/3212)）
- 修复截图路径解析以处理 macOS 截图文件名中小写的 am/pm（[#3194](https://github.com/badlogic/pi-mono/pull/3194) 由 [@jay-aye-see-kay](https://github.com/jay-aye-see-kay)）
- 修复交互式自动重试状态更新，使其在退避期间显示实时倒计时，而非静态重试延迟消息（[#3187](https://github.com/badlogic/pi-mono/issues/3187)）

## [0.67.2] - 2026-04-14

### 新功能

- 支持多个 `--append-system-prompt` 标志，每个值以双换行分隔追加到系统提示。参见 [README.md#other-options](README.md#other-options)。
- 支持将内联扩展工厂传给 `main()`，用于嵌入式集成和自定义入口点。
- 支持 Kitty `super` 修饰快捷键的交互式键绑定，例如 `super+k`、`super+enter` 和 `ctrl+super+k`。参见 [docs/keybindings.md](docs/keybindings.md)。

### 新增

- 新增对多个 `--append-system-prompt` 标志的支持，每个值以双换行分隔追加到系统提示（[#3171](https://github.com/badlogic/pi-mono/pull/3171) 由 [@aliou](https://github.com/aliou)）
- 新增对 Kitty `super` 修饰快捷键的交互式键绑定支持，例如 `super+k`、`super+enter` 和 `ctrl+super+k`（[#3111](https://github.com/badlogic/pi-mono/pull/3111) 由 [@sudosubin](https://github.com/sudosubin)）
- 新增支持将内联扩展工厂传给 `main()`，用于嵌入式集成和自定义入口点（[#3099](https://github.com/badlogic/pi-mono/pull/3099) 由 [@pmateusz](https://github.com/pmateusz)）

### 修复

- 修复直接 OpenAI Responses 和 Codex SSE 请求，使 `prompt_cache_key`、`session_id` 和 `x-client-request-id` 值与同一会话派生标识符对齐，从而改善仅追加会话的提示缓存亲和性（[#3018](https://github.com/badlogic/pi-mono/pull/3018) 由 [@steipete](https://github.com/steipete)）
- 修复仅流式 `partialJson` 暂存缓冲区泄漏至持久化 OpenAI Responses 工具调用的问题，该问题可能会损坏恢复对话中的后续载荷。
- 修复 tmux 中 Ctrl+Alt 字母按键匹配：当旧式 ESC 前缀处理不匹配时，继续回退至 CSI-u 和 xterm `modifyOtherKeys` 解析（[#2989](https://github.com/badlogic/pi-mono/pull/2989) 由 [@kaofelix](https://github.com/kaofelix)）
- 修复附带的 `subagent` 示例，避免将 Bun 虚拟文件系统脚本路径泄漏到子代理提示中（[#3002](https://github.com/badlogic/pi-mono/pull/3002) 由 [@nathyong](https://github.com/nathyong)）
- 修复带边框加载器，使其在释放时停止动画计时器，防止拆除后遗留加载器更新。

## [0.67.1] - 2026-04-13

### 遥测

交互模式在 `settings.json` 中写入 `lastChangelogVersion` 后，会向 `https://pi.dev/install?version=x.y.z` 发送轻量级匿名安装/更新遥测 ping。

其存在原因：
- Pi 需要可靠的逐版本使用信号，以了解版本是否被采用，并帮助证明持续开发资金的合理性。
- npm 下载量不是实际 Pi 使用情况的可靠代理。

工作方式：
- 它仅在交互模式中运行。
- 它不会在 RPC 模式、打印模式、JSON 模式或 SDK 模式中运行。
- 对于全新的交互式安装，Pi 会写入 `lastChangelogVersion`，然后发送 ping。
- 在后续交互式启动中，如果本地变更日志包含比之前存储的 `lastChangelogVersion` 更新的条目，Pi 会写入新的 `lastChangelogVersion`，然后发送 ping。
- 请求为即发即弃。启动不会等待它，且会忽略任何错误。

收集的数据：
- 仅收集请求路径中的 Pi 版本，例如 `https://pi.dev/install?version=0.67.1`。
- 服务器仅存储每个版本的聚合计数器，例如 `{ "0.67.1": 3 }`。
- 不存储 IP 地址、客户端标识符、提示、路径、模型、认证状态或任何其他逐用户数据。它实际上只会增加该版本的计数器。

禁用方式：
- `/settings` → 禁用 `Install telemetry`
- `settings.json` → 将 `enableInstallTelemetry` 设为 `false`
- `PI_OFFLINE=1`
- `PI_TELEMETRY=0`

### 新功能

- 完整支持 `models.json` 中的 `openRouterRouting`，包括回退、参数要求、数据收集、ZDR、忽略列表、量化、提供程序排序、最高价格以及首选吞吐量和延迟约束。参见 [docs/models.md](docs/models.md)。
- 启动时设置 `PI_CODING_AGENT=true` 环境变量，使子进程可检测它们在编码代理内运行。
- 更新 `antigravity-image-gen.ts` 示例扩展以使用 User-Agent 版本 `1.21.9`（[#2901](https://github.com/badlogic/pi-mono/pull/2901) 由 [@aadishv](https://github.com/aadishv)）
- 修复 `--list-models` 静默吞没 `models.json` 加载错误的问题；错误现在会打印到 stderr（[#3072](https://github.com/badlogic/pi-mono/issues/3072)）
- 修复内置提供程序（例如 `openrouter`）的自定义模型被 `--list-models` 静默丢弃的问题：从内置模型定义继承 `api`/`baseUrl`，且不再要求已有认证的提供程序使用 `apiKey`（[#2921](https://github.com/badlogic/pi-mono/issues/2921) 和 [#3072](https://github.com/badlogic/pi-mono/issues/3072)）

### 新增

- 为 `models.json` 新增完整的 `openRouterRouting` 字段支持，包括回退、参数要求、数据收集、ZDR、忽略列表、量化、提供程序排序、最高价格以及首选吞吐量和延迟约束（[#2904](https://github.com/badlogic/pi-mono/pull/2904) 由 [@zmberber](https://github.com/zmberber)）
- 启动时设置 `PI_CODING_AGENT=true` 环境变量，使子进程可检测它们在编码代理内运行（[#2868](https://github.com/badlogic/pi-mono/issues/2868)）

### 修复

- 修复遥测说明的交互式变更日志渲染：将该部分移至 `### 遥测` 标题下，因此启动时显示完整发行说明，而非仅显示版本标题。
- 更新 `antigravity-image-gen.ts` 示例扩展以使用 User-Agent 版本 `1.21.9`（[#2901](https://github.com/badlogic/pi-mono/pull/2901) 由 [@aadishv](https://github.com/aadishv)）
- 将默认 Antigravity User-Agent 版本提升至 `1.21.9`（[#2901](https://github.com/badlogic/pi-mono/pull/2901) 由 [@aadishv](https://github.com/aadishv)）
- 修复 Gemma 4 思考级别映射以在 `MINIMAL` 和 `HIGH` 之间路由，并将 Pi 推理级别映射至模型支持的思考级别（[#2903](https://github.com/badlogic/pi-mono/pull/2903) 由 [@aadishv](https://github.com/aadishv)）
- 修复 Gemini 2.5 Flash Lite 最低思考预算：使用模型支持的 512 令牌最低值，而非常规 Flash 的 128 令牌最低值，避免无效思考预算错误（[#2861](https://github.com/badlogic/pi-mono/pull/2861) 由 [@JasonOA888](https://github.com/JasonOA888)）
- 修复 OpenAI Codex Responses 请求以转发已配置的 `serviceTier` 值，恢复 Codex 会话的服务层级选择（[#2996](https://github.com/badlogic/pi-mono/pull/2996) 由 [@markusylisiurunen](https://github.com/markusylisiurunen)）
- 修复新生成的会话 ID，使其使用 UUIDv7，改善基于会话的请求路由的时间局部性（[#3018](https://github.com/badlogic/pi-mono/pull/3018) 由 [@steipete](https://github.com/steipete)）
- 修复长会话中的 `Container.render()` 栈溢出：将 `Array.push(...spread)` 替换为基于循环的 push，防止子输出超过 V8 调用栈参数限制时出现 `RangeError: Maximum call stack size exceeded`（[#2651](https://github.com/badlogic/pi-mono/issues/2651)）
- 修复粘贴标记周围的编辑器粘滞列跟踪，因此垂直光标导航会恢复光标进入粘贴标记前的列，而非跳至粘贴内容内或越过它（[#3092](https://github.com/badlogic/pi-mono/pull/3092) 由 [@Perlence](https://github.com/Perlence)）
- 修复在 `/tree` 分支摘要期间键入的排队消息，使其在导航完成后自动刷新，因此不再卡在引导队列中（[#3091](https://github.com/badlogic/pi-mono/pull/3091) 由 [@Perlence](https://github.com/Perlence)）
- 修复 npm 包更新检查，使其通过使用 `npm view` 而非硬编码的 `registry.npmjs.org` 获取，适用于非默认注册表上的包（[#3164](https://github.com/badlogic/pi-mono/pull/3164) 由 [@aliou](https://github.com/aliou)）

## [0.67.0] - 2026-04-13

参见 [0.67.1]。版本 0.67.0 发布时包含变更日志格式错误，导致交互式启动仅显示版本标题而非完整发行说明。

## [0.66.1] - 2026-04-08

### 已更改

- 将 Earendil 公告从自动启动通知改为隐藏的 `/dementedelves` 斜杠命令。

## [0.66.0] - 2026-04-08

### 新功能

- Earendil 启动公告，包含内置的内联图像渲染，以及用于 2026 年 4 月 8 日和 9 日的链接博客文章。
- 当 Anthropic 订阅认证处于活动状态时显示交互式 Anthropic 订阅认证警告，澄清 Anthropic 第三方使用会消耗额外用量，并按 token 计费。

### 已修复

- 修复了裸 `readline` 导入，改用 `node:readline` 前缀以兼容 Deno（[@milosv-vtool](https://github.com/milosv-vtool) 提交的 [#2885](https://github.com/badlogic/pi-mono/issues/2885)）
- 修复了自动重试，将诸如 `request ended without sending any chunks` 的流失败视为瞬态错误（[#2892](https://github.com/badlogic/pi-mono/issues/2892)）
- 修复了交互式启动通知，使其在初始资源列表之后渲染，并为 2026 年 4 月 8 日和 9 日添加带内联图像渲染的内置 Earendil 启动公告。将博客链接移至图像上方以避免与终端图像渲染重叠。
- 修复了交互模式，使其在 Anthropic 订阅认证处于活动状态时发出警告，从而让用户了解 Anthropic 第三方使用会消耗额外用量，并按 token 计费。

## [0.65.2] - 2026-04-06

## [0.65.1] - 2026-04-05

### 已修复

- 修复了按行数截断 bash 输出的问题，现在始终将完整输出持久化到临时文件，防止输出超过 2000 行但仍低于字节阈值时丢失数据（[#2852](https://github.com/badlogic/pi-mono/issues/2852)）
- RpcClient 现在会将子进程 stderr 实时转发到父进程（[#2805](https://github.com/badlogic/pi-mono/issues/2805)）
- 主题文件监视器现在会处理异步 `fs.watch` 错误事件，而不是使进程崩溃（[#2791](https://github.com/badlogic/pi-mono/issues/2791)）
- 修复了已存储会话的 cwd 处理，因此恢复或导入原始工作目录不再存在的会话时，现在会提示交互式用户在当前 cwd 中继续，而非交互模式会以明确错误失败。
- 修复了资源冲突优先级，因此项目和用户技能、提示模板及主题会一致地覆盖包资源，而 CLI 提供的路径优先于发现的资源（[#2781](https://github.com/badlogic/pi-mono/issues/2781)）
- 修复了 OpenAI 兼容 completions 流式使用量统计，以保留 `prompt_tokens_details.cache_write_tokens` 并规范化 OpenRouter `cached_tokens`，防止 pi 错误报告缓存读/写 token 和成本（[#2802](https://github.com/badlogic/pi-mono/issues/2802)）
- 修复了诸如 `git:gist.github.com/...` 的 CLI 扩展路径被错误地相对于 cwd 解析，而不是直接传递给包管理器的问题（[@aliou](https://github.com/aliou) 提交的 [#2845](https://github.com/badlogic/pi-mono/pull/2845)）
- 修复了通过管道 stdin 且使用 `--mode json` 运行时保留 JSONL 输出，而不是回退为纯文本的问题（[@aliou](https://github.com/aliou) 提交的 [#2848](https://github.com/badlogic/pi-mono/pull/2848)）
- 修复了交互式命令文档，不再将已移除的 `/exit` 列为受支持的退出命令（[#2850](https://github.com/badlogic/pi-mono/issues/2850)）

## [0.65.0] - 2026-04-03

### 新功能

- **会话运行时 API**：`createAgentSessionRuntime()` 和 `AgentSessionRuntime` 提供基于闭包的运行时，可在每次会话切换时重新创建绑定 cwd 的服务和会话配置。启动、`/new`、`/resume`、`/fork` 以及导入均使用相同的创建路径。参见 [docs/sdk.md](docs/sdk.md) 和 [examples/sdk/13-session-runtime.ts](examples/sdk/13-session-runtime.ts)。
- **`/tree` 中的标签时间戳**：使用 `Shift+T` 切换树条目上的时间戳，具备智能日期格式化，并在分支操作中保留时间戳（[@w-winter](https://github.com/w-winter) 提交的 [#2691](https://github.com/badlogic/pi-mono/pull/2691)）
- **`defineTool()` 辅助函数**：创建独立的自定义工具定义，具备完整的 TypeScript 参数类型推断，无需手动类型断言（[#2746](https://github.com/badlogic/pi-mono/issues/2746)）。参见 [docs/extensions.md](docs/extensions.md)。
- **统一诊断**：参数解析、服务创建、会话选项解析和资源加载均返回结构化诊断（`info`/`warning`/`error`），而不是记录日志或退出。应用层决定呈现和退出行为。

### 破坏性变更

- 移除了扩展的转换后事件 `session_switch` 和 `session_fork`。请使用带有 `event.reason`（`"startup" | "reload" | "new" | "resume" | "fork"`）的 `session_start`。对于 `"new"`、`"resume"` 和 `"fork"`，`session_start` 包含 `previousSessionFile`。
- 从 `AgentSession` 中移除了会话替换方法。请将 `AgentSessionRuntime` 用于 `newSession()`、`switchSession()`、`fork()` 和 `importFromJsonl()`。跨 cwd 的会话替换会重建所有绑定 cwd 的运行时状态，并替换活动的 `AgentSession` 实例。
- 从扩展和设置 API 中移除了 `session_directory`。
- 未知的单短横线 CLI 标志（例如 `-s`）现在会产生错误，而不是被静默忽略。

#### 迁移：扩展

之前：

```ts
pi.on("session_switch", async (event, ctx) => { ... });
pi.on("session_fork", async (_event, ctx) => { ... });
```

之后：

```ts
pi.on("session_start", async (event, ctx) => {
  // event.reason: "startup" | "reload" | "new" | "resume" | "fork"
  // event.previousSessionFile: set for "new", "resume", "fork"
});
```

#### 迁移：SDK 会话替换

之前：

```ts
await session.newSession();
await session.switchSession("/path/to/session.jsonl");
```

之后：

```ts
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runtime.newSession();
await runtime.switchSession("/path/to/session.jsonl");
await runtime.fork("entry-id");

// After replacement, runtime.session is the new live session.
// Rebind any session-local subscriptions or extension bindings.
```

### 已添加

- 添加了 `createAgentSessionRuntime()` 和 `AgentSessionRuntime`，用于由运行时支持的会话替换。运行时接受一个 `CreateAgentSessionRuntimeFactory` 闭包，该闭包捕获进程全局固定输入，并针对每个有效 cwd 重新创建绑定 cwd 的服务和会话配置。启动以及后续的 `/new`、`/resume`、`/fork`、导入均使用同一工厂。
- 为参数解析、服务创建、会话选项解析和资源加载添加了统一诊断模型（`info`/`warning`/`error`）。创建逻辑不再记录日志或退出。应用层决定呈现和退出行为。
- 为缺少的显式 CLI 资源路径（`-e`、`--skill`、`--prompt-template`、`--theme`）添加了错误诊断

- 添加了 `defineTool()`，使独立和基于数组的自定义工具定义无需手动类型断言即可保留推断出的参数类型（[#2746](https://github.com/badlogic/pi-mono/issues/2746)）

- 在 `/tree` 中为会话树添加了标签时间戳，支持通过 `Shift+T` 切换、智能日期格式化以及在分支操作中保留时间戳（[@w-winter](https://github.com/w-winter) 提交的 [#2691](https://github.com/badlogic/pi-mono/pull/2691)）

### 已修复

- 修复了启动资源加载，以便第一个运行时复用初始 `ResourceLoader`，从而使扩展不会在会话启动前加载两次，并且 `session_start` 处理程序仍会为单例样式扩展触发（[#2766](https://github.com/badlogic/pi-mono/issues/2766)）
- 修复了重试完成状态，使重试的代理运行会在声明空闲前等待整个重试周期完成，防止瞬态错误后出现过期状态
- 修复了主题 `export` 颜色，使其以与 `colors` 相同的方式解析主题变量，因此 `/export` HTML 背景现在会遵循诸如 `pageBg: "base"` 的条目，而无需内联十六进制值（[#2707](https://github.com/badlogic/pi-mono/issues/2707)）
- 修复了 Bedrock 限流错误被误识别为上下文溢出的问题，该问题会导致不必要的压缩而非重试（[@xu0o0](https://github.com/xu0o0) 提交的 [#2699](https://github.com/badlogic/pi-mono/pull/2699)）
- 为较新的 Z.ai 模型添加了工具流式支持（[@kaofelix](https://github.com/kaofelix) 提交的 [#2732](https://github.com/badlogic/pi-mono/pull/2732)）

## [0.64.0] - 2026-03-29

### 新功能

- 扩展和 SDK 调用方可以将 `prepareArguments` 钩子附加到任意工具定义，使其能够在模式验证前规范化或迁移原始模型参数。内置 `edit` 工具使用此功能以透明地支持采用旧单编辑模式创建的会话。参见 [docs/extensions.md](docs/extensions.md)
- 扩展可以通过 `ctx.ui.setHiddenThinkingLabel()` 自定义折叠思考块标签。参见 [examples/extensions/hidden-thinking-label.ts](examples/extensions/hidden-thinking-label.ts)（[#2673](https://github.com/badlogic/pi-mono/issues/2673)）

### 破坏性变更

- `ModelRegistry` 不再具有公共构造函数。SDK 调用方和测试必须对基于文件的注册表使用 `ModelRegistry.create(authStorage, modelsJsonPath?)`，或对仅内置的注册表使用 `ModelRegistry.inMemory(authStorage)`。直接调用 `new ModelRegistry(...)` 不再能够编译。

### 已添加

- 添加 `ToolDefinition.prepareArguments` 钩子，以在模式验证之前准备原始工具调用参数，从而为恢复的、工具模式已过时的会话启用兼容性垫片
- 内置 `edit` 工具现在使用 `prepareArguments`，以便在恢复旧会话时静默地将旧版顶层 `oldText`/`newText` 折叠到 `edits[]` 中
- 添加了 `ctx.ui.setHiddenThinkingLabel()`，以便扩展能够在交互模式中自定义折叠的思考标签；其在 RPC 模式中为空操作，并在 `examples/extensions/hidden-thinking-label.ts` 中提供了可运行的示例扩展（[#2673](https://github.com/badlogic/pi-mono/issues/2673)）

### 已修复

- 修复了扩展排队的用户消息，以刷新交互式待处理消息列表，因此在轮次活动期间提交的消息不再被静默丢弃（[@mrexodia](https://github.com/mrexodia) 提交的 [#2674](https://github.com/badlogic/pi-mono/pull/2674)）
- 修复了 monorepo `tsconfig.json` 路径映射，使其在开发检出中将 `@mariozechner/pi-ai` 子路径导出解析为源文件（[@ferologics](https://github.com/ferologics) 提交的 [#2625](https://github.com/badlogic/pi-mono/pull/2625)）
- 修复了 TUI 单元格大小响应处理，使其仅使用精确的 `CSI 6 ; height ; width t` 回复，因此在等待终端图像元数据时不再吞掉裸 `Escape`（[#2661](https://github.com/badlogic/pi-mono/issues/2661)）
- 修复了 Kitty 键盘协议小键盘功能键，将其规范化为逻辑数字、符号和导航键，因此在 iTerm2 等终端中的小键盘输入不再插入私有使用区乱码或被忽略（[#2650](https://github.com/badlogic/pi-mono/issues/2650)）

## [0.63.2] - 2026-03-29

### 新功能

- 扩展处理程序现在可以使用 `ctx.signal` 将取消操作转发到嵌套模型调用、`fetch()` 和其他支持中止的工作中。参见 [docs/extensions.md#ctxsignal](docs/extensions.md#ctxsignal)（[#2660](https://github.com/badlogic/pi-mono/issues/2660)）
- 内置 `edit` 工具输入现在仅使用 `edits[]` 作为替换形式，减少了由混合单编辑和多编辑模式导致的无效工具调用（[#2639](https://github.com/badlogic/pi-mono/issues/2639)）
- 在交互式 TUI 中渲染最终差异时，大型多编辑结果不再触发全屏重绘（[#2664](https://github.com/badlogic/pi-mono/issues/2664)）

### 已添加

- 向 `ExtensionContext` 添加了 `ctx.signal`，并将其连接到活动代理轮次，因此扩展处理程序可以将取消操作转发到嵌套模型调用、`fetch()` 和其他支持中止的工作中（[#2660](https://github.com/badlogic/pi-mono/issues/2660)）

### 已修复

- 修复了内置 `edit` 工具输入，仅使用 `edits[]` 作为替换形式，消除了导致重复无效工具调用和重试的混合单编辑和多编辑模式（[#2639](https://github.com/badlogic/pi-mono/issues/2639)）
- 修复了编辑工具 TUI 渲染，将大型多编辑差异延迟至稳定结果，从而避免工具完成时发生全屏重绘（[#2664](https://github.com/badlogic/pi-mono/issues/2664)）

## [0.63.1] - 2026-03-27

### 已添加

- 为 `google-vertex` 提供商添加了 `gemini-3.1-pro-preview-customtools` 模型可用性（[@gordonhwc](https://github.com/gordonhwc) 提交的 [#2610](https://github.com/badlogic/pi-mono/pull/2610)）

### 已修复

- 将 `tool_call` 输入变异记录为受支持的扩展 API 行为，澄清变异后的输入不会重新验证，并添加了执行变异工具参数的回归覆盖（[#2611](https://github.com/badlogic/pi-mono/issues/2611)）
- 修复了重复压缩会丢弃由较早压缩保留的消息的问题，方法是从之前的保留边界重新汇总，并从重建的会话上下文重新计算 `tokensBefore`（[#2608](https://github.com/badlogic/pi-mono/issues/2608)）
- 修复了交互式压缩 UI 更新，因此 `ctx.compact()` 会通过统一的压缩事件重建聊天，手动压缩不再重复汇总块，并且 `trigger-compact` 示例仅在上下文使用量超过其阈值时触发（[#2617](https://github.com/badlogic/pi-mono/issues/2617)）
- 修复了交互式压缩完成，以便在重建聊天后追加合成的压缩摘要，从而使最新压缩保持在底部可见
- 修复了技能发现，使其在目录包含 `SKILL.md` 后停止递归，并忽略 `.agents/skills` 中根目录的 `*.md` 文件，同时仍支持 `~/.pi/agent/skills`、`.pi/skills` 和包 `skills/` 目录中的根 Markdown 技能文件（[#2603](https://github.com/badlogic/pi-mono/issues/2603)）
- 修复了多编辑操作中具有较大未更改间隔的编辑工具差异渲染，因此远距离编辑会折叠中间上下文，而不是转储完整的未更改中间块
- 修复了编辑工具错误渲染，避免在预览和结果块中重复相同的精确匹配失败
- 修复了 Ollama 模型的自动压缩溢出恢复，当后端返回明确的 `prompt too long; exceeded max context length ...` 错误而不是静默截断输入时（[#2626](https://github.com/badlogic/pi-mono/issues/2626)）
- 修复了复用内置参数模式的内置工具覆盖仍可在交互式 TUI 中遵循自定义 `renderCall` 和 `renderResult` 渲染器，恢复了 `minimal-mode` 示例（[#2595](https://github.com/badlogic/pi-mono/issues/2595)）

## [0.63.0] - 2026-03-27

### 破坏性变更

- `ModelRegistry.getApiKey(model)` 已被 `getApiKeyAndHeaders(model)` 替代，因为 `models.json` 认证和标头值现在可以在每个请求中动态解析。此前仅获取 API 密钥的扩展和 SDK 集成现在必须在每次调用时获取请求认证，并同时转发 `apiKey` 和 `headers`。仅当你明确需要不含模型标头或 `authHeader` 处理的提供商级 API 密钥查找时，才使用 `getApiKeyForProvider(provider)`（[#1835](https://github.com/badlogic/pi-mono/issues/1835)）
- 移除了已弃用的直接 `minimax` 和 `minimax-cn` 模型 ID，仅保留 `MiniMax-M2.7` 和 `MiniMax-M2.7-highspeed`。请将固定的模型 ID 更新为其中一个受支持的直接 MiniMax 模型，或使用仍公开旧 ID 的其他提供商路由（[@liyuan97](https://github.com/liyuan97) 提交的 [#2596](https://github.com/badlogic/pi-mono/pull/2596)）

#### 迁移说明

之前：

```ts
const apiKey = await ctx.modelRegistry.getApiKey(model);
return streamSimple(model, messages, { apiKey });
```

之后：

```ts
const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
if (!auth.ok) throw new Error(auth.error);
return streamSimple(model, messages, {
  apiKey: auth.apiKey,
  headers: auth.headers,
});
```

### 已添加

- 在全局和项目 `settings.json` 中添加了 `sessionDir` 设置支持，因此无需每次调用都传递 `--session-dir` 即可配置会话存储（[@smcllns](https://github.com/smcllns) 提交的 [#2598](https://github.com/badlogic/pi-mono/pull/2598)）
- 在交互式页眉中添加了启动引导提示，告知用户 pi 可以解释其自身功能和文档（[@ferologics](https://github.com/ferologics) 提交的 [#2620](https://github.com/badlogic/pi-mono/pull/2620)）
- 添加了 `edit` 工具多编辑支持，使一次调用可以更新同一文件中多个独立、不相交的区域，同时根据原始文件内容匹配所有替换项
- 添加了对 `PI_TUI_WRITE_LOG` 目录路径的支持，为每个实例创建唯一日志文件（`tui-<timestamp>-<pid>.log`），以便更轻松地调试多个 pi 会话（[@mrexodia](https://github.com/mrexodia) 提交的 [#2508](https://github.com/badlogic/pi-mono/pull/2508)）

### 已更改

### 已修复

- 修复了文件变异队列排序，因此针对同一文件的并发 `edit` 和 `write` 操作会按请求顺序保持串行，而不是在队列键解析期间被重新排序
- 修复了 `models.json` shell 命令认证和标头，以便在请求时解析，而不是被缓存到长期存在的模型状态中。pi 现在将 TTL、缓存和恢复策略交由用户提供的包装命令处理，因为任意 shell 命令需要特定于提供商的策略（[#1835](https://github.com/badlogic/pi-mono/issues/1835)）
- 修复了 Google 和 Vertex 成本计算，以从可计费输入 token 中减去缓存的提示 token，而不是在提供商报告 `cachedContentTokenCount` 时对其重复计数（[@sparkleMing](https://github.com/sparkleMing) 提交的 [#2588](https://github.com/badlogic/pi-mono/pull/2588)）
- 添加了缺失的 `ajv` 直接依赖；此前依赖通过 `@mariozechner/pi-ai` 的传递安装，这会破坏独立安装（[#2252](https://github.com/badlogic/pi-mono/issues/2252)）
- 修复了 `/export` HTML 背景，使其遵循 `theme.export.pageBg`、`cardBg` 和 `infoBg`，而不是始终从 `userMessageBg` 派生（[#2565](https://github.com/badlogic/pi-mono/issues/2565)）
- 修复了交互式 bash 执行折叠预览，使其在渲染时重新计算可视行换行，因此预览会在调整大小和分割窗格宽度变化后遵循当前终端宽度（[#2569](https://github.com/badlogic/pi-mono/issues/2569)）
- 修复了 RPC `get_session_stats`，以公开 `contextUsage`，因此无头客户端可以读取实际当前上下文窗口使用量，而不是从 token 总数推导它（[#2550](https://github.com/badlogic/pi-mono/issues/2550)）
- 修复了 git 包的 `pi update`，使其仅使用 `--no-tags` 获取跟踪的目标分支，在保留可安全应对强制推送的更新的同时减少无关分支和标签噪音（[#2548](https://github.com/badlogic/pi-mono/issues/2548)）
- 修复了打印和 JSON 模式，使其在退出前发出 `session_shutdown`，因此扩展可以释放长期资源，且非交互式运行可以干净地终止（[#2576](https://github.com/badlogic/pi-mono/issues/2576)）
- 修复了 GitHub Copilot OpenAI Responses 请求，使其在未请求推理工作量时完全省略 `reasoning` 字段，避免 Copilot `gpt-5-mini` 在内部摘要调用期间拒绝 `reasoning: { effort: "none" }` 而产生 `400` 错误（[#2567](https://github.com/badlogic/pi-mono/issues/2567)）
- 修复了块引用文本颜色在内联链接（及其他内联元素）后因缺少样式恢复前缀而失效的问题
- 修复了斜杠命令 Tab 补全，使其在完成命令名称后不会立即链接到参数自动补全，恢复了诸如 `/model` 这类提交后进入选择器对话框的流程（[#2577](https://github.com/badlogic/pi-mono/issues/2577)）
- 修复了 TUI 内容收缩或瞬态组件扩大工作区域后出现的过期内容和不正确视口跟踪问题（[@Perlence](https://github.com/Perlence) 提交的 [#2126](https://github.com/badlogic/pi-mono/pull/2126)）
- 修复了 `@` 自动补全，使其对编辑器触发的搜索进行防抖、干净地取消进行中的 `fd` 查找，并在结果刷新时保持建议可见（[#1278](https://github.com/badlogic/pi-mono/issues/1278)）

## [0.62.0] - 2026-03-23

### 新功能

- 将内置工具作为可扩展的 ToolDefinitions。扩展作者现在可以使用自定义 `renderCall`/`renderResult` 组件覆盖内置 read/write/edit/bash/grep/find/ls 工具的渲染。参见 [docs/extensions.md](docs/extensions.md)。
- 通过 `sourceInfo` 统一源出处。所有资源、命令、工具、技能和提示模板现在均携带包含路径、范围和来源元数据的结构化 `sourceInfo`。在自动补全、RPC 发现和 SDK 自省中可见。参见 [docs/extensions.md](docs/extensions.md)。
- AWS Bedrock 成本分配标记。`BedrockOptions` 上的新 `requestMetadata` 选项会将键值对转发到 Bedrock Converse API，以便 AWS Cost Explorer 进行拆分成本分配。

### 破坏性变更

- 更改了 `ToolDefinition.renderCall` 和 `renderResult` 语义。现在仅当未为该位置定义渲染器时才会进行后备渲染。如果定义了 `renderCall` 或 `renderResult`，它必须返回一个 `Component`。
- 更改了斜杠命令出处，以一致使用 `sourceInfo`。RPC `get_commands`、`RpcSlashCommand` 和 SDK `SlashCommandInfo` 不再公开 `location` 或 `path`。请改用 `sourceInfo`（[#1734](https://github.com/badlogic/pi-mono/issues/1734)）
- 从 `Skill` 和 `PromptTemplate` 中移除了旧版 `source` 字段。请改用 `sourceInfo.source` 表示出处（[#1734](https://github.com/badlogic/pi-mono/issues/1734)）
- 移除了 `ResourceLoader.getPathMetadata()`。资源出处现在通过 `sourceInfo` 直接附加到已加载资源（[#1734](https://github.com/badlogic/pi-mono/issues/1734)）
- 从 `RegisteredCommand` 和 `RegisteredTool` 中移除了 `extensionPath`。请改用 `sourceInfo.path` 表示出处（[#1734](https://github.com/badlogic/pi-mono/issues/1734)）

#### 迁移说明

资源、命令和工具出处现在一致使用 `sourceInfo`。

常见更新：
- RPC `get_commands`：将 `path` 和 `location` 替换为 `sourceInfo.path`、`sourceInfo.scope` 和 `sourceInfo.source`
- `SlashCommandInfo`：将 `command.path` 和 `command.location` 替换为 `command.sourceInfo`
- `Skill` 和 `PromptTemplate`：将 `.source` 替换为 `.sourceInfo.source`
- `RegisteredCommand` 和 `RegisteredTool`：将 `.extensionPath` 替换为 `.sourceInfo.path`
- 自定义 `ResourceLoader` 实现：移除 `getPathMetadata()`，并直接从已加载资源读取出处

示例：
- `command.path` -> `command.sourceInfo.path`
- `command.location === "user"` -> `command.sourceInfo.scope === "user"`
- `skill.source` -> `skill.sourceInfo.source`
- `tool.extensionPath` -> `tool.sourceInfo.path`

### 已更改

- 内置工具现在像扩展中的自定义工具一样工作。要获取内置工具定义，请从 `@mariozechner/pi-coding-agent` 导入 `readToolDefinition` / `createReadToolDefinition()`，以及等效的 `bash`、`edit`、`write`、`grep`、`find` 和 `ls` 导出。
- 清理了 `buildSystemPrompt()`，使内置工具代码片段和工具本地指南来自内置 `ToolDefinition` 元数据，而跨工具和全局提示规则保留在系统提示构建中。
- 向内置、SDK 和扩展工具的 `pi.getAllTools()` 结果添加了结构化 `sourceInfo`（[#1734](https://github.com/badlogic/pi-mono/issues/1734)）

### 已修复

- 修复了扩展命令名称冲突，因此具有重复命令名称的扩展可以一同加载。冲突的扩展命令现在会按加载顺序获得数字调用后缀，例如 `/review:1` 和 `/review:2`（[#1061](https://github.com/badlogic/pi-mono/issues/1061)）
- 修复了自动补全和命令发现中扩展命令、提示模板及技能的斜杠命令源归属（[#1734](https://github.com/badlogic/pi-mono/issues/1734)）
- 修复了自动调整大小的图像处理，以对最终 base64 负载强制执行内联图像大小限制、在调整大小无法生成安全图像时返回纯文本后备，并避免在 `read` 和 `@file` 自动调整大小路径中回退到原始图像（[#2055](https://github.com/badlogic/pi-mono/issues/2055)）
- 修复了 git 包的 `pi update`，当获取的目标已与本地检出匹配时，跳过破坏性的重置、清理和重新安装步骤（[#2503](https://github.com/badlogic/pi-mono/issues/2503)）
- 修复了打印和 JSON 模式，使其在非交互式启动期间接管 stdout，从而将包管理器和其他附带杂讯排除在协议/输出 stdout 之外（[#2482](https://github.com/badlogic/pi-mono/issues/2482)）
- 修复了无语言代码块的 cli-highlight 自动检测，该问题会将散文误认为编程语言，并把随机英文词着色为关键字
- 修复了 Anthropic 思考禁用处理，以便在显式关闭思考时，针对支持推理的模型发送 `thinking: { type: "disabled" }`（[#2022](https://github.com/badlogic/pi-mono/issues/2022)）
- 修复了 Google、Google Vertex、Gemini CLI、OpenAI Responses、Azure OpenAI Responses 以及由 OpenRouter 支持的 OpenAI 兼容 completions 中的显式思考禁用处理（[#2490](https://github.com/badlogic/pi-mono/issues/2490)）
- 修复了 OpenAI Responses 对外来工具调用项 ID 的重放，通过将外来 ID 哈希为有界的 `fc_<hash>` ID
- 修复了 OpenAI 兼容 completions 流，使其忽略 null 块而不是崩溃（[@Cheng-Zi-Qing](https://github.com/Cheng-Zi-Qing) 提交的 [#2466](https://github.com/badlogic/pi-mono/pull/2466)）
- 修复了 `truncateToWidth()` 对极大字符串的性能，改用流式截断（[#2447](https://github.com/badlogic/pi-mono/issues/2447)）
- 修复了标题中内联代码跨度之后丢失 Markdown 标题样式的问题

## [0.61.1] - 2026-03-20

### 新功能

- 通过从顶层包和核心扩展入口导出的 `ToolCallEventResult`，为 `tool_call` 处理程序返回值提供类型支持。参见 [docs/extensions.md](docs/extensions.md)。
- 更新了 `zai`、`cerebras`、`minimax` 和 `minimax-cn` 的默认模型，并使 MiniMax 目录覆盖范围和限制与当前提供商阵容保持一致。参见 [docs/models.md](docs/models.md) 和 [docs/providers.md](docs/providers.md)。

### 已添加

- 将 `ToolCallEventResult` 添加到 `@mariozechner/pi-coding-agent` 顶层和核心扩展导出中，使扩展作者能够为显式 `tool_call` 处理程序返回值添加类型（[#2458](https://github.com/badlogic/pi-mono/issues/2458)）

### 已更改

- 将 `zai`、`cerebras`、`minimax` 和 `minimax-cn` 的默认模型更改为与当前提供商阵容相匹配，并添加了缺失的 `MiniMax-M2.1-highspeed` 模型条目及规范化的 MiniMax 上下文限制（[@1500256797](https://github.com/1500256797) 提交的 [#2445](https://github.com/badlogic/pi-mono/pull/2445)）

### 已修复

- 修复了 `ctrl+z` 挂起和 `fg` 恢复的可靠性：保持进程存活，直至 `SIGCONT` 处理程序恢复 TUI，从而避免在没有其他活动事件循环句柄的环境中立即退出进程（[#2454](https://github.com/badlogic/pi-mono/issues/2454)）
- 修复了 `createAgentSession({ agentDir })`，使其从提供的 `agentDir` 派生默认持久化会话路径，使会话存储与设置、认证、模型和资源加载保持一致（[#2457](https://github.com/badlogic/pi-mono/issues/2457)）
- 修复了共享键绑定解析，防止用户覆盖逐出不相关的默认快捷键，如选择器确认和编辑器光标键（[#2455](https://github.com/badlogic/pi-mono/issues/2455)）
- 修复了 Termux 软件键盘高度变化在每次切换时强制全屏重绘并重放 TUI 历史的问题（[#2467](https://github.com/badlogic/pi-mono/issues/2467)）
- 修复了项目本地 npm 包更新，使其安装 npm `latest` 而不是复用过期的已保存依赖范围；并在 `pi update <source>` 省略已配置 npm 或 git 源前缀时添加 `Did you mean ...?` 建议（[#2459](https://github.com/badlogic/pi-mono/issues/2459)）

## [0.61.0] - 2026-03-20

### 新功能

- 在应用和 TUI 中使用命名空间化的键绑定 ID 及统一的键绑定管理器。参见 [docs/keybindings.md](docs/keybindings.md) 和 [docs/extensions.md](docs/extensions.md)。
- 通过 `/export <path.jsonl>` 和 `/import <path.jsonl>` 提供 JSONL 会话导出和导入。参见 [README.md](README.md) 和 [docs/session.md](docs/session.md)。
- HTML 分享和导出视图中的可调整大小侧边栏。参见 [README.md](README.md)。

### 破坏性变更

- 交互式键绑定 ID 现在采用命名空间，且 `keybindings.json` 现在使用这些相同的规范命名空间 ID。旧配置文件会在启动时自动迁移。自定义编辑器和扩展 UI 组件仍会接收注入的 `keybindings: KeybindingsManager`。它们不会自行调用 `getKeybindings()` 或 `setKeybindings()`。声明合并适用于该注入类型（[#2391](https://github.com/badlogic/pi-mono/issues/2391)）
- 扩展作者迁移：将 `keyHint()`、`keyText()` 和注入的 `keybindings.matches(...)` 调用从诸如 `"expandTools"`、`"selectConfirm"` 和 `"interrupt"` 的旧内置名称更新为诸如 `"app.tools.expand"`、`"tui.select.confirm"` 和 `"app.interrupt"` 的命名空间 ID。完整列表参见 [docs/keybindings.md](docs/keybindings.md)。由于扩展快捷键仍使用原始按键组合而非键绑定 ID，`pi.registerShortcut("ctrl+shift+p", ...)` 保持不变。

### 已添加

- 将 `gpt-5.4-mini` 添加到 `openai-codex` 模型目录（[@justram](https://github.com/justram) 提交的 [#2334](https://github.com/badlogic/pi-mono/pull/2334)）
- 通过 `/export <path.jsonl>` 和 `/import <path.jsonl>` 添加了 JSONL 会话导出和导入（[@hjanuschka](https://github.com/hjanuschka) 提交的 [#2356](https://github.com/badlogic/pi-mono/pull/2356)）
- 为 HTML 分享和导出视图添加了可调整大小的侧边栏（[@dmmulroy](https://github.com/dmmulroy) 提交的 [#2435](https://github.com/badlogic/pi-mono/pull/2435)）

### 已修复

- session-selector-rename 和 tree-selector 的测试现在不依赖键绑定，在每个测试前将编辑器键绑定重置为默认值，因此用户 `keybindings.json` 不会导致失败（[#2360](https://github.com/badlogic/pi-mono/issues/2360)）
- 修复了自定义 `keybindings.json` 覆盖，以全局遮蔽冲突的默认快捷键，因此诸如 `cursorUp: ["up", "ctrl+p"]` 的绑定不再使模型循环等默认操作保持活动状态（[#2391](https://github.com/badlogic/pi-mono/issues/2391)）
- 修复了针对同一文件的并发 `edit` 和 `write` 变异，使其串行运行，防止交错的文件写入相互覆盖（[#2327](https://github.com/badlogic/pi-mono/issues/2327)）
- 修复了 RPC 模式，将意外 stdout 写入重定向到 stderr，因此 JSONL 响应保持可解析（[#2388](https://github.com/badlogic/pi-mono/issues/2388)）
- 修复了带工具使用重试响应的自动重试，使 `session.prompt()` 在返回前等待完整的重试循环，包括工具执行（[@pasky](https://github.com/pasky) 提交的 [#2440](https://github.com/badlogic/pi-mono/pull/2440)）
- 修复了 `/model`，使其在 `models.json` 更改后刷新作用域模型列表，避免过期的选择器内容（[@Perlence](https://github.com/Perlence) 提交的 [#2408](https://github.com/badlogic/pi-mono/pull/2408)）
- 修复了 `validateToolArguments()`，使其在 Cloudflare Workers 等受限运行时中 AJV 模式编译被阻止时能够优雅回退，从而允许工具在没有模式验证的情况下继续执行（[#2395](https://github.com/badlogic/pi-mono/issues/2395)）
- 修复了 CLI 启动，抑制进程警告泄漏到终端、打印和 RPC 输出中（[#2404](https://github.com/badlogic/pi-mono/issues/2404)）
- 修复了 bash 工具渲染，在工具块底部显示已用时间（[#2406](https://github.com/badlogic/pi-mono/issues/2406)）
- 修复了自定义主题文件监视，使其从磁盘重新加载更新的主题内容，而不是保留过期的缓存主题数据（[#2417](https://github.com/badlogic/pi-mono/issues/2417), [#2003](https://github.com/badlogic/pi-mono/issues/2003)）
- 修复了页脚 Git 分支刷新，使其异步运行，从而使分支监视器更新不会阻塞 UI（[#2418](https://github.com/badlogic/pi-mono/issues/2418)）
- 修复了无效扩展提供商注册，使其显示扩展错误而不阻止其他提供商加载（[#2431](https://github.com/badlogic/pi-mono/issues/2431)）
- 修复了 Windows bash 执行在命令生成继承 stdout/stderr 句柄的分离后代进程时挂起的问题，该问题会导致 `agent-browser` 和类似命令无限旋转（[@mrexodia](https://github.com/mrexodia) 提交的 [#2389](https://github.com/badlogic/pi-mono/pull/2389)）
- 修复了 `google-vertex` API 密钥解析，使其忽略诸如 `<authenticated>` 的占位认证标记，并回退到 ADC，而不是将其作为字面 API 密钥发送（[#2335](https://github.com/badlogic/pi-mono/issues/2335)）
- 修复了桌面剪贴板文本复制，优先使用原生 OS 剪贴板集成，再使用 shell 后备方案，从而提高 macOS 和 Windows 上的可靠性（[#2347](https://github.com/badlogic/pi-mono/issues/2347)）
- 修复了 Bun Bedrock 提供商注册，使其在已编译二进制文件中经历提供商重置和会话重新加载后仍能保持有效（[@unexge](https://github.com/unexge) 提交的 [#2350](https://github.com/badlogic/pi-mono/pull/2350)）
- 修复了 OpenRouter 推理请求，使其使用提供商的嵌套推理负载，恢复了对 OpenRouter 模型和自定义兼容设置的思考级别支持（[@PriNova](https://github.com/PriNova) 提交的 [#2298](https://github.com/badlogic/pi-mono/pull/2298)）
- 修复了 Bedrock 应用程序推理配置文件，使其在设置 `AWS_BEDROCK_FORCE_CACHE=1` 时支持提示缓存，涵盖未公开底层 Claude 模型名称的配置文件 ARN（[@haoqixu](https://github.com/haoqixu) 提交的 [#2346](https://github.com/badlogic/pi-mono/pull/2346)）

## [0.60.0] - 2026-03-18

### 新功能

- 可通过 CLI 的 `--fork <path|id>` 直接派生现有会话，它会将源会话复制为当前项目中的新会话。参见 [README.md](README.md)。
- 扩展和 SDK 调用方可通过 `createLocalBashOperations()` 复用 pi 的内置本地 bash 后端，用于 `user_bash` 拦截和自定义 bash 集成。参见 [docs/extensions.md#user_bash](docs/extensions.md#user_bash)。
- 启动时不再自动更新未固定版本的 npm 和 git 包。请显式使用 `pi update`；交互模式会在后台检查更新，并在有新版本包可用时通知你。参见 [README.md](README.md)。

### 破坏性变更

- 修改了包启动行为，安装的未固定版本包不再在启动期间检查或更新。使用 `pi update` 应用 npm/git 包更新；交互模式现在会在后台检查可用的包更新，并在有更新可用时通知你（[#1963](https://github.com/badlogic/pi-mono/issues/1963)）

### 新增

- 新增 `--fork <path|id>` CLI 标志，可将现有会话文件或部分会话 UUID 直接派生为新会话（[#2290](https://github.com/badlogic/pi-mono/issues/2290)）
- 新增 `createLocalBashOperations()` 导出，以便扩展和 SDK 调用方包装 pi 的内置本地 bash 后端，用于 `user_bash` 处理和其他自定义 bash 集成（[#2299](https://github.com/badlogic/pi-mono/issues/2299)）

### 修复

- 修复动态提供商注册或更新改变可用模型集合后，活动模型选择未立即刷新的问题（[#2291](https://github.com/badlogic/pi-mono/issues/2291)）
- 修复 tmux xterm `modifyOtherKeys` 对 `Backspace`、`Escape` 和 `Space` 的匹配，并通过区别对待 Windows Terminal 会话与旧式终端，解决原始 `\x08` 退格的歧义（[#2293](https://github.com/badlogic/pi-mono/issues/2293)）
- 修复 Gemini 3 和 Antigravity 图像工具结果被经由单独的后续消息重新路由的问题，现在它们会以内联多模态工具响应形式保留（[#2052](https://github.com/badlogic/pi-mono/issues/2052)）
- 修复捆绑的 Bedrock Claude 4.6 模型元数据，改用正确的 200K 上下文窗口而非 1M（[#2305](https://github.com/badlogic/pi-mono/issues/2305)）
- 修复 `/reload`，使其从磁盘重新加载按键绑定，以便 `keybindings.json` 中的更改立即生效（[#2309](https://github.com/badlogic/pi-mono/issues/2309)）
- 修复延迟内置提供商注册，以便编译后的 Bun 二进制文件仍可在首次使用时加载提供商，而无需急切捆绑提供商 SDK（[#2314](https://github.com/badlogic/pi-mono/issues/2314)）
- 修复内置 OAuth 登录流程，在 Anthropic、Gemini CLI、Antigravity 和 OpenAI Codex 之间使用一致的回调处理；并修复 OpenAI Codex 登录，使浏览器回调成功后立即完成（[#2316](https://github.com/badlogic/pi-mono/issues/2316)）
- 修复 OpenAI 兼容的 z.ai `network_error` 响应被当作成功的助手输出处理的问题，现在会触发错误处理和重试（[#2313](https://github.com/badlogic/pi-mono/issues/2313)）
- 修复打印模式，在同时提供管道 stdin 和显式提示时将 stdin 合并到初始提示中（[#2315](https://github.com/badlogic/pi-mono/issues/2315)）
- 修复 coding-agent 中的 OpenAI Responses 重放，在将超长的恢复工具调用 ID 发送回 OpenAI Codex 和其他 Responses 兼容目标前对其进行规范化（[#2328](https://github.com/badlogic/pi-mono/issues/2328)）
- 修复 tmux 服务器不可达时 tmux 扩展按键警告仍显示的问题，避免沙盒环境中出现错误的启动警告（[#2311](https://github.com/badlogic/pi-mono/pull/2311) 由 [@kaffarell](https://github.com/kaffarell) 提供）

## [0.59.0] - 2026-03-17

### 新功能

- 在首次使用时而非导入时延迟加载 `@mariozechner/pi-ai` 提供商 SDK，加快启动速度（[#2297](https://github.com/badlogic/pi-mono/issues/2297)）
- 改进提供商将错误消息作为响应返回时的重试行为（[#2264](https://github.com/badlogic/pi-mono/issues/2264)）
- 通过 OSC 133 命令执行标记改进终端集成（[#2242](https://github.com/badlogic/pi-mono/issues/2242)）
- 改进使用 reftable 存储的仓库的 Git 页脚分支检测（[#2300](https://github.com/badlogic/pi-mono/issues/2300)）

### 破坏性变更

- 修改自定义工具系统提示行为：扩展和 SDK 工具仅在提供 `promptSnippet` 时才包含在默认的 `Available tools` 部分中。现在省略 `promptSnippet` 会使工具不出现在该部分，而不再回退到 `description`（[#2285](https://github.com/badlogic/pi-mono/issues/2285)）

### 变更

- 延迟加载内置 `@mariozechner/pi-ai` 提供商模块和根提供商包装器，使 coding-agent 启动时不再在首次使用前急切加载提供商 SDK（[#2297](https://github.com/badlogic/pi-mono/issues/2297)）

### 修复

- 修复 `/tree`、压缩和分支摘要中的会话标题处理，使空标题清除能够正确渲染，并使 `session_info` 条目不会出现在摘要中（[#2304](https://github.com/badlogic/pi-mono/pull/2304) 由 [@aliou](https://github.com/aliou) 提供）
- 修复使用 reftable 存储的 Git 仓库的页脚分支检测，使分支名称仍能在页脚中正确显示（[#2300](https://github.com/badlogic/pi-mono/issues/2300)）
- 修复渲染后的用户消息，使其在命令输出后发出 OSC 133 命令执行标记，改进终端提示集成（[#2242](https://github.com/badlogic/pi-mono/issues/2242)）
- 修复提供商重试处理，将提供商返回的错误消息视为可重试失败而非成功响应（[#2264](https://github.com/badlogic/pi-mono/issues/2264)）
- 修复捆绑模型元数据中的 Claude 4.6 上下文窗口覆盖，以便重建生成的目录后 coding-agent 识别预期的模型限制（[#2286](https://github.com/badlogic/pi-mono/issues/2286)）

## [0.58.4] - 2026-03-16

### 修复

- 修复引导消息，令其等待当前助手消息的工具调用批次完全结束，而非跳过待处理的工具调用。

## [0.58.3] - 2026-03-15

## [0.58.2] - 2026-03-15

### 新增

- 通过使用可配置的选择列表主列尺寸，改进设置、主题、思考和显示图像选择器布局（[#2154](https://github.com/badlogic/pi-mono/pull/2154) 由 [@markusylisiurunen](https://github.com/markusylisiurunen) 提供）

### 修复

- 修复模糊 `edit` 匹配，在比较前规范化 Unicode 兼容变体，减少 CJK 和全角字符等文本出现“oldText not found”错误失败的情况（[#2044](https://github.com/badlogic/pi-mono/issues/2044)）
- 修复 `/model <ref>` 精确匹配和选择器搜索，使其在模型 ID 自身包含 `/` 时识别规范的 `provider/model` 引用，例如 LM Studio 模型 `unsloth/qwen3.5-35b-a3b`（[#2174](https://github.com/badlogic/pi-mono/issues/2174)）
- 修复 Anthropic OAuth 手动登录和令牌刷新：为粘贴的重定向/代码流程使用 localhost 回调 URI，并从刷新令牌请求中省略 `scope`（[#2169](https://github.com/badlogic/pi-mono/issues/2169)）
- 修复会话切换后遗留的过期回滚缓冲，通过在清空回滚缓冲前清屏解决（[#2155](https://github.com/badlogic/pi-mono/pull/2155) 由 [@Perlence](https://github.com/Perlence) 提供）
- 修复渲染输出中 Markdown 块元素后的额外空行（[#2152](https://github.com/badlogic/pi-mono/pull/2152) 由 [@markusylisiurunen](https://github.com/markusylisiurunen) 提供）

## [0.58.1] - 2026-03-14

### 新增

- 新增 `pi uninstall` 作为 `pi install --uninstall` 的便捷别名

### 修复

- 修复 OpenAI Codex websocket 协议，使其包含必需的标头并在连接关闭时正确终止 SSE 流（[#1961](https://github.com/badlogic/pi-mono/issues/1961)）
- 修复 WSL 剪贴板图像回退，以正确处理缺少剪贴板工具和权限错误（[#1722](https://github.com/badlogic/pi-mono/issues/1722)）
- 修复扩展 `session_start` 钩子在 TUI 就绪前触发，导致 `session_start` 处理器中的 UI 操作失败的问题（[#2035](https://github.com/badlogic/pi-mono/issues/2035)）
- 修复包管理器操作和自动补全的 Windows shell 及路径处理，以正确处理盘符和混合路径分隔符
- 修复为非 Claude 模型启用 Bedrock 提示缓存导致 API 错误的问题（[#2053](https://github.com/badlogic/pi-mono/issues/2053)）
- 通过添加使用 Qwen 原生聊天模板格式的 `qwen-chat-template` 兼容模式，修复通过 OpenAI 兼容提供商使用 Qwen 模型的问题（[#2020](https://github.com/badlogic/pi-mono/issues/2020)）
- 修复 Bedrock 未签名思考重放，以处理空或格式错误的思考块等边缘情况（[#2063](https://github.com/badlogic/pi-mono/issues/2063)）
- 修复无头剪贴板回退在非交互环境中记录虚假错误的问题（[#2056](https://github.com/badlogic/pi-mono/issues/2056)）
- 修复加载自定义模型定义时未遵循 `models.json` 提供商兼容标志的问题（[#2062](https://github.com/badlogic/pi-mono/issues/2062)）
- 修复 Claude Opus 4.6 的 xhigh 推理强度检测，改为按模型 ID 匹配，而不要求显式能力标志（[#2040](https://github.com/badlogic/pi-mono/issues/2040)）
- 修复提示 cwd 包含 Windows 反斜杠时导致 bash 工具执行失败的问题，改为规范化为正斜杠（[#2080](https://github.com/badlogic/pi-mono/issues/2080)）
- 修复编辑器粘贴，使其保留字面内容而非规范化换行，防止包含嵌入式转义序列的文本损坏（[#2064](https://github.com/badlogic/pi-mono/issues/2064)）
- 修复嵌套 `SKILL.md` 文件存在时，技能发现递归越过技能根目录的问题（[#2075](https://github.com/badlogic/pi-mono/issues/2075)）
- 修复 Tab 补全，使其在补全相对路径时保留 `./` 前缀（[#2087](https://github.com/badlogic/pi-mono/issues/2087)）
- 通过添加 `npmCommand` 作为包管理器操作的 argv 风格设置覆盖，修复 npm 包安装和查询绑定到活动仓库 Node 版本的问题（[#2072](https://github.com/badlogic/pi-mono/issues/2072)）
- 修复扩展 API 中的 `ctx.ui.getEditorText()` 返回粘贴标记（例如 `[paste #1 +24 lines]`）而非实际粘贴内容的问题（[#2084](https://github.com/badlogic/pi-mono/issues/2084)）
- 修复首次运行时下载 `fd`/`ripgrep` 导致的启动崩溃，改用 `pipeline()` 而非 `finished(readable.pipe(writable))`，以正确捕获超时产生的流错误，并将下载超时从 10 秒增加到 120 秒（[#2066](https://github.com/badlogic/pi-mono/issues/2066)）

## [0.58.0] - 2026-03-14

### 新功能

- Claude Opus 4.6、Sonnet 4.6 和相关 Bedrock 模型现在使用 1M token 上下文窗口（从 200K 提升）（[#2135](https://github.com/badlogic/pi-mono/pull/2135) 由 [@mitsuhiko](https://github.com/mitsuhiko) 提供）。
- 扩展工具调用现在默认并行执行，同时保留用于扩展拦截的顺序 `tool_call` 预检。
- 为 `google-vertex` 提供商支持 `GOOGLE_CLOUD_API_KEY` 环境变量，作为应用默认凭据的替代方案（[#1976](https://github.com/badlogic/pi-mono/pull/1976) 由 [@gordonhwc](https://github.com/gordonhwc) 提供）。
- 扩展可通过 `newSession()` 提供确定性的会话 ID（[#2130](https://github.com/badlogic/pi-mono/pull/2130) 由 [@zhahaoyu](https://github.com/zhahaoyu) 提供）。

### 新增

- 为 `google-vertex` 提供商新增 `GOOGLE_CLOUD_API_KEY` 环境变量支持，作为应用默认凭据的替代方案（[#1976](https://github.com/badlogic/pi-mono/pull/1976) 由 [@gordonhwc](https://github.com/gordonhwc) 提供）
- 为需要确定性会话路径的扩展，在 `newSession()` 中新增自定义会话 ID 支持（[#2130](https://github.com/badlogic/pi-mono/pull/2130) 由 [@zhahaoyu](https://github.com/zhahaoyu) 提供）

### 变更

- 将扩展工具拦截改为使用 agent-core 的 `beforeToolCall` 和 `afterToolCall` 钩子，而非基于包装器的拦截。工具调用现在默认并行执行，扩展 `tool_call` 预检仍顺序运行，最终工具结果按助手源顺序发出。
- 将 Claude Opus 4.6、Sonnet 4.6 和相关 Bedrock 模型的上下文窗口从 200K 提升至 1M token（[#2135](https://github.com/badlogic/pi-mono/pull/2135) 由 [@mitsuhiko](https://github.com/mitsuhiko) 提供）

### 修复

- 修复多工具轮次中 `tool_call` 扩展处理器观察到过期 `sessionManager` 状态的问题，方法是在每个 `tool_call` 预检前排空已排队的代理事件。在并行工具模式下，这可保证状态覆盖当前助手工具调用消息，但不包括同一助手消息中同级工具的结果。
- 修复由 TUI `Input` 组件支持的交互输入字段，使其针对宽 Unicode 文本（CJK、全角字符）按视觉列宽滚动，防止搜索和筛选输入等位置出现渲染行溢出和 TUI 崩溃（[#1982](https://github.com/badlogic/pi-mono/issues/1982)）
- 修复 tmux 中的 `shift+tab` 和其他修饰 Tab 绑定，当 `extended-keys-format` 保持默认 `xterm` 时的问题
- 修复图像转换和缩放期间未应用 EXIF 方向的问题，该问题导致手机相机拍摄的 JPEG 和 WebP 图像显示为旋转或镜像（[#2105](https://github.com/badlogic/pi-mono/pull/2105) 由 [@melihmucuk](https://github.com/melihmucuk) 提供）
- 修复默认 coding-agent 系统提示，使其仅包含 ISO 格式的当前日期而非当前时间，从而令提示前缀可在重载和恢复的会话之间缓存（[#2131](https://github.com/badlogic/pi-mono/issues/2131)）
- 修复重试正则表达式，使其匹配提供商的 `server_error` 和 `internal_error` 错误类型，改善自动重试覆盖率（[#2117](https://github.com/badlogic/pi-mono/pull/2117) 由 [@MadKangYu](https://github.com/MadKangYu) 提供）
- 修复示例扩展，以支持用于自定义代理目录路径的 `PI_CODING_AGENT_DIR` 环境变量（[#2009](https://github.com/badlogic/pi-mono/pull/2009) 由 [@smithbm2316](https://github.com/smithbm2316) 提供）
- 修复 OpenAI Responses API 提供商的 `function_call_output` 项中未发送工具结果图像的问题，该问题会导致图像数据在工具结果中被静默丢弃（[#2104](https://github.com/badlogic/pi-mono/issues/2104)）
- 修复 `openai-completions` 提供商中助手内容以结构化内容块而非纯字符串发送的问题，该问题会导致某些 OpenAI 兼容后端报错（[#2008](https://github.com/badlogic/pi-mono/pull/2008) 由 [@geraldoaax](https://github.com/geraldoaax) 提供）
- 修复 OpenAI Responses `response.failed` 处理器中的错误详情，使其包含状态码、错误代码和消息，而非通用失败信息（[#1956](https://github.com/badlogic/pi-mono/pull/1956) 由 [@drewburr](https://github.com/drewburr) 提供）
- 修复 GitHub Copilot 设备代码登录轮询，以遵守 OAuth 降速间隔、在首次令牌轮询前等待，并在反复降速导致超时时为 WSL/VM 环境提供更清晰的时钟漂移提示
- 修复未捕获 OpenAI 兼容提供商使用 `choice.usage` 而非标准 `chunk.usage` 返回的用量统计的问题（例如 Moonshot/Kimi）（[#2017](https://github.com/badlogic/pi-mono/issues/2017)）
- 修复窄终端宽度下编辑器滚动指示器渲染崩溃的问题（[#2103](https://github.com/badlogic/pi-mono/pull/2103) 由 [@haoqixu](https://github.com/haoqixu) 提供）
- 修复编辑器和输入粘贴中的 Tab 字符未规范化为空格的问题（[#2027](https://github.com/badlogic/pi-mono/pull/2027)、[#1975](https://github.com/badlogic/pi-mono/pull/1975) 由 [@haoqixu](https://github.com/haoqixu) 提供）
- 修复宽字符（CJK、全角字符）恰好落在换行边界时 `wordWrapLine` 溢出的问题（[#2082](https://github.com/badlogic/pi-mono/pull/2082) 由 [@haoqixu](https://github.com/haoqixu) 提供）
- 修复粘贴标记在编辑器自动换行和光标导航中未被视为原子段的问题（[#2111](https://github.com/badlogic/pi-mono/pull/2111) 由 [@haoqixu](https://github.com/haoqixu) 提供）

## [0.57.1] - 2026-03-07

### 新功能
- `/tree` 中的树分支折叠和分段跳转导航，提供 `Ctrl+←`/`Ctrl+→` 与 `Alt+←`/`Alt+→` 快捷键，同时保留 `←`/`→` 和 `Page Up`/`Page Down` 用于分页。参见 [docs/tree.md](docs/tree.md) 和 [docs/keybindings.md](docs/keybindings.md)。
- 用于在创建会话管理器前自定义会话目录路径的 `session_directory` 扩展事件。参见 [docs/extensions.md](docs/extensions.md)。
- TUI 按键绑定系统中的数字按键绑定（`0-9`），包括如 `ctrl+1` 的修饰组合。参见 [docs/keybindings.md](docs/keybindings.md)。

### 新增
- 新增 `/tree` 分支折叠和分段跳转导航，提供 `Ctrl+←`/`Ctrl+→` 与 `Alt+←`/`Alt+→`，同时保留 `←`/`→` 和 `Page Up`/`Page Down` 用于分页（[#1724](https://github.com/badlogic/pi-mono/pull/1724) 由 [@Perlence](https://github.com/Perlence) 提供）
- 新增 `session_directory` 扩展事件，在创建会话管理器前触发，允许扩展根据 cwd 和其他因素自定义会话目录路径。CLI `--session-dir` 标志优先于扩展提供的路径（[#1730](https://github.com/badlogic/pi-mono/pull/1730) 由 [@hjanuschka](https://github.com/hjanuschka) 提供）。
- 在按键绑定系统中新增数字键（`0-9`），包括对如 `ctrl+1` 绑定的 Kitty CSI-u 和 xterm `modifyOtherKeys` 支持（[#1905](https://github.com/badlogic/pi-mono/issues/1905)）

### 修复
- 修复 HTML 导出中自定义工具折叠/展开渲染。定义不同折叠与展开显示的自定义工具现在可在导出的 HTML 中正确渲染；当两种状态不同时提供可展开部分，仅存在展开状态时直接显示（[#1934](https://github.com/badlogic/pi-mono/pull/1934) 由 [@aliou](https://github.com/aliou) 提供）
- 修复 tmux 启动指引和用于修饰键处理的键盘设置警告，包括 Ghostty `shift+enter=text:\n` 重映射指引和 tmux `extended-keys-format` 检测（[#1872](https://github.com/badlogic/pi-mono/issues/1872)）
- 修复 z.ai 上下文溢出恢复，使 `model_context_window_exceeded` 错误触发自动压缩，而非显示为未处理的停止原因失败（[#1937](https://github.com/badlogic/pi-mono/issues/1937)）
- 修复自动补全选择忽略已输入文本的问题：用户输入时高亮现在跟随第一个前缀匹配项，且精确匹配在 Enter 时始终被选中（[#1931](https://github.com/badlogic/pi-mono/pull/1931) 由 [@aliou](https://github.com/aliou) 提供）
- 修复斜杠命令 Tab 补全，使其在可用时立即打开参数补全（[#1481](https://github.com/badlogic/pi-mono/pull/1481) 由 [@barapa](https://github.com/barapa) 提供）
- 修复显式 `pi -e <path>` 扩展将命令和工具冲突让给已发现扩展的问题，改为赋予 CLI 加载的扩展更高优先级（[#1896](https://github.com/badlogic/pi-mono/issues/1896)）
- 修复 `Ctrl+G` 和 `ctx.ui.editor()` 的 Windows 外部编辑器启动，以使 `EDITOR="code --wait"` 等基于 shell 的命令正常工作（[#1925](https://github.com/badlogic/pi-mono/issues/1925)）

## [0.57.0] - 2026-03-07

### 新功能

- 扩展可通过 `before_provider_request` 拦截和修改提供商请求负载。参见 [docs/extensions.md#before_provider_request](docs/extensions.md#before_provider_request)。
- 扩展 UI 可通过 `OverlayOptions.nonCapturing` 和 `OverlayHandle.focus()` / `unfocus()` / `isFocused()` 使用具有显式焦点控制的非捕获式覆盖层。参见 [docs/extensions.md](docs/extensions.md) 和 [../tui/README.md](../tui/README.md)。
- RPC 模式现在使用严格的仅 LF JSONL 分帧以实现稳健的负载处理。参见 [docs/rpc.md](docs/rpc.md)。

### 破坏性变更

- RPC 模式现在使用严格的 LF 分隔 JSONL 分帧。客户端必须仅按 `\n` 拆分记录，而不能使用 Node `readline` 等通用行读取器，因为它们也会在 JSON 负载中的 Unicode 分隔符处拆分（[#1911](https://github.com/badlogic/pi-mono/issues/1911)）

### 新增

- 新增 `before_provider_request` 扩展钩子，以便扩展在发送请求前检查或替换提供商负载，并在 `examples/extensions/provider-payload.ts` 中提供示例
- 通过 `OverlayOptions.nonCapturing` 和 `OverlayHandle.focus()` / `unfocus()` / `isFocused()` 为扩展 UI 新增非捕获式覆盖层焦点控制（[#1916](https://github.com/badlogic/pi-mono/pull/1916) 由 [@nicobailon](https://github.com/nicobailon) 提供）

### 变更

- 扩展 UI 中的覆盖层合成现在使用焦点顺序，因此具有焦点的覆盖层渲染在最上方，同时保留显示/隐藏行为的堆栈语义（[#1916](https://github.com/badlogic/pi-mono/pull/1916) 由 [@nicobailon](https://github.com/nicobailon) 提供）

### 修复

- 修复 RPC 模式 stdin/stdout 分帧，改用严格的 LF 分隔 JSONL 而非 `readline`，使包含 `U+2028` 或 `U+2029` 的负载不再损坏命令或事件流（[#1911](https://github.com/badlogic/pi-mono/issues/1911)）
- 修复扩展 UI 中自动恢复覆盖层焦点的逻辑，使其跳过非捕获式覆盖层；并修复覆盖层隐藏行为，使其仅在隐藏的覆盖层拥有焦点时重新分配焦点（[#1916](https://github.com/badlogic/pi-mono/pull/1916) 由 [@nicobailon](https://github.com/nicobailon) 提供）
- 修复 `pi config` 在 `$HOME` 下的非 git 目录中将 `~/.agents/skills` 错误归类为项目作用域的问题，因此切换这些技能不再将项目覆盖写入 `.pi/settings.json`（[#1915](https://github.com/badlogic/pi-mono/issues/1915)）

## [0.56.3] - 2026-03-06

### 新功能

- 可通过 `google-antigravity` 提供商使用 `claude-sonnet-4-6` 模型（[#1859](https://github.com/badlogic/pi-mono/issues/1859)）
- 自定义编辑器现在可定义自己的 `onEscape`/`onCtrlD` 处理器，而不会被应用默认值覆盖，从而支持 vim 模式扩展（[#1838](https://github.com/badlogic/pi-mono/issues/1838)）
- Shift+Enter 和 Ctrl+Enter 现在可通过 xterm modifyOtherKeys 回退机制在 tmux 内工作（[docs/tmux.md](docs/tmux.md)、[#1872](https://github.com/badlogic/pi-mono/issues/1872)）
- 自动压缩现在能够应对持久 API 错误（例如 529 overloaded），且不会在压缩后错误地再次触发（[#1834](https://github.com/badlogic/pi-mono/issues/1834)、[#1860](https://github.com/badlogic/pi-mono/issues/1860)）

### 新增

- 为 `google-antigravity` 提供商新增 `claude-sonnet-4-6` 模型（[#1859](https://github.com/badlogic/pi-mono/issues/1859)）。
- 为修饰 Enter 键支持新增 [tmux 设置文档](docs/tmux.md)（[#1872](https://github.com/badlogic/pi-mono/issues/1872)）

### 修复

- 修复自定义编辑器的 `onEscape`/`onCtrlD` 处理器被应用级默认值无条件覆盖，导致不可能实现 vim 风格 Escape 处理的问题（[#1838](https://github.com/badlogic/pi-mono/issues/1838)）
- 修复由于过期的压缩前助手用量而在压缩后的首次提示中再次触发自动压缩的问题（[#1860](https://github.com/badlogic/pi-mono/issues/1860) 由 [@joelhooks](https://github.com/joelhooks) 提供）
- 修复因持久 API 错误（例如 529 overloaded）而从不自动压缩的会话，改为根据最后一次成功响应估算上下文大小（[#1834](https://github.com/badlogic/pi-mono/issues/1834)）
- 修复压缩摘要请求超出上下文限制的问题，将工具结果截断为 2k 字符（[#1796](https://github.com/badlogic/pi-mono/issues/1796)）
- 修复 `/new` 在启动新会话后仍显示启动标头内容（包括更新日志）的问题（[#1880](https://github.com/badlogic/pi-mono/issues/1880)）
- 修复具有误导性的文档和示例，它们暗示从工具的 `execute` 函数返回 `{ isError: true }` 会将执行标记为失败；错误必须通过抛出异常来指示（[#1881](https://github.com/badlogic/pi-mono/issues/1881)）
- 修复通过非推理模型切换模型时，持久化能力强制的 `off` 限制而非保留已保存默认思考级别的问题（[#1864](https://github.com/badlogic/pi-mono/issues/1864)）
- 修复并行 pi 进程因 `auth.json` 和 `settings.json` 上即时锁文件争用而报出错误的“未找到 API 密钥”错误（[#1871](https://github.com/badlogic/pi-mono/issues/1871)）
- 修复破坏多轮推理连续性的 OpenAI Responses 推理重放回归（[#1878](https://github.com/badlogic/pi-mono/issues/1878)）

## [0.56.2] - 2026-03-05

### 新功能

- 在 `openai`、`openai-codex`、`azure-openai-responses` 和 `opencode` 中支持 GPT-5.4，`gpt-5.4` 现为 `openai` 和 `openai-codex` 的默认模型（[README.md](README.md)、[docs/providers.md](docs/providers.md)）。
- 使用 `treeFilterMode` 设置选择默认 `/tree` 筛选模式（`default`、`no-tools`、`user-only`、`labeled-only`、`all`）（[docs/settings.md](docs/settings.md)、[#1852](https://github.com/badlogic/pi-mono/pull/1852) 由 [@lajarre](https://github.com/lajarre) 提供）。
- Mistral 原生会话集成，采用 SDK 支持的提供商行为，保留 Mistral 特有的思考和重放语义（[README.md](README.md)、[docs/providers.md](docs/providers.md)、[#1716](https://github.com/badlogic/pi-mono/issues/1716)）。

### 新增

- 为 `openai`、`openai-codex`、`azure-openai-responses` 和 `opencode` 提供商新增 `gpt-5.4` 模型可用性。
- 在上游模型目录包含它之前，为 `github-copilot` 新增 `gpt-5.3-codex` 回退模型可用性（[#1853](https://github.com/badlogic/pi-mono/issues/1853)）。
- 新增 `treeFilterMode` 设置，用于选择默认 `/tree` 筛选模式（`default`、`no-tools`、`user-only`、`labeled-only`、`all`）（[#1852](https://github.com/badlogic/pi-mono/pull/1852) 由 [@lajarre](https://github.com/lajarre) 提供）。

### 变更

- 将 `openai` 和 `openai-codex` 提供商的默认模型更新为 `gpt-5.4`。

### 修复

- 修复 GPT-5.3 Codex 后续轮次丢弃 OpenAI Responses 助手 `phase` 元数据的问题，通过在会话历史中保留可重放签名并将 `phase` 转发回 Responses API 解决（[#1819](https://github.com/badlogic/pi-mono/issues/1819)）。
- 修复 OpenAI Responses 重放，省略空思考块，避免后续轮次中出现无效的无操作推理项。
- 更新 Mistral 集成以使用原生 SDK 支持的提供商和 conversations API，包括 coding-agent 模型/提供商连接以及 Mistral 设置文档（[#1716](https://github.com/badlogic/pi-mono/issues/1716)）。
- 修复 Antigravity 可靠性：在 403/404 时进行端点级联、添加 autopush 沙盒回退、移除额外指纹标头（[#1830](https://github.com/badlogic/pi-mono/issues/1830)）。
- 修复已发布安装中的 `@mariozechner/pi-ai/oauth` 扩展导入，改为直接从构建后的 `dist` 文件解析子路径，而非通过包根包装器 shim（[#1856](https://github.com/badlogic/pi-mono/issues/1856)）。
- 修复 Gemini 3 多轮工具使用丢失结构化上下文的问题，对未签名函数调用使用 `skip_thought_signature_validator` 哨兵而非文本回退（[#1829](https://github.com/badlogic/pi-mono/issues/1829)）。
- 修复因 `Input` 组件缺少 Kitty CSI-u 可打印字符解码导致 VS Code 1.110+ 中模型选择器筛选不接受输入字符的问题（[#1857](https://github.com/badlogic/pi-mono/issues/1857)）
- 修复终端调整大小期间编辑器/页脚可见性漂移的问题，在终端宽度或高度变化时强制完全重绘（[#1844](https://github.com/badlogic/pi-mono/pull/1844) 由 [@ghoulr](https://github.com/ghoulr) 提供）。
- 修复宽 Unicode 文本（会话名称、模型、提供商）的页脚宽度截断，以防止渲染行超出终端宽度而导致 TUI 崩溃（[#1833](https://github.com/badlogic/pi-mono/issues/1833)）。
- 修复 Windows 写入预览背景伪影，通过将 CRLF 内容（`\r\n`）规范化为 LF 用于工具输出预览中的显示渲染（[#1854](https://github.com/badlogic/pi-mono/issues/1854)）。

## [0.56.1] - 2026-03-05

### 修复

- 修复全局安装中 `jiti` 别名的扩展别名回退解析，改用感知 ESM 的解析（[#1821](https://github.com/badlogic/pi-mono/pull/1821) 由 [@Perlence](https://github.com/Perlence) 提供）
- 修复 Markdown 引用块渲染，使引用块样式与默认文本样式隔离，防止样式泄漏。

## [0.56.0] - 2026-03-04

### 新功能

- 新增 OpenCode Go 提供商支持，包含 `opencode-go` 默认模型和 `OPENCODE_API_KEY` 环境变量支持（[docs/providers.md](docs/providers.md)、[#1757](https://github.com/badlogic/pi-mono/issues/1757)）。
- 新增 `branchSummary.skipPrompt` 设置，用于在树导航期间跳过分支摘要提示（[docs/settings.md](docs/settings.md)、[#1792](https://github.com/badlogic/pi-mono/issues/1792)）。
- 当上游模型元数据滞后时，在 Google 提供商目录中新增 `gemini-3.1-flash-lite-preview` 回退模型可用性（[README.md](README.md)、[#1785](https://github.com/badlogic/pi-mono/issues/1785)）。

### 破坏性变更

- 修改作用域模型思考语义。现在，未显式带有 `:<thinking>` 后缀的作用域条目在选中时继承当前会话思考级别，而非应用启动时捕获的默认值。
- 将 Node OAuth 运行时导出从顶层 `@mariozechner/pi-ai` 入口移出。OAuth 登录和刷新必须从 `@mariozechner/pi-ai/oauth` 导入（[#1814](https://github.com/badlogic/pi-mono/issues/1814)）。

### 新增

- 新增 `branchSummary.skipPrompt` 设置，用于在导航分支时跳过摘要提示（[#1792](https://github.com/badlogic/pi-mono/issues/1792)）。
- 新增 OpenCode Go 提供商支持，包含 `opencode-go` 默认模型和 `OPENCODE_API_KEY` 环境变量支持（[#1757](https://github.com/badlogic/pi-mono/issues/1757)）。
- 当上游目录滞后时，在提供商目录中新增 `gemini-3.1-flash-lite-preview` 回退模型可用性（[#1785](https://github.com/badlogic/pi-mono/issues/1785)）。

### 变更

- 更新 Antigravity Gemini 3.1 模型元数据和请求标头，以匹配上游行为。

### 修复

- 修复自定义扩展编辑器（`ctx.ui.editor()` / 扩展编辑器对话框）中的 IME 硬件光标定位，通过将焦点传播到内部 `Editor`，防止合成期间终端光标卡在右下角。
- 在渲染后的用户消息周围新增 OSC 133 语义区域标记，以支持在 iTerm2、WezTerm、Kitty、Ghostty 和其他兼容终端中于提示之间导航（[#1805](https://github.com/badlogic/pi-mono/issues/1805)）。
- 修复 TUI 渲染器中 Markdown 引用块丢弃嵌套列表内容的问题（[#1787](https://github.com/badlogic/pi-mono/issues/1787)）。
- 修复 TUI 对区域指示符号的宽度处理，以防止流式传输期间换行漂移和遗留字符（[#1783](https://github.com/badlogic/pi-mono/issues/1783)）。
- 修复 Kitty CSI-u 处理，使其忽略不支持的修饰符，从而令仅修饰符事件不插入可打印字符（[#1807](https://github.com/badlogic/pi-mono/issues/1807)）。
- 修复单行粘贴处理，使其原子性地插入文本，并避免对大型粘贴反复进行 `@` 自动补全扫描（[#1812](https://github.com/badlogic/pi-mono/issues/1812)）。
- 修复使用新 `@mariozechner/pi-ai/oauth` 导出路径加载扩展的问题，方法是在扩展加载器和开发路径映射中为 oauth 子路径创建别名（[#1814](https://github.com/badlogic/pi-mono/issues/1814)）。
- 修复浏览器安全提供商加载回归，方法是在编译后的 Bun 二进制文件中预加载 Bedrock 提供商模块，并针对新的工作区依赖重建二进制文件（[#1814](https://github.com/badlogic/pi-mono/issues/1814)）。
- 修复 GNU screen 终端检测：对于 `screen*` TERM 值，将主题输出降级为 256 色模式（[#1809](https://github.com/badlogic/pi-mono/issues/1809)）。
- 修复分支摘要队列处理，使摘要生成期间输入的消息得到正确处理（[#1803](https://github.com/badlogic/pi-mono/issues/1803)）。
- 修复压缩摘要请求，以避免非推理模型产生推理输出（[#1793](https://github.com/badlogic/pi-mono/issues/1793)）。
- 修复溢出自动压缩级联，使单次溢出不再触发重复的压缩循环。
- 修复 `models.json`，以允许提供商作用域的自定义模型 ID 和模型级 `baseUrl` 覆盖（[#1759](https://github.com/badlogic/pi-mono/issues/1759)、[#1777](https://github.com/badlogic/pi-mono/issues/1777)）。
- 修复会话选择器显示净化，通过从会话显示文本中去除控制字符解决（[#1747](https://github.com/badlogic/pi-mono/issues/1747)）。
- 修复 OpenAI 兼容模型的 Groq Qwen3 推理强度映射（[#1745](https://github.com/badlogic/pi-mono/issues/1745)）。
- 修复 Bedrock `AWS_PROFILE` 区域解析，使其遵循配置文件 `region` 值（[#1800](https://github.com/badlogic/pi-mono/issues/1800)）。
- 修复 `google` 和 `google-vertex` 提供商的 Gemini 3.1 思考级别检测（[#1785](https://github.com/badlogic/pi-mono/issues/1785)）。
- 修复 `@mariozechner/pi-ai` 的浏览器捆绑兼容性，移除默认浏览器导入路径中的仅 Node 副作用（[#1814](https://github.com/badlogic/pi-mono/issues/1814)）。
## [0.55.4] - 2026-03-02

### 新功能

- 运行时工具注册现在会立即应用于活动会话。启动后通过 `pi.registerTool()` 注册的工具无需 `/reload` 即可供 `pi.getAllTools()` 和 LLM 使用（[docs/extensions.md](docs/extensions.md)、[examples/extensions/dynamic-tools.ts](examples/extensions/dynamic-tools.ts)、[#1720](https://github.com/badlogic/pi-mono/issues/1720)）。
- 工具定义可在工具处于活动状态时，通过 `promptSnippet`（`Available tools`）和 `promptGuidelines`（`Guidelines`）自定义默认系统提示（[docs/extensions.md](docs/extensions.md)、[#1720](https://github.com/badlogic/pi-mono/issues/1720)）。
- 自定义工具渲染器可抑制记录输出，同时不会在交互渲染中留下额外间距或空记录痕迹（[docs/extensions.md](docs/extensions.md)、[#1719](https://github.com/badlogic/pi-mono/pull/1719)）。

### 新增

- 在 `ToolDefinition` 中新增可选 `promptSnippet`，用于默认系统提示 `Available tools` 部分中的单行条目。活动扩展工具在注册并激活后会显示于此（[#1237](https://github.com/badlogic/pi-mono/pull/1237) 由 [@semtexzv](https://github.com/semtexzv) 提供）。
- 在 `ToolDefinition` 中新增可选 `promptGuidelines`，以便活动工具向默认系统提示 `Guidelines` 部分追加工具专用项目符号（[#1720](https://github.com/badlogic/pi-mono/issues/1720)）。

### 修复

- 修复会话初始化后 `pi.registerTool()` 的动态注册。现在在 `session_start` 及后续处理器中注册的工具会立即刷新、变为活动状态，并且无需 `/reload` 即对 LLM 可见（[#1720](https://github.com/badlogic/pi-mono/issues/1720)）
- 修复会话消息持久化顺序，通过串行化 `AgentSession` 事件处理，防止扩展处理器异步时 `toolResult` 条目先于对应的助手工具调用消息写入（[#1717](https://github.com/badlogic/pi-mono/issues/1717)）
- 修复自定义工具渲染器有意抑制每次调用的记录输出时的间距伪影，包括交互流式传输中的额外空行，以及空自定义渲染的非零记录痕迹（[#1719](https://github.com/badlogic/pi-mono/pull/1719) 由 [@alasano](https://github.com/alasano) 提供）
- 修复 `session.prompt()` 在重试完成前返回的问题，方法是在 `agent_end` 分发时同步创建重试 promise，从而消除先前排队的事件处理器异步时的竞争条件（[#1726](https://github.com/badlogic/pi-mono/pull/1726) 由 [@pasky](https://github.com/pasky) 提供）

## [0.55.3] - 2026-02-27

### 修复

- 将 Windows 上默认的图像粘贴按键绑定改为 `alt+v`，以避免与终端粘贴行为的 `ctrl+v` 冲突（[#1682](https://github.com/badlogic/pi-mono/pull/1682) 由 [@mrexodia](https://github.com/mrexodia) 提供）。

## [0.55.2] - 2026-02-27

### 新功能

- 扩展可通过 `pi.unregisterProvider(name)` 动态移除自定义提供商，恢复任何被覆盖的内置模型，且无需 `/reload`（[docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/custom-provider.md)）。
- `pi.registerProvider()` 现在在初始扩展加载阶段之外调用时立即生效（例如从命令处理器调用），无需在延迟注册后使用 `/reload`。

### 新增

- `pi.unregisterProvider(name)` 会从注册表中移除动态注册的提供商及其模型，无需 `/reload`。被该提供商覆盖的内置模型会恢复（[#1669](https://github.com/badlogic/pi-mono/pull/1669) 由 [@aliou](https://github.com/aliou) 提供）。

### 修复

- `pi.registerProvider()` 现在在初始扩展加载阶段之后调用时立即生效（例如从命令处理器调用）。此前注册会留在一个待处理队列中，直至下一次 `/reload` 才会刷新（[#1669](https://github.com/badlogic/pi-mono/pull/1669) 由 [@aliou](https://github.com/aliou) 提供）。
- 修复从任意助手消息之前的点派生时出现重复会话标头的问题。现在当派生路径没有助手消息时，`createBranchedSession` 会将文件创建延后到 `_persist()`，与 `newSession()` 契约一致（[#1672](https://github.com/badlogic/pi-mono/pull/1672) 由 [@w-winter](https://github.com/w-winter) 提供）。
- 修复进程挂起期间（例如通过 `ctrl+z`）向 pi 传递 SIGINT 的问题，该问题可能在恢复时破坏终端状态（[#1668](https://github.com/badlogic/pi-mono/pull/1668) 由 [@aliou](https://github.com/aliou) 提供）。
- 修复 Z.ai 思考控制使用错误参数名，导致思考始终启用并浪费 token/延迟的问题（[#1674](https://github.com/badlogic/pi-mono/pull/1674) 由 [@okuyam2y](https://github.com/okuyam2y) 提供）
- 修复 Anthropic 流式传输期间 `redacted_thinking` 块被静默丢弃的问题，以及交错思考 beta 标头和随扩展思考发送 temperature 的相关问题（[#1665](https://github.com/badlogic/pi-mono/pull/1665) 由 [@tctev](https://github.com/tctev) 提供）
- 修复 `(external, cli)` user-agent 标志导致 Anthropic 设置令牌端点出现 401 错误的问题（[#1677](https://github.com/badlogic/pi-mono/pull/1677) 由 [@LazerLance777](https://github.com/LazerLance777) 提供）
- 修复 OpenAI 兼容提供商返回不含 `choices` 数组的块时发生的崩溃（[#1671](https://github.com/badlogic/pi-mono/issues/1671)）

## [0.55.1] - 2026-02-26

### 新功能

- 通过 `--offline`（或 `PI_OFFLINE`）新增离线启动模式，以禁用启动网络操作；并提供启动网络超时，避免受限或离线环境中挂起。
- 为 `google-gemini-cli` 提供商新增 `gemini-3.1-pro-preview` 模型支持（[#1599](https://github.com/badlogic/pi-mono/pull/1599) 由 [@audichuang](https://github.com/audichuang) 提供）。

### 修复

- 修复离线启动挂起问题，在托管工具设置期间添加离线启动行为和网络超时（[#1631](https://github.com/badlogic/pi-mono/pull/1631) 由 [@mcollina](https://github.com/mcollina) 提供）
- 修复 ESM 中的 Windows VT 输入初始化，通过 createRequire 加载 koffi，避免最终用户环境中的运行时和捆绑问题（[#1627](https://github.com/badlogic/pi-mono/pull/1627) 由 [@kaste](https://github.com/kaste) 提供）
- 修复 Git Bash 中 Windows 上托管 `fd`/`rg` 引导，改用 `extract-zip` 处理 `.zip` 归档、更稳健地搜索提取后的布局，并隔离提取临时目录以避免并发下载竞争（[#1348](https://github.com/badlogic/pi-mono/issues/1348)）
- 修复 Windows 上解析 `@sinclair/typebox` 别名时的扩展加载，使如 `@sinclair/typebox/compiler` 的子路径导入能够正确解析。
- 修复 Anthropic 和 Bedrock 提供商中 Claude Sonnet 4.6 的自适应思考，并将不支持的 `xhigh` 强度值限制为受支持级别（[#1548](https://github.com/badlogic/pi-mono/pull/1548) 由 [@tctev](https://github.com/tctev) 提供）
- 修复 Vertex ADC 凭据检测竞争，避免在异步导入初始化期间缓存假阴性结果（[#1550](https://github.com/badlogic/pi-mono/pull/1550) 由 [@jeremiahgaylord-web](https://github.com/jeremiahgaylord-web) 提供）
- 修复子代理扩展示例，使其从配置的代理目录而非硬编码路径解析用户代理（[#1559](https://github.com/badlogic/pi-mono/pull/1559) 由 [@tianshuwang](https://github.com/tianshuwang) 提供）

## [0.55.0] - 2026-02-24

### 破坏性变更

- 扩展、技能、提示、主题和斜杠命令名称冲突的资源优先级现在是项目优先（`cwd/.pi`）而后才是用户全局（`~/.pi/agent`）。如果你依赖同名全局资源覆盖项目资源，请重命名或重新排序资源。
- 扩展注册冲突不再卸载整个后加载扩展。所有扩展都会保持加载，冲突的命令/工具/标志名称按加载顺序中的首次注册来解析。

## [0.54.2] - 2026-02-23

### 修复

- 修复仅读取设置时不必要创建 `.pi` 文件夹的问题。现在仅在写入项目特定设置时创建该文件夹。
- 修复扩展驱动的运行时主题变更持久化到设置，使 `/settings` 在 `ctx.ui.setTheme(...)` 后反映活动的 `currentTheme`（[#1483](https://github.com/badlogic/pi-mono/pull/1483) 由 [@ferologics](https://github.com/ferologics) 提供）
- 修复大型流式 `write` 工具调用期间交互模式冻结的问题，在部分参数流式传输时使用增量语法高亮，并在工具调用参数完成后进行最终完整重新高亮。

## [0.54.1] - 2026-02-22

### 修复

- 从 bun 二进制构建中外部化 koffi，将每个平台的归档大小减少约 15MB（例如 darwin-arm64：43MB -> 28MB）。Koffi 仅 Windows 使用的 `.node` 文件现在仅随 Windows 二进制文件一同发布。

## [0.54.0] - 2026-02-19

### 新增

- 为 `.agents/skills` 位置新增默认技能自动发现。除现有 `.pi` 技能路径外，Pi 现在还会从 `cwd` 和祖先目录（最多到 git 仓库根目录，或不在仓库中时到文件系统根目录）的 `.agents/skills` 发现项目技能，并从 `~/.agents/skills` 发现全局技能。

## [0.53.1] - 2026-02-19

### 变更

- 为当前公开 Gemini 3.1 的所有内置提供商新增 Gemini 3.1 模型目录条目：`google`、`google-vertex`、`opencode`、`openrouter` 和 `vercel-ai-gateway`。
- 在 `google-antigravity` 模型目录中新增 Claude Opus 4.6 Thinking。

## [0.53.0] - 2026-02-17

### 破坏性变更

- 面向 SDK 使用者的 `SettingsManager` 持久化语义已更改。Setter 现在立即更新内存状态并将磁盘写入排队。需要持久化磁盘设置的代码必须调用 `await settingsManager.flush()`。
- `AuthStorage` 构造函数不再公开。请使用静态工厂（`AuthStorage.create(...)`、`AuthStorage.fromStorage(...)`、`AuthStorage.inMemory(...)`）。这会破坏直接使用 `new AuthStorage(...)` 的代码。

### 新增

- 新增 `SettingsManager.drainErrors()`，用于调用方控制设置 I/O 错误处理，且管理器端不输出控制台信息。
- 新增认证存储后端（`FileAuthStorageBackend`、`InMemoryAuthStorageBackend`）和 `AuthStorage.fromStorage(...)`，用于以存储为先的认证持久化连接。
- 为生成的模型定义新增 Anthropic `claude-sonnet-4-6` 模型回退条目。

### 变更

- `SettingsManager` 现在使用作用域存储抽象，对全局和项目设置进行按作用域加锁的读取/合并/写入持久化。

### 修复

- 修复项目设置持久化，通过写入时合并保留无关的外部编辑，同时仍应用已修改键的内存变更。
- 修复认证凭据持久化，通过加锁的读取/合并/写入更新保留对 `auth.json` 的无关外部编辑。
- 修复认证加载/持久化错误上报，将错误缓冲并通过 `AuthStorage.drainErrors()` 公开。

## [0.52.12] - 2026-02-13

### 新增

- 在 `/settings` 和 `settings.json` 中为支持多种传输方式的提供商（目前为通过 OpenAI Codex Responses 的 `openai-codex`）新增 `transport` 设置（`"sse"`、`"websocket"`、`"auto"`）。

### 变更

- 交互模式现在会立即将传输方式变更应用于活动代理会话。
- 设置迁移现在将旧版 `websockets: boolean` 映射至新的 `transport` 设置。

## [0.52.11] - 2026-02-13

### 新增

- 为 `minimax`、`minimax-cn`、`openrouter` 和 `vercel-ai-gateway` 提供商新增 MiniMax M2.5 模型条目，并为 `opencode` 新增 `minimax-m2.5-free`。

## [0.52.10] - 2026-02-12

### 新功能

- 通过 `terminal_input` 拦截扩展终端输入，允许扩展在正常 TUI 处理前消费或转换原始输入。参见 [docs/extensions.md](docs/extensions.md)。
- 扩展 CLI 模型选择：`--model` 现在支持 `provider/id`、模糊匹配和 `:<thinking>` 后缀。参见 [README.md](README.md) 和 [docs/models.md](docs/models.md)。
- 通过更严格的 git 源解析和改进的本地路径规范化，实现更安全的包源处理。参见 [docs/packages.md](docs/packages.md)。
- 面向 OpenAI 和 OpenAI Codex 提供商的新内置模型定义 `gpt-5.3-codex-spark`。
- 改进 OpenAI 流对部分块中格式错误的尾随工具调用 JSON 的健壮性。
- 通过 z.ai 和 OpenRouter 提供商目录新增内置 GLM-5 模型支持。

### 破坏性变更

- `ContextUsage.tokens` 和 `ContextUsage.percent` 现在为 `number | null`。压缩后，上下文 token 数在下一次 LLM 响应之前未知，因此这些字段返回 `null`。读取 `ContextUsage` 的扩展必须处理 `null` 情况。已从 `ContextUsage` 移除 `usageTokens`、`trailingTokens` 和 `lastUsageIndex` 字段（本不应公开的实现细节）（[#1382](https://github.com/badlogic/pi-mono/pull/1382) 由 [@ferologics](https://github.com/ferologics) 提供）
- 不带 `git:` 前缀的 Git 源解析现在是严格的：只有协议 URL 被视为 git（`https://`、`http://`、`ssh://`、`git://`）。`github.com/org/repo` 和 `git@github.com:org/repo` 等简写源现在需要 `git:` 前缀。（[#1426](https://github.com/badlogic/pi-mono/issues/1426)）

### 新增

- 为消息和工具执行生命周期新增扩展事件转发（`message_start`、`message_update`、`message_end`、`tool_execution_start`、`tool_execution_update`、`tool_execution_end`）（[#1375](https://github.com/badlogic/pi-mono/pull/1375) 由 [@sumeet](https://github.com/sumeet) 提供）
- 新增 `terminal_input` 扩展事件，以在正常 TUI 处理之前拦截、消费或转换原始终端输入。
- 为 OpenAI 和 OpenAI Codex 提供商新增 `gpt-5.3-codex-spark` 模型定义（研究预览）。

### 变更

- 将 GitHub Copilot Claude 4.x 模型经由 Anthropic Messages API 路由，并更新 Claude 模型请求的 Copilot 标头处理。

### 修复

- 修复页脚中的上下文用量百分比显示过期的压缩前值。压缩后，页脚现在显示 `?/200k`，直至下一次 LLM 响应提供准确用量（[#1382](https://github.com/badlogic/pi-mono/pull/1382) 由 [@ferologics](https://github.com/ferologics) 提供）
- 修复 `_checkCompaction()` 使用首次压缩条目而非最新条目的问题，该问题可能在多次压缩时导致错误的溢出检测（[#1382](https://github.com/badlogic/pi-mono/pull/1382) 由 [@ferologics](https://github.com/ferologics) 提供）
- `--model` 现在无需 `--provider` 即可工作，支持 `provider/id` 语法、模糊匹配和 `:<thinking>` 后缀（例如 `--model sonnet:high`、`--model openai/gpt-4o`）（[#1350](https://github.com/badlogic/pi-mono/pull/1350) 由 [@mitsuhiko](https://github.com/mitsuhiko) 提供）
- 修复扩展源的本地包路径规范化，同时收紧 git 源解析规则（[#1426](https://github.com/badlogic/pi-mono/issues/1426)）
- 修复会话重置期间未清除扩展终端输入监听器的问题，该问题可能使过期处理器保持活动状态。
- 修复 Termux 中 `fd` 安装的引导包名称（[#1433](https://github.com/badlogic/pi-mono/pull/1433)）
- 修复 `@` 文件自动补全模糊匹配，使其优先处理嵌套路径的路径前缀和段匹配（[#1423](https://github.com/badlogic/pi-mono/issues/1423)）
- 修复 OpenAI 流式工具调用解析，使其容忍部分块中格式错误的尾随 JSON（[#1424](https://github.com/badlogic/pi-mono/issues/1424)）

## [0.52.9] - 2026-02-08

### 新功能

- 扩展可通过 `ctx.reload()` 触发完整的运行时重载，适用于热重载配置或重启代理。参见 [docs/extensions.md](docs/extensions.md) 和 [`reload-runtime` 示例](examples/extensions/reload-runtime.ts)（[#1371](https://github.com/badlogic/pi-mono/issues/1371)）
- 简短的 CLI 禁用别名：`-ne`（`--no-extensions`）、`-ns`（`--no-skills`）和 `-np`（`--no-prompt-templates`），用于更快速的交互使用和脚本编写。
- `/export` HTML 现在包含可折叠的工具输入 schema（参数名称、类型和描述），改善会话审阅和共享工作流（[#1416](https://github.com/badlogic/pi-mono/pull/1416) 由 [@marchellodev](https://github.com/marchellodev) 提供）。
- `pi.getAllTools()` 现在除名称和描述外还公开工具参数，从而支持更丰富的扩展集成（[#1416](https://github.com/badlogic/pi-mono/pull/1416) 由 [@marchellodev](https://github.com/marchellodev) 提供）。

### 新增

- 在扩展 API 中新增 `ctx.reload()`，用于以编程方式重载运行时（[#1371](https://github.com/badlogic/pi-mono/issues/1371)）
- 为禁用标志新增短别名：`--no-extensions` 使用 `-ne`，`--no-skills` 使用 `-ns`，`--no-prompt-templates` 使用 `-np`
- `/export` HTML 现在会在每个工具下方的可折叠部分中包含工具输入 schema（参数名称、类型、描述）（[#1416](https://github.com/badlogic/pi-mono/pull/1416) 由 [@marchellodev](https://github.com/marchellodev) 提供）
- `pi.getAllTools()` 现在除名称和描述外还返回工具参数（[#1416](https://github.com/badlogic/pi-mono/pull/1416) 由 [@marchellodev](https://github.com/marchellodev) 提供）

### 修复

- 修复扩展源解析，使点前缀本地路径（例如 `.pi/extensions/foo.ts`）被视为本地路径而非 git URL
- 修复 Windows 上因没有 `unzip` 而导致 fd/rg 下载失败的问题；现在对 `.tar.gz` 和 `.zip` 提取均使用 `tar`，并提供正确的错误报告（[#1348](https://github.com/badlogic/pi-mono/issues/1348)）
- 修复 RPC 模式文档错误地声明 `ctx.hasUI` 为 `false`；它实际为 `true`，因为对话框和即发即弃 UI 方法可通过 RPC 子协议工作。还记录了缺失的不支持/降级方法（`pasteToEditor`、`getAllThemes`、`getTheme`、`setTheme`）（[#1411](https://github.com/badlogic/pi-mono/pull/1411) 由 [@aliou](https://github.com/aliou) 提供）
- 修复 bash 工具中 `rg` 不可用的问题，在启动时与 `fd` 一同下载它（[#1348](https://github.com/badlogic/pi-mono/issues/1348)）
- 修复 `custom-compaction` 示例以使用 `ModelRegistry`（[#1387](https://github.com/badlogic/pi-mono/issues/1387)）
- Google 提供商现在在工具声明中支持完整 JSON Schema（anyOf、oneOf、const 等）（[#1398](https://github.com/badlogic/pi-mono/issues/1398) 由 [@jarib](https://github.com/jarib) 提供）
- 回退错误的 Antigravity 模型变更：将 `claude-opus-4-6-thinking` 改回 `claude-opus-4-5-thinking`（该模型不存在于 Antigravity 端点）
- 将 Antigravity 系统指令更新为更紧凑的版本，以兼容 Google Gemini CLI
- 修正 Claude Sonnet 4 和 4.5 的 opencode 上下文窗口（[#1383](https://github.com/badlogic/pi-mono/issues/1383)）
- 修复子代理示例中的未知代理错误，使其包含可用代理名称（[#1414](https://github.com/badlogic/pi-mono/pull/1414) 由 [@dnouri](https://github.com/dnouri) 提供）

## [0.52.8] - 2026-02-07

### 新功能

- 编辑器输入中提供 Emacs 风格 kill ring（`ctrl+k`/`ctrl+y`/`alt+y`）和撤销（`ctrl+z`）（[#1373](https://github.com/badlogic/pi-mono/pull/1373) 由 [@Perlence](https://github.com/Perlence) 提供）
- 用于自动模型路由的 OpenRouter `auto` 模型别名（`openrouter:auto`）（[#1361](https://github.com/badlogic/pi-mono/pull/1361) 由 [@yogasanas](https://github.com/yogasanas) 提供）
- 扩展可通过扩展 UI 上下文中的 `pasteToEditor` 以编程方式将内容粘贴到编辑器。参见 [docs/extensions.md](docs/extensions.md)（[#1351](https://github.com/badlogic/pi-mono/pull/1351) 由 [@kaofelix](https://github.com/kaofelix) 提供）
- `pi <package> --help` 和无效子命令现在会显示有用的输出，而非静默失败（[#1347](https://github.com/badlogic/pi-mono/pull/1347) 由 [@ferologics](https://github.com/ferologics) 提供）

### 新增

- 在扩展 UI 上下文中新增 `pasteToEditor`，用于以编程方式粘贴到编辑器（[#1351](https://github.com/badlogic/pi-mono/pull/1351) 由 [@kaofelix](https://github.com/kaofelix) 提供）
- 新增包子命令帮助和针对无效命令的友好错误消息（[#1347](https://github.com/badlogic/pi-mono/pull/1347) 由 [@ferologics](https://github.com/ferologics) 提供）
- 新增用于自动模型路由的 OpenRouter `auto` 模型别名（[#1361](https://github.com/badlogic/pi-mono/pull/1361) 由 [@yogasanas](https://github.com/yogasanas) 提供）
- 为编辑器输入新增 kill ring（ctrl+k/ctrl+y/alt+y）和撤销（ctrl+z）支持（[#1373](https://github.com/badlogic/pi-mono/pull/1373) 由 [@Perlence](https://github.com/Perlence) 提供）

### 变更

- 将默认模型从 Claude Opus 4.5 替换为 Opus 4.6（[#1345](https://github.com/badlogic/pi-mono/pull/1345) 由 [@calvin-hpnet](https://github.com/calvin-hpnet) 提供）

### 修复

- 修复临时 git 包缓存（`-e <git-url>`），使未固定版本源在缓存命中时刷新，包括分离 HEAD/无上游检出
- 修复扩展自定义编辑器时中止重试的问题（[#1364](https://github.com/badlogic/pi-mono/pull/1364) 由 [@Perlence](https://github.com/Perlence) 提供）
- 修复自动补全未传播到扩展创建的自定义编辑器的问题（[#1372](https://github.com/badlogic/pi-mono/pull/1372) 由 [@Perlence](https://github.com/Perlence) 提供）
- 修复扩展关闭，改用干净的 TUI 关闭路径，防止产生孤立进程

## [0.52.7] - 2026-02-06

### 新功能

- 通过 `modelOverrides` 在 `models.json` 中提供逐模型覆盖，允许自定义内置提供商模型而无需替换提供商模型列表。参见 [docs/models.md#per-model-overrides](docs/models.md#per-model-overrides)。
- `models.json` 提供商 `models` 现在按 `id` 与内置模型合并，因此无需完整替换提供商即可添加自定义模型或替换匹配的内置模型。参见 [docs/models.md#overriding-built-in-providers](docs/models.md#overriding-built-in-providers)。
- 通过 `AWS_BEDROCK_SKIP_AUTH` 和 `AWS_BEDROCK_FORCE_HTTP1` 支持未认证端点的 Bedrock 代理。参见 [docs/providers.md](docs/providers.md)。

### 破坏性变更

- 将 `models.json` 提供商 `models` 行为从完整替换改为按 ID 与内置模型合并。内置模型现在默认保留，自定义模型按 `id` 进行 upsert。

### 新增

- 在 `models.json` 中新增 `modelOverrides`，以便为每个提供商自定义单个内置模型而无需完整替换提供商（[#1332](https://github.com/badlogic/pi-mono/pull/1332) 由 [@charles-cooper](https://github.com/charles-cooper) 提供）
- 新增 `AWS_BEDROCK_SKIP_AUTH` 和 `AWS_BEDROCK_FORCE_HTTP1` 环境变量，用于连接未认证 Bedrock 代理（[#1320](https://github.com/badlogic/pi-mono/pull/1320) 由 [@virtuald](https://github.com/virtuald) 提供）

### 修复

- 修复仅含思考的助手内容与后续工具执行块之间的额外间距，当助手消息不含文本时
- 修复阈值自动压缩后排队的引导/后续/自定义消息仍卡住的问题：当 Agent 级队列仍包含待处理消息时恢复代理循环（[#1312](https://github.com/badlogic/pi-mono/pull/1312) 由 [@ferologics](https://github.com/ferologics) 提供）
- 修复 `tool_result` 扩展处理器，使结果补丁在处理器之间链式传递，而非最后一个处理器获胜（[#1280](https://github.com/badlogic/pi-mono/issues/1280)）
- 修复受到损害的认证锁文件，改为优雅处理而非使认证存储初始化崩溃（[#1322](https://github.com/badlogic/pi-mono/issues/1322)）
- 修复针对 Claude Opus 4.6 且带有交错思考 beta 响应的 Bedrock 自适应思考处理（[#1323](https://github.com/badlogic/pi-mono/pull/1323) 由 [@markusylisiurunen](https://github.com/markusylisiurunen) 提供）
- 修复 OpenAI Responses API 请求，默认使用 `store: false` 以避免服务器端历史记录（[#1308](https://github.com/badlogic/pi-mono/issues/1308)）
- 修复交互模式启动，在资源加载后初始化自动补全（[#1328](https://github.com/badlogic/pi-mono/issues/1328)）
- 修复 `modelOverrides` 对嵌套对象的合并行为，并记录使用详情（[#1062](https://github.com/badlogic/pi-mono/issues/1062)）

## [0.52.6] - 2026-02-05

### 破坏性变更

- 移除 `/exit` 命令处理。请使用 `/quit` 退出（[#1303](https://github.com/badlogic/pi-mono/issues/1303)）

### 修复

- 修复 `/quit` 被技能的模糊斜杠命令自动补全匹配遮蔽的问题，方法是将 `/quit` 添加到内置命令自动补全中（[#1303](https://github.com/badlogic/pi-mono/issues/1303)）
- 修复本地包源解析和设置规范化回归，该问题将相对路径错误归类为 git URL，并阻止全局安装的本地包在重启后加载（[#1304](https://github.com/badlogic/pi-mono/issues/1304)）

## [0.52.5] - 2026-02-05

### 修复

- 修复思考级别能力检测，使 Anthropic Opus 4.6 模型在选择器和循环中公开 `xhigh`

## [0.52.4] - 2026-02-05

### 修复

- 修复直接指定目录时扩展设置未遵循 `package.json` `pi.extensions` 清单的问题（[#1302](https://github.com/badlogic/pi-mono/pull/1302) 由 [@hjanuschka](https://github.com/hjanuschka) 提供）

## [0.52.3] - 2026-02-05

### 修复

- 修复未知主机的 git 包解析回退，使 `git:github.tools.sap/org/repo` 等企业 git 源被视为 git 包而非本地路径
- 修复简写、HTTPS 和 SSH 源格式的 git 包 `@ref` 解析，包括带斜杠的分支引用
- 将 Bedrock 默认模型 ID 从 `us.anthropic.claude-opus-4-6-v1:0` 修复为 `us.anthropic.claude-opus-4-6-v1`
- 修复 Bedrock Opus 4.6 模型元数据（ID、缓存定价）并新增缺失的 EU 配置文件
- 将 Anthropic 和 OpenCode 提供商的 Claude Opus 4.6 上下文窗口元数据修复为 200000

## [0.52.2] - 2026-02-05

### 变更

- 将 `anthropic` 提供商的默认模型更新为 `claude-opus-4-6`
- 将 `openai-codex` 提供商的默认模型更新为 `gpt-5.3-codex`
- 将 `amazon-bedrock` 提供商的默认模型更新为 `us.anthropic.claude-opus-4-6-v1:0`
- 将 `vercel-ai-gateway` 提供商的默认模型更新为 `anthropic/claude-opus-4-6`
- 将 `opencode` 提供商的默认模型更新为 `claude-opus-4-6`

## [0.52.1] - 2026-02-05

## [0.52.0] - 2026-02-05

### 新功能

- Claude Opus 4.6 模型支持。
- GPT-5.3 Codex 模型支持（仅 OpenAI Codex 提供商）。
- git 包支持 SSH URL。参见 [docs/packages.md](docs/packages.md)。
- `auth.json` API 密钥现在支持 shell 命令解析（`!command`）和环境变量查找。参见 [docs/providers.md](docs/providers.md)。
- 模型选择器现在显示所选模型名称。

### 新增

- `auth.json` 中的 API 密钥现在支持 shell 命令解析（`!command`）和环境变量查找，与 `models.json` 中的行为一致
- 新增 `minimal-mode.ts` 示例扩展，演示如何覆盖内置工具渲染以实现极简显示模式
- 在模型目录中新增 Claude Opus 4.6 模型
- 在模型目录中新增 GPT-5.3 Codex 模型（仅 OpenAI Codex 提供商）
- 新增 git 包的 SSH URL 支持（[#1287](https://github.com/badlogic/pi-mono/pull/1287) 由 [@markusn](https://github.com/markusn) 提供）
- 模型选择器现在显示所选模型名称（[#1275](https://github.com/badlogic/pi-mono/pull/1275) 由 [@haoqixu](https://github.com/haoqixu) 提供）

### 修复

- 修复 HTML 导出中 ANSI 渲染的工具输出丢失缩进的问题（例如自定义工具结果中的 JSON 代码块）（[#1269](https://github.com/badlogic/pi-mono/pull/1269) 由 [@aliou](https://github.com/aliou) 提供）
- 修复流式传输期间以同时包含 `images` 和 `streamingBehavior` 的方式调用 `prompt()` 时图像被静默丢弃的问题。`steer()`、`followUp()` 和对应的 RPC 命令现在接受可选图像。（[#1271](https://github.com/badlogic/pi-mono/pull/1271) 由 [@aliou](https://github.com/aliou) 提供）
- CLI `--help`、`--version`、`--list-models` 和 `--export` 现在即使扩展保持事件循环活动也会退出（[#1285](https://github.com/badlogic/pi-mono/pull/1285) 由 [@ferologics](https://github.com/ferologics) 提供）
- 修复模型发送格式错误的工具参数（对象而非字符串）时发生的崩溃（[#1259](https://github.com/badlogic/pi-mono/issues/1259)）
- 修复未遵循自定义消息展开状态的问题（[#1258](https://github.com/badlogic/pi-mono/pull/1258) 由 [@Gurpartap](https://github.com/Gurpartap) 提供）
- 修复扫描目录时技能加载器未遵循 .gitignore、.ignore 和 .fdignore 的问题

## [0.51.6] - 2026-02-04

### 新功能

- 用于打开会话恢复选择器的可配置 `resume` 键绑定操作。参见 [docs/keybindings.md](docs/keybindings.md)。([#1249](https://github.com/badlogic/pi-mono/pull/1249) 作者 [@juanibiapina](https://github.com/juanibiapina))

### 新增

- 新增可配置键绑定操作 `resume`，允许用户将一个按键绑定为打开会话恢复选择器（类似 `newSession`、`tree` 和 `fork`）([#1249](https://github.com/badlogic/pi-mono/pull/1249) 作者 [@juanibiapina](https://github.com/juanibiapina))

### 变更

- 即使其他行已有内容，斜杠命令菜单现在也会在第一行触发，从而允许将命令添加到现有文本之前 ([#1227](https://github.com/badlogic/pi-mono/pull/1227) 作者 [@aliou](https://github.com/aliou))

### 修复

- 加载技能时忽略未知的 skill frontmatter 字段
- 修复 `/reload` 未获取全局 settings.json 中的更改 ([#1241](https://github.com/badlogic/pi-mono/issues/1241))
- 修复分叉会话在分叉后未持久化用户消息的问题
- 修复分叉会话写入新会话文件而非父会话 ([#1242](https://github.com/badlogic/pi-mono/issues/1242))
- 修复本地包移除功能在比较前未规范化路径的问题 ([#1243](https://github.com/badlogic/pi-mono/issues/1243))
- 修复 OpenAI Codex Responses provider 未遵守配置的 baseUrl 的问题 ([#1244](https://github.com/badlogic/pi-mono/issues/1244))
- 通过在设置列表中处理较小宽度，修复 `/settings` 在窄终端中崩溃的问题 ([#1246](https://github.com/badlogic/pi-mono/pull/1246) 作者 [@haoqixu](https://github.com/haoqixu))
- 修复 Unix bash 检测：当 `/bin/bash` 不可用时回退到 PATH 查找，包括 Termux 设置 ([#1230](https://github.com/badlogic/pi-mono/pull/1230) 作者 [@VaclavSynacek](https://github.com/VaclavSynacek))

## [0.51.5] - 2026-02-04

### 变更

- 更改 Bedrock 模型生成，移除现在已由上游处理的旧版变通方案 ([#1239](https://github.com/badlogic/pi-mono/pull/1239) 作者 [@unexge](https://github.com/unexge))

### 修复

- 通过使用 shell 执行而非 `.cmd` 解析，修复 Windows 包安装回归 ([#1220](https://github.com/badlogic/pi-mono/issues/1220))

## [0.51.4] - 2026-02-03

### 新功能

- 分享 URL 现默认使用 pi.dev，由 exe.dev 慷慨捐赠。

### 变更

- 分享 URL 现默认使用 pi.dev，同时 pi.dev 和 buildwithpi.ai 仍可继续使用。

### 修复

- 修复输入滚动时避免拆分 emoji 序列 ([#1228](https://github.com/badlogic/pi-mono/pull/1228) 作者 [@haoqixu](https://github.com/haoqixu))

## [0.51.3] - 2026-02-03

### 新功能

- 通过 `ExtensionAPI.getCommands()` 发现扩展命令，并提供 `commands.ts` 示例说明调用模式。参见 [docs/extensions.md#pigetcommands](docs/extensions.md#pigetcommands) 和 [examples/extensions/commands.ts](examples/extensions/commands.ts)。
- `pi install` 和 `pi remove` 支持本地路径，相对路径相对于设置文件解析。参见 [docs/packages.md#local-paths](docs/packages.md#local-paths)。

### 破坏性变更

- RPC `get_commands` 响应和 `SlashCommandSource` 类型：为与其余代码库保持一致，将 `"template"` 重命名为 `"prompt"`

### 新增

- 新增 `ExtensionAPI.getCommands()`，让扩展可列出可通过 `prompt` 调用的斜杠命令（扩展、提示词模板、技能）([#1210](https://github.com/badlogic/pi-mono/pull/1210) 作者 [@w-winter](https://github.com/w-winter))
- 新增 `commands.ts` 示例扩展并导出 `SlashCommandInfo` 类型，用于命令发现集成 ([#1210](https://github.com/badlogic/pi-mono/pull/1210) 作者 [@w-winter](https://github.com/w-winter))
- 新增对 `pi install` 和 `pi remove` 的本地路径支持，相对路径相对于目标设置文件存储 ([#1216](https://github.com/badlogic/pi-mono/issues/1216))

### 修复

- 修复默认思考级别的持久化，确保从设置派生的默认值被正确保存和恢复
- 通过在 `npm` 不可直接执行时解析 `npm.cmd`，修复 Windows 包安装 ([#1220](https://github.com/badlogic/pi-mono/issues/1220))
- 修复 xhigh 思考级别支持检查，使其接受 gpt-5.2 模型 ID ([#1209](https://github.com/badlogic/pi-mono/issues/1209))

## [0.51.2] - 2026-02-03

### 新功能

- 通过 ExtensionUIContext getToolsExpanded 和 setToolsExpanded 控制扩展工具输出展开。参见 [docs/extensions.md](docs/extensions.md) 和 [docs/rpc.md](docs/rpc.md)。

### 新增

- 新增 ExtensionUIContext getToolsExpanded 和 setToolsExpanded，用于控制工具输出展开 ([#1199](https://github.com/badlogic/pi-mono/pull/1199) 作者 [@academo](https://github.com/academo))
- 新增安装方式检测，以显示特定包管理器的更新说明 ([#1203](https://github.com/badlogic/pi-mono/pull/1203) 作者 [@Itsnotaka](https://github.com/Itsnotaka))

### 修复

- 修复 Kitty 按键释放事件通过慢速 SSH 连接泄漏到父 shell 的问题：退出时最多排空 stdin 1 秒 ([#1204](https://github.com/badlogic/pi-mono/issues/1204))
- 修复编辑器中的旧版换行处理，以保持先前的换行行为
- 修复 `@` 自动补全未包含隐藏路径的问题
- 修复提交回退未遵守配置键绑定的问题
- 通过跳过扩展命令，修复其与内置命令冲突的问题 ([#1196](https://github.com/badlogic/pi-mono/pull/1196) 作者 [@haoqixu](https://github.com/haoqixu))
- 通过去除前缀，修复以 `@` 为前缀的工具路径无法解析的问题 ([#1206](https://github.com/badlogic/pi-mono/issues/1206))
- 修复安装方式检测使用过期缓存结果的问题

## [0.51.1] - 2026-02-02

### 新功能

- **Extension API switchSession**：扩展现在可通过 `ctx.switchSession(sessionPath)` 以编程方式切换会话。参见 [docs/extensions.md](docs/extensions.md)。([#1187](https://github.com/badlogic/pi-mono/issues/1187))
- **缩小时清除设置**：新增 `terminal.clearOnShrink` 设置，当内容缩小时，使编辑器和页脚固定在终端底部。由于重绘可能会导致一些闪烁。默认禁用。通过 `/settings` 或 `PI_CLEAR_ON_SHRINK=1` 环境变量启用。

### 修复

- 修复作用域模型在登出后未找到有效凭据的问题 ([#1194](https://github.com/badlogic/pi-mono/pull/1194) 作者 [@terrorobe](https://github.com/terrorobe))
- 修复 Ctrl+D 退出因 stdin 缓冲区竞争条件关闭父 SSH 会话的问题 ([#1185](https://github.com/badlogic/pi-mono/issues/1185))
- 修复编辑器输入中的 emoji 光标定位 ([#1183](https://github.com/badlogic/pi-mono/pull/1183) 作者 [@haoqixu](https://github.com/haoqixu))

## [0.51.0] - 2026-02-01

### 破坏性变更

- **扩展工具签名变更**：`ToolDefinition.execute` 现使用 `(toolCallId, params, signal, onUpdate, ctx)` 参数顺序，以匹配 `AgentTool.execute`。此前为 `(toolCallId, params, onUpdate, ctx, signal)`。由于前四个参数现已对齐，这使包装内置工具变得非常简单。通过交换 `signal` 和 `onUpdate` 参数来更新扩展：
  ```ts
  // Before
  async execute(toolCallId, params, onUpdate, ctx, signal) { ... }

  // After
  async execute(toolCallId, params, signal, onUpdate, ctx) { ... }
  ```

### 新功能

- **Android/Termux 支持**：Pi 现在可通过 Termux 在 Android 上运行。安装方式：
  ```bash
  pkg install nodejs termux-api git
  npm install -g @mariozechner/pi-coding-agent
  mkdir -p ~/.pi/agent
  echo "You are running on Android in Termux." > ~/.pi/agent/AGENTS.md
  ```
  当 `termux-api` 不可用时，剪贴板操作会优雅地回退。([#1164](https://github.com/badlogic/pi-mono/issues/1164))
- **Bash spawn hook**：扩展现在可在执行前通过 `pi.setBashSpawnHook()` 拦截和修改 bash 命令。可调整命令字符串、工作目录或环境变量。参见 [docs/extensions.md](docs/extensions.md)。([#1160](https://github.com/badlogic/pi-mono/pull/1160) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- **Linux ARM64 musl 支持**：通过更新剪贴板依赖，Pi 现在可在 Alpine Linux ARM64 (linux-arm64-musl) 上运行。
- **Nix/Guix 支持**：对于存储路径难以正确分词的内容寻址包管理器，`PI_PACKAGE_DIR` 环境变量可覆盖包路径。参见 [README.md#environment-variables](README.md#environment-variables)。([#1153](https://github.com/badlogic/pi-mono/pull/1153) 作者 [@odysseus0](https://github.com/odysseus0))
- **命名会话筛选**：`/resume` 选择器现在支持通过 Ctrl+N 筛选仅显示已命名的会话。可通过 `toggleSessionNamedFilter` 键绑定配置。参见 [docs/keybindings.md](docs/keybindings.md)。([#1128](https://github.com/badlogic/pi-mono/pull/1128) 作者 [@w-winter](https://github.com/w-winter))
- **类型化工具调用事件**：扩展开发者可使用 `isToolCallEventType()` 缩小 `ToolCallEvent` 类型，以获得更好的 TypeScript 支持。参见 [docs/extensions.md#tool-call-events](docs/extensions.md#tool-call-events)。([#1147](https://github.com/badlogic/pi-mono/pull/1147) 作者 [@giuseppeg](https://github.com/giuseppeg))
- **扩展 UI 协议**：提供扩展对话框和通知的完整 RPC 文档和示例，使无头客户端能够支持交互式扩展。参见 [docs/rpc.md#extension-ui-protocol](docs/rpc.md#extension-ui-protocol)。([#1144](https://github.com/badlogic/pi-mono/pull/1144) 作者 [@aliou](https://github.com/aliou))

### 新增

- 通过剪贴板依赖更新新增 Linux ARM64 musl (Alpine Linux) 支持
- 新增 Android/Termux 支持，并提供优雅的剪贴板回退 ([#1164](https://github.com/badlogic/pi-mono/issues/1164))
- 新增 bash 工具 spawn hook 支持，以便在执行前调整命令、cwd 和 env ([#1160](https://github.com/badlogic/pi-mono/pull/1160) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- 按工具为 `ToolCallEvent.input` 新增类型，并通过 `isToolCallEventType()` 类型守卫缩小内置工具事件 ([#1147](https://github.com/badlogic/pi-mono/pull/1147) 作者 [@giuseppeg](https://github.com/giuseppeg))
- 从包中导出 `discoverAndLoadExtensions`，无需本地克隆仓库即可进行扩展测试 ([#1148](https://github.com/badlogic/pi-mono/issues/1148))
- 在 RPC 文档中新增扩展 UI 协议文档，涵盖扩展对话框和通知的所有请求/响应类型 ([#1144](https://github.com/badlogic/pi-mono/pull/1144) 作者 [@aliou](https://github.com/aliou))
- 新增 `rpc-demo.ts` 示例扩展，演示所有 RPC 支持的扩展 UI 方法 ([#1144](https://github.com/badlogic/pi-mono/pull/1144) 作者 [@aliou](https://github.com/aliou))
- 新增 `rpc-extension-ui.ts` TUI 示例客户端，演示带交互式对话框的扩展 UI 协议 ([#1144](https://github.com/badlogic/pi-mono/pull/1144) 作者 [@aliou](https://github.com/aliou))
- 新增 `PI_PACKAGE_DIR` 环境变量，为存储路径难以正确分词的内容寻址包管理器（Nix、Guix）覆盖包路径 ([#1153](https://github.com/badlogic/pi-mono/pull/1153) 作者 [@odysseus0](https://github.com/odysseus0))
- `/resume` 会话选择器现在支持仅命名会话筛选切换（默认 Ctrl+N，可通过 `toggleSessionNamedFilter` 配置），以仅显示已命名会话 ([#1128](https://github.com/badlogic/pi-mono/pull/1128) 作者 [@w-winter](https://github.com/w-winter))

### 修复

- 修复 `pi update` 在无参数调用时未更新 npm/git 包的问题 ([#1151](https://github.com/badlogic/pi-mono/issues/1151))
- 修复 `models.json` 验证要求文档标为可选的字段。模型定义现在仅需要 `id`；其他所有字段（`name`、`reasoning`、`input`、`cost`、`contextWindow`、`maxTokens`）均有合理默认值。([#1146](https://github.com/badlogic/pi-mono/issues/1146))
- 通过在技能前言中添加明确指导，修复模型从 cwd 而非技能目录解析技能文件中的相对路径的问题 ([#1136](https://github.com/badlogic/pi-mono/issues/1136))
- 修复树选择器在导航条目时丢失焦点状态的问题 ([#1142](https://github.com/badlogic/pi-mono/pull/1142) 作者 [@Perlence](https://github.com/Perlence))
- 修复 `cacheRetention` 选项未在 `buildBaseOptions` 中传递的问题 ([#1154](https://github.com/badlogic/pi-mono/issues/1154))
- 修复 OAuth 登录/刷新未使用 HTTP 代理设置（`HTTP_PROXY`、`HTTPS_PROXY` 环境变量）的问题 ([#1132](https://github.com/badlogic/pi-mono/issues/1132))
- 修复 `pi update <source>` 在源仅全局注册时本地安装包的问题 ([#1163](https://github.com/badlogic/pi-mono/pull/1163) 作者 [@aliou](https://github.com/aliou))
- 修复带摘要的树导航覆盖摘要等待期间输入的编辑器内容的问题 ([#1169](https://github.com/badlogic/pi-mono/pull/1169) 作者 [@aliou](https://github.com/aliou))

## [0.50.9] - 2026-02-01

### 新增

- 新增 `titlebar-spinner.ts` 示例扩展，在代理工作期间于终端标题中显示盲文 spinner 动画。
- 新增 `PI_AI_ANTIGRAVITY_VERSION` 环境变量的帮助文本说明 ([#1129](https://github.com/badlogic/pi-mono/issues/1129))
- 新增 `cacheRetention` 流选项，并为提示词缓存控件提供特定 provider 映射，默认采用短期保留 ([#1134](https://github.com/badlogic/pi-mono/issues/1134))

## [0.50.8] - 2026-02-01

### 新增

- 为 `/new`、`/tree` 和 `/fork` 命令新增 `newSession`、`tree` 和 `fork` 键绑定操作。默认均未绑定。([#1114](https://github.com/badlogic/pi-mono/pull/1114) 作者 [@juanibiapina](https://github.com/juanibiapina))
- 新增 `retry.maxDelayMs` 设置以限制服务器请求的最大重试延迟。当 provider 请求更长的延迟（例如 Google 的 “quota will reset after 5h”）时，请求会立即失败并显示信息性错误，而非静默等待。默认值：60000ms（60 秒）。([#1123](https://github.com/badlogic/pi-mono/issues/1123))
- `/resume` 会话选择器：新增“线程化”排序模式（现为默认），根据分叉关系以树结构显示会话。在右侧以紧凑单行格式显示消息数和时间。([#1124](https://github.com/badlogic/pi-mono/pull/1124) 作者 [@pasky](https://github.com/pasky))
- 新增 Qwen CLI OAuth provider 扩展示例。([#940](https://github.com/badlogic/pi-mono/pull/940) 作者 [@4h9fbZ](https://github.com/4h9fbZ))
- 新增在注册时为扩展注册的 provider 提供 OAuth `modifyModels` hook 支持。([#940](https://github.com/badlogic/pi-mono/pull/940) 作者 [@4h9fbZ](https://github.com/4h9fbZ))
- 通过 `enable_thinking` 为 OpenAI 兼容 completions 新增 Qwen 思考格式支持。([#940](https://github.com/badlogic/pi-mono/pull/940) 作者 [@4h9fbZ](https://github.com/4h9fbZ))
- 新增垂直光标导航的粘滞列跟踪，使编辑器跨越短行移动时恢复首选列。([#1120](https://github.com/badlogic/pi-mono/pull/1120) 作者 [@Perlence](https://github.com/Perlence))
- 新增 `resources_discover` 扩展 hook，以在启动和重新加载时提供额外的技能、提示词和主题。

### 修复

- 修复 `switchSession()` 在恢复时向会话日志附加无意义 `thinking_level_change` 条目的问题。`setThinkingLevel()` 现为幂等操作。([#1118](https://github.com/badlogic/pi-mono/issues/1118))
- 修复 WSL2/WSLg 上剪贴板图像粘贴在剪贴板提供 `image/bmp` 格式时写入无效 PNG 文件的问题。BMP 图像现在会先转换为 PNG 再保存。([#1112](https://github.com/badlogic/pi-mono/pull/1112) 作者 [@lightningRalf](https://github.com/lightningRalf))
- 修复 Kitty 键盘协议基础布局回退，避免非 QWERTY 布局触发错误快捷键 ([#1096](https://github.com/badlogic/pi-mono/pull/1096) 作者 [@rytswd](https://github.com/rytswd))

## [0.50.7] - 2026-01-31

### 修复

- 包中的多文件扩展现在可正确工作。包解析现在使用与本地扩展相同的发现逻辑：仅从子目录加载 `index.ts`（或 manifest 声明的条目），不会加载辅助模块。([#1102](https://github.com/badlogic/pi-mono/issues/1102))

## [0.50.6] - 2026-01-30

### 新增

- 为扩展上下文新增 `ctx.getSystemPrompt()`，用于访问当前有效的系统提示词 ([#1098](https://github.com/badlogic/pi-mono/pull/1098) 作者 [@kaofelix](https://github.com/kaofelix))

### 修复

- 修复内容缩小时页脚下方出现空行的问题（例如关闭 `/tree`、清除多行编辑器）([#1095](https://github.com/badlogic/pi-mono/pull/1095) 作者 [@marckrenn](https://github.com/marckrenn))
- 修复在有待处理渲染时通过 `stop()` 退出 TUI 后终端光标仍隐藏的问题 ([#1099](https://github.com/badlogic/pi-mono/pull/1099) 作者 [@haoqixu](https://github.com/haoqixu))

## [0.50.5] - 2026-01-30

## [0.50.4] - 2026-01-30

### 新功能

- **适用于 SSH/mosh 的 OSC 52 剪贴板支持** - `/copy` 命令现在可通过 OSC 52 终端转义序列在远程连接中工作。通过 SSH 使用 pi 时不再有剪贴板困扰。([#1069](https://github.com/badlogic/pi-mono/issues/1069) 作者 [@gturkoglu](https://github.com/gturkoglu))
- **Vercel AI Gateway 路由** - 通过 Vercel 的 AI Gateway 路由请求，并使用 provider 故障转移和负载均衡。在 models.json 中通过 `vercelGatewayRouting` 配置。([#1051](https://github.com/badlogic/pi-mono/pull/1051) 作者 [@ben-vargas](https://github.com/ben-vargas))
- **字符跳转导航** - Bash/Readline 风格的字符搜索：Ctrl+] 向前跳至某字符的下一个出现位置，Ctrl+Alt+] 向后跳转。([#1074](https://github.com/badlogic/pi-mono/pull/1074) 作者 [@Perlence](https://github.com/Perlence))
- **Emacs 风格 Ctrl+B/Ctrl+F 导航** - 编辑器中用于单词导航（光标按词左/右移动）的替代键绑定。([#1053](https://github.com/badlogic/pi-mono/pull/1053) 作者 [@ninlds](https://github.com/ninlds))
- **行边界导航** - 在第一个视觉行按 Up 时，编辑器跳至行首；在最后一个视觉行按 Down 时，跳至行尾。([#1050](https://github.com/badlogic/pi-mono/pull/1050) 作者 [@4h9fbZ](https://github.com/4h9fbZ))
- **性能改进** - 优化 TUI 中的图像行检测和框渲染缓存，以提高渲染性能。([#1084](https://github.com/badlogic/pi-mono/pull/1084) 作者 [@can1357](https://github.com/can1357))
- **`set_session_name` RPC 命令** - 无头客户端现在可以通过编程方式设置会话显示名称。([#1075](https://github.com/badlogic/pi-mono/pull/1075) 作者 [@dnouri](https://github.com/dnouri))
- **禁用双 Escape 行为** - `doubleEscapeAction` 设置新增 `"none"` 选项，可完全禁用双 Escape 快捷键。([#973](https://github.com/badlogic/pi-mono/issues/973) 作者 [@juanibiapina](https://github.com/juanibiapina))

### 新增

- 为 `doubleEscapeAction` 设置新增 "none" 选项，以完全禁用双 Escape 行为 ([#973](https://github.com/badlogic/pi-mono/issues/973) 作者 [@juanibiapina](https://github.com/juanibiapina))
- 为 SSH/mosh 会话新增 OSC 52 剪贴板支持。`/copy` 现在可在远程连接中工作。([#1069](https://github.com/badlogic/pi-mono/issues/1069) 作者 [@gturkoglu](https://github.com/gturkoglu))
- 在 models.json 中通过 `vercelGatewayRouting` 新增 Vercel AI Gateway 路由支持 ([#1051](https://github.com/badlogic/pi-mono/pull/1051) 作者 [@ben-vargas](https://github.com/ben-vargas))
- 在编辑器中新增用于光标按词左/右导航的 Ctrl+B 和 Ctrl+F 键绑定 ([#1053](https://github.com/badlogic/pi-mono/pull/1053) 作者 [@ninlds](https://github.com/ninlds))
- 新增字符跳转导航：Ctrl+] 向前跳至下一个字符，Ctrl+Alt+] 向后跳转 ([#1074](https://github.com/badlogic/pi-mono/pull/1074) 作者 [@Perlence](https://github.com/Perlence))
- 在第一个视觉行按 Up 时编辑器现跳至行首，在最后一个视觉行按 Down 时跳至行尾 ([#1050](https://github.com/badlogic/pi-mono/pull/1050) 作者 [@4h9fbZ](https://github.com/4h9fbZ))
- 优化图像行检测和框渲染缓存，以提高 TUI 性能 ([#1084](https://github.com/badlogic/pi-mono/pull/1084) 作者 [@can1357](https://github.com/can1357))
- 新增 `set_session_name` RPC 命令，供无头客户端设置会话显示名称 ([#1075](https://github.com/badlogic/pi-mono/pull/1075) 作者 [@dnouri](https://github.com/dnouri))

### 修复

- Read 工具现在处理带弯引号 (U+2019) 和 NFD Unicode 规范化的 macOS 文件名 ([#1078](https://github.com/badlogic/pi-mono/issues/1078))
- 扫描包资源的技能、提示词、主题和扩展时遵守 .gitignore、.ignore 和 .fdignore 文件 ([#1072](https://github.com/badlogic/pi-mono/issues/1072))
- 修复 provider 省略输入时工具调用参数默认值的问题 ([#1065](https://github.com/badlogic/pi-mono/issues/1065))
- settings.json 中的无效 JSON 不再导致文件被空设置覆盖 ([#1054](https://github.com/badlogic/pi-mono/issues/1054))
- 配置选择器现在为显示名称重复的扩展显示文件夹名称 ([#1064](https://github.com/badlogic/pi-mono/pull/1064) 作者 [@Graffioh](https://github.com/Graffioh))

## [0.50.3] - 2026-01-29

### 新功能

- **Kimi For Coding provider**：访问 Moonshot AI 的 Anthropic 兼容编码 API。设置 `KIMI_API_KEY` 环境变量。参见 [README.md#kimi-for-coding](README.md#kimi-for-coding)。

### 新增

- 新增 Kimi For Coding provider 支持（Moonshot AI 的 Anthropic 兼容编码 API）。设置 `KIMI_API_KEY` 环境变量。参见 [README.md#kimi-for-coding](README.md#kimi-for-coding)。

### 修复

- 恢复会话时资源现在出现在消息之前，防止已加载的上下文显示在聊天底部。

## [0.50.2] - 2026-01-29

### 新功能

- **Hugging Face provider**：通过 OpenAI 兼容的 Inference Router 访问 Hugging Face 模型。设置 `HF_TOKEN` 环境变量。参见 [README.md#hugging-face](README.md#hugging-face)。
- **扩展提示词缓存**：`PI_CACHE_RETENTION=long` 为 Anthropic 启用 1 小时缓存（相比默认 5 分钟），为 OpenAI 启用 24 小时缓存（相比默认内存缓存）。仅适用于直接 API 调用。参见 [README.md#prompt-caching](README.md#prompt-caching)。
- **可配置自动补全高度**：`autocompleteMaxVisible` 设置（3-20 项，默认 5）控制下拉菜单大小。通过 `/settings` 或 `settings.json` 调整。
- **Shell 风格键绑定**：`alt+b`/`alt+f` 用于单词导航，`ctrl+d` 用于向前删除字符。参见 [docs/keybindings.md](docs/keybindings.md)。
- **RPC `get_commands`**：无头客户端现在可通过编程方式列出可用命令。参见 [docs/rpc.md](docs/rpc.md)。

### 新增

- 通过 OpenAI 兼容的 Inference Router 新增 Hugging Face provider 支持 ([#994](https://github.com/badlogic/pi-mono/issues/994))
- 新增 `PI_CACHE_RETENTION` 环境变量，用于控制 Anthropic（5m 与 1h）和 OpenAI（内存与 24h）的缓存 TTL。设为 `long` 可延长保留时间。([#967](https://github.com/badlogic/pi-mono/issues/967))
- 新增 `autocompleteMaxVisible` 设置，用于配置自动补全下拉高度（3-20 项，默认 5）([#972](https://github.com/badlogic/pi-mono/pull/972) 作者 [@masonc15](https://github.com/masonc15))
- 新增 `/files` 命令，列出当前会话中的所有文件操作（读取、写入、编辑）
- 新增 shell 风格键绑定：`alt+b`/`alt+f` 用于单词导航，`ctrl+d` 用于向前删除字符（当编辑器有文本时）([#1043](https://github.com/badlogic/pi-mono/issues/1043) 作者 [@jasonish](https://github.com/jasonish))
- 新增 `get_commands` RPC 方法，供无头客户端列出可用命令 ([#995](https://github.com/badlogic/pi-mono/pull/995) 作者 [@dnouri](https://github.com/dnouri))

### 变更

- 改进 TUI 中 `extractCursorPosition` 的性能：反向扫描行，并在光标位于视口上方时提前退出 ([#1004](https://github.com/badlogic/pi-mono/pull/1004) 作者 [@can1357](https://github.com/can1357))
- 自动补全改进：更好地处理部分匹配和边界情况 ([#1024](https://github.com/badlogic/pi-mono/pull/1024) 作者 [@Perlence](https://github.com/Perlence))

### 修复

- 当 pi 重新加载或保存无关设置时，现在会保留对 `settings.json` 的外部编辑。此前，直接编辑 settings.json（例如从 `packages` 数组移除一个包）会在自动 setter（如 `setLastChangelogVersion()`）触发保存后的下次 pi 启动时被静默还原。
- 修复启用 `quietStartup` 时自定义标题未正确显示的问题 ([#1039](https://github.com/badlogic/pi-mono/pull/1039) 作者 [@tudoroancea](https://github.com/tudoroancea))
- 包筛选器中的空数组现在会禁用所有资源，而不是回退到 manifest 默认值 ([#1044](https://github.com/badlogic/pi-mono/issues/1044))
- 自动重试计数器现在在每次 LLM 响应成功后重置，而非在工具使用轮次间累积 ([#1019](https://github.com/badlogic/pi-mono/issues/1019))
- 修复警告消息中的 `.md` 文件名不正确的问题 ([#1041](https://github.com/badlogic/pi-mono/issues/1041) 作者 [@llimllib](https://github.com/llimllib))
- 修复终端较窄时页脚中 provider 名称隐藏的问题 ([#981](https://github.com/badlogic/pi-mono/pull/981) 作者 [@Perlence](https://github.com/Perlence))
- 修复反斜杠输入缓冲导致编辑器字符延迟显示的问题 ([#1037](https://github.com/badlogic/pi-mono/pull/1037) 作者 [@Perlence](https://github.com/Perlence))
- 修复 Markdown 表格渲染，使用正确的行分隔符和最小列宽 ([#997](https://github.com/badlogic/pi-mono/pull/997) 作者 [@tmustier](https://github.com/tmustier))
- 修复 OpenAI completions 的 `toolChoice` 处理 ([#998](https://github.com/badlogic/pi-mono/pull/998) 作者 [@williamtwomey](https://github.com/williamtwomey))
- 修复从 OpenAI Responses API provider 切换时因以管道符分隔的工具调用 ID 导致跨 provider 交接失败的问题 ([#1022](https://github.com/badlogic/pi-mono/issues/1022))
- 修复 429 速率限制错误错误触发自动压缩而非采用退避重试的问题 ([#1038](https://github.com/badlogic/pi-mono/issues/1038))
- 修复 Anthropic provider 处理 API 返回的 `sensitive` stop_reason 的问题 ([#978](https://github.com/badlogic/pi-mono/issues/978))
- 通过检测 `deepseek.com` URL 并禁用不受支持的 `developer` 角色，修复 DeepSeek API 兼容性 ([#1048](https://github.com/badlogic/pi-mono/issues/1048))
- 修复代理在 `message_delta` 事件中省略输入 token 计数时 Anthropic provider 未保留该计数的问题 ([#1045](https://github.com/badlogic/pi-mono/issues/1045))
- 修复 `autocompleteMaxVisible` 设置未持久化至 `settings.json` 的问题

## [0.50.1] - 2026-01-26

### 修复

- Git 扩展更新现在可优雅地处理强制推送的远程仓库，而非失败 ([#961](https://github.com/badlogic/pi-mono/pull/961) 作者 [@aliou](https://github.com/aliou))
- 扩展 `ctx.newSession({ setup })` 现在在 setup 回调运行后正确同步代理状态并渲染消息 ([#968](https://github.com/badlogic/pi-mono/issues/968))
- 修复从无扩展状态启动时扩展 UI 绑定未初始化的问题，该问题会导致 `/reload` 后 UI 方法失效
- 修复 `/hotkeys` 输出未将扩展热键转为标题格式的问题 ([#969](https://github.com/badlogic/pi-mono/pull/969) 作者 [@Perlence](https://github.com/Perlence))
- 修复模型目录生成未排除已弃用 OpenCode Zen 模型的问题 ([#970](https://github.com/badlogic/pi-mono/pull/970) 作者 [@DanielTatarkin](https://github.com/DanielTatarkin))
- 修复 git 扩展移除功能未清理空目录的问题

## [0.50.0] - 2026-01-26

### 新功能

- 用于打包和安装扩展、技能、提示词和主题的 Pi 包。参见 [docs/packages.md](docs/packages.md)。
- 资源热重载（`/reload`），包括 AGENTS.md、SYSTEM.md、APPEND_SYSTEM.md、提示词模板、技能、主题和扩展。参见 [README.md#commands](README.md#commands) 和 [README.md#context-files](README.md#context-files)。
- 通过 `pi.registerProvider()` 支持自定义 provider，用于代理、自定义端点、OAuth 或 SSO 流程以及非标准流式 API。参见 [docs/custom-provider.md](docs/custom-provider.md)。
- 支持 Azure OpenAI Responses provider，并提供感知部署的模型映射。参见 [docs/providers.md#azure-openai](docs/providers.md#azure-openai)。
- 通过 `openRouterRouting` 支持自定义模型的 OpenRouter 路由。参见 [docs/providers.md#api-keys](docs/providers.md#api-keys) 和 [docs/models.md](docs/models.md)。
- 技能调用消息现在可折叠，且技能可通过 `disable-model-invocation` 选择退出模型调用。参见 [docs/skills.md#frontmatter](docs/skills.md#frontmatter)。
- 会话选择器重命名和可配置键绑定。参见 [README.md#commands](README.md#commands) 和 [docs/keybindings.md](docs/keybindings.md)。
- `models.json` 标头可解析环境变量和 shell 命令。参见 [docs/models.md#value-resolution](docs/models.md#value-resolution)。
- 用于覆盖静默启动的 `--verbose` CLI 标志。参见 [README.md#cli-reference](README.md#cli-reference)。

阅读完全改版的 `README.md` 文档，或者让你的 clanker 为你阅读。

### SDK 迁移指南

自 v0.49.3 以来存在多个 SDK 破坏性变更。为实现最快迁移，请让你的代理查看 `packages/coding-agent/docs/sdk.md`、`packages/coding-agent/examples/sdk` 中的 SDK 示例，以及 `packages/coding-agent/src/core/sdk.ts` 和相关模块中的 SDK 源码。

### 破坏性变更

- `models.json` 中的标头值现在会解析环境变量（若标头值匹配环境变量名称，则使用环境变量值）。如果字面标头值意外匹配环境变量名称，这可能会改变行为。([#909](https://github.com/badlogic/pi-mono/issues/909))
- 外部包（npm/git）现在通过 settings.json 中的 `packages` 数组配置，而非 `extensions`。`extensions` 中现有的 npm:/git: 条目会自动迁移。([#645](https://github.com/badlogic/pi-mono/issues/645))
- 资源加载现在仅使用 `ResourceLoader`，且 settings.json 对扩展、技能、提示词和主题使用数组 ([#645](https://github.com/badlogic/pi-mono/issues/645))
- 从 SDK 中移除 `discoverAuthStorage` 和 `discoverModels`。除非传递 `agentDir`，否则 `AuthStorage` 和 `ModelRegistry` 现在默认使用 `~/.pi/agent` 路径 ([#645](https://github.com/badlogic/pi-mono/issues/645))

### 新增

- 在 `/resume` 选择器中通过 `Ctrl+R` 重命名会话，无需打开会话 ([#863](https://github.com/badlogic/pi-mono/pull/863) 作者 [@svkozak](https://github.com/svkozak))
- 会话选择器键绑定现在可配置 ([#948](https://github.com/badlogic/pi-mono/pull/948) 作者 [@aos](https://github.com/aos))
- 为技能新增 `disable-model-invocation` frontmatter 字段，以阻止代理式调用，同时仍允许显式 `/skill:name` 命令 ([#927](https://github.com/badlogic/pi-mono/issues/927))
- 为扩展公开 `copyToClipboard` 工具 ([#926](https://github.com/badlogic/pi-mono/issues/926) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- 技能调用消息现在可在聊天输出中折叠，默认折叠显示技能名称和展开提示 ([#894](https://github.com/badlogic/pi-mono/issues/894))
- `models.json` 中的标头值现在支持环境变量和 shell 命令，与 `apiKey` 解析保持一致 ([#909](https://github.com/badlogic/pi-mono/issues/909))
- 新增 API 请求的 HTTP 代理环境变量支持 ([#942](https://github.com/badlogic/pi-mono/pull/942) 作者 [@haoqixu](https://github.com/haoqixu))
- 通过 `openRouterRouting` compat 字段，为自定义模型新增 OpenRouter provider 路由支持 ([#859](https://github.com/badlogic/pi-mono/pull/859) 作者 [@v01dpr1mr0s3](https://github.com/v01dpr1mr0s3))
- 新增 Azure OpenAI Responses API 的 `azure-openai-responses` provider 支持。([#890](https://github.com/badlogic/pi-mono/pull/890) 作者 [@markusylisiurunen](https://github.com/markusylisiurunen))
- 在更新通知中新增 changelog 链接 ([#925](https://github.com/badlogic/pi-mono/pull/925) 作者 [@dannote](https://github.com/dannote))
- 新增 `--verbose` CLI 标志以覆盖 quietStartup 设置 ([#906](https://github.com/badlogic/pi-mono/pull/906) 作者 [@Perlence](https://github.com/Perlence))
- `markdown.codeBlockIndent` 设置可自定义渲染输出中的代码块缩进
- 使用 `pi install`、`pi remove`、`pi update` 和 `pi list` 命令进行扩展包管理 ([#645](https://github.com/badlogic/pi-mono/issues/645))
- 包筛选：使用 `packages` 数组中的对象形式选择性加载包中的资源 ([#645](https://github.com/badlogic/pi-mono/issues/645))
- 在包筛选器、顶级设置数组和 pi manifest 中新增 minimatch glob 模式支持（例如 `"!funky.json"`、`"*.ts"`）([#645](https://github.com/badlogic/pi-mono/issues/645))
- 新增 `/reload` 命令以重新加载扩展、技能、提示词和主题 ([#645](https://github.com/badlogic/pi-mono/issues/645))
- 新增带 TUI 的 `pi config` 命令，通过模式启用/禁用包和顶级资源 ([#938](https://github.com/badlogic/pi-mono/issues/938))
- 新增 `--skill`、`--prompt-template`、`--theme`、`--no-prompt-templates` 和 `--no-themes` CLI 标志 ([#645](https://github.com/badlogic/pi-mono/issues/645))
- 包去重：若同一包出现在全局和项目设置中，项目设置优先 ([#645](https://github.com/badlogic/pi-mono/issues/645))
- 通过 `ResourceDiagnostic` 类型为所有资源类型提供统一的冲突报告 ([#645](https://github.com/badlogic/pi-mono/issues/645))
- 若有多个 provider 可用，在页脚中将 provider 与模型一并显示
- 通过带有 `streamSimple` 的 `pi.registerProvider()` 支持自定义 provider，以实现自定义 API
- 新增 `custom-provider.ts` 示例扩展，演示带 OAuth 的自定义 Anthropic provider

### 变更

- `/resume` 选择器排序切换移至 `Ctrl+S`，为重命名释放 `Ctrl+R` ([#863](https://github.com/badlogic/pi-mono/pull/863) 作者 [@svkozak](https://github.com/svkozak))
- HTML 导出：点击侧边栏消息现在会导航至其最新叶节点并滚动到该处，而非截断分支 ([#853](https://github.com/badlogic/pi-mono/pull/853) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- HTML 导出：活动路径现在以视觉方式突出显示，非路径节点变暗 ([#929](https://github.com/badlogic/pi-mono/pull/929) 作者 [@hewliyang](https://github.com/hewliyang))
- Azure OpenAI Responses provider 现在使用带感知部署模型映射的 base URL 配置，且不再包含 service tier 处理
- `/reload` 现在会重新渲染整个回滚缓冲区，使更新后的扩展组件立即可见 ([#928](https://github.com/badlogic/pi-mono/pull/928) 作者 [@ferologics](https://github.com/ferologics))
- 技能、提示词模板和主题发现现在使用设置和 CLI 路径数组，而非旧版筛选器 ([#645](https://github.com/badlogic/pi-mono/issues/645))

### 修复

- `agent_start` handler 中的扩展 `setWorkingMessage()` 调用现在可正确工作；此前由于加载动画尚不存在，消息会被静默忽略 ([#935](https://github.com/badlogic/pi-mono/issues/935))
- 修复包自动发现以遵守加载器规则、配置覆盖和强制排除模式
- 修复 /reload 在重载后恢复正确编辑器的问题 ([#949](https://github.com/badlogic/pi-mono/pull/949) 作者 [@Perlence](https://github.com/Perlence))
- 修复分发主题破坏 `/export` 的问题 ([#946](https://github.com/badlogic/pi-mono/pull/946) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- 修复启动提示以阐明思考级别选择和扩展思考指导
- 修复 SDK 初始模型解析以使用 `findInitialModel`，并默认为 Anthropic 模型选择 Claude Opus 4.5
- 修复无模型警告，使其包含 `/model` 指引
- 修复认证错误消息，使其指向认证文档
- 修复 bash 输出提示行截断至终端宽度
- 修复自定义编辑器遵守 `paddingX` 设置的问题 ([#936](https://github.com/badlogic/pi-mono/pull/936) 作者 [@Perlence](https://github.com/Perlence))
- 修复系统提示词工具列表仅显示内置工具的问题
- 修复包管理器在使用缓存副本前检查 npm 包版本
- 修复包管理器克隆包含 package.json 的 git 仓库后运行 `npm install`
- 修复扩展 provider 注册在模型解析之前应用的问题
- 修复编辑器多行插入处理和 lastAction 跟踪 ([#945](https://github.com/badlogic/pi-mono/pull/945) 作者 [@Perlence](https://github.com/Perlence))
- 修复编辑器自动换行未保留光标列的问题 ([#934](https://github.com/badlogic/pi-mono/pull/934) 作者 [@Perlence](https://github.com/Perlence))
- 修复编辑器自动换行使用单次回溯处理空白的问题 ([#924](https://github.com/badlogic/pi-mono/pull/924) 作者 [@Perlence](https://github.com/Perlence))
- 修复 Kitty 图像 ID 分配和清理，避免图像 ID 冲突
- 修复终端调整大小后 overlay 保持居中的问题 ([#950](https://github.com/badlogic/pi-mono/pull/950) 作者 [@nicobailon](https://github.com/nicobailon))
- 修复流式分发使用模型 API 类型而非硬编码 API 默认值
- 修复 Google provider 在省略时将工具调用参数默认设为空对象
- 修复 OpenAI Responses 流式处理，以处理 OpenAI 兼容端点上的 `arguments.done` 事件 ([#917](https://github.com/badlogic/pi-mono/pull/917) 作者 [@williballenthin](https://github.com/williballenthin))
- 修复共享 responses 重构后 OpenAI Codex Responses 工具 strictness 处理
- 修复 Azure OpenAI Responses 流式处理，在内容部分之前保护 delta，并纠正元数据和交接门控
- 修复连续工具结果后的 OpenAI completions 工具结果图像批处理 ([#902](https://github.com/badlogic/pi-mono/pull/902) 作者 [@terrorobe](https://github.com/terrorobe))
- 修复 bash 输出“earlier lines”计数因将间距换行计算为隐藏内容导致的差一错误 ([#921](https://github.com/badlogic/pi-mono/issues/921))
- 用户包筛选器现在叠加在 manifest 筛选器之上，而非替换它们 ([#645](https://github.com/badlogic/pi-mono/issues/645))
- 自动重试现在可处理中途流失败时来自 Codex API 的 “terminated” 错误
- 后续队列 (Alt+Enter) 现在发送完整粘贴内容，而非 `[paste #N ...]` 标记 ([#912](https://github.com/badlogic/pi-mono/issues/912))
- 修复 Alt-Up 未恢复压缩期间排队消息的问题 ([#923](https://github.com/badlogic/pi-mono/pull/923) 作者 [@aliou](https://github.com/aliou))
- 修复通过 `--session` 标志加载空或无效会话文件时的会话损坏 ([#932](https://github.com/badlogic/pi-mono/issues/932) 作者 [@armanddp](https://github.com/armanddp))
- 修复扩展同时使用 `setEditorComponent()` 时其快捷键未触发的问题 ([#947](https://github.com/badlogic/pi-mono/pull/947) 作者 [@Perlence](https://github.com/Perlence))
- 会话“修改”时间现在使用最后一条消息的时间戳而非文件 mtime，因此重命名不会重新排列最近列表 ([#863](https://github.com/badlogic/pi-mono/pull/863) 作者 [@svkozak](https://github.com/svkozak))

## [0.49.3] - 2026-01-22

### 新增

- `markdown.codeBlockIndent` 设置可自定义渲染输出中的代码块缩进 ([#855](https://github.com/badlogic/pi-mono/pull/855) 作者 [@terrorobe](https://github.com/terrorobe))
- 新增 `inline-bash.ts` 示例扩展，用于展开提示词中的 `!{command}` 模式 ([#881](https://github.com/badlogic/pi-mono/pull/881) 作者 [@scutifer](https://github.com/scutifer))
- 新增 `antigravity-image-gen.ts` 示例扩展，用于通过 Google Antigravity 生成 AI 图像 ([#893](https://github.com/badlogic/pi-mono/pull/893) 作者 [@ben-vargas](https://github.com/ben-vargas))
- 新增 `PI_SHARE_VIEWER_URL` 环境变量，用于自定义分享查看器 URL ([#889](https://github.com/badlogic/pi-mono/pull/889) 作者 [@andresaraujo](https://github.com/andresaraujo))
- 新增 Alt+Delete 作为向前删除单词的热键 ([#878](https://github.com/badlogic/pi-mono/pull/878) 作者 [@Perlence](https://github.com/Perlence))

### 变更

- 树选择器：将标签筛选快捷键从 `l` 改为 `Shift+L`，以便用户搜索包含 “l” 的条目 ([#861](https://github.com/badlogic/pi-mono/pull/861) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- 模糊匹配现在对连续匹配给予更高评分，以提高搜索相关性 ([#860](https://github.com/badlogic/pi-mono/pull/860) 作者 [@mitsuhiko](https://github.com/mitsuhiko))

### 修复

- 修复错误消息显示硬编码 `~/.pi/agent/` 路径而未遵守 `PI_CODING_AGENT_DIR` 的问题 ([#887](https://github.com/badlogic/pi-mono/pull/887) 作者 [@aliou](https://github.com/aliou))
- 修复 `write` 工具执行失败时未在 UI 中显示错误的问题 ([#856](https://github.com/badlogic/pi-mono/issues/856))
- 修复 HTML 导出使用默认主题而非用户活动主题的问题 ([#870](https://github.com/badlogic/pi-mono/pull/870) 作者 [@scutifer](https://github.com/scutifer))
- 在页脚和终端/标签标题中显示会话名称 ([#876](https://github.com/badlogic/pi-mono/pull/876) 作者 [@scutifer](https://github.com/scutifer))
- 修复 Terminal.app 中的 256color 回退，以防止颜色渲染问题 ([#869](https://github.com/badlogic/pi-mono/pull/869) 作者 [@Perlence](https://github.com/Perlence))
- 修复 overlay 和内容缩小场景的视口跟踪及光标定位
- 修复自动补全以允许带 `/` 字符的搜索（例如 `folder1/folder2`）([#882](https://github.com/badlogic/pi-mono/pull/882) 作者 [@richardgill](https://github.com/richardgill))
- 修复自动链接的电子邮件显示冗余 `(mailto:...)` 后缀的问题 ([#888](https://github.com/badlogic/pi-mono/pull/888) 作者 [@terrorobe](https://github.com/terrorobe))
- 修复 `@` 文件自动补全在目录后添加空格，从而破坏继续自动补全子目录的问题

## [0.49.2] - 2026-01-19

### 新增

- 通过 `pi.addWidget()` 中的 `widgetPlacement` 为扩展 widget 新增放置选项 ([#850](https://github.com/badlogic/pi-mono/pull/850) 作者 [@marckrenn](https://github.com/marckrenn))
- 新增 ECS/Kubernetes 环境的 AWS 凭据检测：`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`、`AWS_CONTAINER_CREDENTIALS_FULL_URI`、`AWS_WEB_IDENTITY_TOKEN_FILE` ([#848](https://github.com/badlogic/pi-mono/issues/848))
- 在 `/settings` 中添加“静默启动”设置 ([#847](https://github.com/badlogic/pi-mono/pull/847) 作者 [@unexge](https://github.com/unexge))

### 变更

- HTML 导出现包含 JSONL 下载按钮、点击时跳转至最后一条消息，并修复缺失标签 ([#853](https://github.com/badlogic/pi-mono/pull/853) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- 改进 OAuth 认证失败（过期凭据、离线）的错误消息，替代笼统的 “No API key found” ([#849](https://github.com/badlogic/pi-mono/pull/849) 作者 [@zedrdave](https://github.com/zedrdave))

### 修复
- 修复 `/model` 选择器作用域切换，以便保存作用域模型时可在所有模型和作用域模型之间切换 ([#844](https://github.com/badlogic/pi-mono/issues/844))
- 修复重放中止的轮次时 OpenAI Responses 400 错误 “reasoning without following item” ([#838](https://github.com/badlogic/pi-mono/pull/838))
- 修复取消恢复会话选择时 pi 以代码 0 退出的问题

### 移除

- 从 models.json schema 移除 `strictResponsesPairing` compat 选项（不再需要）

## [0.49.1] - 2026-01-18

### 新增

- 为 Azure 上的自定义 OpenAI Responses 模型新增 `strictResponsesPairing` compat 选项 ([#768](https://github.com/badlogic/pi-mono/pull/768) 作者 [@prateekmedia](https://github.com/prateekmedia))
- 会话选择器（`/resume`）现在支持路径显示切换 (`Ctrl+P`) 和带内联确认的会话删除 (`Ctrl+D`) ([#816](https://github.com/badlogic/pi-mono/pull/816) 作者 [@w-winter](https://github.com/w-winter))
- 在交互模式中新增 Ctrl+- 热键撤销支持。([#831](https://github.com/badlogic/pi-mono/pull/831) 作者 [@Perlence](https://github.com/Perlence))

### 变更

- 分享 URL 现在使用哈希片段（`#`）而非查询字符串（`?`），防止会话 ID 被发送到 buildwithpi.ai ([#829](https://github.com/badlogic/pi-mono/pull/829) 作者 [@terrorobe](https://github.com/terrorobe))
- `models.json` 中的 API 密钥现在可通过带 `!` 前缀的 shell 命令获取（例如 macOS Keychain 的 `"apiKey": "!security find-generic-password -ws 'anthropic'"`）([#762](https://github.com/badlogic/pi-mono/pull/762) 作者 [@cv](https://github.com/cv))

### 修复

- 修复使用输入法编辑器筛选菜单时 IME 候选窗口出现在错误位置的问题（例如中文 IME）。带搜索输入的组件现在会正确传播焦点状态以进行光标定位。([#827](https://github.com/badlogic/pi-mono/issues/827))
- 修复内置操作重新映射时扩展快捷键冲突未遵守用户键绑定的问题。([#826](https://github.com/badlogic/pi-mono/pull/826) 作者 [@richardgill](https://github.com/richardgill))
- 修复独立编译二进制文件中的 photon WASM 加载。
- 修复跨 provider 交接的工具调用 ID 规范化（例如 Codex 至 Antigravity Claude）([#821](https://github.com/badlogic/pi-mono/issues/821))

## [0.49.0] - 2026-01-17

### 新增

- ExtensionAPI 中的 `pi.setLabel(entryId, label)`，供扩展设置每个条目的标签 ([#806](https://github.com/badlogic/pi-mono/issues/806))
- 为扩展导出 `keyHint`、`appKeyHint`、`editorKey`、`appKey`、`rawKeyHint`，以一致地格式化键绑定提示 ([#802](https://github.com/badlogic/pi-mono/pull/802) 作者 [@dannote](https://github.com/dannote))
- 从包索引导出 `VERSION` 并更新自定义标题示例。([#798](https://github.com/badlogic/pi-mono/pull/798) 作者 [@tallshort](https://github.com/tallshort))
- 新增 `showHardwareCursor` 设置，用于在仍为 IME 支持定位光标时控制光标可见性。([#800](https://github.com/badlogic/pi-mono/pull/800) 作者 [@ghoulr](https://github.com/ghoulr))
- 在交互式编辑器中新增 Emacs 风格 kill ring 编辑，包含 yank 和 yank-pop 键绑定，以及旧版 Alt+字母处理和 Alt+D 向前删除单词支持。([#810](https://github.com/badlogic/pi-mono/pull/810) 作者 [@Perlence](https://github.com/Perlence))
- 向扩展上下文新增 `ctx.compact()` 和 `ctx.getContextUsage()`，用于程序化压缩及上下文使用量检查。
- 在交互模式中新增向前删除单词和 kill ring 键绑定的文档。([#810](https://github.com/badlogic/pi-mono/pull/810) 作者 [@Perlence](https://github.com/Perlence))

### 变更

- 更新默认系统提示词措辞，以阐明 pi harness 和文档范围。
- 简化 Codex 系统提示词处理，直接将默认系统提示词用于 Codex 指令。

### 修复

- 修复 photon 模块在 ESM 上下文中因 “require is not defined” 错误无法加载的问题 ([#795](https://github.com/badlogic/pi-mono/pull/795) 作者 [@dannote](https://github.com/dannote))
- 修复扩展触发压缩时压缩 UI 未显示的问题。
- 修复出错的 assistant 消息后的孤立工具结果导致 Codex API 错误的问题。当 assistant 消息具有 `stopReason: "error"` 时，其工具调用现从待处理工具跟踪中排除，防止为将由特定 provider 转换器丢弃的调用生成合成工具结果。([#812](https://github.com/badlogic/pi-mono/issues/812))
- 修复 Bedrock Claude max_tokens 处理，使其始终超过思考预算 token，防止压缩失败。([#797](https://github.com/badlogic/pi-mono/pull/797) 作者 [@pjtf93](https://github.com/pjtf93))
- 修复 Claude Code 工具名称规范化，使其不区分大小写地匹配 Claude Code 工具列表并移除无效映射。

### 移除

- 从 read 工具移除 `pi-internal://` 路径解析。

## [0.48.0] - 2026-01-16

### 新增

- 新增 `quietStartup` 设置以静默启动输出（版本标题、已加载上下文信息、模型作用域行）。仍会显示 Changelog 通知。([#777](https://github.com/badlogic/pi-mono/pull/777) 作者 [@ribelo](https://github.com/ribelo))
- 新增 `editorPaddingX` 设置，用于输入编辑器的水平内边距（0-3，默认值：0）
- 新增 `shellCommandPrefix` 设置，在每次 bash 执行前添加命令，以在非交互式 shell 中启用别名展开（例如 `"shellCommandPrefix": "shopt -s expand_aliases"`）([#790](https://github.com/badlogic/pi-mono/pull/790) 作者 [@richardgill](https://github.com/richardgill))
- 新增提示词模板的 bash 风格参数切片 ([#770](https://github.com/badlogic/pi-mono/pull/770) 作者 [@airtonix](https://github.com/airtonix))
- 扩展命令现在可通过 `pi.registerCommand()` 中的 `getArgumentCompletions` 提供参数自动补全 ([#775](https://github.com/badlogic/pi-mono/pull/775) 作者 [@ribelo](https://github.com/ribelo))
- 当设置超时时，Bash 工具现在会在 UI 中显示超时值 ([#780](https://github.com/badlogic/pi-mono/pull/780) 作者 [@dannote](https://github.com/dannote))
- 导出 `getShellConfig`，供扩展检测用户 shell 环境 ([#766](https://github.com/badlogic/pi-mono/pull/766) 作者 [@dannote](https://github.com/dannote))
- 向主题 schema 新增 `thinkingText` 和 `selectedBg` ([#763](https://github.com/badlogic/pi-mono/pull/763) 作者 [@scutifer](https://github.com/scutifer))
- `navigateTree()` 现在支持 `replaceInstructions` 选项以完全替换默认摘要提示词，以及 `label` 选项以向分支摘要条目附加标签 ([#787](https://github.com/badlogic/pi-mono/pull/787) 作者 [@mitsuhiko](https://github.com/mitsuhiko))

### 修复

- 修复摘要失败（例如配额超限）时自动压缩崩溃的问题。现在会显示错误消息而非崩溃 ([#792](https://github.com/badlogic/pi-mono/issues/792))
- 修复 `--session <UUID>` 在本地找不到时未跨项目全局搜索的问题，并提供从其他项目分叉会话的选项 ([#785](https://github.com/badlogic/pi-mono/pull/785) 作者 [@ribelo](https://github.com/ribelo))
- 修复 Linux 上独立二进制文件的 WASM 加载 ([#784](https://github.com/badlogic/pi-mono/issues/784))
- 修复工具参数中的字符串数字在验证期间未强制转换为数字的问题 ([#786](https://github.com/badlogic/pi-mono/pull/786) 作者 [@dannote](https://github.com/dannote))
- 修复 `--no-extensions` 标志未阻止扩展发现的问题 ([#776](https://github.com/badlogic/pi-mono/issues/776))
- 修复在 `session_start` 期间调用 `pi.sendMessage({ display: true })` 时扩展消息在启动时渲染两次的问题 ([#765](https://github.com/badlogic/pi-mono/pull/765) 作者 [@dannote](https://github.com/dannote))
- 修复 `PI_CODING_AGENT_DIR` 环境变量未将波浪号 (`~`) 展开为主目录的问题 ([#778](https://github.com/badlogic/pi-mono/pull/778) 作者 [@aliou](https://github.com/aliou))
- 修复会话选择器提示文本溢出 ([#764](https://github.com/badlogic/pi-mono/issues/764))
- 修复 Kitty 键盘协议中 shifted 符号键（例如 `@`、`?`）无法在编辑器中工作的问题 ([#779](https://github.com/badlogic/pi-mono/pull/779) 作者 [@iamd3vil](https://github.com/iamd3vil))
- 修复 Bedrock 工具调用 ID 因无效字符导致 API 错误的问题 ([#781](https://github.com/badlogic/pi-mono/pull/781) 作者 [@pjtf93](https://github.com/pjtf93))

### 变更

- 现在默认禁用硬件光标，以获得更好的终端兼容性。设置 `PI_HARDWARE_CURSOR=1` 启用（替换了用于禁用它的 `PI_NO_HARDWARE_CURSOR=1`）。

## [0.47.0] - 2026-01-16

### 破坏性变更

- 直接使用 `Editor` 的扩展现在必须将 `TUI` 作为第一个构造函数参数传递：`new Editor(tui, theme)`。`tui` 参数在扩展工厂函数中可用。([#732](https://github.com/badlogic/pi-mono/issues/732))

### 新增

- **OpenAI Codex 官方支持**：完全兼容 OpenAI 的 Codex CLI 模型（`gpt-5.1`、`gpt-5.2`、`gpt-5.1-codex-mini`、`gpt-5.2-codex`）。功能包括用于 OpenAI allowlisting 的静态系统提示词、通过会话 ID 进行提示词缓存，以及跨轮次保留推理签名。设置 `OPENAI_API_KEY` 并使用 `--provider openai-codex`，或选择一个 Codex 模型。([#737](https://github.com/badlogic/pi-mono/pull/737))
- read 工具中的 `pi-internal://` URL scheme，用于访问内部文档。模型可读取 coding-agent 包中的文件（README、docs、examples），以了解如何扩展 pi。
- 扩展系统中新增 `input` 事件，用于在代理处理用户输入前对其进行拦截、转换或处理。支持三种结果类型：`continue`（透传）、`transform`（修改文本/图像）、`handled`（不经 LLM 直接响应）。handler 会链式转换，并在 handled 时短路。([#761](https://github.com/badlogic/pi-mono/pull/761) 作者 [@nicobailon](https://github.com/nicobailon))
- 扩展示例：`input-transform.ts`，演示输入拦截模式（快速模式、即时命令、源路由）([#761](https://github.com/badlogic/pi-mono/pull/761) 作者 [@nicobailon](https://github.com/nicobailon))
- 自定义工具 HTML 导出：具有 `renderCall`/`renderResult` 的扩展现在会在 `/share` 和 `/export` 输出中渲染，并进行 ANSI 到 HTML 颜色转换 ([#702](https://github.com/badlogic/pi-mono/pull/702) 作者 [@aliou](https://github.com/aliou))
- Tree 模式中的直接筛选快捷键：Ctrl+D（默认）、Ctrl+T（无工具）、Ctrl+U（仅用户）、Ctrl+L（仅有标签）、Ctrl+A（全部）([#747](https://github.com/badlogic/pi-mono/pull/747) 作者 [@kaofelix](https://github.com/kaofelix))

### 变更

- 技能命令（`/skill:name`）现在在 AgentSession 中而非交互模式中展开。这使 RPC 和打印模式可使用技能命令，并允许 `input` 事件在展开前拦截 `/skill:name`。

### 修复

- 通过 `setEditorText` 加载大型提示词时，编辑器不再破坏终端显示。内容现在垂直滚动，并显示视口上方/下方行的指示器。([#732](https://github.com/badlogic/pi-mono/issues/732))
- 管道 stdin 现在可正确工作：`echo foo | pi` 等同于 `pi -p foo`。当 stdin 被管道传递时，会自动启用打印模式，因为交互模式需要 TTY ([#708](https://github.com/badlogic/pi-mono/issues/708))
- 当筛选器隐藏中间条目时，会话树现在会保留分支连接线和缩进，以使后代附加至最近可见祖先，且兄弟分支对齐。已在 TUI 和 HTML 导出中修复 ([#739](https://github.com/badlogic/pi-mono/pull/739) 作者 [@w-winter](https://github.com/w-winter))
- 向自动重试错误检测新增 `upstream connect`、`connection refused` 和 `reset before headers` 模式 ([#733](https://github.com/badlogic/pi-mono/issues/733))
- 技能和提示词模板中的多行 YAML frontmatter 现在可正确解析。使用 `yaml` 库集中解析 frontmatter。([#728](https://github.com/badlogic/pi-mono/pull/728) 作者 [@richardgill](https://github.com/richardgill))
- `ctx.shutdown()` 现在在退出前等待待处理 UI 渲染完成，确保通知和最终输出可见 ([#756](https://github.com/badlogic/pi-mono/issues/756))
- OpenAI Codex provider 现在会以指数退避重试瞬态错误（429、5xx、连接失败）([#733](https://github.com/badlogic/pi-mono/issues/733))

## [0.46.0] - 2026-01-15

### 修复

- 作用域模型（`--models` 或 `enabledModels`）现在会跨会话记住最后选择的模型，而非总以作用域中的第一个模型开始 ([#736](https://github.com/badlogic/pi-mono/pull/736) 作者 [@ogulcancelik](https://github.com/ogulcancelik))
- 在 Bun 下运行时，更新通知中显示 `bun install` 而非 `npm install` ([#714](https://github.com/badlogic/pi-mono/pull/714) 作者 [@dannote](https://github.com/dannote))
- `/skill` 提示词现在包含技能路径 ([#711](https://github.com/badlogic/pi-mono/pull/711) 作者 [@jblwilliams](https://github.com/jblwilliams))
- 使用可配置的 `expandTools` 键绑定而非硬编码 Ctrl+O ([#717](https://github.com/badlogic/pi-mono/pull/717) 作者 [@dannote](https://github.com/dannote))
- 压缩轮次前缀摘要现在会正确合并 ([#738](https://github.com/badlogic/pi-mono/pull/738) 作者 [@vsabavat](https://github.com/vsabavat))
- 避免无签名 Gemini 3 工具调用 ([#741](https://github.com/badlogic/pi-mono/pull/741) 作者 [@roshanasingh4](https://github.com/roshanasingh4))
- 修复 Amazon Bedrock provider 中非 Anthropic 模型的签名支持 ([#727](https://github.com/badlogic/pi-mono/pull/727) 作者 [@unexge](https://github.com/unexge))
- 键盘快捷键（Ctrl+C、Ctrl+D 等）现在可在支持具有备用键报告的 Kitty 键盘协议的终端中用于非拉丁键盘布局（俄语、乌克兰语、保加利亚语等）([#718](https://github.com/badlogic/pi-mono/pull/718) 作者 [@dannote](https://github.com/dannote))

### 新增

- edit 工具现在在精确匹配失败时使用模糊匹配作为回退，可容忍尾随空白、智能引号、Unicode 破折号和特殊空格 ([#713](https://github.com/badlogic/pi-mono/pull/713) 作者 [@dannote](https://github.com/dannote))
- 支持 `APPEND_SYSTEM.md` 以向系统提示词追加指令 ([#716](https://github.com/badlogic/pi-mono/pull/716) 作者 [@tallshort](https://github.com/tallshort))
- 会话选择器搜索：Ctrl+R 在模糊匹配（默认）和最近使用之间切换排序；支持带引号短语匹配和 `re:` 正则表达式模式 ([#731](https://github.com/badlogic/pi-mono/pull/731) 作者 [@ogulcancelik](https://github.com/ogulcancelik))
- 为扩展导出 `getAgentDir` ([#749](https://github.com/badlogic/pi-mono/pull/749) 作者 [@dannote](https://github.com/dannote))
- 启动时显示已加载的提示词模板 ([#743](https://github.com/badlogic/pi-mono/pull/743) 作者 [@tallshort](https://github.com/tallshort))
- MiniMax China (`minimax-cn`) provider 支持 ([#725](https://github.com/badlogic/pi-mono/pull/725) 作者 [@tallshort](https://github.com/tallshort))
- 为 GitHub Copilot 和 OpenCode Zen provider 新增 `gpt-5.2-codex` 模型 ([#734](https://github.com/badlogic/pi-mono/pull/734) 作者 [@aadishv](https://github.com/aadishv))

### 变更

- 将图像处理从 `wasm-vips` 替换为 `@silvia-odwyer/photon-node` ([#710](https://github.com/badlogic/pi-mono/pull/710) 作者 [@can1357](https://github.com/can1357))
- 扩展示例：将 `plan-mode/` 快捷键从 Shift+P 改为 Ctrl+Alt+P，以避免与输入大写 P 冲突 ([#746](https://github.com/badlogic/pi-mono/pull/746) 作者 [@ferologics](https://github.com/ferologics))
- UI 键绑定提示现在在各组件中遵守配置的键绑定 ([#724](https://github.com/badlogic/pi-mono/pull/724) 作者 [@dannote](https://github.com/dannote))
- CLI 进程标题现在设为 `pi`，以便更容易识别进程 ([#742](https://github.com/badlogic/pi-mono/pull/742) 作者 [@richardgill](https://github.com/richardgill))

## [0.45.7] - 2026-01-13

### 新增

- 为扩展导出 `highlightCode` 和 `getLanguageFromPath` ([#703](https://github.com/badlogic/pi-mono/pull/703) 作者 [@dannote](https://github.com/dannote))

## [0.45.6] - 2026-01-13

### 新增

- `ctx.ui.custom()` 现在接受用于 overlay 定位和尺寸的 `overlayOptions`（锚点、边距、偏移、百分比、绝对定位）([#667](https://github.com/badlogic/pi-mono/pull/667) 作者 [@nicobailon](https://github.com/nicobailon))
- `ctx.ui.custom()` 现在接受 `onHandle` 回调以接收 `OverlayHandle`，用于控制 overlay 可见性 ([#667](https://github.com/badlogic/pi-mono/pull/667) 作者 [@nicobailon](https://github.com/nicobailon))
- 扩展示例：`overlay-qa-tests.ts`，具有 10 个命令，用于测试 overlay 定位、动画和切换场景 ([#667](https://github.com/badlogic/pi-mono/pull/667) 作者 [@nicobailon](https://github.com/nicobailon))
- 扩展示例：`doom-overlay/` - 作为以 35 FPS 运行的 overlay 的 DOOM 游戏（首次运行时自动下载 WAD）([#667](https://github.com/badlogic/pi-mono/pull/667) 作者 [@nicobailon](https://github.com/nicobailon))

## [0.45.5] - 2026-01-13

### 修复

- 在全新安装时跳过 Changelog 显示（仅在升级时显示）

## [0.45.4] - 2026-01-13

### 变更

- 调整浅色主题颜色以符合 WCAG AA 标准（相对于白色背景的 4.5:1 对比度）
- 将图像处理（调整大小、PNG 转换）从 `sharp` 替换为 `wasm-vips`。消除了在某些系统上导致安装失败的原生构建要求。([#696](https://github.com/badlogic/pi-mono/issues/696))

### 新增

- 扩展示例：`summarize.ts`，使用自定义 UI 和外部模型总结对话 ([#684](https://github.com/badlogic/pi-mono/pull/684) 作者 [@scutifer](https://github.com/scutifer))
- 扩展示例：增强 `question.ts`，使用自定义 UI 向用户提问 ([#693](https://github.com/badlogic/pi-mono/pull/693) 作者 [@ferologics](https://github.com/ferologics))
- 扩展示例：增强 `plan-mode/`，提供显式步骤跟踪和进度 widget ([#694](https://github.com/badlogic/pi-mono/pull/694) 作者 [@ferologics](https://github.com/ferologics))
- 扩展示例：`questionnaire.ts`，用于带标签栏导航的多问题输入 ([#695](https://github.com/badlogic/pi-mono/pull/695) 作者 [@ferologics](https://github.com/ferologics))
- 实验性 Vercel AI Gateway provider 支持：设置 `AI_GATEWAY_API_KEY` 并使用 `--provider vercel-ai-gateway`。目前 Anthropic Messages 兼容端点报告的 token 使用量不正确。([#689](https://github.com/badlogic/pi-mono/pull/689) 作者 [@timolins](https://github.com/timolins))

### 修复

- 通过使用 provider 参数修复模型切换后的 API 密钥解析 ([#691](https://github.com/badlogic/pi-mono/pull/691) 作者 [@joshp123](https://github.com/joshp123))
- 修复 z.ai 思考/推理：思考切换现在可正确为 z.ai 模型启用/禁用思考 ([#688](https://github.com/badlogic/pi-mono/issues/688))
- 修复编译后的 Bun 二进制文件中的扩展加载：包含本地文件导入的扩展现在可正确工作。将 `@mariozechner/jiti` 更新至 v2.6.5，该版本捆绑 babel 以实现 Bun 二进制兼容性。([#681](https://github.com/badlogic/pi-mono/issues/681))
- 修复通过 mise 安装时的主题加载：在发布 tarball 中使用包装目录，以兼容 mise 的 `strip_components=1` 提取。([#681](https://github.com/badlogic/pi-mono/issues/681))

## [0.45.3] - 2026-01-13

## [0.45.2] - 2026-01-13

### 修复

- 扩展现在可在编译后的 Bun 二进制文件中正确加载，使用带 `virtualModules` 支持的 `@mariozechner/jiti` fork。捆绑包（`@sinclair/typebox`、`@mariozechner/pi-tui`、`@mariozechner/pi-ai`、`@mariozechner/pi-coding-agent`）无需文件系统 node_modules 即可供扩展访问。

## [0.45.1] - 2026-01-13

### 变更

- `/share` 现在输出 `buildwithpi.ai` 会话预览 URL，而非 `pi.dev`

## [0.45.0] - 2026-01-13

### 新增

- MiniMax provider 支持：设置 `MINIMAX_API_KEY` 并使用 `minimax/MiniMax-M2.1` ([#656](https://github.com/badlogic/pi-mono/pull/656) 作者 [@dannote](https://github.com/dannote))
- `/scoped-models`：Alt+Up/Down 可重新排序已启用模型。使用 Ctrl+S 保存时顺序会保留，并决定 Ctrl+P 循环顺序。([#676](https://github.com/badlogic/pi-mono/pull/676) 作者 [@thomasmhr](https://github.com/thomasmhr))
- Amazon Bedrock provider 支持（实验性，仅使用 Anthropic Claude 模型测试）([#494](https://github.com/badlogic/pi-mono/pull/494) 作者 [@unexge](https://github.com/unexge))
- 扩展示例：`sandbox/`，使用 `@anthropic-ai/sandbox-runtime` 和逐项目配置实现 OS 级 bash 沙箱 ([#673](https://github.com/badlogic/pi-mono/pull/673) 作者 [@dannote](https://github.com/dannote))
- 打印模式 JSON 输出现在将会话标头作为第一行输出。

## [0.44.0] - 2026-01-12

### 破坏性变更

- `pi.getAllTools()` 现在返回 `ToolInfo[]`（包含 `name` 和 `description`），而非 `string[]`。仅需名称的扩展可使用 `.map(t => t.name)`。([#648](https://github.com/badlogic/pi-mono/pull/648) 作者 [@carsonfarmer](https://github.com/carsonfarmer))

### 新增

- 会话命名：`/name <name>` 命令设置会话选择器中显示的名称，而非第一条消息。适合区分分叉会话。扩展可使用 `pi.setSessionName()` 和 `pi.getSessionName()`。([#650](https://github.com/badlogic/pi-mono/pull/650) 作者 [@scutifer](https://github.com/scutifer))
- 扩展示例：`notify.ts`，通过 OSC 777 转义序列发送桌面通知 ([#658](https://github.com/badlogic/pi-mono/pull/658) 作者 [@ferologics](https://github.com/ferologics))
- 为排队消息提供内联提示，显示 `Alt+Up` 恢复快捷键 ([#657](https://github.com/badlogic/pi-mono/pull/657) 作者 [@tmustier](https://github.com/tmustier))
- `/resume` 会话选择器中的 Page-up/down 导航，可每次跳转 5 项 ([#662](https://github.com/badlogic/pi-mono/pull/662) 作者 [@aliou](https://github.com/aliou))
- `/settings` 菜单中的模糊搜索：输入以按标签筛选设置 ([#643](https://github.com/badlogic/pi-mono/pull/643) 作者 [@ninlds](https://github.com/ninlds))

### 修复

- 当前文件夹没有会话时会话选择器现在保持打开，允许使用 Tab 切换至“全部”作用域 ([#661](https://github.com/badlogic/pi-mono/pull/661) 作者 [@aliou](https://github.com/aliou))
- 使用 `getSettingsListTheme()` 等主题工具的扩展现在可在 tsx 开发模式中工作

## [0.43.0] - 2026-01-11

### 破坏性变更

- 扩展编辑器（`ctx.ui.editor()`）现在使用 Enter 提交，Shift+Enter 换行，与主编辑器一致。此前使用 Ctrl+Enter 提交。带有硬编码 “ctrl+enter” 提示的扩展需要更新。([#642](https://github.com/badlogic/pi-mono/pull/642) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- 将 `/branch` 命令重命名为 `/fork` ([#641](https://github.com/badlogic/pi-mono/issues/641))
  - RPC：`branch` → `fork`，`get_branch_messages` → `get_fork_messages`
  - SDK：`branch()` → `fork()`，`getBranchMessages()` → `getForkMessages()`
  - AgentSession：`branch()` → `fork()`，`getUserMessagesForBranching()` → `getUserMessagesForForking()`
  - 扩展事件：`session_before_branch` → `session_before_fork`，`session_branch` → `session_fork`
  - 设置：`doubleEscapeAction: "branch" | "tree"` → `"fork" | "tree"`
- `SessionManager.list()` 和 `SessionManager.listAll()` 现在为异步函数，返回 `Promise<SessionInfo[]>`。调用方必须 await 它们。([#620](https://github.com/badlogic/pi-mono/pull/620) 作者 [@tmustier](https://github.com/tmustier))

### 新增
- `/resume` 选择器现在通过 Tab 在当前文件夹和所有会话之间切换，在“全部”视图中显示会话 cwd 和加载进度。([#620](https://github.com/badlogic/pi-mono/pull/620) 作者 [@tmustier](https://github.com/tmustier))
- `SessionManager.list()` 和 `SessionManager.listAll()` 接受可选的 `onProgress` 回调以更新进度
- 包含会话工作目录的 `SessionInfo.cwd` 字段（旧会话为空字符串）
- 为进度回调导出 `SessionListProgress` 类型
- `/scoped-models` 命令用于启用/禁用 Ctrl+P 循环的模型。默认仅限当前会话更改；按 Ctrl+S 持久化到 settings.json。([#626](https://github.com/badlogic/pi-mono/pull/626) 作者 [@CarlosGtrz](https://github.com/CarlosGtrz))
- 当通过 `/model`、模型循环或会话恢复更改模型时，触发 `model_select` 扩展 hook，并带有 `source` 字段和 `previousModel` ([#628](https://github.com/badlogic/pi-mono/pull/628) 作者 [@marckrenn](https://github.com/marckrenn))
- `ctx.ui.setWorkingMessage()` 扩展 API，用于在流式处理期间自定义 “Working...” 消息 ([#625](https://github.com/badlogic/pi-mono/pull/625) 作者 [@nicobailon](https://github.com/nicobailon))
- 技能斜杠命令：加载的技能注册为 `/skill:name` 命令以便快速访问。通过 `/settings` 或 settings.json 中的 `skills.enableSkillCommands` 切换。([#630](https://github.com/badlogic/pi-mono/pull/630) 作者 [@Dwsy](https://github.com/Dwsy))
- 斜杠命令自动补全现在使用模糊匹配（输入 `/skbra` 可匹配 `/skill:brave-search`）
- `/tree` 分支摘要现在提供三项选项：“No summary”、“Summarize”和“Summarize with custom prompt”。自定义提示词会作为额外焦点附加至默认摘要指令。([#642](https://github.com/badlogic/pi-mono/pull/642) 作者 [@mitsuhiko](https://github.com/mitsuhiko))

### 修复

- assistant 消息与文本编辑器之间缺少间隔 ([#655](https://github.com/badlogic/pi-mono/issues/655))
- 使用 `--resume` 时会话选择器遵守自定义键绑定 ([#633](https://github.com/badlogic/pi-mono/pull/633) 作者 [@aos](https://github.com/aos))
- 自定义页脚扩展现在可看到模型更改：`ctx.model` 现在是一个返回当前模型的 getter，而非创建上下文时的快照 ([#634](https://github.com/badlogic/pi-mono/pull/634) 作者 [@ogulcancelik](https://github.com/ogulcancelik))
- 修复外部切换分支后页脚 git 分支未更新的问题。Git 使用原子写入（临时文件 + rename），这会改变 inode 并破坏对文件的 `fs.watch`。现在改为监视目录。
- 扩展加载错误现在显示给用户，而非被静默忽略 ([#639](https://github.com/badlogic/pi-mono/pull/639) 作者 [@aliou](https://github.com/aliou))

## [0.42.5] - 2026-01-11

### 修复

- 通过仅重新渲染已更改的行减少闪烁 ([#617](https://github.com/badlogic/pi-mono/pull/617) 作者 [@ogulcancelik](https://github.com/ogulcancelik))。不过别担心，VS Code Terminal 仍然会有一点闪烁。赞美闪烁。
- 剩余行不变时，内容缩小的光标位置跟踪
- 若终端在挂起期间调整大小，挂起/恢复后 TUI 以错误尺寸渲染 ([#599](https://github.com/badlogic/pi-mono/issues/599))
- 含 Kitty 按键释放模式的粘贴内容（例如 MAC 地址中的 `:3F`）被错误过滤掉 ([#623](https://github.com/badlogic/pi-mono/pull/623) 作者 [@ogulcancelik](https://github.com/ogulcancelik))

## [0.42.4] - 2026-01-10

### 修复

- Bash 输出展开提示现在显示 “(ctrl+o to collapse)” ([#610](https://github.com/badlogic/pi-mono/pull/610) 作者 [@tallshort](https://github.com/tallshort))
- 通过使用流式 TextDecoder 修复远程 bash 执行（SSH、容器）中的 UTF-8 文本损坏 ([#608](https://github.com/badlogic/pi-mono/issues/608))

## [0.42.3] - 2026-01-10

### 变更

- OpenAI Codex：更新为使用上游捆绑的系统提示词

## [0.42.2] - 2026-01-10

### 新增

- `/model <search>` 现在会预先筛选模型选择器，或在精确匹配时自动选择。使用 `provider/model` 语法消除歧义（例如 `/model openai/gpt-4`）。([#587](https://github.com/badlogic/pi-mono/pull/587) 作者 [@zedrdave](https://github.com/zedrdave))
- 用于自定义页脚的 `FooterDataProvider`：`ctx.ui.setFooter()` 现在接收第三个 `footerData` 参数，提供 `getGitBranch()`、`getExtensionStatuses()` 和 `onBranchChange()`，以支持响应式更新 ([#600](https://github.com/badlogic/pi-mono/pull/600) 作者 [@nicobailon](https://github.com/nicobailon))
- `Alt+Up` 热键，可在不中止当前运行的情况下将已排队的引导/后续消息恢复至编辑器 ([#604](https://github.com/badlogic/pi-mono/pull/604) 作者 [@tmustier](https://github.com/tmustier))

### 修复

- 修复 ai provider 中用于 OpenAI Responses 工具 strict 映射的 LM Studio 兼容性 ([#598](https://github.com/badlogic/pi-mono/pull/598) 作者 [@gnattu](https://github.com/gnattu))

## [0.42.1] - 2026-01-09

### 修复

- 加载提示词模板时，现在会跟随 `prompts/` 文件夹中的符号链接目录 ([#601](https://github.com/badlogic/pi-mono/pull/601) 作者 [@aliou](https://github.com/aliou))

## [0.42.0] - 2026-01-09

### 新增

- 新增 OpenCode Zen provider 支持。设置 `OPENCODE_API_KEY` 环境变量并使用 `opencode/<model-id>`（例如 `opencode/claude-opus-4-5`）。

## [0.41.0] - 2026-01-09

### 新增

- Anthropic OAuth 支持回归！使用 `/login` 通过 Claude Pro/Max 订阅进行认证。

## [0.40.1] - 2026-01-09

### 移除

- Anthropic OAuth 支持（`/login`）。请改用 API 密钥。

## [0.40.0] - 2026-01-08

### 新增

- `docs/tui.md` 中关于组件失效和主题变更的文档

### 修复

- 组件现在会在主题变更时正确重建其内容（工具执行、assistant 消息、bash 执行、自定义消息、分支/压缩摘要）

## [0.39.1] - 2026-01-08

### 修复

- `setTheme()` 现在触发完整重新渲染，使先前渲染的组件使用新的主题颜色更新
- `mac-system-theme.ts` 示例现在每 2 秒轮询一次，并使用 `osascript` 实时检测 macOS 外观

## [0.39.0] - 2026-01-08

### 破坏性变更

- `before_agent_start` 事件现在在事件对象中接收 `systemPrompt`，并返回 `systemPrompt`（完整替换）而非 `systemPromptAppend`。此前追加内容的扩展现在必须使用 `event.systemPrompt + extra` 模式。([#575](https://github.com/badlogic/pi-mono/issues/575))
- `discoverSkills()` 现在返回 `{ skills: Skill[], warnings: SkillWarning[] }` 而非 `Skill[]`。这使调用方可处理技能加载警告。([#577](https://github.com/badlogic/pi-mono/pull/577) 作者 [@cv](https://github.com/cv))

### 新增

- 为扩展新增 `ctx.ui.getAllThemes()`、`ctx.ui.getTheme(name)` 和 `ctx.ui.setTheme(name | Theme)` 方法，以在运行时列出、加载和切换主题 ([#576](https://github.com/badlogic/pi-mono/pull/576))
- `--no-tools` 标志以禁用所有内置工具，允许仅扩展工具设置 ([#557](https://github.com/badlogic/pi-mono/pull/557) 作者 [@cv](https://github.com/cv))
- 内置工具的可插拔操作，支持通过 SSH 或其他传输方式进行远程执行 ([#564](https://github.com/badlogic/pi-mono/issues/564))。接口：`ReadOperations`、`WriteOperations`、`EditOperations`、`BashOperations`、`LsOperations`、`GrepOperations`、`FindOperations`
- `user_bash` 事件用于拦截用户 `!`/`!!` 命令，允许扩展将其重定向至远程系统 ([#528](https://github.com/badlogic/pi-mono/issues/528))
- ExtensionAPI 中的 `setActiveTools()`，用于动态工具管理
- 对工具覆盖自动使用内置渲染器，无需自定义 `renderCall`/`renderResult`
- `ssh.ts` 示例：通过 `--ssh user@host:/path` 远程执行工具
- `interactive-shell.ts` 示例：通过 `!i` 前缀或自动检测，以完整终端访问运行交互式命令（vim、git rebase、htop）
- Wayland 对 `/copy` 命令的剪贴板支持，使用 wl-copy 并回退至 xclip/xsel ([#570](https://github.com/badlogic/pi-mono/pull/570) 作者 [@OgulcanCelik](https://github.com/OgulcanCelik))
- **实验性：**`ctx.ui.custom()` 现在接受 `{ overlay: true }` 选项，用于浮动模态组件，这些组件在不清屏的情况下叠加在现有内容上 ([#558](https://github.com/badlogic/pi-mono/pull/558) 作者 [@nicobailon](https://github.com/nicobailon))
- `AgentSession.skills` 和 `AgentSession.skillWarnings` 属性，用于访问已加载技能而无需重新发现 ([#577](https://github.com/badlogic/pi-mono/pull/577) 作者 [@cv](https://github.com/cv))

### 修复

- `createAgentSession()` 中的字符串 `systemPrompt` 现在可作为完整替换使用，而非附加上下文文件和技能，符合文档行为 ([#543](https://github.com/badlogic/pi-mono/issues/543))
- Bun 二进制安装的更新通知现在显示发行版下载 URL，而非 npm 命令 ([#567](https://github.com/badlogic/pi-mono/pull/567) 作者 [@ferologics](https://github.com/ferologics))
- 自动重试后，在“Working...”状态下 ESC 键现在可用 ([#568](https://github.com/badlogic/pi-mono/pull/568) 作者 [@tmustier](https://github.com/tmustier))
- 中止消息现在显示正确的重试次数（例如 “Aborted after 2 retry attempts”）([#568](https://github.com/badlogic/pi-mono/pull/568) 作者 [@tmustier](https://github.com/tmustier))
- 修复 Antigravity provider 尽管有可用配额仍返回 429 错误的问题 ([#571](https://github.com/badlogic/pi-mono/pull/571) 作者 [@ben-vargas](https://github.com/ben-vargas))
- 修复 Gemini/Antigravity 响应中的错误思考文本，其中思考内容显示为普通文本，或反之。跨模型对话现在会正确将思考块转换为纯文本。([#561](https://github.com/badlogic/pi-mono/issues/561))
- `--no-skills` 标志现在可正确阻止在交互模式中加载技能 ([#577](https://github.com/badlogic/pi-mono/pull/577) 作者 [@cv](https://github.com/cv))

## [0.38.0] - 2026-01-08

### 破坏性变更

- `ctx.ui.custom()` 工厂签名从 `(tui, theme, done)` 改为 `(tui, theme, keybindings, done)`，以在自定义组件中访问键绑定
- `LoadedExtension` 类型重命名为 `Extension`
- 移除 `LoadExtensionsResult.setUIContext()`，替换为 `runtime: ExtensionRuntime`
- `ExtensionRunner` 构造函数现在要求将 `runtime: ExtensionRuntime` 作为第二个参数
- `ExtensionRunner.initialize()` 签名从 options 对象改为位置参数 `(actions, contextActions, commandContextActions?, uiContext?)`
- `ExtensionRunner.getHasUI()` 重命名为 `hasUI()`
- 移除 OpenAI Codex 模型别名（`gpt-5`、`gpt-5-mini`、`gpt-5-nano`、`codex-mini-latest`）。请使用规范 ID：`gpt-5.1`、`gpt-5.1-codex-mini`、`gpt-5.2`、`gpt-5.2-codex`。([#536](https://github.com/badlogic/pi-mono/pull/536) 作者 [@ghoulr](https://github.com/ghoulr))

### 新增

- `--no-extensions` 标志以禁用扩展发现，同时仍允许显式 `-e` 路径 ([#524](https://github.com/badlogic/pi-mono/pull/524) 作者 [@cv](https://github.com/cv))
- SDK：导出 `InteractiveMode`、`runPrintMode()`、`runRpcMode()`，用于构建自定义运行模式。参见 `docs/sdk.md`。
- `PI_SKIP_VERSION_CHECK` 环境变量，以在启动时禁用新版本通知 ([#549](https://github.com/badlogic/pi-mono/pull/549) 作者 [@aos](https://github.com/aos))
- `thinkingBudgets` 设置，以按思考级别为基于 token 的 provider 自定义 token 预算 ([#529](https://github.com/badlogic/pi-mono/pull/529) 作者 [@melihmucuk](https://github.com/melihmucuk))
- 扩展 UI 对话框（`ctx.ui.select()`、`ctx.ui.confirm()`、`ctx.ui.input()`）现在支持带实时倒计时显示的 `timeout` 选项 ([#522](https://github.com/badlogic/pi-mono/pull/522) 作者 [@nicobailon](https://github.com/nicobailon))
- 扩展现在可通过 `ctx.ui.setEditorComponent()` 提供自定义编辑器组件。参见 `examples/extensions/modal-editor.ts` 和 `docs/tui.md` 模式 7。
- 扩展工厂现在可以是异步的，支持动态导入和延迟加载的依赖 ([#513](https://github.com/badlogic/pi-mono/pull/513) 作者 [@austinm911](https://github.com/austinm911))
- `ctx.shutdown()` 现在可在扩展上下文中用于请求优雅关闭。在交互模式中，关闭会延后至代理空闲时（处理完所有排队的引导和后续消息后）。在 RPC 模式中，关闭会延后至完成当前命令响应后。在打印模式中，关闭为空操作，因为提示词完成后进程会自动退出。([#542](https://github.com/badlogic/pi-mono/pull/542) 作者 [@kaofelix](https://github.com/kaofelix))

### 修复

- 配置 `enabledModels` 时，设置中的默认思考级别现在可正确应用 ([#540](https://github.com/badlogic/pi-mono/pull/540) 作者 [@ferologics](https://github.com/ferologics))
- pi 运行期间对 `settings.json` 的外部编辑现在会在 pi 保存设置时保留 ([#527](https://github.com/badlogic/pi-mono/pull/527) 作者 [@ferologics](https://github.com/ferologics))
- 若错误来自其他模型或已由先前压缩处理，基于溢出的压缩现在会跳过 ([#535](https://github.com/badlogic/pi-mono/pull/535) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- 将 OpenAI Codex 上下文窗口从 400k token 降至 272k token，以匹配 Codex CLI 默认值并防止 400 错误 ([#536](https://github.com/badlogic/pi-mono/pull/536) 作者 [@ghoulr](https://github.com/ghoulr))
- 上下文溢出检测现在识别 `context_length_exceeded` 错误。
- 通过 SSH 批量输入时不再丢弃按键 ([#538](https://github.com/badlogic/pi-mono/issues/538))
- 剪贴板图像支持现在可在 Alpine Linux 和其他基于 musl 的发行版中工作 ([#533](https://github.com/badlogic/pi-mono/issues/533))

## [0.37.8] - 2026-01-07

## [0.37.7] - 2026-01-07

## [0.37.6] - 2026-01-06

### 新增

- 扩展 UI 对话框（`ctx.ui.select()`、`ctx.ui.confirm()`、`ctx.ui.input()`）现在接受可选 `AbortSignal`，以通过编程方式关闭对话框。适用于实现超时。参见 `examples/extensions/timed-confirm.ts`。([#474](https://github.com/badlogic/pi-mono/issues/474))
- HTML 导出现在会在 Codex 会话的模型变更消息中显示桥接提示词 ([#510](https://github.com/badlogic/pi-mono/pull/510) 作者 [@mitsuhiko](https://github.com/mitsuhiko))

## [0.37.5] - 2026-01-06

### 新增

- ExtensionAPI：`setModel()`、`getThinkingLevel()`、`setThinkingLevel()` 方法，供扩展在运行时变更模型和思考级别 ([#509](https://github.com/badlogic/pi-mono/issues/509))
- 为自定义工具导出截断工具：`truncateHead`、`truncateTail`、`truncateLine`、`formatSize`、`DEFAULT_MAX_BYTES`、`DEFAULT_MAX_LINES`、`TruncationOptions`、`TruncationResult`
- 新增示例 `truncated-tool.ts`，演示扩展使用自定义渲染正确截断输出
- 新增示例 `preset.ts`，演示具有模型/思考/工具切换的预设配置 ([#347](https://github.com/badlogic/pi-mono/issues/347))
- `docs/extensions.md` 中关于输出截断最佳实践的文档
- 为扩展导出所有 UI 组件：`ArminComponent`、`AssistantMessageComponent`、`BashExecutionComponent`、`BorderedLoader`、`BranchSummaryMessageComponent`、`CompactionSummaryMessageComponent`、`CustomEditor`、`CustomMessageComponent`、`DynamicBorder`、`ExtensionEditorComponent`、`ExtensionInputComponent`、`ExtensionSelectorComponent`、`FooterComponent`、`LoginDialogComponent`、`ModelSelectorComponent`、`OAuthSelectorComponent`、`SessionSelectorComponent`、`SettingsSelectorComponent`、`ShowImagesSelectorComponent`、`ThemeSelectorComponent`、`ThinkingSelectorComponent`、`ToolExecutionComponent`、`TreeSelectorComponent`、`UserMessageComponent`、`UserMessageSelectorComponent`，以及工具 `renderDiff`、`truncateToVisualLines`
- `docs/tui.md`：通用模式章节，包含 SelectList、BorderedLoader、SettingsList、setStatus、setWidget、setFooter 的可复制粘贴代码
- `docs/tui.md`：关键规则章节，记录扩展 UI 开发的关键模式
- `docs/extensions.md`：所有 ExtensionAPI 方法和事件的详尽示例链接
- 系统提示词现在引用 `docs/tui.md`，用于 TUI 组件开发

## [0.37.4] - 2026-01-06

### 新增

- 会话选择器（`pi -r`）和 `--session` 标志现在支持按会话 ID（UUID 前缀）搜索/恢复 ([#495](https://github.com/badlogic/pi-mono/issues/495) 作者 [@arunsathiya](https://github.com/arunsathiya))
- 扩展现在可使用 `ctx.ui.setHeader()` 替换启动标题，参见 `examples/extensions/custom-header.ts` ([#500](https://github.com/badlogic/pi-mono/pull/500) 作者 [@tudoroancea](https://github.com/tudoroancea))

### 变更

- 启动帮助文本：修复误导性的 “ctrl+k to delete line”，改为 “ctrl+k to delete to end”
- 启动帮助文本和 `/hotkeys`：新增 `!!` 快捷方式，可在不将输出添加至上下文的情况下运行 bash

### 修复

- 排队的引导/后续消息不再清除未发送的编辑器输入 ([#503](https://github.com/badlogic/pi-mono/pull/503) 作者 [@tmustier](https://github.com/tmustier))
- OAuth token 刷新失败不再在启动时导致应用崩溃，允许用户通过 `/login` 重新认证 ([#498](https://github.com/badlogic/pi-mono/issues/498))

## [0.37.3] - 2026-01-06

### 新增

- 扩展现在可使用 `ctx.ui.setFooter()` 替换页脚，参见 `examples/extensions/custom-footer.ts` ([#481](https://github.com/badlogic/pi-mono/issues/481))
- 会话 ID 现在会转发给 LLM provider 以进行基于会话的缓存（OpenAI Codex 使用此项进行提示词缓存）。
- 新增 `blockImages` 设置，以防止图像发送至 LLM provider ([#492](https://github.com/badlogic/pi-mono/pull/492) 作者 [@jsinge97](https://github.com/jsinge97))
- 扩展现在可通过 `pi.sendUserMessage()` 发送用户消息 ([#483](https://github.com/badlogic/pi-mono/issues/483))

### 修复

- 添加 `minimatch` 作为直接依赖以支持显式导入。
- 在 git worktree 中运行时，状态栏现在显示正确的 git 分支 ([#490](https://github.com/badlogic/pi-mono/pull/490) 作者 [@kcosr](https://github.com/kcosr))
- 交互模式：通过使用 `wl-paste` 并回退至 `xclip`，Ctrl+V 剪贴板图像粘贴现在可在 Wayland 会话中工作 ([#488](https://github.com/badlogic/pi-mono/pull/488) 作者 [@ghoulr](https://github.com/ghoulr))

## [0.37.2] - 2026-01-05

### 修复

- `settings.json` 中的扩展目录现在遵守 `package.json` manifest，与全局扩展行为一致 ([#480](https://github.com/badlogic/pi-mono/pull/480) 作者 [@prateekmedia](https://github.com/prateekmedia))
- 分享查看器：通过 `/share` 打开时，深层链接现在滚动至目标消息
- Bash 工具现在可优雅地处理 spawn 错误而非使代理崩溃（缺少 cwd、无效 shell 路径）([#479](https://github.com/badlogic/pi-mono/pull/479) 作者 [@robinwander](https://github.com/robinwander))

## [0.37.1] - 2026-01-05

### 修复

- 分享查看器：通过 `/share`（iframe 上下文）查看会话时，复制链接按钮现在生成正确 URL

## [0.37.0] - 2026-01-05

### 新增

- 分享查看器：消息上的复制链接按钮可分享直接导航至特定消息的 URL ([#477](https://github.com/badlogic/pi-mono/pull/477) 作者 [@lockmeister](https://github.com/lockmeister))
- 扩展示例：添加 `claude-rules`，将 `.claude/rules/` 条目加载到系统提示词中 ([#461](https://github.com/badlogic/pi-mono/pull/461) 作者 [@vaayne](https://github.com/vaayne))
- 无头 OAuth 登录：所有 provider 现在均显示手动输入 URL/代码的粘贴输入，可在无 DISPLAY 的 SSH 上工作 ([#428](https://github.com/badlogic/pi-mono/pull/428) 作者 [@ben-vargas](https://github.com/ben-vargas), [#468](https://github.com/badlogic/pi-mono/pull/468) 作者 [@crcatala](https://github.com/crcatala))

### 变更

- OAuth 登录 UI 现在使用具有一致边框的专用对话框组件
- 除 `dumb`、空或 `linux` 以外的所有终端均假定支持 truecolor（修复 SSH 上的颜色）
- OpenAI Codex 清理：移除每个思考级别的模型变体，思考级别现单独设置，provider 会在内部限制为各模型支持的范围（初始实现于 [#472](https://github.com/badlogic/pi-mono/pull/472)，作者 [@ben-vargas](https://github.com/ben-vargas)）

### 修复

- 压缩期间提交的消息会排队，并在压缩完成后交付，保留引导和后续行为。扩展命令会在压缩期间立即执行。([#476](https://github.com/badlogic/pi-mono/pull/476) 作者 [@tmustier](https://github.com/tmustier))
- 托管二进制文件（`fd`、`rg`）现在存储于 `~/.pi/agent/bin/` 而非 `tools/`，消除错误的弃用警告 ([#470](https://github.com/badlogic/pi-mono/pull/470) 作者 [@mcinteerj](https://github.com/mcinteerj))
- 未加载 `settings.json` 中定义的扩展 ([#463](https://github.com/badlogic/pi-mono/pull/463) 作者 [@melihmucuk](https://github.com/melihmucuk))
- 多个 pi 实例运行时，OAuth 刷新不再使用户登出 ([#466](https://github.com/badlogic/pi-mono/pull/466) 作者 [@Cursivez](https://github.com/Cursivez))
- 迁移警告现在会忽略 Windows 上 `tools/` 中的 `fd.exe` 和 `rg.exe` ([#458](https://github.com/badlogic/pi-mono/pull/458) 作者 [@carlosgtrz](https://github.com/carlosgtrz))
- CI：将 `examples/extensions/with-deps` 添加至 workspaces 以修复 typecheck ([#467](https://github.com/badlogic/pi-mono/pull/467) 作者 [@aliou](https://github.com/aliou))
- SDK：传递 `extensions: []` 现在会按文档禁用扩展发现 ([#465](https://github.com/badlogic/pi-mono/pull/465) 作者 [@aliou](https://github.com/aliou))

## [0.36.0] - 2026-01-05

### 新增

- 实验性：OpenAI Codex OAuth provider 支持：通过 `/login openai-codex`，使用 ChatGPT Plus/Pro 订阅访问 Codex 模型 ([#451](https://github.com/badlogic/pi-mono/pull/451) 作者 [@kim0](https://github.com/kim0))

## [0.35.0] - 2026-01-05

此版本将 hooks 和自定义工具统一为单一的“扩展”系统，并将“斜杠命令”重命名为“提示词模板”。([#454](https://github.com/badlogic/pi-mono/issues/454))

**迁移前请阅读：**

- [docs/extensions.md](docs/extensions.md) - 完整 API 参考
- [README.md](README.md) - 含示例的扩展章节
- [examples/extensions/](examples/extensions/) - 可运行示例

### 扩展迁移

Hooks 和自定义工具现统一为**扩展**。二者均为导出接收 API 对象的工厂函数的 TypeScript 模块。现在只有一个概念、一个发现位置、一个 CLI 标志和一个 settings.json 条目。

**自动迁移：**

- 启动时会自动将 `commands/` 目录重命名为 `prompts/`（同时适用于 `~/.pi/agent/commands/` 和 `.pi/commands/`）

**需要手动迁移：**

1. 将 `hooks/` 和 `tools/` 目录中的文件移至 `extensions/`（启动时显示弃用警告）
2. 更新扩展代码中的 import 和类型名称
3. 若配置了显式 hook 和自定义工具路径，请更新 `settings.json`

**目录变更：**

```
# Before
~/.pi/agent/hooks/*.ts       →  ~/.pi/agent/extensions/*.ts
~/.pi/agent/tools/*.ts       →  ~/.pi/agent/extensions/*.ts
.pi/hooks/*.ts               →  .pi/extensions/*.ts
.pi/tools/*.ts               →  .pi/extensions/*.ts
```

**扩展发现规则**（在 `extensions/` 目录中）：

1. **直接文件：**`extensions/*.ts` 或 `*.js` → 直接加载
2. **带 index 的子目录：**`extensions/myext/index.ts` → 作为单一扩展加载
3. **带 package.json 的子目录：**具有 `"pi"` 字段的 `extensions/myext/package.json` → 加载声明的路径

```json
// extensions/my-package/package.json
{
  "name": "my-extension-package",
  "dependencies": { "zod": "^3.0.0" },
  "pi": {
    "extensions": ["./src/main.ts", "./src/tools.ts"]
  }
}
```

不会递归超过一层。复杂包必须使用 `package.json` manifest。依赖通过 jiti 解析，扩展可发布至 npm 并从 npm 安装。

**类型重命名：**

- `HookAPI` → `ExtensionAPI`
- `HookContext` → `ExtensionContext`
- `HookCommandContext` → `ExtensionCommandContext`
- `HookUIContext` → `ExtensionUIContext`
- `CustomToolAPI` → `ExtensionAPI`（已合并）
- `CustomToolContext` → `ExtensionContext`（已合并）
- `CustomToolUIContext` → `ExtensionUIContext`
- `CustomTool` → `ToolDefinition`
- `CustomToolFactory` → `ExtensionFactory`
- `HookMessage` → `CustomMessage`

**Import 变更：**

```typescript
// Before (hook)
import type { HookAPI, HookContext } from "@mariozechner/pi-coding-agent";
export default function (pi: HookAPI) { ... }

// Before (custom tool)
import type { CustomToolFactory } from "@mariozechner/pi-coding-agent";
const factory: CustomToolFactory = (pi) => ({ name: "my_tool", ... });
export default factory;

// After (both are now extensions)
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => { ... });
  pi.registerTool({ name: "my_tool", ... });
}
```

**自定义工具现在拥有完整上下文访问权限。**通过 `pi.registerTool()` 注册的工具现在接收与事件 handler 相同的 `ctx` 对象。此前，自定义工具的上下文有限。现在所有扩展代码共享相同能力：

- `pi.registerTool()` - 注册 LLM 可调用的工具
- `pi.registerCommand()` - 注册如 `/mycommand` 的命令
- `pi.registerShortcut()` - 注册键盘快捷键（显示于 `/hotkeys`）
- `pi.registerFlag()` - 注册 CLI 标志（显示于 `--help`）
- `pi.registerMessageRenderer()` - 为消息类型自定义 TUI 渲染
- `pi.on()` - 订阅生命周期事件（tool_call、session_start 等）
- `pi.sendMessage()` - 向对话注入消息
- `pi.appendEntry()` - 在会话中持久化自定义数据（跨重启/分支保留）
- `pi.exec()` - 运行 shell 命令
- `pi.getActiveTools()` / `pi.setActiveTools()` - 动态启用/禁用工具
- `pi.getAllTools()` - 列出全部可用工具
- `pi.events` - 用于跨扩展通信的事件总线
- `ctx.ui.confirm()` / `select()` / `input()` - 用户提示
- `ctx.ui.notify()` - Toast 通知
- `ctx.ui.setStatus()` - 页脚中的持久状态（多个扩展可各自设置）
- `ctx.ui.setWidget()` - 编辑器上方的 widget 显示
- `ctx.ui.setTitle()` - 设置终端窗口标题
- `ctx.ui.custom()` - 带键盘处理的完整 TUI 组件
- `ctx.ui.editor()` - 支持外部编辑器的多行文本编辑器
- `ctx.sessionManager` - 读取会话条目、获取分支历史

**设置变更：**

```json
// Before
{
  "hooks": ["./my-hook.ts"],
  "customTools": ["./my-tool.ts"]
}

// After
{
  "extensions": ["./my-extension.ts"]
}
```

**CLI 变更：**

```bash
# Before
pi --hook ./safety.ts --tool ./todo.ts

# After
pi --extension ./safety.ts -e ./todo.ts
```

### 提示词模板迁移

“斜杠命令”（定义可通过 `/name` 调用的可重用提示词的 Markdown 文件）重命名为“提示词模板”，以避免与扩展注册的命令混淆。

**自动迁移：**启动时会自动将 `commands/` 目录重命名为 `prompts/`（若 `prompts/` 不存在）。适用于普通目录和符号链接。

**目录变更：**

```
~/.pi/agent/commands/*.md    →  ~/.pi/agent/prompts/*.md
.pi/commands/*.md            →  .pi/prompts/*.md
```

**SDK 类型重命名：**

- `FileSlashCommand` → `PromptTemplate`
- `LoadSlashCommandsOptions` → `LoadPromptTemplatesOptions`

**SDK 函数重命名：**

- `discoverSlashCommands()` → `discoverPromptTemplates()`
- `loadSlashCommands()` → `loadPromptTemplates()`
- `expandSlashCommand()` → `expandPromptTemplate()`
- `getCommandsDir()` → `getPromptsDir()`

**SDK 选项重命名：**

- `CreateAgentSessionOptions.slashCommands` → `.promptTemplates`
- `AgentSession.fileCommands` → `.promptTemplates`
- `PromptOptions.expandSlashCommands` → `.expandPromptTemplates`

### SDK 迁移

**发现函数：**

- `discoverAndLoadHooks()` → `discoverAndLoadExtensions()`
- `discoverAndLoadCustomTools()` → 合并至 `discoverAndLoadExtensions()`
- `loadHooks()` → `loadExtensions()`
- `loadCustomTools()` → 合并至 `loadExtensions()`

**Runner 和 wrapper：**

- `HookRunner` → `ExtensionRunner`
- `wrapToolsWithHooks()` → `wrapToolsWithExtensions()`
- `wrapToolWithHooks()` → `wrapToolWithExtensions()`

**CreateAgentSessionOptions：**

- `.hooks` → 已移除（对路径使用 `.additionalExtensionPaths`）
- `.additionalHookPaths` → `.additionalExtensionPaths`
- `.preloadedHooks` → `.preloadedExtensions`
- `.customTools` 类型变更：`Array<{ path?; tool: CustomTool }>` → `ToolDefinition[]`
- `.additionalCustomToolPaths` → 合并至 `.additionalExtensionPaths`
- `.slashCommands` → `.promptTemplates`

**AgentSession：**

- `.hookRunner` → `.extensionRunner`
- `.fileCommands` → `.promptTemplates`
- `.sendHookMessage()` → `.sendCustomMessage()`

### 会话迁移

**自动。**会话版本从 2 升至 3。现有会话会在首次加载时迁移：

- 消息角色 `"hookMessage"` → `"custom"`

### 破坏性变更

- **设置：**`hooks` 和 `customTools` 数组替换为单个 `extensions` 数组
- **CLI：**`--hook` 和 `--tool` 标志替换为 `--extension` / `-e`
- **目录：**`hooks/`、`tools/` → `extensions/`；`commands/` → `prompts/`
- **类型：**见上述类型重命名
- **SDK：**见上述 SDK 迁移

### 变更

- 扩展可以有自己的带依赖的 `package.json`（通过 jiti 解析）
- 文档：将 `docs/hooks.md` 和 `docs/custom-tools.md` 合并至 `docs/extensions.md`
- 示例：将 `examples/hooks/` 和 `examples/custom-tools/` 合并至 `examples/extensions/`
- README：扩展章节扩充了自定义工具、命令、事件、状态持久化、快捷键、标志和 UI 示例
- SDK：`customTools` 选项现在直接接受 `ToolDefinition[]`（从 `Array<{ path?, tool }>` 简化）
- SDK：`extensions` 选项接受用于内联扩展的 `ExtensionFactory[]`
- SDK：`additionalExtensionPaths` 替换 `additionalHookPaths` 和 `additionalCustomToolPaths`

## [0.34.2] - 2026-01-04

## [0.34.1] - 2026-01-04

### 新增

- Hook API：`ctx.ui.setTitle(title)` 允许 hook 设置终端窗口/标签标题 ([#446](https://github.com/badlogic/pi-mono/pull/446) 作者 [@aliou](https://github.com/aliou))

### 变更

- 扩展键绑定文档，列出全部 32 个支持的符号键，并说明 ctrl+symbol 行为 ([#450](https://github.com/badlogic/pi-mono/pull/450) 作者 [@kaofelix](https://github.com/kaofelix))

## [0.34.0] - 2026-01-04

### 新增

- Hook API：`pi.getActiveTools()` 和 `pi.setActiveTools(toolNames)`，用于从 hooks 动态启用/禁用工具
- Hook API：`pi.getAllTools()`，用于枚举所有已配置工具（通过 --tools 或默认的内置工具，以及自定义工具）
- Hook API：`pi.registerFlag(name, options)` 和 `pi.getFlag(name)`，用于 hooks 注册自定义 CLI 标志（自动解析）
- Hook API：`pi.registerShortcut(shortcut, options)`，用于 hooks 使用 `KeyId` 注册自定义键盘快捷键（例如 `Key.shift("p")`）。与内置快捷键冲突的项会跳过，hooks 间的冲突记录为警告。
- Hook API：`ctx.ui.setWidget(key, content)`，用于编辑器上方的状态显示。接受字符串数组或组件工厂函数。
- Hook API：`theme.strikethrough(text)`，用于删除线文本样式
- Hook API：`before_agent_start` handler 现在可返回 `systemPromptAppend`，以在该轮次向系统提示词动态追加文本。多个 hook 的追加内容会串联。
- Hook API：`before_agent_start` handler 现在可返回多条消息（会注入全部消息，而非仅第一条）
- `/hotkeys` 命令现在会在独立“Hooks”章节显示 hook 注册的快捷键
- 新增示例 hook：`plan-mode.ts` - Claude Code 风格只读探索模式：
  - 通过 `/plan` 命令、`Shift+P` 快捷键或 `--plan` CLI 标志切换
  - 只读工具：`read`、`bash`、`grep`、`find`、`ls`（无 `edit`/`write`）
  - Bash 命令限制为非破坏性操作（阻止 `rm`、`mv`、`git commit`、`npm install` 等）
  - 每次响应后提供交互式提示：执行计划、保持计划模式或优化
  - 显示带复选框和已完成项删除线的 Todo 列表 widget
  - 每个 todo 均有唯一 ID；代理通过输出 `[DONE:id]` 标记完成项
  - 通过 `agent_end` hook 更新进度（从最终消息解析已完成项）
  - `/todos` 命令查看当前计划进度
  - 处于计划模式时在页脚显示 `⏸ plan` 指示器，执行时显示 `📋 2/5`
  - 状态跨会话持久化（包括 todo 进度）
- 新增示例 hook：`tools.ts` - 具有会话持久化的交互式 `/tools` 命令，用于启用/禁用工具
- 新增示例 hook：`pirate.ts` - 演示 `systemPromptAppend` 以使代理用海盗口吻说话
- 工具注册表现在包含所有内置工具（read、bash、edit、write、grep、find、ls），即使 `--tools` 限制初始活动集合。Hooks 可通过 `pi.setActiveTools()` 从注册表中启用任何工具。
- 通过 `setActiveTools()` 更改工具时，系统提示词现在会自动重建，更新工具描述和指南以匹配新工具集
- Hook 错误现在显示完整堆栈跟踪，以便更轻松调试
- 事件总线（`pi.events`）用于工具/hook 通信：自定义工具和 hooks 之间共享的发布/订阅
- 自定义工具现在可使用 `pi.sendMessage()` 直接向代理会话发送消息，无需事件总线
- `sendMessage()` 支持 `deliverAs: "nextTurn"`，以将消息排队到下一条用户提示词

### 变更

- 移除复制粘贴后的图像占位符，改为直接插入图像文件路径。([#442](https://github.com/badlogic/pi-mono/pull/442) 作者 [@mitsuhiko](https://github.com/mitsuhiko))

### 修复

- 通过使用流式 TextDecoder 而非 Buffer.toString() 修复 bash executor 中潜在的文本解码问题
- 外部编辑器 (Ctrl-G) 现在显示完整粘贴内容，而非 `[paste #N ...]` 占位符 ([#444](https://github.com/badlogic/pi-mono/pull/444) 作者 [@aliou](https://github.com/aliou))

## [0.33.0] - 2026-01-04

### 破坏性变更

- **从 `@mariozechner/pi-tui` 移除按键检测函数**：所有 `isXxx()` 按键检测函数（`isEnter()`、`isEscape()`、`isCtrlC()` 等）均已移除。请改用 `matchesKey(data, keyId)`（例如 `matchesKey(data, "enter")`、`matchesKey(data, "ctrl+c")`）。这会影响使用 `ctx.ui.custom()` 处理键盘输入的 hooks 和自定义工具。([#405](https://github.com/badlogic/pi-mono/pull/405))

### 新增

- 通过 `Ctrl+V` 支持剪贴板图像粘贴。图像保存至临时文件并附加到消息。适用于 macOS、Windows 和 Linux (X11)。([#419](https://github.com/badlogic/pi-mono/issues/419))
- 通过 `~/.pi/agent/keybindings.json` 提供可配置键绑定。所有键盘快捷键（编辑器导航、删除、如模型循环的应用操作等）现在均可自定义。支持为每项操作设置多个绑定。([#405](https://github.com/badlogic/pi-mono/pull/405) 作者 [@hjanuschka](https://github.com/hjanuschka))
- `/quit` 和 `/exit` 斜杠命令，用于优雅退出应用。与双 Ctrl+C 不同，这些命令会在退出前正确等待 hook 和自定义工具清理 handler。([#426](https://github.com/badlogic/pi-mono/pull/426) 作者 [@ben-vargas](https://github.com/ben-vargas))

### 修复

- 子代理示例 README 错误引用文件名 `subagent.ts` 而非 `index.ts` ([#427](https://github.com/badlogic/pi-mono/pull/427) 作者 [@Whamp](https://github.com/Whamp))

## [0.32.3] - 2026-01-03

### 修复

- `--list-models` 不再显示未配置显式认证的 Google Vertex AI 模型
- JPEG/GIF/WebP 图像未在使用 Kitty 图形协议的终端（Kitty、Ghostty、WezTerm）中显示。该协议要求 PNG 格式，因此非 PNG 图像现在会在显示前转换。
- 修复阻止更新通知工作的版本检查 URL 拼写错误 ([#423](https://github.com/badlogic/pi-mono/pull/423) 作者 [@skuridin](https://github.com/skuridin))
- 超出 Anthropic 5MB 限制的大型图像现在会以逐步降低质量/尺寸的方式重试 ([#424](https://github.com/badlogic/pi-mono/pull/424) 作者 [@mitsuhiko](https://github.com/mitsuhiko))

## [0.32.2] - 2026-01-03

### 新增

- 为自定义斜杠命令新增 `$ARGUMENTS` 语法，作为连接全部参数的 `$@` 替代方式。与 Claude、Codex 和 OpenCode 使用的模式保持一致。两种语法均完全支持。([#418](https://github.com/badlogic/pi-mono/pull/418) 作者 [@skuridin](https://github.com/skuridin))

### 变更

- **斜杠命令和 hook 命令现在可在流式处理期间工作**：此前，在代理流式处理时使用斜杠命令或 hook 命令会以 “Agent is already processing” 崩溃。现在：
  - Hook 命令立即执行（它们通过 `pi.sendMessage()` 管理自己的 LLM 交互）
  - 基于文件的斜杠命令通过 steer/followUp 展开并排队
  - `steer()` 和 `followUp()` 现在会展开基于文件的斜杠命令，并对 hook 命令报错（hook 命令无法排队）
  - `prompt()` 接受新的 `streamingBehavior` 选项（`"steer"` 或 `"followUp"`），用于指定流式处理期间的排队行为
  - RPC `prompt` 命令现在接受可选 `streamingBehavior` 字段
    ([#420](https://github.com/badlogic/pi-mono/issues/420))

### 修复

- 斜杠命令参数替换现在会在全参数（`$@`、`$ARGUMENTS`）之前处理位置参数（`$1`、`$2` 等），以防止参数值包含如 `$100` 的美元符号-数字模式时发生递归替换。([#418](https://github.com/badlogic/pi-mono/pull/418) 作者 [@skuridin](https://github.com/skuridin))

## [0.32.1] - 2026-01-03

### 新增

- 不贡献上下文的 shell 命令：使用 `!!command` 执行 bash 命令，该命令会显示在 TUI 中并保存至会话历史，但不包含在 LLM 上下文中。适用于运行不希望 AI 看到的命令。([#414](https://github.com/badlogic/pi-mono/issues/414))

### 修复

- 修复 edit 工具 diff 因异步预览计算与工具执行之间的竞争条件未在 TUI 中显示的问题

## [0.32.0] - 2026-01-03

### 破坏性变更

- **Queue API 替换为 steer/followUp**：`queueMessage()` 方法已拆分为两个具有不同交付语义的方法 ([#403](https://github.com/badlogic/pi-mono/issues/403))：
  - `steer(text)`：在代理运行中中断代理（流式处理时按 Enter）。在当前工具执行后交付。
  - `followUp(text)`：等待代理完成（流式处理时按 Alt+Enter）。仅在代理停止时交付。
- **设置重命名**：`queueMode` 设置重命名为 `steeringMode`。新增 `followUpMode` 设置。旧 settings.json 文件会自动迁移。
- **AgentSession 方法重命名：**
  - `queueMessage()` → `steer()` 和 `followUp()`
  - `queueMode` getter → `steeringMode` 和 `followUpMode` getters
  - `setQueueMode()` → `setSteeringMode()` 和 `setFollowUpMode()`
  - `queuedMessageCount` → `pendingMessageCount`
  - `getQueuedMessages()` → `getSteeringMessages()` 和 `getFollowUpMessages()`
  - `clearQueue()` 现在返回 `{ steering: string[], followUp: string[] }`
  - `hasQueuedMessages()` → `hasPendingMessages()`
- **Hook API 签名变更**：`pi.sendMessage()` 的第二个参数从 `triggerTurn?: boolean` 改为 `options?: { triggerTurn?, deliverAs? }`。使用 `deliverAs: "followUp"` 进行后续交付。这会影响 hooks 和内部 `sendHookMessage()` 方法。
- **RPC API 变更：**
  - `queue_message` 命令 → `steer` 和 `follow_up` 命令
  - `set_queue_mode` 命令 → `set_steering_mode` 和 `set_follow_up_mode` 命令
  - `RpcSessionState.queueMode` → `steeringMode` 和 `followUpMode`
- **设置 UI：**“Queue mode”设置拆分为“Steering mode”和“Follow-up mode”

### 新增

- 可配置双 Escape 操作：选择编辑器为空时双 Escape 打开 `/tree`（默认）或 `/branch`。通过 `/settings` 或 settings.json 中的 `doubleEscapeAction` 配置 ([#404](https://github.com/badlogic/pi-mono/issues/404))
- Vertex AI provider（`google-vertex`）：使用 Application Default Credentials 通过 Google Cloud Vertex AI 访问 Gemini 模型 ([#300](https://github.com/badlogic/pi-mono/pull/300) 作者 [@default-anton](https://github.com/default-anton))
- `models.json` 中的内置 provider 覆盖：仅覆盖 `baseUrl` 以通过代理路由内置 provider，同时保留其全部模型；或定义 `models` 以完全替换 provider ([#406](https://github.com/badlogic/pi-mono/pull/406) 作者 [@yevhen](https://github.com/yevhen))
- 自动调整图像大小：大于 2000x2000 的图像会调整大小以获得更好的模型兼容性。原始尺寸会注入提示词。通过 `/settings` 或 settings.json 中的 `images.autoResize` 控制。([#402](https://github.com/badlogic/pi-mono/pull/402) 作者 [@mitsuhiko](https://github.com/mitsuhiko))
- 代理流式处理时使用 Alt+Enter 键绑定排队后续消息
- 为使用 `ctx.ui.custom()` 的 hooks 导出 `Theme` 和 `ThemeColor` 类型
- 终端窗口标题现在显示 “pi - dirname”，以标识所在的项目会话 ([#407](https://github.com/badlogic/pi-mono/pull/407) 作者 [@kaofelix](https://github.com/kaofelix))

### 变更

- 编辑器组件现在使用单词换行而非字符级换行，以提高可读性 ([#382](https://github.com/badlogic/pi-mono/pull/382) 作者 [@nickseelert](https://github.com/nickseelert))

### 修复

- `/model` 选择器现在立即打开，而非等待 OAuth token 刷新。Token 刷新会延后至实际使用模型时。
- Shift+Space、Shift+Backspace 和 Shift+Delete 现在可在 Kitty 协议终端（Kitty、WezTerm 等）中正确工作，而非被静默忽略 ([#411](https://github.com/badlogic/pi-mono/pull/411) 作者 [@nathyong](https://github.com/nathyong))
- `AgentSession.prompt()` 现在在代理已流式处理时抛出异常，以防止竞争条件。请使用 `steer()` 或 `followUp()` 在流式处理期间排队消息。
- Ctrl+C 现在在选择器组件中与 Escape 一样工作，因此连续按 Ctrl+C 最终会关闭程序 ([#400](https://github.com/badlogic/pi-mono/pull/400) 作者 [@mitsuhiko](https://github.com/mitsuhiko))

## [0.31.1] - 2026-01-02

### 已修复

- 在模型加载完成前按方向键时，模型选择器不再允许负索引（[#398](https://github.com/badlogic/pi-mono/pull/398)，作者 [@mitsuhiko](https://github.com/mitsuhiko)）
- 类型守卫函数（`isBashToolResult` 等）现已在运行时导出，而不仅是在类型声明中导出（[#397](https://github.com/badlogic/pi-mono/issues/397)）

## [0.31.0] - 2026-01-02

此版本引入了用于原地分支的会话树、对 hooks 和自定义工具的重大 API 变更，以及带文件跟踪的结构化压缩。

### 会话树

会话现在使用带有 `id`/`parentId` 字段的树结构。这支持原地分支：通过 `/tree` 导航至任何先前节点，从那里继续，并在保留单个文件中所有历史记录的同时切换分支。

**现有会话会在首次加载时自动迁移**（v1 → v2）。无需手动操作。

新增条目类型：`BranchSummaryEntry`（来自已放弃分支的上下文）、`CustomEntry`（hook 状态）、`CustomMessageEntry`（由 hook 注入的消息）、`LabelEntry`（书签）。

有关文件格式和 `SessionManager` API，请参阅 [docs/session.md](docs/session.md)。

### Hooks 迁移

hooks API 已重构，提供更细粒度的事件和更好的会话访问能力。

**类型重命名：**

- `HookEventContext` → `HookContext`
- `HookCommandContext` 现为扩展 `HookContext` 的新接口，包含会话控制方法

**事件变更：**

- 原本单一的 `session` 事件现拆分为细粒度事件：`session_start`、`session_before_switch`、`session_switch`、`session_before_branch`、`session_branch`、`session_before_compact`、`session_compact`、`session_shutdown`
- `session_before_switch` 和 `session_switch` 事件现在包含 `reason: "new" | "resume"`，以区分 `/new` 与 `/resume`
- 新增用于 `/tree` 导航的 `session_before_tree` 和 `session_tree` 事件（hook 可提供自定义分支摘要）
- 新增 `before_agent_start` 事件：在代理循环开始前注入消息
- 新增 `context` 事件：在每次 LLM 调用前以非破坏方式修改消息
- 会话条目不再在事件中传递。请改用 `ctx.sessionManager.getEntries()` 或 `ctx.sessionManager.getBranch()`

**API 变更：**

- `pi.send(text, attachments?)` → `pi.sendMessage(message, triggerTurn?)`（创建 `CustomMessageEntry`）
- 新增 `pi.appendEntry(customType, data?)`，用于 hook 状态持久化（不在 LLM 上下文中）
- 新增 `pi.registerCommand(name, options)`，用于自定义斜杠命令（处理器接收 `HookCommandContext`）
- 新增 `pi.registerMessageRenderer(customType, renderer)`，用于自定义 TUI 渲染
- 新增 `ctx.isIdle()`、`ctx.abort()`、`ctx.hasQueuedMessages()`，用于代理状态（所有事件中均可用）
- 新增 `ctx.ui.editor(title, prefill?)`，用于多行文本编辑，并支持 Ctrl+G 外部编辑器
- 新增 `ctx.ui.custom(component)`，用于具有键盘焦点的完整 TUI 组件渲染
- 新增 `ctx.ui.setStatus(key, text)`，用于页脚持久状态文本（多个 hook 可设置各自文本）
- 新增 `ctx.ui.theme` getter，用主题颜色为文本设置样式
- `ctx.exec()` 移至 `pi.exec()`
- `ctx.sessionFile` → `ctx.sessionManager.getSessionFile()`
- 新增 `ctx.modelRegistry` 和 `ctx.model`，用于 API 密钥解析

**HookCommandContext（仅斜杠命令）：**

- `ctx.waitForIdle()` - 等待代理完成流式输出
- `ctx.newSession(options?)` - 创建可带可选设置回调的新会话
- `ctx.fork(entryId) - 从指定条目分叉，创建新会话文件
- `ctx.navigateTree(targetId, options?)` - 导航会话树

这些方法仅存在于 `HookCommandContext`（而非 `HookContext`）中，因为从代理循环内运行的事件处理器中调用它们可能导致死锁。

**已移除：**

- `hookTimeout` 设置（hook 不再有超时；使用 Ctrl+C 中止）
- `resolveApiKey` 参数（使用 `ctx.modelRegistry.getApiKey(model)`）

有关当前 API，请参阅 [docs/hooks.md](docs/hooks.md) 和 [examples/hooks/](examples/hooks/)。

### 自定义工具迁移

自定义工具 API 已重构为通过上下文对象镜像 hooks 模式。

**类型重命名：**

- `CustomAgentTool` → `CustomTool`
- `ToolAPI` → `CustomToolAPI`
- `ToolContext` → `CustomToolContext`
- `ToolSessionEvent` → `CustomToolSessionEvent`

**execute 签名变更：**

```typescript
// 之前（v0.30.2）
execute(toolCallId, params, signal, onUpdate)

// 之后
execute(toolCallId, params, onUpdate, ctx, signal?)
```

新的 `ctx: CustomToolContext` 提供 `sessionManager`、`modelRegistry`、`model` 和代理状态方法：

- `ctx.isIdle()` - 检查代理是否正在流式输出
- `ctx.hasQueuedMessages()` - 检查用户是否有排队消息（跳过交互提示）
- `ctx.abort()` - 中止当前操作（即发即弃）

**会话事件变更：**

- `CustomToolSessionEvent` 现在仅包含 `reason` 和 `previousSessionFile`
- 会话条目不再位于事件中。使用 `ctx.sessionManager.getBranch()` 或 `ctx.sessionManager.getEntries()` 重建状态
- 原因：`"start" | "switch" | "branch" | "tree" | "shutdown"`（没有单独的 `"new"` 原因；`/new` 触发 `"switch"`）
- 已移除 `dispose()` 方法。使用 `reason: "shutdown"` 的 `onSession` 进行清理

有关当前 API，请参阅 [docs/custom-tools.md](docs/custom-tools.md) 和 [examples/custom-tools/](examples/custom-tools/)。

### SDK 迁移

**类型变更：**

- `CustomAgentTool` → `CustomTool`
- `AppMessage` → `AgentMessage`
- `sessionFile` 返回 `string | undefined`（原为 `string | null`）
- `model` 返回 `Model | undefined`（原为 `Model | null`）
- 已移除 `Attachment` 类型。请改用 `@mariozechner/pi-ai` 中的 `ImageContent`。直接将图像添加到消息内容数组。

**AgentSession API：**

- `branch(entryIndex: number)` → `branch(entryId: string)`
- `getUserMessagesForBranching()` 现在返回 `{ entryId, text }`，而非 `{ entryIndex, text }`
- `reset()` → `newSession(options?)`，其中 options 带有用于谱系跟踪的可选 `parentSession`
- `newSession()` 和 `switchSession()` 现在返回 `Promise<boolean>`（若被 hook 取消则为 false）
- 新增 `navigateTree(targetId, options?)`，用于原地树导航

**Hook 集成：**

- 新增 `sendHookMessage(message, triggerTurn?)`，用于 hook 消息注入

**SessionManager API：**

- 方法重命名：`saveXXX()` → `appendXXX()`（例如 `appendMessage`、`appendCompaction`）
- `branchInPlace()` → `branch()`
- `reset()` → `newSession(options?)`，带有用于谱系跟踪的可选 `parentSession`
- `createBranchedSessionFromEntries(entries, index)` → `createBranchedSession(leafId)`
- `SessionHeader.branchedFrom` → `SessionHeader.parentSession`
- `saveCompaction(entry)` → `appendCompaction(summary, firstKeptEntryId, tokensBefore, details?)`
- `getEntries()` 现不包含会话头部（请单独使用 `getHeader()`）
- `getSessionFile()` 返回 `string | undefined`（内存中会话返回 undefined）
- 新增树方法：`getTree()`、`getBranch()`、`getLeafId()`、`getLeafEntry()`、`getEntry()`、`getChildren()`、`getLabel()`
- 新增追加方法：`appendCustomEntry()`、`appendCustomMessageEntry()`、`appendLabelChange()`
- 新增分支方法：`branch(entryId)`、`branchWithSummary()`

**ModelRegistry（新增）：**

`ModelRegistry` 是管理模型发现和 API 密钥解析的新类。它将内置模型与来自 `models.json` 的自定义模型结合，并通过 `AuthStorage` 解析 API 密钥。

```typescript
import {
  discoverAuthStorage,
  discoverModels,
} from "@mariozechner/pi-coding-agent";

const authStorage = discoverAuthStorage(); // ~/.pi/agent/auth.json
const modelRegistry = discoverModels(authStorage); // + ~/.pi/agent/models.json

// Get all models (built-in + custom)
const allModels = modelRegistry.getAll();

// Get only models with valid API keys
const available = await modelRegistry.getAvailable();

// Find specific model
const model = modelRegistry.find("anthropic", "claude-sonnet-4-20250514");

// Get API key for a model
const apiKey = await modelRegistry.getApiKey(model);
```

这取代了旧的 `resolveApiKey` 回调模式。hooks 和自定义工具通过 `ctx.modelRegistry` 访问它。

**重命名的导出：**

- `messageTransformer` → `convertToLlm`
- 已移除 `SessionContext` 别名 `LoadedSession`

有关当前 API，请参阅 [docs/sdk.md](docs/sdk.md) 和 [examples/sdk/](examples/sdk/)。

### RPC 迁移

**会话命令：**

- `reset` 命令 → 带可选 `parentSession` 字段的 `new_session` 命令

**分支命令：**

- `branch` 命令：`entryIndex` → `entryId`
- `get_branch_messages` 响应：`entryIndex` → `entryId`

**类型变更：**

- 消息现为 `AgentMessage`（原为 `AppMessage`）
- `prompt` 命令：`attachments` 字段替换为使用 `ImageContent` 格式的 `images` 字段

**压缩事件：**

- `auto_compaction_start` 现在包含 `reason` 字段（`"threshold"` 或 `"overflow"`）
- `auto_compaction_end` 现在包含 `willRetry` 字段
- `compact` 响应包含完整的 `CompactionResult`（`summary`、`firstKeptEntryId`、`tokensBefore`、`details`）

有关当前协议，请参阅 [docs/rpc.md](docs/rpc.md)。

### 结构化压缩

压缩和分支摘要现在使用结构化输出格式：

- 清晰分节：目标、进度、关键信息、文件操作
- 文件跟踪：`details` 中的 `readFiles` 和 `modifiedFiles` 数组，跨压缩累积
- 对话会在摘要前序列化为文本，防止模型“继续”它们

`before_compact` 和 `before_tree` hook 事件允许自定义压缩实现。请参阅 [docs/compaction.md](docs/compaction.md)。

### 交互模式

**`/tree` 命令：**

- 原地导航完整会话树
- 通过输入搜索，用 ←/→ 翻页
- 过滤模式（Ctrl+O）：默认 → 无工具 → 仅用户 → 仅带标签 → 全部
- 按 `l` 将条目标记为书签
- 选择分支会切换上下文，并可选择注入已放弃分支的摘要

**条目标签：**

- 通过 `/tree` → 选择 → `l` 为任何条目添加书签
- 标签显示在树视图中，并作为 `LabelEntry` 持久保存

**主题变更（对自定义主题为破坏性变更）：**

自定义主题必须添加以下新颜色令牌，否则将无法加载：

- `selectedBg`：树选择器和其他组件中选定/高亮项目的背景
- `customMessageBg`：由 hook 注入的消息（`CustomMessageEntry`）的背景
- `customMessageText`：hook 消息的文本颜色
- `customMessageLabel`：hook 消息的标签颜色（`[customType]` 前缀）

颜色总数从 46 增至 50。有关完整颜色列表，请参阅 [docs/themes.md](docs/themes.md)，并从内置深色/浅色主题复制值。

**设置：**

- `enabledModels`：`settings.json` 中的模型允许列表（格式与 `--models` CLI 相同）

### 已添加

- `ctx.ui.setStatus(key, text)`，供 hooks 在页脚显示持久状态文本（[#385](https://github.com/badlogic/pi-mono/pull/385)，作者 [@prateekmedia](https://github.com/prateekmedia)）
- `ctx.ui.theme` getter，用主题颜色为状态文本和其他输出设置样式
- `/share` 命令，将会话上传为秘密 GitHub gist，并通过 pi.dev 获取可共享 URL（[#380](https://github.com/badlogic/pi-mono/issues/380)）
- HTML 导出现在包含用于导航会话分支的树形可视化侧边栏（[#375](https://github.com/badlogic/pi-mono/issues/375)）
- HTML 导出支持键盘快捷键：Ctrl+T 切换思考块，Ctrl+O 切换工具输出
- HTML 导出通过主题 JSON 中可选的 `export` 节支持主题可配置背景颜色（[#387](https://github.com/badlogic/pi-mono/pull/387)，作者 [@mitsuhiko](https://github.com/mitsuhiko)）
- HTML 导出语法高亮现在使用主题颜色，并与 TUI 渲染一致
- **贪吃蛇游戏示例 hook**：演示 `ui.custom()`、`registerCommand()` 和会话持久化。请参阅 [examples/hooks/snake.ts](examples/hooks/snake.ts)。
- **`thinkingText` 主题令牌**：用于思考块文本的可配置颜色。（[#366](https://github.com/badlogic/pi-mono/pull/366)，作者 [@paulbettner](https://github.com/paulbettner)）

### 已更改

- **条目 ID**：会话条目现在使用短的 8 字符十六进制 ID，而非完整 UUID
- **API 密钥优先级**：`ANTHROPIC_OAUTH_TOKEN` 现在优先于 `ANTHROPIC_API_KEY`
- HTML 导出模板已拆分为独立文件（template.html、template.css、template.js），便于维护

### 已修复

- HTML 导出现在可正确清理包含 `<style>` 等 HTML 标签、可能破坏 DOM 渲染的用户消息
- 显示包含 U+0600-U+0604 等 Unicode 格式字符的 bash 输出时崩溃（[#372](https://github.com/badlogic/pi-mono/pull/372)，作者 [@HACKE-RC](https://github.com/HACKE-RC)）
- **页脚显示完整会话统计**：令牌用量和成本现在包含所有消息，而不只是在压缩后的消息。（[#322](https://github.com/badlogic/pi-mono/issues/322)）
- **状态消息刷屏聊天日志**：快速变更设置（例如通过 Shift+Tab 变更思考级别）会添加多条状态行。连续状态更新现在合并为单行。（[#365](https://github.com/badlogic/pi-mono/pull/365)，作者 [@paulbettner](https://github.com/paulbettner)）
- **流式输出期间切换思考块不显示内容**：流式输出时按 Ctrl+T 会隐藏当前消息，直至流式输出完成。
- **恢复会话会将思考级别重置为关闭**：初始模型和思考级别未保存到会话文件，导致 `--resume`/`--continue` 默认使用 `off`。（[#342](https://github.com/badlogic/pi-mono/issues/342)，作者 [@aliou](https://github.com/aliou)）
- **Hook `tool_result` 事件忽略自定义工具错误**：工具抛出错误时从不发出 `tool_result` hook 事件，成功执行时总是 `isError: false`。现在在成功和错误两种情况下均以正确的 `isError` 值发出事件。（[#374](https://github.com/badlogic/pi-mono/issues/374)，作者 [@nicobailon](https://github.com/nicobailon)）
- **由于 CRLF 行尾，编辑工具在 Windows 上失败**：当 LLM 发送仅 LF 文本时，带 CRLF 行尾的文件现在能正确匹配。匹配前会规范化行尾，写入时恢复原始样式。（[#355](https://github.com/badlogic/pi-mono/issues/355)，作者 [@Pratham-Dubey](https://github.com/Pratham-Dubey)）
- **编辑工具在带 UTF-8 BOM 的文件上失败**：由于 LLM 不包含不可见 BOM 字符，带 UTF-8 BOM 标记的文件可能导致“未找到文本”错误。现在会在匹配前移除 BOM，并在写入时恢复。（[#394](https://github.com/badlogic/pi-mono/pull/394)，作者 [@prathamdby](https://github.com/prathamdby)）
- **Unix 上使用 bash 而非 sh**：修复 Unix 系统上使用 `/bin/sh` 而非 `/bin/bash` 的 shell 命令。（[#328](https://github.com/badlogic/pi-mono/pull/328)，作者 [@dnouri](https://github.com/dnouri)）
- **OAuth 登录 URL 可点击**：使终端中的 OAuth 登录 URL 可点击。（[#349](https://github.com/badlogic/pi-mono/pull/349)，作者 [@Cursivez](https://github.com/Cursivez)）
- **改进错误消息**：缺少 `apiKey` 或 `model` 时提供更好的错误消息。（[#346](https://github.com/badlogic/pi-mono/pull/346)，作者 [@ronyrus](https://github.com/ronyrus)）
- **会话文件验证**：`findMostRecentSession()` 现在会在返回前验证会话头部，防止加载非会话 JSONL 文件
- **压缩错误处理**：`generateSummary()` 和 `generateTurnPrefixSummary()` 现在会在 LLM 出错时抛出，而非返回空字符串
- **带分支会话的压缩**：修复压缩错误地包含已放弃分支的条目、导致令牌溢出错误的问题。压缩现在使用 `sessionManager.getPath()`，仅处理当前分支路径，消除了 `prepareCompaction()` 和 `compact()` 之间 80 多行重复的条目收集逻辑
- **enabledModels glob 模式**：`--models` 和 `enabledModels` 现在支持 `github-copilot/*` 或 `*sonnet*` 等 glob 模式。此前模式仅按字面量或子字符串搜索匹配。（[#337](https://github.com/badlogic/pi-mono/issues/337)）

## [0.30.2] - 2025-12-26

### 已更改

- **整合迁移**：将认证迁移从 `AuthStorage.migrateLegacy()` 移至新的 `migrations.ts` 模块。

## [0.30.1] - 2025-12-26

### 已修复

- **会话保存到错误目录**：在 v0.30.0 中，会话被保存到 `~/.pi/agent/`，而非 `~/.pi/agent/sessions/<encoded-cwd>/`，导致 `--resume` 和 `/resume` 失效。放错位置的会话会在启动时自动迁移。（[#320](https://github.com/badlogic/pi-mono/issues/320)，作者 [@aliou](https://github.com/aliou)）
- **自定义系统提示词缺少上下文**：使用自定义系统提示词字符串时，未附加项目上下文文件（AGENTS.md）、skills、日期/时间和工作目录。（[#321](https://github.com/badlogic/pi-mono/issues/321)）

## [0.30.0] - 2025-12-25

### 破坏性变更

- **SessionManager API**：`create()`、`continueRecent()` 和 `list()` 的第二个参数从 `agentDir` 改为 `sessionDir`。提供时，它直接指定会话目录（不进行 cwd 编码）。省略时，使用默认值（`~/.pi/agent/sessions/<encoded-cwd>/`）。`open()` 不再接受 `agentDir`。（[#313](https://github.com/badlogic/pi-mono/pull/313)）

### 已添加

- **`--session-dir` 标志**：使用自定义目录存放会话，而非默认的 `~/.pi/agent/sessions/<encoded-cwd>/`。可与 `-c`（继续）和 `-r`（恢复）标志配合使用。（[#313](https://github.com/badlogic/pi-mono/pull/313)，作者 [@scutifer](https://github.com/scutifer)）
- **反向模型循环和模型选择器**：Shift+Ctrl+P 反向循环模型，Ctrl+L 打开模型选择器（保留编辑器中的文本）。（[#315](https://github.com/badlogic/pi-mono/pull/315)，作者 [@mitsuhiko](https://github.com/mitsuhiko)）

## [0.29.1] - 2025-12-25

### 已添加

- **自动加载自定义系统提示词**：Pi 现在自动加载 `SYSTEM.md` 文件以替换默认系统提示词。项目本地 `.pi/SYSTEM.md` 优先于全局 `~/.pi/agent/SYSTEM.md`。CLI `--system-prompt` 标志覆盖两者。（[#309](https://github.com/badlogic/pi-mono/issues/309)）
- **统一的 `/settings` 命令**：新的设置菜单整合思考级别、主题、队列模式、自动压缩、显示图像、隐藏思考和折叠更新日志。取代单独的 `/thinking`、`/queue`、`/theme`、`/autocompact` 和 `/show-images` 命令。（[#310](https://github.com/badlogic/pi-mono/issues/310)）

### 已修复

- **使用 typebox 子路径导入的自定义工具/hooks**：修复 jiti 的 `@sinclair/typebox` 别名，使其指向包根目录而非入口文件，允许 `@sinclair/typebox/compiler` 等导入正确解析。（[#311](https://github.com/badlogic/pi-mono/issues/311)，作者 [@kim0](https://github.com/kim0)）

## [0.29.0] - 2025-12-25

### 破坏性变更

- **将 `/clear` 重命名为 `/new`**：开始全新会话的命令现为 `/new`。hook 事件原因 `before_clear`/`clear` 现为 `before_new`/`new`。圣诞快乐，[@mitsuhiko](https://github.com/mitsuhiko)！（[#305](https://github.com/badlogic/pi-mono/pull/305)）

### 已添加

- **在粘贴的文件路径前自动添加空格**：在单词字符后粘贴以 `/`、`~` 或 `.` 开头的文件路径时，会自动在前面添加空格。（[#307](https://github.com/badlogic/pi-mono/pull/307)，作者 [@mitsuhiko](https://github.com/mitsuhiko)）
- **输入字段中的单词导航**：新增 Ctrl+Left/Right 和 Alt+Left/Right，用于逐词移动光标。（[#306](https://github.com/badlogic/pi-mono/pull/306)，作者 [@kim0](https://github.com/kim0)）
- **完整 Unicode 输入**：输入字段现在接受 ASCII 以外的 Unicode 字符。（[#306](https://github.com/badlogic/pi-mono/pull/306)，作者 [@kim0](https://github.com/kim0)）

### 已修复

- **readline 风格的 Ctrl+W**：现在会在删除前一个单词前跳过末尾空白，符合标准 readline 行为。（[#306](https://github.com/badlogic/pi-mono/pull/306)，作者 [@kim0](https://github.com/kim0)）

## [0.28.0] - 2025-12-25

### 已更改

- **凭据存储重构**：API 密钥和 OAuth 令牌现在存储在 `~/.pi/agent/auth.json`，而非 `oauth.json` 和 `settings.json`。现有凭据会在首次运行时自动迁移。（[#296](https://github.com/badlogic/pi-mono/issues/296)）

- **SDK API 变更**（[#296](https://github.com/badlogic/pi-mono/issues/296)）：

  - 新增 `AuthStorage` 类用于凭据管理（API 密钥和 OAuth 令牌）
  - 新增 `ModelRegistry` 类用于模型发现和 API 密钥解析
  - 新增 `discoverAuthStorage()` 和 `discoverModels()` 发现函数
  - `createAgentSession()` 现在接受 `authStorage` 和 `modelRegistry` 选项
  - 移除 `configureOAuthStorage()`、`defaultGetApiKey()`、`findModel()`、`discoverAvailableModels()`
  - 移除 `getApiKey` 回调选项（运行时覆盖使用 `AuthStorage.setRuntimeApiKey()`）
  - 对内置模型使用 `@mariozechner/pi-ai` 的 `getModel()`，对自定义模型 + 内置模型使用 `modelRegistry.find()`
  - 请参阅更新后的 [SDK 文档](docs/sdk.md) 和 [README](README.md)

- **设置变更**：从 `settings.json` 移除 `apiKeys`。请改用 `auth.json`。（[#296](https://github.com/badlogic/pi-mono/issues/296)）

### 已修复

- **符号链接的重复 skill 警告**：经由指向同一文件的符号链接加载的 skills 现在会静默去重，而非显示名称冲突警告。（[#304](https://github.com/badlogic/pi-mono/pull/304)，作者 [@mitsuhiko](https://github.com/mitsuhiko)）

## [0.27.9] - 2025-12-24

### 已修复

- **含 settings.json API 密钥的模型选择器和 --list-models**：在 settings.json 中配置 API 密钥（但不在环境变量中）的模型，现在会正确显示在 /model 选择器和 `--list-models` 输出中。（[#295](https://github.com/badlogic/pi-mono/issues/295)）

## [0.27.8] - 2025-12-24

### 已修复

- **API 密钥优先级**：OAuth 令牌现在优先于 settings.json API 密钥。此前 settings.json 中的 API 密钥会胜过 OAuth，导致使用套餐登录（不限令牌）的用户改按 PAYG 计费。

## [0.27.7] - 2025-12-24

### 已修复

- **思考标签泄漏**：修复 Claude 在响应中模仿字面量 `</thinking>` 标签的问题。未签名的思考块（来自中止的流）现在会转换为不带 `<thinking>` 标签的纯文本。TUI 仍将其显示为思考块。（[#302](https://github.com/badlogic/pi-mono/pull/302)，作者 [@nicobailon](https://github.com/nicobailon)）

## [0.27.6] - 2025-12-24

### 已添加

- **压缩 hook 改进**：`before_compact` 会话事件现在包含：

  - `previousSummary`：上次压缩的摘要（若有），使 hooks 能保留累积上下文
  - `messagesToKeep`：除 `messagesToSummarize` 外，摘要后会保留的消息（最近轮次）
  - `resolveApiKey`：为任何模型解析 API 密钥的函数（检查设置、OAuth、环境变量）
  - 移除 `apiKey` 字符串，改用 `resolveApiKey`，以提供更大灵活性

- **SessionManager API 清理**：
  - 将 `loadSessionFromEntries()` 重命名为 `buildSessionContext()`（从条目构建 LLM 上下文，处理压缩）
  - 将 `loadEntries()` 重命名为 `getEntries()`（返回所有会话条目的防御性副本）
  - 向 SessionManager 新增 `buildSessionContext()` 方法

## [0.27.5] - 2025-12-24

### 已添加

- **HTML 导出语法高亮**：Markdown 和工具输出（read、write）中的代码块现在使用 highlight.js 进行语法高亮，颜色与 TUI 匹配并感知主题。
- **HTML 导出改进**：使用 marked 在服务端渲染 markdown（表格、标题、代码块等），遵循用户选择的主题（浅色/深色），为用户消息添加图像渲染，并用类 TUI 的语言标记设置代码块样式。（[@scutifer](https://github.com/scutifer)）

### 已修复

- **tmux 中的 Ghostty 内联图像**：通过检查 `GHOSTTY_RESOURCES_DIR` 环境变量，修复在 tmux 内运行时 Ghostty 的终端检测。（[#299](https://github.com/badlogic/pi-mono/pull/299)，作者 [@nicobailon](https://github.com/nicobailon)）

## [0.27.4] - 2025-12-24

### 已修复

- **符号链接的 skill 目录**：符号链接目录中的 skills（例如 `~/.pi/agent/skills/my-skills -> /path/to/skills`）现在能被正确发现和加载。

## [0.27.3] - 2025-12-24

### 已添加

- **settings.json 中的 API 密钥**：将 API 密钥存储在 `~/.pi/agent/settings.json` 的 `apiKeys` 字段下（例如 `{ "apiKeys": { "anthropic": "sk-..." } }`）。设置密钥优先于环境变量。（[#295](https://github.com/badlogic/pi-mono/issues/295)）

### 已修复

- **允许无 API 密钥启动**：未配置 API 密钥时，交互模式不再抛出错误。用户现在可以启动代理并使用 `/login` 进行认证。（[#288](https://github.com/badlogic/pi-mono/issues/288)）
- **`--system-prompt` 文件路径支持**：`--system-prompt` 参数现在能正确解析文件路径（与 `--append-system-prompt` 已有行为一致）。（[#287](https://github.com/badlogic/pi-mono/pull/287)，作者 [@scutifer](https://github.com/scutifer)）

## [0.27.2] - 2025-12-23

### 已添加

- **分支时跳过对话恢复**：hooks 可从 `before_branch` 返回 `{ skipConversationRestore: true }`，以创建分支会话文件而不恢复对话消息。适用于单独恢复文件的检查点 hooks。（[#286](https://github.com/badlogic/pi-mono/pull/286)，作者 [@nicobarray](https://github.com/nicobarray)）

## [0.27.1] - 2025-12-22

### 已修复

- **Skill 发现性能**：递归扫描 skills 时跳过 `node_modules` 目录。当 skill 目录包含 npm 依赖时，修复约 60ms 的启动延迟。

### 已添加

- **启动耗时检测**：设置 `PI_TIMING=1` 以查看启动性能明细（仅交互模式）。

## [0.27.0] - 2025-12-22

### 破坏性变更

- **会话 hooks API 重新设计**：将 `branch` 事件合并到 `session` 事件。移除 `BranchEvent`、`BranchEventResult` 类型和 `pi.on("branch", ...)`。改用带有 `reason: "before_branch" | "branch"` 的 `pi.on("session", ...)`。`AgentSession.branch()` 返回 `{ cancelled }`，而非 `{ skipped }`。`AgentSession.reset()` 和 `switchSession()` 现在返回 `boolean`（被 hook 取消时为 false）。RPC 命令 `reset`、`switch_session` 和 `branch` 现在在响应数据中包含 `cancelled`。（[#278](https://github.com/badlogic/pi-mono/issues/278)）

### 已添加

- **会话生命周期 hooks**：新增在操作前触发、且可通过 `{ cancel: true }` 取消的 `before_*` 变体（`before_switch`、`before_clear`、`before_branch`）。新增 `shutdown` 原因以处理优雅退出。（[#278](https://github.com/badlogic/pi-mono/issues/278)）

### 已修复

- **文件 Tab 补全显示**：文件路径不再过早截断。文件夹现在显示尾随 `/`，并移除了冗余的“directory”/“file”标签，以最大化水平空间。（[#280](https://github.com/badlogic/pi-mono/issues/280)）
- **Bash 工具视觉行截断**：修复折叠模式下 bash 工具输出使用视觉行计数（考虑换行）而非逻辑行计数。现在与 bash-execution.ts 行为一致。提取共享 `truncateToVisualLines` 工具。（[#275](https://github.com/badlogic/pi-mono/issues/275)）

## [0.26.1] - 2025-12-22

### 已修复

- **SDK 工具遵循 cwd**：核心工具（bash、read、edit、write、grep、find、ls）现在能正确使用 `createAgentSession()` 的 `cwd` 选项。为通过显式工具指定自定义 `cwd` 的 SDK 用户新增工具工厂函数（`createBashTool`、`createReadTool` 等）。（[#279](https://github.com/badlogic/pi-mono/issues/279)）

## [0.26.0] - 2025-12-22

### 已添加

- **用于编程使用的 SDK**：新增 `createAgentSession()` 工厂，对模型、工具、hooks、skills、会话持久化和设置进行完整控制。理念：“省略即发现，提供即覆盖”。包含 12 个示例和完整文档。（[#272](https://github.com/badlogic/pi-mono/issues/272)）

- **项目特定设置**：设置现在同时从 `~/.pi/agent/settings.json`（全局）和 `<cwd>/.pi/settings.json`（项目）加载。项目设置通过嵌套对象深度合并覆盖全局设置。项目设置为只读（便于版本控制）。（[#276](https://github.com/badlogic/pi-mono/pull/276)）

- **SettingsManager 静态工厂**：`SettingsManager.create(cwd?, agentDir?)` 用于基于文件的设置，`SettingsManager.inMemory(settings?)` 用于测试。新增 `applyOverrides()` 用于编程式覆盖。

- **SessionManager 静态工厂**：`SessionManager.create()`、`SessionManager.open()`、`SessionManager.continueRecent()`、`SessionManager.inMemory()`、`SessionManager.list()`，用于灵活会话管理。

## [0.25.4] - 2025-12-22

### 已修复

- **语法高亮 stderr 垃圾输出**：修复当 markdown 包含格式错误的代码围栏（例如闭合反引号附近缺少换行）时，cli-highlight 向 stderr 记录错误的问题。现在会在高亮前验证语言标识符，并静默回退到纯文本。（[#274](https://github.com/badlogic/pi-mono/issues/274)）

## [0.25.3] - 2025-12-21

### 已添加

- **Gemini 3 预览模型**：向 google-gemini-cli 提供商添加 `gemini-3-pro-preview` 和 `gemini-3-flash-preview`。（[#264](https://github.com/badlogic/pi-mono/pull/264)，作者 [@LukeFost](https://github.com/LukeFost)）

- **外部编辑器支持**：按 `Ctrl+G` 在外部编辑器中编辑消息。使用 `$VISUAL` 或 `$EDITOR` 环境变量。成功保存时替换消息；取消时保留原消息。（[#266](https://github.com/badlogic/pi-mono/pull/266)，作者 [@aliou](https://github.com/aliou)）

- **进程挂起**：按 `Ctrl+Z` 挂起 pi 并返回 shell。照常使用 `fg` 恢复。（[#267](https://github.com/badlogic/pi-mono/pull/267)，作者 [@aliou](https://github.com/aliou)）

- **可配置的 skill 目录**：新增通过 `enableCodexUser`、`enableClaudeUser`、`enableClaudeProject`、`enablePiUser`、`enablePiProject` 开关，以及 `customDirectories` 和 `ignoredSkills` 设置，对 skill 来源进行细粒度控制。（[#269](https://github.com/badlogic/pi-mono/pull/269)，作者 [@nicobailon](https://github.com/nicobailon)）

- **Skills CLI 过滤**：新增 `--skills <patterns>` 标志，使用 glob 模式过滤 skills。还新增 `includeSkills` 设置以及 `ignoredSkills` 的 glob 模式支持。（[#268](https://github.com/badlogic/pi-mono/issues/268)）

## [0.25.2] - 2025-12-21

### 已修复

- **工具输出中的图像偏移**：修复通过 Ctrl+O 展开或折叠工具输出时，其中图像会因间隔符不断累积而每次向下偏移的问题。

## [0.25.1] - 2025-12-21

### 已修复

- **Gemini 图像读取损坏**：修复 `read` 工具返回图像会导致 Gemini 模型响应不稳定/损坏的问题。工具结果中的图像现在按 Gemini API 规范正确格式化。

- **绝对路径的 Tab 补全**：修复 Tab 补全生成 `//tmp` 而非 `/tmp/`。还修复了指向目录（如 `/tmp`）的符号链接未获得尾随斜杠、从而无法继续通过 Tab 浏览子目录的问题。

## [0.25.0] - 2025-12-20

### 已添加

- **可中断工具执行**：在工具执行期间将消息加入队列，现在会中断当前工具批次。其余工具会以错误结果跳过，排队消息会立即处理。适用于在任务中途重定向代理。（[#259](https://github.com/badlogic/pi-mono/pull/259)，作者 [@steipete](https://github.com/steipete)）

- **Google Gemini CLI OAuth 提供商**：通过 Google Cloud Code Assist 免费访问 Gemini 2.0/2.5 模型。使用 `/login` 登录并选择“Google Gemini CLI”。使用您的 Google 帐户并受速率限制。

- **Google Antigravity OAuth 提供商**：通过 Google 的 Antigravity 沙箱免费访问 Gemini 3、Claude（sonnet/opus 思考模型）和 GPT-OSS 模型。使用 `/login` 登录并选择“Antigravity”。使用您的 Google 帐户并受速率限制。

### 已更改

- **模型选择器遵循 --models 范围**：使用 `--models` 标志时，`/model` 命令现在仅显示通过该标志指定的模型，而非所有可用模型。这可防止意外选择非预期提供商的模型。（[#255](https://github.com/badlogic/pi-mono/issues/255)）

### 已修复

- **连接错误未重试**：将“connection error”加入可重试错误列表，因此 Anthropic 连接中断会触发自动重试，而非静默失败。（[#252](https://github.com/badlogic/pi-mono/issues/252)）

- **切换模型时未限制思考级别**：修复切换至不支持 xhigh 的模型后 TUI 显示 xhigh 思考级别的问题。思考级别现在会自动限制到模型能力范围。（[#253](https://github.com/badlogic/pi-mono/issues/253)）

- **跨模型思考交接**：修复在具有不同思考签名格式的模型之间切换时的错误（例如通过 Antigravity 从 GPT-OSS 切换至 Claude 思考模型）。无签名的思考块现在会转换为带 `<thinking>` 分隔符的文本。

## [0.24.5] - 2025-12-20

### 已修复

- **iTerm2 中的输入缓冲**：修复在 iTerm2 中 Ctrl+C、Ctrl+D 及其他按键需要多次按下的问题。单元格尺寸查询响应解析器错误地拦截了键盘输入。

## [0.24.4] - 2025-12-20

### 已修复

- **选择器组件中的方向键和 Enter**：修复启用 Caps Lock 或 Num Lock 时，模型选择器、会话选择器、OAuth 选择器和其他选择器组件中的方向键和 Enter 无法使用的问题。（[#243](https://github.com/badlogic/pi-mono/issues/243)）

## [0.24.3] - 2025-12-19

### 已修复

- **窄终端中的页脚溢出**：修复调整至极窄宽度时页脚路径显示超出终端宽度、导致渲染崩溃的问题。/arminsayshi

## [0.24.2] - 2025-12-20

### 已修复

- **更多 Kitty 键盘协议修复**：修复启用 Caps Lock 时 Backspace、Enter、Home、End 和 Delete 键无法工作的问题。0.24.1 的初始修复遗漏了若干仍使用原始字节检测的按键处理器。现在所有按键处理器都使用能正确屏蔽锁定键位的辅助函数。（[#243](https://github.com/badlogic/pi-mono/issues/243)）

## [0.24.1] - 2025-12-19

### 已添加

- **OAuth 和模型配置导出**：直接使用 `AgentSession` 的脚本现在可从 `@mariozechner/pi-coding-agent` 导入 `getAvailableModels`、`getApiKeyForModel`、`findModel`、`login`、`logout` 和 `getOAuthProviders`，以复用 OAuth 令牌存储和模型解析。（[#245](https://github.com/badlogic/pi-mono/issues/245)）

- **gpt-5.2 模型的 xhigh 思考级别**：思考级别选择器和 shift+tab 循环现在为 gpt-5.2 和 gpt-5.2-codex 模型显示 xhigh 选项（除 gpt-5.1-codex-max 外）。（[#236](https://github.com/badlogic/pi-mono/pull/236)，作者 [@theBucky](https://github.com/theBucky)）

### 已修复

- **Hooks 包装自定义工具**：自定义工具现在通过 hook 包装器执行，因此 `tool_call`/`tool_result` hooks 可观察、阻止和修改自定义工具执行（与 hook 类型文档一致）。（[#248](https://github.com/badlogic/pi-mono/pull/248)，作者 [@nicobailon](https://github.com/nicobailon)）

- **Hook onUpdate 回调转发**：`onUpdate` 回调现在可正确通过 hook 包装器转发，修复自定义工具进度更新。（[#238](https://github.com/badlogic/pi-mono/pull/238)，作者 [@nicobailon](https://github.com/nicobailon)）

- **会话选择器中 Ctrl+C 时的终端清理**：修复在会话选择器中按 Ctrl+C 时终端未正确恢复的问题。（[#247](https://github.com/badlogic/pi-mono/pull/247)，作者 [@aliou](https://github.com/aliou)）

- **ID 中含冒号的 OpenRouter 模型**：修复解析含冒号的 OpenRouter 模型 ID（例如 `openrouter:meta-llama/llama-4-scout:free`）的问题。（[#242](https://github.com/badlogic/pi-mono/pull/242)，作者 [@aliou](https://github.com/aliou)）

- **全局 AGENTS.md 被加载两次**：修复全局 AGENTS.md 同时存在于 `~/.pi/agent/` 和当前目录时被加载两次的问题。（[#239](https://github.com/badlogic/pi-mono/pull/239)，作者 [@aliou](https://github.com/aliou)）

- **Linux 上的 Kitty 键盘协议**：修复启用 Num Lock 时 Ghostty 在 Linux 上键盘输入无法工作的问题。Kitty 协议在修饰符值中包含 Caps Lock 和 Num Lock 状态，破坏了按键检测。现在匹配键盘快捷键时能正确屏蔽锁定键位。（[#243](https://github.com/badlogic/pi-mono/issues/243)）

- **Emoji 删除和光标移动**：Backspace、Delete 和方向键现在能正确处理 emoji 等多代码点字符。此前删除 emoji 会留下部分字节，损坏编辑器状态。（[#240](https://github.com/badlogic/pi-mono/issues/240)）

## [0.24.0] - 2025-12-19

### 已添加

- **子代理编排示例**：新增全面的自定义工具示例，用于生成和编排具有隔离上下文窗口的子代理。包含 scout/planner/reviewer/worker 代理以及多代理管道的工作流命令。（[#215](https://github.com/badlogic/pi-mono/pull/215)，作者 [@nicobailon](https://github.com/nicobailon)）

- **`getMarkdownTheme()` 导出**：自定义工具现在可从 `@mariozechner/pi-coding-agent` 导入 `getMarkdownTheme()`，以使用与主 UI 相同的 markdown 样式。

- **`pi.exec()` 信号和超时支持**：自定义工具和 hooks 现在可向 `pi.exec()` 传递 `{ signal, timeout }` 选项，用于取消和超时处理。进程终止时结果包含 `killed` 标志。

- **Kitty 键盘协议支持**：Shift+Enter、Alt+Enter、Shift+Tab、Ctrl+D 和所有 Ctrl+按键组合现在可在 Ghostty、Kitty、WezTerm 及其他现代终端中使用。（[#225](https://github.com/badlogic/pi-mono/pull/225)，作者 [@kim0](https://github.com/kim0)）

- **动态 API 密钥刷新**：现在会在每次 LLM 调用前刷新 OAuth 令牌（GitHub Copilot、Anthropic OAuth），防止令牌在会话中途到期的长期运行代理循环失败。（[#223](https://github.com/badlogic/pi-mono/pull/223)，作者 [@kim0](https://github.com/kim0)）

- **`/hotkeys` 命令**：在格式化表格中显示所有键盘快捷键。

- **Markdown 表格边框**：表格现在以正确的顶部和底部边框渲染。

### 已更改

- **子代理示例改进**：并行模式现在流式显示所有任务的更新。链式模式在流式输出期间显示所有已完成步骤。展开视图使用带语法高亮的正确 markdown 渲染。用量页脚显示轮次计数。

- **Skills 标准合规性**：skills 现在遵循 [Agent Skills 标准](https://agentskills.io/specification)。验证名称（必须匹配父目录、小写、最多 64 个字符）、描述（必需、最多 1024 个字符）和 frontmatter 字段。对违规发出警告但保持宽容。提示词格式改为 XML 结构。移除 `{baseDir}` 占位符，改用相对路径。（[#231](https://github.com/badlogic/pi-mono/issues/231)）

### 已修复

- **JSON 模式 stdout 刷新**：修复 `pi --mode json` 可能在所有输出写入 stdout 前退出、导致消费者错过最终事件的竞态条件。

- **符号链接的工具、hooks 和斜杠命令**：发现机制现在扫描自定义工具、hooks 和斜杠命令时能正确跟随符号链接。（[#219](https://github.com/badlogic/pi-mono/pull/219)、[#232](https://github.com/badlogic/pi-mono/pull/232)，作者 [@aliou](https://github.com/aliou)）

### 破坏性变更

- **自定义工具现在要求 `index.ts` 入口点**：自动发现的自定义工具必须位于带有 `index.ts` 文件的子目录中。旧模式 `~/.pi/agent/tools/mytool.ts` 必须改为 `~/.pi/agent/tools/mytool/index.ts`。这允许多文件工具导入辅助模块。通过 `--tool` 或 `settings.json` 提供的显式路径仍可使用任何 `.ts` 文件。

- **Hook `tool_result` 事件重构**：`ToolResultEvent` 现在公开完整工具结果数据，而不仅是文本。（[#233](https://github.com/badlogic/pi-mono/pull/233)）
  - 已移除：`result: string` 字段
  - 已添加：`content: (TextContent | ImageContent)[]` - 完整内容数组
  - 已添加：`details: unknown` - 工具特定详情（按 `toolName` 上的可区分联合进行类型化）
  - `ToolResultEventResult.result` 重命名为 `ToolResultEventResult.text`（已移除），请改用 `content`
  - 返回 `{ result: "..." }` 的 hook 处理器必须改为 `{ content: [{ type: "text", text: "..." }] }`
  - 导出内置工具详情类型：`BashToolDetails`、`ReadToolDetails`、`GrepToolDetails`、`FindToolDetails`、`LsToolDetails`、`TruncationResult`
  - 导出用于收窄的类型守卫：`isBashToolResult`、`isReadToolResult`、`isEditToolResult`、`isWriteToolResult`、`isGrepToolResult`、`isFindToolResult`、`isLsToolResult`

## [0.23.4] - 2025-12-18

### 已添加

- **语法高亮**：为 markdown 代码块、read 工具输出和 write 工具内容添加语法高亮。使用 cli-highlight，采用感知主题的颜色映射和 VS Code 风格语法颜色。（[#214](https://github.com/badlogic/pi-mono/pull/214)，作者 [@svkozak](https://github.com/svkozak)）

- **行内 diff 高亮**：编辑工具现在在修改单行时以反色高亮显示单词级更改。多行更改先显示所有已删除行，再显示所有新增行。

### 已修复

- **Gemini 工具结果格式**：修复 Gemini 3 Flash Preview 的工具结果格式，其严格要求成功使用 `{ output: value }`、错误使用 `{ error: value }`。使用 `{ result, isError }` 的旧格式被新版 Gemini 模型拒绝。（[#213](https://github.com/badlogic/pi-mono/issues/213)、[#220](https://github.com/badlogic/pi-mono/pull/220)）

- **Google baseUrl 配置**：Google 提供商现在遵循用于自定义端点或 API 代理的 `baseUrl` 配置。（[#216](https://github.com/badlogic/pi-mono/issues/216)、[#221](https://github.com/badlogic/pi-mono/pull/221)，作者 [@theBucky](https://github.com/theBucky)）

- **Google 提供商 FinishReason**：新增对 `IMAGE_RECITATION` 和 `IMAGE_OTHER` 结束原因的处理。将 @google/genai 升级至 1.34.0。

## [0.23.3] - 2025-12-17

### 已修复

- 在提交用户提示词前（而非仅在代理轮次结束后）检查压缩。这能处理用户在响应中途终止且上下文已接近上限的情况。

### 已更改

- 改进系统提示词文档部分，更清晰地指向自定义模型、主题、skills、hooks、自定义工具和 RPC 的具体文档文件。

- 清理文档：

  - `theme.md`：添加缺失的颜色令牌（`thinkingXhigh`、`bashMode`）
  - `skills.md`：以更好的定位和示例重写
  - `hooks.md`：修复超时/错误处理文档，添加导入别名部分
  - `custom-tools.md`：添加含用例和对比表的简介
  - `rpc.md`：添加缺失的 `hook_error` 事件文档
  - `README.md`：完整设置表、精简理念部分、标准化 OAuth 文档

- Hooks 加载器现在支持与自定义工具相同的导入别名（`@sinclair/typebox`、`@mariozechner/pi-ai`、`@mariozechner/pi-tui`、`@mariozechner/pi-coding-agent`）。

### 破坏性变更

- **Hooks**：`turn_end` 事件的 `toolResults` 类型从 `AppMessage[]` 变更为 `ToolResultMessage[]`。若 hooks 处理 `turn_end` 事件并显式标注结果类型，请更新类型注释。

## [0.23.2] - 2025-12-17

### 已修复

- 修复通过 GitHub Copilot 使用的 Claude 模型在多轮对话中重新回答所有先前提示词的问题。原因是助手消息内容作为数组而非字符串发送，被 Copilot 的 Claude 适配器误解。还添加了缺失的 `Openai-Intent: conversation-edits` 头，并修复 `X-Initiator` 逻辑以检查历史记录中任何 assistant/tool 消息。（[#209](https://github.com/badlogic/pi-mono/issues/209)）

- 通过文件魔数（read 工具和 `@file` 附件）而非文件扩展名检测图像 MIME 类型。

- 修复 markdown 表格溢出终端宽度的问题。表格现在换行单元格内容以适应可用宽度，而非在行中间破坏边框。（[#206](https://github.com/badlogic/pi-mono/pull/206)，作者 [@kim0](https://github.com/kim0)）

## [0.23.1] - 2025-12-17

### 已修复

- 修复 Box 组件缺少渲染缓存导致的 TUI 性能回退。内置工具现在直接使用 Text（如 v0.22.5），Box 为自定义工具渲染提供正确缓存。

- 修复全局安装 pi 时自定义工具无法从 `~/.pi/agent/tools/` 加载的问题。模块导入（`@sinclair/typebox`、`@mariozechner/pi-tui`、`@mariozechner/pi-ai`）现通过别名解析。

## [0.23.0] - 2025-12-17

### 已添加

- **自定义工具**：使用 TypeScript 编写的自定义工具扩展 pi。工具可提供自定义 TUI 渲染，通过 `pi.ui`（select、confirm、input、notify）与用户交互，并通过 `onSession` 回调跨会话维护状态。请参阅 [docs/custom-tools.md](docs/custom-tools.md) 和 [examples/custom-tools/](examples/custom-tools/)。（[#190](https://github.com/badlogic/pi-mono/issues/190)）

- **Hook 和工具示例**：新增带有可运行示例的 `examples/hooks/` 和 `examples/custom-tools/`。示例现随 npm 和二进制发行版打包。

### 破坏性变更

- **Hooks**：将 `session_start` 和 `session_switch` 事件替换为统一的 `session` 事件。使用 `event.reason`（`"start" | "switch" | "clear"`）区分。事件现在包含用于状态重建的 `entries` 数组。

## [0.22.5] - 2025-12-17

### 已修复

- 修复 `--session` 标志未在打印模式（`-p`）保存会话的问题。由于没有附加订阅者，会话管理器从未接收到事件。

## [0.22.4] - 2025-12-17

### 已添加

- `--list-models [search]` CLI 标志，用于列出可选模糊搜索的可用模型。显示提供商、模型 ID、上下文窗口、最大输出、思考支持和图像支持。仅列出配置了 API 密钥的模型。（[#203](https://github.com/badlogic/pi-mono/issues/203)）

### 已修复

- 修复工具执行仍在运行时显示绿色（成功）背景的问题。现在会在工具完成前正确显示灰色（待处理）背景。

## [0.22.3] - 2025-12-16

### 已添加

- **流式 bash 输出**：bash 工具现在在执行期间实时流式输出。TUI 显示最后 5 行可见的实时进度（可用 ctrl+o 展开）。（[#44](https://github.com/badlogic/pi-mono/issues/44)）

### 已更改

- **工具输出显示**：折叠时，工具输出现在显示最后 N 行而非前 N 行，使流式输出更实用。

- 更新 `@mariozechner/pi-ai`，支持 GitHub Copilot 的 X-Initiator 头，确保代理调用不从配额中扣除。（[#200](https://github.com/badlogic/pi-mono/pull/200)，作者 [@kim0](https://github.com/kim0)）

### 已修复

- 修复压缩期间编辑器文本被清除的问题。压缩运行时输入的文本现在会保留。（[#179](https://github.com/badlogic/pi-mono/issues/179)）
- 改进不支持 truecolor 的终端的 RGB 到 256 色映射。现在能对中性色正确使用灰度阶梯，并保留语义色调（成功为绿、错误为红、待处理为蓝），而非将所有内容映射到错误的立方体颜色。
- `/think off` 现在会真正为所有提供商禁用思考。此前 Gemini 等默认启用“动态思考”的提供商在关闭后仍会使用思考。（[#180](https://github.com/badlogic/pi-mono/pull/180)，作者 [@markusylisiurunen](https://github.com/markusylisiurunen)）

## [0.22.2] - 2025-12-15

### 已更改

- 更新 `@mariozechner/pi-ai`，默认对 Anthropic Claude 4 模型启用交错思考。

## [0.22.1] - 2025-12-15

_献给 Peter 的肩膀（[@steipete](https://twitter.com/steipete)）_

### 已更改

- 更新 `@mariozechner/pi-ai`，支持 Anthropic 模型的交错思考。

## [0.22.0] - 2025-12-15

### 已添加

- **GitHub Copilot 支持**：通过 OAuth 登录（`/login` -> “GitHub Copilot”）使用 GitHub Copilot 模型。支持 github.com 和 GitHub Enterprise。模型来自 models.dev，包括 Claude、GPT、Gemini、Grok 等。登录后自动启用所有模型。（[#191](https://github.com/badlogic/pi-mono/pull/191)，作者 [@cau1k](https://github.com/cau1k)）

### 已修复

- 模型选择器模糊搜索现在会匹配提供商名称（不只模型 ID），并支持以空格分隔的令牌，要求所有令牌均匹配

## [0.21.0] - 2025-12-14

### 已添加

- **内联图像渲染**：支持 Kitty 图形协议（Kitty、Ghostty、WezTerm）或 iTerm2 内联图像的终端，现在会在工具输出中内联渲染图像。启动时查询终端单元格尺寸以保留宽高比。通过 `/show-images` 命令或 `terminal.showImages` 设置切换。不支持的终端或禁用时回退为文本占位符。（[#177](https://github.com/badlogic/pi-mono/pull/177)，作者 [@nicobailon](https://github.com/nicobailon)）

- **Gemini 3 Pro 思考级别**：思考级别选择器现在可用于 Gemini 3 Pro 模型。minimal/low 映射到 Google 的 LOW，medium/high 映射到 Google 的 HIGH。（[#176](https://github.com/badlogic/pi-mono/pull/176)，作者 [@markusylisiurunen](https://github.com/markusylisiurunen)）

### 已修复

- 修复由于时间戳中 Unicode 窄不换行空格（U+202F）导致 read 工具无法读取 macOS 截图文件名的问题。新增回退以尝试 macOS 变体路径，并将重复的 expandPath 函数整合到共享 path-utils.ts。（[#181](https://github.com/badlogic/pi-mono/pull/181)，作者 [@nicobailon](https://github.com/nicobailon)）

- 修复 markdown 代码块后渲染双空行的问题（[#173](https://github.com/badlogic/pi-mono/pull/173)，作者 [@markusylisiurunen](https://github.com/markusylisiurunen)）

## [0.20.1] - 2025-12-13

### 已添加

- **导出的 skills API**：`loadSkillsFromDir`、`formatSkillsForPrompt` 和相关类型现在已导出，可供其他包使用（例如 mom）。

## [0.20.0] - 2025-12-13

### 破坏性变更

- **Pi skills 现在使用 `SKILL.md` 约定**：Pi skills 现在必须命名为目录内的 `SKILL.md`，与 Codex CLI 格式一致。此前任何 `*.md` 文件都被视为 skill。请将 `~/.pi/agent/skills/foo.md` 重命名为 `~/.pi/agent/skills/foo/SKILL.md` 进行迁移。

### 已添加

- 在交互模式启动时显示已加载的 skills

## [0.19.1] - 2025-12-12

### 已修复

- 文档：在 README 中添加 skills 系统文档（设置、使用、CLI 标志、设置）

## [0.19.0] - 2025-12-12

### 已添加

- **Skills 系统**：按需自动发现并加载指令文件。支持 Claude Code（`~/.claude/skills/*/SKILL.md`）、Codex CLI（`~/.codex/skills/`）和 Pi 原生格式（`~/.pi/agent/skills/`、`.pi/skills/`）。skills 会连同描述列在系统提示词中，代理在需要时通过 read 工具加载它们。支持 `{baseDir}` 占位符。通过 `--no-skills` 或设置中的 `skills.enabled: false` 禁用。（[#169](https://github.com/badlogic/pi-mono/issues/169)）

- **版本标志**：新增 `--version` / `-v` 标志以显示当前版本并退出。（[#170](https://github.com/badlogic/pi-mono/pull/170)）

## [0.18.2] - 2025-12-11

### 已添加

- **瞬态错误自动重试**：当提供商返回过载、速率限制或服务器错误（429、500、502、503、504）时自动重试请求。使用指数退避（2s、4s、8s）。在 TUI 中显示重试状态，并可通过 Escape 取消。通过 `settings.json` 中的 `retry.enabled`、`retry.maxRetries`、`retry.baseDelayMs` 配置。RPC 模式发出 `auto_retry_start` 和 `auto_retry_end` 事件。（[#157](https://github.com/badlogic/pi-mono/issues/157)）

- **HTML 导出行号**：HTML 导出中的 read 工具调用现在在使用 offset/limit 参数时显示行号范围（例如 `file.txt:10-20`），与 TUI 显示格式一致。行号以黄色显示，便于查看。（[#166](https://github.com/badlogic/pi-mono/issues/166)）

### 已修复

- **分支选择器现在可用于单条消息**：此前仅有一条用户消息时分支选择器不会打开。现在可从任何消息（包括第一条）正确分支。这是检查点 hooks 从第一条消息之前恢复状态所需的。（[#163](https://github.com/badlogic/pi-mono/issues/163)）

- **`--no-session` 模式的内存中分支**：分支现在可在 `--no-session` 模式中正确工作，无需创建任何会话文件。对话会在内存中截断。

- **Git 分支指示器现在可在子目录中工作**：页脚的 git 分支检测现在会沿目录层级向上查找 git 根目录，因此从仓库子目录运行 pi 时也可工作。（[#156](https://github.com/badlogic/pi-mono/issues/156)）

## [0.18.1] - 2025-12-10

### 已添加

- **Mistral 提供商**：新增对 Mistral AI 模型的支持。设置 `MISTRAL_API_KEY` 环境变量即可使用。

### 已修复

- 修复存在自定义主题时，打印模式（`-p`）在输出后不退出的问题（主题监视器现在会在打印模式中正确停止）（[#161](https://github.com/badlogic/pi-mono/issues/161)）

## [0.18.0] - 2025-12-10

### 已添加

- **Hooks 系统**：通过订阅生命周期事件扩展代理行为的 TypeScript 模块。hooks 可拦截工具调用、请求确认、修改结果，并从外部来源注入消息。自动从 `~/.pi/agent/hooks/*.ts` 和 `.pi/hooks/*.ts` 发现。感谢 [@nicobailon](https://github.com/nicobailon) 在设计和实现上的协作。（[#145](https://github.com/badlogic/pi-mono/issues/145)，取代 [#158](https://github.com/badlogic/pi-mono/pull/158)）

- **`pi.send()` API**：hooks 可从外部来源（文件监视器、webhook、CI 系统）向代理会话注入消息。若正在流式输出，消息会排队；否则立即启动新的代理循环。

- **`--hook <path>` CLI 标志**：直接加载 hook 文件以进行测试，无需修改设置。

- **Hook 事件**：`session_start`、`session_switch`、`agent_start`、`agent_end`、`turn_start`、`turn_end`、`tool_call`（可阻止）、`tool_result`（可修改）、`branch`。

- **Hook UI 原语**：`ctx.ui.select()`、`ctx.ui.confirm()`、`ctx.ui.input()`、`ctx.ui.notify()`，用于 hooks 的交互提示。

- **Hooks 文档**：`docs/hooks.md` 中提供完整 API 参考，随 npm 包发布。

## [0.17.0] - 2025-12-09

### 已更改

- **简化压缩流程**：移除主动压缩（在接近阈值时中途终止轮次）。压缩现在仅在两种情况下触发：(1) 来自 LLM 的溢出错误，此时压缩并自动重试；或 (2) 成功轮次后越过阈值，此时压缩但不重试。

- **压缩重试使用 `Agent.continue()`**：溢出后的自动重试现在使用新的 `continue()` API，而非重新发送用户消息，从而保留精确的上下文状态。

- **合并轮次前缀摘要**：轮次在压缩期间被拆分时，轮次前缀摘要现在合并到主历史摘要中，而非单独存储。

### 已添加

- **AgentSession 上的 `isCompacting` 属性**：检查自动压缩当前是否正在运行。

- **会话压缩指示器**：恢复已压缩会话时，显示“会话已压缩 N 次”状态消息。

### 已修复

- **压缩期间阻止输入**：自动压缩运行时现在会阻止用户输入，以避免竞态条件。

- **在用量计算中跳过错误消息**：上下文大小估算现在跳过已中止和错误消息，因为两者都没有有效的用量数据。

## [0.16.0] - 2025-12-09

### 破坏性变更

- **新 RPC 协议**：RPC 模式（`--mode rpc`）已使用新 JSON 协议完全重新设计。不再支持旧协议。有关新协议文档，请参阅 [`docs/rpc.md`](docs/rpc.md)，有关可运行示例，请参阅 [`test/rpc-example.ts`](test/rpc-example.ts)。包含 `RpcClient` TypeScript 类，便于集成。（[#91](https://github.com/badlogic/pi-mono/issues/91)）

### 已更改

- **README 重构**：将文档从 30 多个扁平部分重组为 10 个逻辑组。将冗长子节转换为易浏览的表格。整合理念部分。在保留全部信息的同时，大小减少约 60%。

## [0.15.0] - 2025-12-09

### 已更改

- **大型代码重构**：重组代码库以提高可维护性和关注点分离。将文件移至有组织的目录（`core/`、`modes/`、`utils/`、`cli/`）。提取 `AgentSession` 类作为中心会话管理抽象。将 `main.ts` 和 `tui-renderer.ts` 拆分为聚焦模块。有关新的代码映射，请参阅 `DEVELOPMENT.md`。（[#153](https://github.com/badlogic/pi-mono/issues/153)）

## [0.14.2] - 2025-12-08

### 已添加

- `/debug` 命令现在在输出中包含 JSONL 格式的代理消息

### 已修复

- 修复 bash 命令输出二进制数据（例如 `curl` 下载视频文件）时崩溃的问题

## [0.14.1] - 2025-12-08

### 已修复

- 通过正确导入 `ReasoningEffort` 类型，修复 tsgo 7.0.0-dev.20251208.1 的构建错误

## [0.14.0] - 2025-12-08

### 破坏性变更

- **自定义主题需要新的颜色令牌**：主题现在必须包含 `thinkingXhigh` 和 `bashMode` 颜色令牌。主题加载器会提供列出缺失令牌的有用错误消息。请参阅内置主题（dark.json、light.json）获取参考值。

### 已添加

- **models.json 中的 OpenAI 兼容性覆盖**：使用 `openai-completions` API 的自定义模型现在可指定 `compat` 对象以覆盖提供商特性（`supportsStore`、`supportsDeveloperRole`、`supportsReasoningEffort`、`maxTokensField`）。适用于 LiteLLM、自定义代理及其他非标准端点。（[#133](https://github.com/badlogic/pi-mono/issues/133)，感谢 @fink-andreas 提出初始想法和 PR）

- **xhigh 思考级别**：为 OpenAI codex-max 模型添加 `xhigh` 思考级别。使用 Shift+Tab 循环思考级别；仅在使用 codex-max 模型时显示 `xhigh`。（[#143](https://github.com/badlogic/pi-mono/issues/143)）

- **折叠更新日志设置**：向 `~/.pi/agent/settings.json` 添加 `"collapseChangelog": true`，以在更新后显示精简的“已更新至 vX.Y.Z”消息，而非完整更新日志。使用 `/changelog` 查看完整更新日志。（[#148](https://github.com/badlogic/pi-mono/issues/148)）

- **Bash 模式**：在编辑器中以前缀 `!` 直接执行 shell 命令（例如 `!ls -la`）。输出实时流式传输，添加到 LLM 上下文，并持久保存到会话历史。支持多行命令、取消（Escape）、大型输出截断和预览/展开切换（Ctrl+O）。也可在 RPC 模式中通过 `{"type":"bash","command":"..."}` 使用。（[#112](https://github.com/badlogic/pi-mono/pull/112)，原始实现者 [@markusylisiurunen](https://github.com/markusylisiurunen)）

## [0.13.2] - 2025-12-07

### 已更改

- **工具输出截断**：所有工具现在都执行一致的截断限制，并为 LLM 提供可操作的提示。（[#134](https://github.com/badlogic/pi-mono/issues/134)）
  - **限制**：2000 行或 50KB（以先达到者为准），绝不截断部分行
  - **read**：显示 `[显示第 X-Y 行，共 Z 行。使用 offset=N 继续]`。若首行超过 50KB，建议使用 bash 命令
  - **bash**：使用临时文件进行尾部截断。显示 `[显示第 X-Y 行，共 Z 行。完整输出：/tmp/...]`
  - **grep**：将匹配行预截断为 500 个字符。显示匹配限制和行截断提示
  - **find/ls**：显示结果/条目限制提示
  - TUI 在工具输出底部以黄色显示截断警告（即使折叠时也可见）

## [0.13.1] - 2025-12-06

### 已添加

- **灵活的 Windows shell 配置**：bash 工具现在支持 Git Bash 之外的多个 shell 来源。解析顺序：(1) settings.json 中的自定义 `shellPath`，(2) 标准位置的 Git Bash，(3) PATH 中的任意 bash.exe。这支持 Cygwin、MSYS2 和其他 bash 环境。通过 `~/.pi/agent/settings.json` 配置：`{"shellPath": "C:\\cygwin64\\bin\\bash.exe"}`。

### 已修复

- **Windows 二进制检测**：通过在 `import.meta.url` 中除 `$bunfs` 和 `~BUN` 外检查 URL 编码的 `%7EBUN`，修复 Windows 上 Bun 编译二进制检测。确保二进制能在可执行文件旁正确定位支持文件（package.json、主题等）。

## [0.12.15] - 2025-12-06

### 已修复

- **含 emoji/CJK 字符的编辑器崩溃**：修复粘贴或输入含宽字符（如 ✅ emoji、CJK 字符）导致行宽超出终端宽度时崩溃的问题。编辑器现在使用感知字素的文本换行，并正确计算可见宽度。

## [0.12.14] - 2025-12-06

### 已添加

- **双 Escape 分支快捷键**：编辑器为空时按两次 Escape，可快速打开用于对话分支的 `/branch` 选择器。

## [0.12.13] - 2025-12-05

### 已更改

- **更快启动**：版本检查现在与 TUI 初始化并行运行，而非阻塞启动最多 1 秒。检查完成时，更新通知显示在聊天中。

## [0.12.12] - 2025-12-05

### 已更改

- **页脚显示**：令牌计数现在对百万使用 M 后缀（例如 `10.2M` 而非 `10184k`）。上下文显示从 `61.3% of 200k` 缩短为 `61.3%/200k`。

### 已修复

- **输入中的多键序列**：模型搜索等输入现在与主提示词编辑器完全一致地处理多键序列。（[#122](https://github.com/badlogic/pi-mono/pull/122)，作者 [@markusylisiurunen](https://github.com/markusylisiurunen)）
- **行换行转义码**：修复长 URL 换行时下划线样式渗入填充的问题。ANSI 代码现在附加到正确内容，行尾重置仅关闭下划线（保留背景色）。（[#109](https://github.com/badlogic/pi-mono/issues/109)）

### 已添加

- **模型和会话模糊搜索**：为模型和会话实现简单模糊搜索（例如 `codexmax` 现在可找到 `gpt-5.1-codex-max`）。（[#122](https://github.com/badlogic/pi-mono/pull/122)，作者 [@markusylisiurunen](https://github.com/markusylisiurunen)）
- **提示词历史导航**：编辑器为空时使用 Up/Down 方向键浏览此前提交的提示词。按 Up 循环至更旧提示词，按 Down 返回较新提示词或清空编辑器。类似 shell 历史和 Claude Code 的提示词历史功能。历史记录限定于会话，最多存储 100 条。（[#121](https://github.com/badlogic/pi-mono/pull/121)，作者 [@nicobailon](https://github.com/nicobailon)）
- **`/resume` 命令**：在对话中途切换至不同会话。打开显示所有可用会话的交互选择器。等同于 `--resume` CLI 标志，但无需重启代理即可使用。（[#117](https://github.com/badlogic/pi-mono/pull/117)，作者 [@hewliyang](https://github.com/hewliyang)）

## [0.12.11] - 2025-12-05

### 已更改

- **压缩 UI**：简化折叠的压缩指示器，显示带警告色和令牌计数的文本，而非样式化横幅。移除压缩后的冗余成功消息。（[#108](https://github.com/badlogic/pi-mono/issues/108)）

### 已修复

- **打印模式错误处理**：请求失败时，`-p` 标志现在输出错误消息并以代码 1 退出，而非静默不产生输出。
- **分支选择器崩溃**：修复用户消息包含 Unicode 字符（如 `✔` 或 `›`）导致行宽超出终端宽度的 TUI 崩溃。现在使用正确的 `truncateToWidth` 而非 `substring`。
- **Bash 输出转义序列**：修复 bash 工具输出中终端转义序列移除不完整的问题。`stripAnsi` 会漏掉独立字符串终止符（`ESC \`）等序列，显示捕获的 TUI 输出时可能导致渲染问题。
- **页脚溢出崩溃**：修复终端宽度不足以显示页脚统计行时的 TUI 崩溃。页脚现在会优雅截断而非溢出。

### 已添加

- **models.json 中的 `authHeader` 选项**：自定义提供商可设置 `"authHeader": true`，以自动添加 `Authorization: Bearer <apiKey>` 头。适用于要求显式认证头的提供商。（[#81](https://github.com/badlogic/pi-mono/issues/81)）
- **`--append-system-prompt` 标志**：向系统提示词追加额外文本或文件内容。支持内联文本和文件路径。补充 `--system-prompt`，以分层自定义指令而不替换基础系统提示词。（[#114](https://github.com/badlogic/pi-mono/pull/114)，作者 [@markusylisiurunen](https://github.com/markusylisiurunen)）
- **思考块切换**：新增 `Ctrl+T` 快捷键以切换 LLM 思考块的可见性。关闭后显示静态“Thinking...”标签，而非完整内容。适用于减少长对话期间的视觉杂乱。（[#113](https://github.com/badlogic/pi-mono/pull/113)，作者 [@markusylisiurunen](https://github.com/markusylisiurunen)）

## [0.12.10] - 2025-12-04

### 已添加

- 添加 `gpt-5.1-codex-max` 模型支持

## [0.12.9] - 2025-12-04

### 已添加

- **`/copy` 命令**：将最后一条代理消息复制到剪贴板。跨平台适用（macOS、Windows、Linux）。适用于从渲染的 Markdown 输出中提取文本。（[#105](https://github.com/badlogic/pi-mono/pull/105)，作者 [@markusylisiurunen](https://github.com/markusylisiurunen)）

## [0.12.8] - 2025-12-04

- 修复：始终使用 CTRL+O 作为压缩展开快捷键（而非 Mac 上的 CMD+O）

## [0.12.7] - 2025-12-04

### 已添加

- **上下文压缩**：长会话现在可压缩以减少上下文使用量，同时保留最近对话历史。（[#92](https://github.com/badlogic/pi-mono/issues/92)、[文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md#context-compaction)）
  - `/compact [instructions]`：使用可选自定义摘要指令手动压缩上下文
  - `/autocompact`：上下文超过阈值时切换自动压缩
  - 压缩会汇总旧消息，同时逐字保留最近消息（默认 20k 令牌）
  - 当上下文达到 `contextWindow - reserveTokens` 时触发自动压缩（默认预留 16k）
  - 已压缩会话在 TUI 中显示可折叠摘要（用 `o` 键切换）
  - HTML 导出将压缩摘要包含为可折叠部分
  - RPC 模式支持 `{"type":"compact"}` 命令和自动压缩（发出压缩事件）
- **分支来源跟踪**：分支会话现在在会话头部存储 `branchedFrom`，包含原始会话文件的路径。适用于跟踪会话谱系。

## [0.12.5] - 2025-12-03

### 已添加

- **Forking/Rebranding 支持**：所有品牌元素（应用名称、配置目录、环境变量名）现在均可通过 `package.json` 中的 `piConfig` 配置。分叉可更改 `piConfig.name` 和 `piConfig.configDir`，无需代码修改即可重塑 CLI 品牌。影响 CLI 横幅、帮助文本、配置路径和错误消息。（[#95](https://github.com/badlogic/pi-mono/pull/95)）

### 已修复

- **Bun 二进制检测**：修复 Bun 将虚拟文件系统路径格式从 `%7EBUN` 更新为 `$bunfs` 后，Bun 编译二进制无法启动的问题。（[#95](https://github.com/badlogic/pi-mono/pull/95)）

## [0.12.4] - 2025-12-02

### 已添加

- **RPC 终止保护**：作为 RPC worker（检测到 stdin 管道）运行时，若父进程意外终止，CLI 现在会立即退出。防止孤立的 RPC worker 无限存续并消耗系统资源。

## [0.12.3] - 2025-12-02

### 已修复

- **速率限制处理**：Anthropic 速率限制错误现在会触发自动指数退避重试（基础 10s，最多 5 次）。此前这些错误会立即中止请求。
- **重试期间的用量跟踪**：重试的请求现在能正确累计所有尝试的令牌用量，而非仅最后一次成功尝试。修复请求重试时令牌计数人为偏低的问题。

## [0.12.2] - 2025-12-02

### 已更改

- 移除对 gpt-4.5-preview 和 o3 模型的支持（尚不可用）

## [0.12.1] - 2025-12-02

### 已添加

- **模型**：新增对 OpenAI 新模型的支持：
  - `gpt-4.1`（128K 上下文）
  - `gpt-4.1-mini`（128K 上下文）
  - `gpt-4.1-nano`（128K 上下文）
  - `o3`（200K 上下文，推理模型）
  - `o4-mini`（200K 上下文，推理模型）

## [0.12.0] - 2025-12-02

### 已添加

- **`-p, --print` 标志**：在非交互批处理模式下运行。无需 TUI 即可处理输入消息或管道 stdin，并将代理响应直接打印到 stdout。适用于脚本、管道和 CI/CD 集成。在首次响应后退出。
- **`-P, --print-streaming` 标志**：类似 `-p`，但在响应令牌到达时流式输出。使用 `--print-streaming --no-markdown` 获取原始未格式化输出。
- **`--print-turn` 标志**：持续处理工具调用和代理轮次，直至代理自然完成或需要用户输入。与 `-p` 结合以完成多轮对话。
- **`--no-markdown` 标志**：输出不带 Markdown 格式的原始文本。适用于将输出管道传递至期待纯文本的工具。
- **流式打印模式**：添加内部 `printStreaming` 选项，用于非 TUI 模式的流式输出。
- **RPC 模式 `print` 命令**：发送 `{"type":"print","content":"text"}`，通过 `print_output` 事件获取格式化打印输出。
- **打印模式自动保存**：打印模式对话自动保存到会话目录，允许之后通过 `--continue` 恢复。
- **思考级别选项**：新增 `--thinking-off`、`--thinking-minimal`、`--thinking-low`、`--thinking-medium`、`--thinking-high` 标志，直接指定思考级别而无需选择器 UI。

### 已更改

- **简化 RPC 协议**：将 `prompt` 包装命令替换为直接消息对象。发送 `{"role":"user","content":"text"}`，而非 `{"type":"prompt","message":"text"}`。与整个代码库中的消息格式更一致。
- **RPC 消息处理**：代理现在直接处理原始消息对象，缺少时自动填充 `timestamp`。

## [0.11.9] - 2025-12-02

### 已更改

- 将模型循环快捷键从 Ctrl+I 改为 Ctrl+P，以避免在某些终端中与 Tab 键冲突

## [0.11.8] - 2025-12-01

### 已修复

- 绝对 glob 模式（例如 `/Users/foo/**/*.ts`）现在能正确处理。此前前导 `/` 被移除，导致模式被解释为相对于当前目录。

## [0.11.7] - 2025-12-01

### 已修复

- 修复 read 路径遍历漏洞。现在会验证路径，防止读取工作目录或其父目录之外的文件。`read` 工具可从 `cwd`、其祖先目录（用于配置文件）和所有后代目录读取。验证前会解析符号链接。

## [0.11.6] - 2025-12-01

### 已修复

- 修复 `--system-prompt <path>` 将路径参数捕获到消息收集、导致“未找到文件”错误的问题。

## [0.11.5] - 2025-11-30

### 已修复

- 修复在 `edit` 工具中编辑空文件时出现致命错误“Cannot set properties of undefined (setting '0')”。
- 简化 `edit` 工具输出：成功编辑现在仅显示“Edited file.txt”，而非冗长的搜索/替换详情。
- 修复因缺少用量数据导致令牌计数包含 NaN 值时，页脚渲染中的致命错误。

## [0.11.4] - 2025-11-30

### 已修复

- 修复消息包含预格式化/样式化文本（例如灰色斜体样式的思考轨迹）时的聊天渲染崩溃。markdown 渲染器现在在内联元素前出现现有 ANSI 转义码时予以保留。

## [0.11.3] - 2025-11-29

### 已修复

- 修复绝对路径的文件拖放功能

## [0.11.2] - 2025-11-29

### 已修复

- 修复粘贴含制表符内容时 TUI 崩溃的问题。插入前会将制表符转换为 4 个空格。
- 修复退出后 shell 集成序列（OSC 133）出现在 bash 输出时的终端损坏。这些序列现在与其他 ANSI 代码一同移除。

## [0.11.1] - 2025-11-29

### 已添加

- 添加用于文件路径自动补全的 `fd` 集成。现在使用 `fd` 进行更快的模糊文件搜索

### 已修复

- 修复 VS Code 集成终端和其他一些终端模拟器中键盘快捷键 Ctrl+A、Ctrl+E、Ctrl+K、Ctrl+U、Ctrl+W 和单词导航（Option+Arrow）无法工作的问题

## [0.11.0] - 2025-11-29

### 已添加

- **基于文件的斜杠命令**：在 `~/.pi/slash-commands/` 中创建 `.txt` 文件作为自定义可复用提示词。文件会成为带首行描述的 `/filename` 命令。支持用于引用选中/附加内容的 `{{selection}}` 占位符。
- **`/branch` 命令**：从任何先前用户消息创建对话分支。打开选择器选择消息，然后从该节点开始创建新会话文件。原始消息文本会放入编辑器以供修改。
- **统一内容引用**：消息中的 `@path` 和 `--file path` CLI 参数现在均使用相同附件系统，并具有一致的 MIME 类型检测。
- **拖放文件**：将文件拖到终端以附加到消息。支持多个文件以及文本和图像内容。

### 已更改

- **带搜索的模型选择器**：`/model` 命令现在打开可搜索列表。输入以按名称过滤模型，使用方向键导航，按 Enter 选择。
- **改进文件自动补全**：`@` 后的文件路径补全现在支持模糊匹配，并显示文件/目录指示器。
- **带搜索的会话选择器**：`--resume` 和 `--session` 标志现在打开带模糊过滤的可搜索会话列表。
- **附件显示**：通过 `@path` 添加的文件现在在用户消息中显示为“Attached: filename”，与提示词文本分开。
- **Tab 补全**：Tab 键现在在编辑器的任何位置触发文件路径自动补全，而不只是在 `@` 符号后。

### 已修复

- 修复自动补全 z-order 问题，即下拉列表可能显示在聊天消息后面
- 修复编辑器中浏览换行行时的光标位置
- 修复续接会话的附件处理，以保留文件引用

## [0.10.6] - 2025-11-28

### 已更改

- 在工具输出中显示大型图像的 base64 截断指示器

### 已修复

- 修复从 PNG/JPEG/GIF 文件中未能正确读取图像尺寸的问题
- 修复 PDF 图像在显示中被错误进行 base64 截断的问题
- 允许从祖先目录读取文件（单体仓库配置所需）

## [0.10.5] - 2025-11-28

### 已添加

- 完整多模态支持：使用 `@path` 语法或 `--file` 标志将图像（PNG、JPEG、GIF、WebP）和 PDF 附加到提示词

### 已修复

- `@` 引用现在能处理文件名中的特殊字符（空格、引号、unicode）
- 修复编辑器中多字节 unicode 字符的光标定位问题

## [0.10.4] - 2025-11-28

### 已修复

- 移除 TUI 中首条用户消息的填充，以改善视觉一致性。

## [0.10.3] - 2025-11-28

### 已添加

- 添加用于编程集成的 RPC 模式（`--rpc`）。在 stdin 上接受 JSON 命令，在 stdout 上发出 JSON 事件。有关协议详情，请参阅 [RPC 模式文档](https://github.com/nicobailon/pi-mono/blob/main/packages/coding-agent/README.md#rpc-mode)。

### 已更改

- 重构内部架构以支持多个前端（TUI、RPC）和共享代理逻辑。

## [0.10.2] - 2025-11-26

### 已添加

- 添加思考级别持久化。默认级别存储在 `~/.pi/settings.json`，启动时恢复。每会话覆盖保存在会话文件中。
- 添加模型循环快捷键：`Ctrl+I` 循环可用模型（或带 `-m` 标志的限定模型）。
- 为瞬态 API 错误（网络问题、500、过载）添加自动指数退避重试。
- 页脚现在显示累计令牌用量（会话中所有消息使用的总令牌）。
- 添加 `--system-prompt` 标志，以自定义文本或文件内容覆盖默认系统提示词。
- 页脚现在基于模型定价以 USD 显示估算总成本。

### 已更改

- 将 `--models` 标志替换为支持多个值的 `-m/--model`。将模型指定为 `provider/model@thinking`（例如 `anthropic/claude-sonnet-4-20250514@high`）。多个 `-m` 标志限定本会话的可用模型。
- 关闭选择器后，思考级别边框现在在视觉上保持。
- 改进带可折叠输出的工具结果显示（默认折叠，用 `Ctrl+O` 展开）。

## [0.10.1] - 2025-11-25

### 已添加

- 通过 `~/.pi/models.json` 添加自定义模型配置

## [0.10.0] - 2025-11-25

首次公开发布。

### 已添加

- 带流式响应的交互式 TUI
- 使用 `--continue`、`--resume` 和 `--session` 标志的对话会话管理
- 多行输入支持（新行使用 Shift+Enter 或 Option+Enter）
- 工具执行：`read`、`write`、`edit`、`bash`、`glob`、`grep`、`think`
- 带视觉指示器和 `/thinking` 选择器的 Claude 思考模式支持
- 使用 `@` 前缀的文件路径自动补全
- 斜杠命令自动补全
- 用于 HTML 会话导出的 `/export` 命令
- 用于运行时模型切换的 `/model` 命令
- 用于会话统计的 `/session` 命令
- 模型提供商支持：Anthropic（Claude）、OpenAI、Google（Gemini）
- 页脚中的 Git 分支显示
- 流式响应期间的消息排队
- 用于 Gmail 和 Google Calendar 访问的 OAuth 集成
- 带语法高亮和可折叠部分的 HTML 导出
