# Coco CLI

This page is the Coco operational reference. It takes precedence over inherited Pi documentation.

## Install and upgrade

Requirements: Node.js `>=22.19.0`; the release installer supports macOS and Linux.

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

To install a reviewed release, download that release's `install.sh` and run it with the matching `COCO_VERSION`:

```bash
curl -fsSLO https://github.com/bit-cook/coco/releases/download/v0.1.8/install.sh
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

## Persistent goals

`/goal` is a built-in interactive command for keeping a goal and its execution plan with the current session branch. It is not a shell command or a top-level `coco` CLI argument.

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

- `/goal <description>` and `/goal set <description>` set a new active goal and clear its existing plan. `/goal` and `/goal status` display the goal and step progress.
- `/goal plan` asks the model to create and store a concise, verifiable plan, but does not execute it. `/goal pause` stops injecting goal context; `/goal resume` makes an existing goal active again.
- `/goal done <step>` marks that numbered step done only after its work and verification are complete. `/goal active <step>`, `/goal block <step>`, and `/goal reopen <step>` set a numbered step to active, blocked, or pending. `/goal continue` resumes the goal and asks the model to start with the first unfinished step. `/goal complete` completes the goal and marks all planned steps done; `/goal clear` removes the goal and plan.

Goal state is appended to session history and restored from the current branch, so a forked or resumed branch has its own latest goal state rather than a shared global goal. During context compaction, the active goal context is regenerated before the next agent turn; use `/goal status` to inspect the persisted goal and plan after compaction.

The model has a `goal` tool for reading and updating the current goal's plan and progress. Its actions are `status`, `set_steps`, `activate_step`, `block_step`, `reopen_step`, `complete_step`, and `complete`; it must use `set_steps` to store an ordered plan and must not complete a step before work and verification finish. The goal guides work but does not override the current user instruction or Coco safety policy.

## Language

Use `/language`, `/language en`, or `/language zh-CN` to select a built-in language. `/language status` shows the selection and `/language list` includes valid user language packs. Selection persists globally. Custom data-only JSON packs belong in `~/.coco/agent/languages/`; see the [Coco user manual](manual.md#language-switching-and-language-packs) for the schema, supported keys, validation rules, and pack-authoring workflow.

The selection localizes Coco-owned commands and response guidance. Some inherited Pi core UI remains English, and an explicit current user language request takes priority.

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
