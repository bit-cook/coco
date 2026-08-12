# CoCo Agent

<img src="site/logo.svg" alt="CoCo Agent" width="72" height="72" />

CoCo Agent is a general AI assistant with strong coding and terminal capabilities, built as a downstream distribution of [Pi Coding Agent](https://github.com/earendil-works/pi) with `agnes/agnes-2.5-flash` at `max` thinking as the default model. CoCo includes no provider credentials in source.

[English](https://github.com/bit-cook/coco/blob/main/README.md) | [简体中文](https://github.com/bit-cook/coco/blob/main/documentation/zh-CN/README.md) | [Documentation](https://github.com/bit-cook/coco/tree/main/documentation)

## Install

Requirements: Node.js `>=22.19.0`; the release installer supports macOS and Linux.

Install the newest stable release through the stable Pages launcher:

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

Or install an explicitly reviewed release:

```bash
curl -fsSLO https://github.com/bit-cook/coco/releases/download/v0.3.8/install.sh
COCO_VERSION=0.3.8 bash install.sh
```

The installer verifies the exact-tag release tarball and the pinned public Agnes credential against their published SHA-256 values, safely extracts CoCo, and preserves existing `~/.coco/agent` configuration during updates and reinstalls.

Fresh installs work with Agnes max immediately and show models for Agnes, IDEPub, StepFun, Achai, and DeepSeek, including `deepseek-v4-flash` and `deepseek-v4-pro`. Achai credentials come from `ACHAI_API_KEY` or an existing OpenCode secret; CoCo does not bundle an Achai key. Set `AGNES_API_KEY` to override the default Agnes credential, set `DEEPSEEK_API_KEY` on a fresh install to import a DeepSeek credential, or configure another provider after installation.

To upgrade, run the stable installer command again. Do not use `coco update`; CoCo intentionally does not provide that command.

## Quick start

Run CoCo after installation:

```bash
coco
coco -p "hello"
coco --list-models
```

## Documentation

- User manual: [English](documentation/en/docs/manual.md) | [简体中文](documentation/zh-CN/docs/manual.md)
- Operational reference: [CoCo CLI](documentation/en/docs/coco-cli.md) | [CoCo security](documentation/en/docs/coco-security.md)
- Tasks and control: [English](documentation/en/docs/tasks.md) | [简体中文](documentation/zh-CN/docs/tasks.md)
- Language packs: [English instructions](documentation/en/docs/manual.md#language-switching-and-language-packs) | [中文说明](documentation/zh-CN/docs/manual.md#多语言切换与语言包)
- Documentation index: [English](documentation/en/README.md) | [简体中文](documentation/zh-CN/README.md)

CoCo-specific documentation takes precedence over inherited Pi documentation when they differ.

## Core workflows

Use the built-in interactive `/goal` command to set and track a goal for the current session branch. Goals and plans persist with that branch, survive context compaction, and guide the agent without overriding the current user instruction or CoCo safety policy. See [CoCo CLI](documentation/en/docs/coco-cli.md#persistent-goals) for the command grammar and [CoCo security](documentation/en/docs/coco-security.md#goal-instruction-and-safety-boundary) for the trust boundary.

Use interactive `/loop` for recurring work in the current saved session. It runs only while that matching CoCo session is open, inherits normal CoCo guard and permission behavior, and never loads project-local loop prompts. See [CoCo CLI](documentation/en/docs/coco-cli.md#scheduled-loops).

Use `coco task create` for durable background and worktree tasks that survive terminal closure. Inspect live Agent PIDs with `coco task active`, and completely terminate all Agent process groups with `coco task stop-all`. See [Tasks, Agents, and Control](documentation/en/docs/tasks.md).

CoCo includes English and Simplified Chinese language switching through `/language`. Additional languages can be installed as global JSON language packs.

## Authentication

Set an API key interactively for one of CoCo's five managed providers. The prompt does not echo the key:

```bash
coco manage auth set idepub
coco manage auth set achai
coco manage auth set agnes
coco manage auth set stepfun
coco manage auth set deepseek
```

For automation, pipe a key through standard input. Do not put a real key in shell history, source control, or issue reports:

```bash
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
```

Alternatively, supply credentials only for the current process with these environment variables: `IDEPUB_API_KEY`, `ACHAI_API_KEY`, `AGNES_API_KEY`, `STEPFUN_API_KEY`, or `DEEPSEEK_API_KEY`. Stored keys live in `~/.coco/agent/auth.json` with mode `0600`; no credentials are bundled with CoCo.

## Configuration and security

| Path | Purpose |
|------|---------|
| `~/.coco/agent/settings.json` | Default provider, model, and UI settings |
| `~/.coco/agent/models.json` | Public provider and model metadata |
| `~/.coco/agent/auth.json` | Locally stored credentials (`0600`) |
| `~/.coco/agent/loops.json` | Saved-session recurring loops |
| `~/.coco/agent/tasks.json` | Durable tasks, schedules, status, and results |
| `~/.coco/agent/mcp.json` | MCP stdio server registry and approval policy |
| `~/.coco/agent/control.json` | Active local control endpoint and token (`0600`) |
| `~/.coco/agent/loop.md` | Optional global default loop prompt |
| `~/.coco/agent/skills/` | Skills |
| `~/.coco/agent/prompts/` | Prompt templates |
| `~/.coco/agent/extensions/` | TypeScript extensions |
| `~/.coco/agent/languages/` | Data-only user language packs |

CoCo applies a global-only trust policy for project resources. Project-local settings, extensions, skills, prompts, and system prompt files are not loaded; `resources/project-resource-policy.v1.json` enforces this policy.

## Network and offline use

CoCo starts offline by default. It sets `PI_OFFLINE=1` before Pi loads, so a bare startup does not check for updates or download missing `fd` and `ripgrep` binaries. This affects startup work only; model and provider API calls still run when you use CoCo.

To opt in to Pi's startup network behavior for one invocation, explicitly set `PI_OFFLINE=0`:

```bash
PI_OFFLINE=0 coco
```

Offline and intranet deployment is supported through a platform-specific self-contained ZIP; see [English instructions](documentation/en/docs/manual.md#offline-and-intranet-installation) or [中文说明](documentation/zh-CN/docs/manual.md#离线与内网安装).

## Licensing and upstream

CoCo is MIT licensed. It is a downstream distribution of `@earendil-works/pi-coding-agent`, authored upstream by Mario Zechner and earendil-works under the MIT License. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
