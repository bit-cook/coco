# 供应商

Pi 通过 OAuth 支持基于订阅的提供程序，并通过环境变量或身份验证文件支持 API 密钥提供程序。内置目录随 pi 一起提供；配置的提供程序可以刷新较新的目录并将其缓存在`~/.pi/agent/models-store.json`中以供离线使用。

## 目录

- [订阅](#subscriptions)
- [API 密钥](#api-keys)
- [验证文件](#auth-file)
- [云提供商](#cloud-providers)
- [骆驼.cpp](#llamacpp)
- [定制供应商](#custom-providers)
- [决议顺序](#resolution-order)

## 订阅

在交互模式下使用`/login`，然后选择一个提供商：

- ChatGPT Plus/Pro（法典）
- 克劳德·普罗/麦克斯
- GitHub 副驾驶
- xAI（Grok/X 订阅）
- OpenRouter（OAuth 铸造的 API 密钥，通过 OpenRouter 积分计费）
- 半径

使用`/logout`清除凭据。令牌存储在`~/.pi/agent/auth.json`中并在过期时自动刷新。相反，OpenRouter 会创建一个用户控制的 API 密钥，该密钥不会自动过期。

### OpenAI 法典

- 需要 ChatGPT Plus 或 Pro 订阅
- OpenAI 官方认可：[Codex for OSS](https://developers.openai.com/community/codex-for-oss)

### 克劳德·普罗/麦克斯

Claude Pro/Max 帐户的人择订阅身份验证处于活动状态。第三方安全带使用量来自[额外使用量](https://claude.ai/settings/usage)，并按代币计费，不违反 Claude 计划限制。

### GitHub 副驾驶

- 按 Enter 键进入 github.com，或输入您的 GitHub Enterprise Server 域
- 如果出现“型号不受支持”，请在 VS Code 中启用它：Copilot Chat → 型号选择器 → 选择型号 →“启用”

### xAI（Grok/X 订阅）

- 运行`/login xai`，然后选择**使用订阅**
- `XAI_API_KEY` 通过**使用 API 密钥**仍然可用

### 开放路由器

- 运行`/login openrouter`，然后选择**使用OpenRouter登录**，打开OpenRouter PKCE授权流程
- 授权创建一个用户控制的 OpenRouter API 密钥，从您的 OpenRouter 积分中计费
- `OPENROUTER_API_KEY` 通过**使用 API 密钥**仍然可用

### 半径

Radius 是一个动态 `pi-messages` 网关。 `/login radius`将OAuth令牌存储在`auth.json`中；网关目录独立刷新并缓存在`models-store.json`中。自定义 Radius 网关可以在 `models.json` 和 `"oauth": "radius"` 以及网关 `baseUrl` 中声明。

## API 密钥

### 环境变量或身份验证文件

在交互模式下使用 `/login` 并选择一个提供商将 API 密钥存储在 `auth.json` 中，或通过环境变量设置凭据：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

|提供商|环境变量|`auth.json`键|
|----------|----------------------|------------------|
|人择|`ANTHROPIC_API_KEY`|`anthropic`|
|蚁灵|`ANT_LING_API_KEY`|`ant-ling`|
|Azure OpenAI 响应|`AZURE_OPENAI_API_KEY`|`azure-openai-responses`|
|开放人工智能|`OPENAI_API_KEY`|`openai`|
|深度搜索|`DEEPSEEK_API_KEY`|`deepseek`|
|英伟达NIM|`NVIDIA_API_KEY`|`nvidia`|
|谷歌双子座|`GEMINI_API_KEY`|`google`|
|亚马逊基岩|`AWS_BEARER_TOKEN_BEDROCK`|`amazon-bedrock`|
|米斯特拉尔|`MISTRAL_API_KEY`|`mistral`|
|格罗克|`GROQ_API_KEY`|`groq`|
|大脑|`CEREBRAS_API_KEY`|`cerebras`|
|Cloudflare AI 网关|`CLOUDFLARE_API_KEY` (+ `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_GATEWAY_ID`)|`cloudflare-ai-gateway`|
|Cloudflare Workers AI|`CLOUDFLARE_API_KEY` (+ `CLOUDFLARE_ACCOUNT_ID`)|`cloudflare-workers-ai`|
|人工智能|`XAI_API_KEY`|`xai`|
|开放路由器|`OPENROUTER_API_KEY`|`openrouter`|
|Vercel人工智能网关|`AI_GATEWAY_API_KEY`|`vercel-ai-gateway`|
|ZAI 编码计划（全球）|`ZAI_API_KEY`|`zai`|
|ZAI编码计划（中国）|`ZAI_CODING_CN_API_KEY`|`zai-coding-cn`|
|开放代码禅|`OPENCODE_API_KEY`|`opencode`|
|开放代码Go|`OPENCODE_API_KEY`|`opencode-go`|
|半径|`RADIUS_API_KEY`|`radius`|
|抱脸|`HF_TOKEN`|`huggingface`|
|烟花|`FIREWORKS_API_KEY`|`fireworks`|
|一起人工智能|`TOGETHER_API_KEY`|`together`|
|基米编码|`KIMI_API_KEY`|`kimi-coding`|
|最小最大|`MINIMAX_API_KEY`|`minimax`|
|极小最大（中国）|`MINIMAX_CN_API_KEY`|`minimax-cn`|
|Qwen 代币计划|`QWEN_TOKEN_PLAN_API_KEY`|`qwen-token-plan`|
|Qwen代币计划（中国）|`QWEN_TOKEN_PLAN_CN_API_KEY`|`qwen-token-plan-cn`|
|小米MiMo|`XIAOMI_API_KEY`|`xiaomi`|
|小米 MiMo 代币计划（中国）|`XIAOMI_TOKEN_PLAN_CN_API_KEY`|`xiaomi-token-plan-cn`|
|小米 MiMo 代币计划（阿姆斯特丹）|`XIAOMI_TOKEN_PLAN_AMS_API_KEY`|`xiaomi-token-plan-ams`|
|小米 MiMo 代币计划（新加坡）|`XIAOMI_TOKEN_PLAN_SGP_API_KEY`|`xiaomi-token-plan-sgp`|

环境变量和`auth.json`键参考：[`packages/ai/src/env-api-keys.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/env-api-keys.ts)中的[`const envMap`](https://github.com/earendil-works/pi-mono/blob/main/packages/ai/src/env-api-keys.ts)。

#### 验证文件

将凭证存储在`~/.pi/agent/auth.json`中：

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "ant-ling": { "type": "api_key", "key": "..." },
  "openai": { "type": "api_key", "key": "sk-..." },
  "deepseek": { "type": "api_key", "key": "sk-..." },
  "nvidia": { "type": "api_key", "key": "nvapi-..." },
  "google": { "type": "api_key", "key": "..." },
  "opencode": { "type": "api_key", "key": "..." },
  "opencode-go": { "type": "api_key", "key": "..." },
  "together": { "type": "api_key", "key": "..." },
  "qwen-token-plan":  { "type": "api_key", "key": "sk-sp-..." },
  "qwen-token-plan-cn": { "type": "api_key", "key": "sk-sp-..." },
  "xiaomi": { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-cn":  { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-ams": { "type": "api_key", "key": "..." },
  "xiaomi-token-plan-sgp": { "type": "api_key", "key": "..." }
}
```

该文件是使用 `0600` 权限创建的（仅限用户读/写）。身份验证文件凭据优先于环境变量。

API 密钥凭证还可以包括提供商范围内的环境值。在解析凭据密钥、提供程序/模型标头和提供程序配置（例如 Cloudflare 帐户 ID、Azure OpenAI 设置、Vertex 项目/位置、Bedrock 设置、`PI_CACHE_RETENTION` 和 `HTTP_PROXY`/`HTTPS_PROXY`）时，在处理环境变量之前使用这些值。

```json
{
  "cloudflare-ai-gateway": {
    "type": "api_key",
    "key": "$CLOUDFLARE_API_KEY",
    "env": {
      "CLOUDFLARE_API_KEY": "...",
      "CLOUDFLARE_ACCOUNT_ID": "account-id",
      "CLOUDFLARE_GATEWAY_ID": "gateway-id"
    }
  }
}
```

当 pi 应使用与项目 shell 环境不同的提供程序设置时，请使用此选项。

### 关键解决方案

`key`字段支持命令执行、环境插值和文字：

- **Shell 命令：** `"!command"` 在开始时将整个值作为命令执行并使用 stdout（为进程生命周期缓存）
  ```json
  { "type": "api_key", "key": "!security find-generic-password -ws 'anthropic'" }
  { "type": "api_key", "key": "!op 读取 'op://vault/item/credential'" }
  ```
- **环境插值：** `"$ENV_VAR"` 或 `"${ENV_VAR}"` 使用指定变量的值。插值适用于较大的文字。
  ```json
  {“类型”：“api_key”，“密钥”：“$MY_ANTHROPIC_KEY”}
  { "type": "api_key", "key": "${KEY_PREFIX}_${KEY_SUFFIX}" }
  ```
  `$FOO_BAR`是变量`FOO_BAR`；当 `BAR` 是文字时使用 `${FOO}_BAR`。缺少环境变量会导致该值无法解析。
- **转义：** `"$$"` 发出文字 `"$"`； `"$!"` 发出文字 `"!"` 而不触发命令执行。
  ```json
  { "type": "api_key", "key": "$$literal-dollar-prefix" }
  { "type": "api_key", "key": "$!literal-bang-prefix" }
  ```
- **字面值：** 直接使用。普通大写字符串（例如 `MY_API_KEY`）是文字；使用 `$MY_API_KEY` 作为环境变量。
  ```json
  { "type": "api_key", "key": "sk-ant-..." }
  {“类型”：“api_key”，“密钥”：“公共”}
  ```

OAuth 凭据也存储在`/login`之后并自动管理。

## 云提供商

### Azure 开放人工智能

```bash
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_BASE_URL=https://your-resource.ai.azure.com
# also supported: https://your-resource.cognitiveservices.azure.com
# also supported: https://your-resource.openai.azure.com
# root endpoints are auto-normalized to /openai/v1
# or use resource name instead of base URL
export AZURE_OPENAI_RESOURCE_NAME=your-resource

# Optional
export AZURE_OPENAI_API_VERSION=2024-02-01
export AZURE_OPENAI_DEPLOYMENT_NAME_MAP=gpt-4=my-gpt4,gpt-4o=my-gpt4o
```

### 亚马逊基岩

使用 `/login amazon-bedrock` 存储 Bedrock API 密钥，或配置以下环境 AWS 凭证源之一：

```bash
# Option 1: AWS Profile
export AWS_PROFILE=your-profile

# Option 2: IAM Keys
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...

# Option 3: Bearer Token
export AWS_BEARER_TOKEN_BEDROCK=...

# Optional region (defaults to us-east-1)
export AWS_REGION=us-west-2
```

还支持 ECS 任务角色 (`AWS_CONTAINER_CREDENTIALS_*`) 和 IRSA (`AWS_WEB_IDENTITY_TOKEN_FILE`)。

```bash
pi --provider amazon-bedrock --model us.anthropic.claude-sonnet-4-20250514-v1:0
```

对于 ID 包含可识别模型名称（基础模型和系统定义的推理配置文件）的 Claude 模型，会自动启用提示缓存。对于应用程序推理配置文件（其 ARN 不包含模型名称），设置 `AWS_BEDROCK_FORCE_CACHE=1` 以启用缓存点：

```bash
export AWS_BEDROCK_FORCE_CACHE=1
pi --provider amazon-bedrock --model arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123
```

如果您要连接到 Bedrock API 代理，则可以使用以下环境变量：

```bash
# Set the URL for the Bedrock proxy (standard AWS SDK env var)
export AWS_ENDPOINT_URL_BEDROCK_RUNTIME=https://my.corp.proxy/bedrock

# Set if your proxy does not require authentication
export AWS_BEDROCK_SKIP_AUTH=1

# Set if your proxy only supports HTTP/1.1
export AWS_BEDROCK_FORCE_HTTP1=1
```

### Cloudflare AI 网关

`CLOUDFLARE_API_KEY` 可以通过`/login` 设置。帐户 ID 和网关 slug 可以设置为环境变量，也可以设置在 API 密钥凭证的 `env` 对象中的 `auth.json` 中。

```bash
export CLOUDFLARE_API_KEY=...           # or use /login
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_GATEWAY_ID=...        # create at dash.cloudflare.com → AI → AI Gateway
pi --provider cloudflare-ai-gateway --model "claude-sonnet-4-5"
```

通过 Cloudflare AI Gateway 路由到 OpenAI、Anthropic 和 Workers AI。 Workers AI 使用统一 API (`/compat`) 和前缀模型 ID (`workers-ai/@cf/...`)。 OpenAI 使用 OpenAI 直通路由 (`/openai`) 和本机 OpenAI 模型 ID，例如`gpt-5.1`。 Anthropic 使用 Anthropic 直通路由 (`/anthropic`) 和原生 Anthropic 模型 ID，例如`claude-sonnet-4-5`。

AI网关认证使用`CLOUDFLARE_API_KEY`作为`cf-aig-authorization`。上游身份验证可以是以下之一：

|模式|请求授权|上游授权|
|------|--------------|---------------|
|工人人工智能|仅 Cloudflare 令牌|Cloudflare-native|
|统一计费|仅 Cloudflare 令牌|Cloudflare 处理上游身份验证并扣除积分|
|存储的 BYOK|仅 Cloudflare 令牌|Cloudflare 注入存储在 AI Gateway 仪表板中的提供商密钥|
|内嵌BYOK|Cloudflare 令牌加上上游 `Authorization` 标头|该请求提供上游提供商密钥|

对于正常的 pi 使用，更喜欢统一计费或存储 BYOK。内联 BYOK 需要为 Cloudflare AI Gateway 提供商配置额外的上游 `Authorization` 标头，例如通过 `models.json` 提供商/模型覆盖。

### Cloudflare Workers AI

`CLOUDFLARE_API_KEY` 可以通过`/login` 设置。 `CLOUDFLARE_ACCOUNT_ID` 可以设置为环境变量，也可以设置在 `auth.json` 中 API 密钥凭证的 `env` 对象中。

```bash
export CLOUDFLARE_API_KEY=...           # or use /login
export CLOUDFLARE_ACCOUNT_ID=...
pi --provider cloudflare-workers-ai --model "@cf/moonshotai/kimi-k2.6"
```

Pi 自动为[前缀缓存](https://developers.cloudflare.com/workers-ai/features/prompt-caching/)折扣设置`x-session-affinity`。

### 谷歌顶点人工智能

使用应用程序默认凭据：

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project
export GOOGLE_CLOUD_LOCATION=us-central1
```

或者将 `GOOGLE_APPLICATION_CREDENTIALS` 设置为服务帐户密钥文件。

## 骆驼.cpp

Pi 支持 llama.cpp 路由器服务器。使用`/login llama.cpp`对其进行配置，使用`/llama`管理加载的模型，并使用`/model`选择加载的模型。

有关服务器设置、模型目录布局、环境变量和命令用法，请参阅 [llama.cpp](llama-cpp.md)。

## 定制供应商

**通过 models.json：** 添加 Ollama、LM Studio、vLLM 或任何支持 API 的提供商（OpenAI Completions、OpenAI Responses、Anthropic Messages、Google Generative AI）。请参阅[models.md](models.md)。

**通过扩展：** 对于需要自定义 API 实现或 OAuth 流程的提供商，请创建扩展。请参阅 [custom-provider.md](custom-provider.md) 和 [examples/extensions/custom-provider-gitlab-duo](../../../examples/extensions/custom-provider-gitlab-duo/)。

## 决议顺序

解析提供商的凭据时：

1. CLI `--api-key` 标志
2. `auth.json` 条目（API 密钥或 OAuth 令牌）
3. 环境变量
4. 来自 `models.json` 的自定义提供商密钥
