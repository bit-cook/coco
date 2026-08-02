# coco

Your personal coding agent, built as a downstream distribution of [Pi Coding Agent](https://github.com/earendil-works/pi) with `agnes/agnes-2.5-flash` at `max` thinking as the default model. Coco includes no provider credentials in source.

[English](https://github.com/aithernexus/coco/blob/main/README.md) | [简体中文](https://github.com/aithernexus/coco/blob/main/documentation/zh-CN/README.md) | [Documentation](https://github.com/aithernexus/coco/tree/main/documentation)

## Requirements

- Node.js `>=22.19.0`
- macOS or Linux for the release installer

## Install

Install the newest stable release through the stable Pages launcher:

```bash
curl -fsSL https://aithernexus.github.io/coco/install.sh | bash
```

Or install an explicitly reviewed release:

```bash
curl -fsSLO https://github.com/aithernexus/coco/releases/download/v0.1.4/install.sh
COCO_VERSION=0.1.4 bash install.sh
```

The installer verifies the exact-tag release tarball and the pinned public Agnes credential against their published SHA-256 values, safely extracts Coco, and preserves existing `~/.coco/agent` configuration during updates and reinstalls. Fresh installs work with Agnes max immediately and include public metadata for Agnes, IDEPub, StepFun, and Achai. Set `AGNES_API_KEY` to override the default credential, or configure another provider after installation.

Run Coco after installation:

```bash
coco
coco -p "hello"
coco --list-models
```

## Startup network policy

Coco starts offline by default. It sets `PI_OFFLINE=1` before Pi loads, so a bare startup does not check for updates or download missing `fd` and `ripgrep` binaries. This affects startup work only; model and provider API calls still run when you use Coco.

To opt in to Pi's startup network behavior for one invocation, explicitly set `PI_OFFLINE=0`:

```bash
PI_OFFLINE=0 coco
```

## Authentication

Set an API key interactively for one of Coco's four managed providers. The prompt does not echo the key:

```bash
coco manage auth set idepub
coco manage auth set achai
coco manage auth set agnes
coco manage auth set stepfun
```

For automation, pipe a key through standard input. Do not put a real key in shell history, source control, or issue reports:

```bash
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
```

Alternatively, supply credentials only for the current process with these environment variables: `IDEPUB_API_KEY`, `ACHAI_API_KEY`, `AGNES_API_KEY`, or `STEPFUN_API_KEY`. Stored keys live in `~/.coco/agent/auth.json` with mode `0600`; no credentials are bundled with Coco.

## Configuration and security

| Path | Purpose |
|------|---------|
| `~/.coco/agent/settings.json` | Default provider, model, and UI settings |
| `~/.coco/agent/models.json` | Public provider and model metadata |
| `~/.coco/agent/auth.json` | Locally stored credentials (`0600`) |
| `~/.coco/agent/skills/` | Skills |
| `~/.coco/agent/prompts/` | Prompt templates |
| `~/.coco/agent/extensions/` | TypeScript extensions |

Coco applies a global-only trust policy for project resources. Project-local settings, extensions, skills, prompts, and system prompt files are not loaded; `resources/project-resource-policy.v1.json` enforces this policy.

## Licensing and upstream

Coco is MIT licensed. It is a downstream distribution of `@earendil-works/pi-coding-agent`, authored upstream by Mario Zechner and earendil-works under the MIT License. See [LICENSE](https://github.com/aithernexus/coco/blob/main/LICENSE) and [NOTICE](https://github.com/aithernexus/coco/blob/main/NOTICE).
