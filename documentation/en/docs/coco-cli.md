# Coco CLI

This page is the Coco operational reference. It takes precedence over inherited Pi documentation.

## Install and upgrade

Requirements: Node.js `>=22.19.0`; the release installer supports macOS and Linux.

```bash
curl -fsSL https://aithernexus.github.io/coco/install.sh | bash
```

To install a reviewed release, download that release's `install.sh` and run it with the matching `COCO_VERSION`:

```bash
curl -fsSLO https://github.com/aithernexus/coco/releases/download/v0.1.8/install.sh
COCO_VERSION=0.1.8 bash install.sh
```

Upgrade by running the stable installer again. It verifies the release artifact and preserves existing `~/.coco/agent` configuration during updates and reinstalls. `coco update` is not available.

## Start and offline behavior

```bash
coco
coco -p "hello"
coco --list-models
```

Coco starts with `PI_OFFLINE=1` unless you have set `PI_OFFLINE`. Startup therefore does not check for updates or download missing `fd` and `ripgrep` binaries. This does not disable model or provider API calls. Opt in to Pi startup networking for one run with:

```bash
PI_OFFLINE=0 coco
```

## Managed providers and authentication

Coco manages exactly these providers: `agnes`, `idepub`, `achai`, `stepfun`, and `deepseek`. A fresh installer configures Agnes as the default (`agnes/agnes-2.5-flash` with `max` thinking); it does not bundle provider credentials in source.

Do not pass credentials on the command line: `--api-key` is rejected. Store a key without exposing it in shell history with the interactive command, which does not echo the key:

```bash
coco manage auth set idepub
```

For automation, send the key on standard input:

```bash
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
```

Replace `idepub` with any managed provider. Inspect or remove stored credentials with:

```bash
coco manage auth status
coco manage auth remove idepub
```

Current-process credentials may instead use `AGNES_API_KEY`, `IDEPUB_API_KEY`, `ACHAI_API_KEY`, `STEPFUN_API_KEY`, or `DEEPSEEK_API_KEY`. Stored credentials are in `~/.coco/agent/auth.json` with mode `0600`.

## Configuration scope

Coco uses global resources under `~/.coco/agent/`, including `settings.json`, `models.json`, `auth.json`, `skills/`, `prompts/`, and `extensions/`. Project-local settings, extensions, skills, prompts, and system prompt files are not loaded. See [Coco security](coco-security.md).
