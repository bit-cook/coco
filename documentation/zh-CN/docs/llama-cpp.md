# llama.cpp

Pi 支持 [llama.cpp](https://github.com/ggml-org/llama.cpp) 路由服务器。路由器可以发现多个 GGUF 模型，并按需加载或卸载它们。

请使用当前且支持路由功能的 llama.cpp 构建版本。请参阅[构建说明](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)，或为你的平台安装[预构建版本](https://github.com/ggml-org/llama.cpp/releases)。

## 启动路由器

启动 `llama-server` 时不要使用 `--model` 或 `-m`。传入模型会启动单模型模式，而不是路由模式。

```bash
llama-server \
  --models-dir ~/models \
  --no-models-autoload \
  --jinja \
  --host 127.0.0.1 \
  --port 8080 \
  -ngl 999 \
  -c 32768
```

重要选项：

- `--models-dir ~/models` 发现本地 GGUF 文件。
- `--no-models-autoload` 保持通过 `/llama` 显式加载。
- `--jinja` 启用兼容的聊天模板和工具调用。
- `-ngl 999` 尽可能多地将层卸载到 GPU。
- `-c 32768` 设置每个已加载模型的上下文窗口。省略此项将使用模型原生上下文，可能需要明显更多内存。

单文件模型可以直接放在模型目录中。请将多模态模型和多分片模型放在单独的子目录中：

```text
~/models/
├── llama-3.2-1b-Q4_K_M.gguf
├── gemma-3-4b-it-Q4_K_M/
│   ├── gemma-3-4b-it-Q4_K_M.gguf
│   └── mmproj-F16.gguf
└── large-model-Q4_K_M/
    ├── large-model-Q4_K_M-00001-of-00003.gguf
    ├── large-model-Q4_K_M-00002-of-00003.gguf
    └── large-model-Q4_K_M-00003-of-00003.gguf
```

手动添加文件后请重启路由器。若要设置每个模型的上下文大小和其他选项，请使用 [llama.cpp 模型预设](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#model-presets)。

## 配置 Pi

启动 Pi 并配置提供商：

```text
/login llama.cpp
```

输入路由器 URL 和可选的 API 密钥。默认 URL 是 `http://127.0.0.1:8080`。

无需 `/login`，也可以通过环境变量配置相同的值：

```bash
export LLAMA_BASE_URL=http://127.0.0.1:8080
export LLAMA_API_KEY=optional-secret
pi
```

如果服务器使用 API 密钥，请使用匹配的 `--api-key` 值启动 `llama-server`。保持 `--host 127.0.0.1`，以便仅允许本地访问。

## 管理模型

运行：

```text
/llama
```

- 选择未加载的模型以加载它。
- 选择已加载的模型以卸载它。
- 选择 **下载模型…**，搜索 Hugging Face，然后选择仓库和量化方式。也支持精确的 `owner/repository[:quant]` 值。
- 在加载或下载期间按 Escape，然后确认取消。

Hugging Face 搜索在设置了 `HF_TOKEN` 时使用它，然后检查 `$HF_TOKEN_PATH`、`$HF_HOME/token`、`$XDG_CACHE_HOME/huggingface/token` 和 `~/.cache/huggingface/token`。不进行身份验证也可以搜索，但速率限制更低。Pi 会在下载受限仓库前发出警告，并链接到其访问页面。下载由 llama.cpp 服务器执行，因此选定仓库需要访问权限时，该进程也必须拥有 `HF_TOKEN`。

如果还有其他模型已加载，Pi 会询问是先卸载它们还是保留它们。Pi 不会静默卸载模型，也绝不会删除模型文件。路由器可能与其他客户端共享，因此 `/llama` 始终显示路由器的当前状态。

只有已加载的模型会出现在 `/model` 中。加载模型后，运行 `/model`，为当前 Pi 会话选择它。

如果路由器断开连接，`/llama` 会显示 **重试** 和 **关闭**。重试会重新连接并刷新模型状态，不会重放被中断的操作。

## 故障排除

检查路由器是否可访问：

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/models
```

- **`/llama` 中没有模型：** 检查 `--models-dir` 和目录布局，然后重启路由器。
- **`/model` 中缺少模型：** 先使用 `/llama` 加载它。
- **加载失败或占用内存过多：** 降低 `-c`，或卸载另一个模型。
- **服务器不在路由模式：** 在不使用 `--model`、`-m` 或 `-hf` 的情况下启动它。
