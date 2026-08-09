# Coco User Manual

This manual explains Coco from installation through daily interactive use, automation, customization, diagnostics, and safe removal.

Coco is a downstream distribution of Pi Coding Agent. It keeps Pi's coding and terminal workflow while adding managed providers, persistent goals, an offline startup policy, runtime integrity checks, and stricter resource trust rules.

Terminal commands in this manual start with `coco`. Commands beginning with `/` are entered inside Coco's interactive editor.

## Documentation Scope And Precedence

This repository contains both Coco-specific pages and inherited Pi documentation.

When they disagree, use this order of authority:

1. The behavior and error output of the installed Coco runtime.
2. This manual, [Coco CLI](coco-cli.md), and [Coco security](coco-security.md).
3. The inherited Pi pages for features that Coco forwards unchanged.

Important Coco differences are:

- Start the program with `coco`, not `pi`.
- Global state normally lives under `~/.coco/agent/`, not `~/.pi/agent/`.
- `--api-key` and `--api-key=<value>` are rejected. Use Coco's credential management commands or environment variables.
- `coco update` is rejected. Upgrade by running the approved installer again.
- Project-local settings, extensions, skills, prompt templates, themes, and system prompt files are not loaded.
- Coco's guard is best-effort protection, not a sandbox.

## Requirements

The release installer supports macOS and Linux on `arm64` and `amd64` systems.

Coco requires Node.js `>=22.19.0`. If the system Node is absent or too old, the release installer can install a verified private Node runtime inside the Coco installation.

## Install And Upgrade

Install the newest stable release:

```bash
curl -fsSL https://bit-cook.github.io/coco/install.sh | bash
```

The stable launcher selects the newest non-prerelease release and runs that release's installer.

To install an explicitly reviewed release, download the installer for that exact tag and pass the matching version:

```bash
curl -fsSLO https://github.com/bit-cook/coco/releases/download/v0.1.8/install.sh
COCO_VERSION=0.1.8 bash install.sh
```

The installer verifies checksums and archive structure before replacing an installation. It uses a candidate-and-rollback process so a failed update does not intentionally destroy a working installation.

Default locations are:

| Item | Default path |
|---|---|
| Runtime | `~/.coco` |
| Agent state | `~/.coco/agent` |
| User launcher | `~/.local/bin/coco` |
| Root launcher | `/usr/local/bin/coco` |

Installation locations can be changed with `COCO_INSTALL_DIR`, `COCO_BIN_DIR`, and `COCO_AGENT_DIR`. `COCO_CODING_AGENT_DIR` is also accepted for the agent directory.

On a fresh installation, Coco defaults to provider `agnes`, model `agnes/agnes-2.5-flash`, and thinking level `max`.

To upgrade, run the stable installer command again. Existing `settings.json`, `models.json`, and `auth.json` are preserved during a normal reinstall.

Do not run:

```bash
coco update
```

It returns `UPDATE_COMMAND_FORBIDDEN` by design.

If the shell cannot find `coco` after installation, open a new terminal or add the installer's launcher directory to `PATH`.

### Offline And Intranet Installation

For disconnected Linux or macOS hosts, use a platform-specific Coco offline ZIP built on a connected release machine. The ZIP contains the complete Coco package, bundled dependencies, a verified private Node runtime, checksums, and `offline-install.sh`; the target host does not run npm or download components.

After transferring the ZIP to the intranet, extract it and run:

```bash
bash offline-install.sh
```

To configure an OpenAI Chat Completions-compatible intranet service during installation:

```bash
COCO_INTRANET_BASE_URL=http://10.0.0.8:8000/v1 \
COCO_INTRANET_MODEL_ID=corp-model \
COCO_INTRANET_PROVIDER=corp-ai \
bash offline-install.sh
```

By default, the generated provider reads its key at runtime from `INTRANET_AI_API_KEY`. Change the variable name with `COCO_INTRANET_API_KEY_ENV`. For a keyless service, set `COCO_INTRANET_AUTH_HEADER=0`.

To store a key without placing it in command arguments, read it from standard input:

```bash
printf '%s\n' "$INTRANET_AI_API_KEY" | \
  COCO_INTRANET_BASE_URL=http://10.0.0.8:8000/v1 \
  COCO_INTRANET_MODEL_ID=corp-model \
  COCO_INTRANET_KEY_STDIN=1 \
  bash offline-install.sh
```

Optional model metadata includes `COCO_INTRANET_MODEL_NAME`, `COCO_INTRANET_CONTEXT_WINDOW`, and `COCO_INTRANET_MAX_TOKENS`. Existing provider IDs are never silently overwritten. The offline launcher forces `PI_OFFLINE=1` for startup, but model requests to the configured intranet endpoint still work.

Release maintainers create the current-platform ZIP with `npm run build:offline`. The build machine may download and verify the official Node archive; installation on the target machine does not access the public network.

## First Run

Start an interactive session in the current directory:

```bash
coco
```

Start with an initial request:

```bash
coco "Explain the failing tests in this project"
```

Print one response and exit:

```bash
coco -p "Summarize this repository"
```

List registered models:

```bash
coco --list-models
```

Inspect credential availability if a model cannot be selected:

```bash
coco manage auth status
```

## Startup Network Policy

Unless `PI_OFFLINE` is already set, Coco sets `PI_OFFLINE=1` before Pi loads.

This prevents startup-time update checks and downloads of missing optional `fd` and `ripgrep` binaries. It does not isolate the process from the network and does not disable model or provider API calls made during use.

Enable Pi's startup network behavior for one invocation with:

```bash
PI_OFFLINE=0 coco
```

Model catalog synchronization and provider connectivity checks still require a working network connection. While offline, `coco core check` skips its remote registry comparison but can still verify the local runtime.

## Native Coco Commands

These commands are handled by Coco itself:

| Command | Purpose | Main options |
|---|---|---|
| `coco --help` | Show Coco help | `-h`, `help` |
| `coco --version` | Show Coco version | `-v` |
| `coco manage auth set <provider>` | Store a provider credential | `--stdin`, `--json` |
| `coco manage auth status [provider]` | Report credential availability and source | `--json` |
| `coco manage auth remove <provider>` | Remove a stored credential | `--yes`, `--json` |
| `coco manage models sync` | Refresh managed model catalogs | `--provider`, `--allow-empty`, `--yes`, `--json` |
| `coco manage bootstrap` | Create or repair managed base state | `--dry-run`, `--yes`, `--json` |
| `coco manage migrate` | Migrate legacy state | `--dry-run`, `--yes`, `--json` |
| `coco doctor` | Diagnose local state | `--connectivity`, `--json` |
| `coco core status` | Verify local core identity and integrity | `--json` |
| `coco core check` | Verify local core and compare with the registry when online | `--json` |

Unknown native syntax returns `NATIVE_USAGE`. State-changing commands require `--yes` in a noninteractive environment unless they are dry runs.

Other supported arguments are forwarded to the bundled Pi runtime with Coco's guard and persistent-goal extension injected.

## Managed Providers

Coco manages exactly five providers:

- `agnes`
- `idepub`
- `achai`
- `stepfun`
- `deepseek`

Managed means that Coco can store credentials and synchronize model metadata for the provider. It does not mean that Coco supplies your private provider credential in source.

### Store A Credential

Use hidden interactive entry:

```bash
coco manage auth set idepub
```

The key is entered twice and is not echoed.

For automation, send one key through standard input:

```bash
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
```

Never put a real key in command arguments, shell history, source control, screenshots, logs, or issue reports.

The equivalent current-process environment variables are:

```text
AGNES_API_KEY
IDEPUB_API_KEY
ACHAI_API_KEY
STEPFUN_API_KEY
DEEPSEEK_API_KEY
```

Stored credentials take precedence over environment credentials for managed providers.

### Inspect Credential Status

Inspect all providers or one provider:

```bash
coco manage auth status
coco manage auth status idepub
coco manage auth status --json
```

Status reports availability, source, and rotation state. It never prints the key value.

Possible sources include `auth`, `environment`, `legacy`, and `none`.

### Remove A Credential

Interactive removal asks for confirmation:

```bash
coco manage auth remove idepub
```

For noninteractive use:

```bash
coco manage auth remove idepub --yes --json
```

Removing a stored credential does not unset an environment variable in the current process.

Stored credentials are written to `~/.coco/agent/auth.json` with mode `0600`.

## Models And Catalog Synchronization

Synchronize every managed provider:

```bash
coco manage models sync
```

Synchronize one provider:

```bash
coco manage models sync --provider deepseek
```

Use explicit confirmation and JSON output in automation:

```bash
coco manage models sync --provider idepub --yes --json
```

An empty normalized catalog is rejected by default to avoid replacing useful state after a provider or network failure. Use `--allow-empty` only when an empty catalog is the expected result.

List or filter models:

```bash
coco --list-models
coco --list-models deepseek
```

Open the interactive selector with `/model`. Use Ctrl+P and Shift+Ctrl+P to move through scoped models.

Forwarded model options include:

```text
--provider <name>
--model <pattern|provider/id[:thinking]>
--thinking <level>
--models <patterns>
--list-models [search]
```

Thinking levels are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. A model may support only a subset.

Do not use `--api-key`; Coco rejects it with `API_KEY_ARG_FORBIDDEN`.

Custom providers and models can be configured globally in `~/.coco/agent/models.json`. See [custom models](models.md) and [custom providers](custom-provider.md). Coco's five managed-provider commands do not replace the broader compatible model configuration format.

## Interactive Interface

The default interface has four main areas:

- The startup header reports the active model and loaded global resources.
- The transcript shows messages, reasoning, tool calls, results, notices, and errors.
- The editor accepts prompts, commands, file references, and images.
- The footer reports the directory, session, model, context, token, cache, and cost information.

Common editor actions are:

| Action | Input |
|---|---|
| Search and insert a project file | Type `@` |
| Complete a path or command | Tab |
| Insert a newline | Shift+Enter |
| Open the external editor | Ctrl+G |
| Paste an image | Ctrl+V; Alt+V on Windows where needed |
| Copy the last assistant response | Ctrl+X |
| Run shell and include output in context | `!command` |
| Run shell without adding output to context | `!!command` |
| Abort the current run | Escape |

While the agent is running, Enter queues a steering message. Alt+Enter queues a follow-up for after the current run. Alt+Up retrieves queued text.

Use `/hotkeys` for the active key map and see [keybindings](keybindings.md) for customization.

## Interactive Commands

Frequently used inherited commands include:

| Command | Purpose |
|---|---|
| `/model` | Select a model |
| `/scoped-models` | Configure the model cycling set |
| `/settings` | Change interactive settings |
| `/resume` | Open the session picker |
| `/new` | Start a new session |
| `/name <name>` | Name the current session |
| `/session` | Show session details |
| `/tree` | Navigate the current session tree |
| `/fork` | Start a new session from an earlier user message |
| `/clone` | Copy the active branch into a new session |
| `/compact [prompt]` | Compact older context |
| `/copy` | Copy the last assistant message |
| `/export [file]` | Export the session |
| `/import <file>` | Import a JSONL session |
| `/reload` | Reload supported global resources |
| `/hotkeys` | Show shortcuts |
| `/quit` | Exit |

Some inherited commands can expose upstream provider or package behavior. Coco's credential, update, and project-resource rules still take precedence.

## Language Switching And Language Packs

Coco includes English (`en`) and Simplified Chinese (`zh-CN`). The default is English. Switch interactively with:

```text
/language
/language en
/language zh-CN
/language status
/language list
```

`/language` opens a selector in interactive UI mode. A successful choice is stored in `~/.coco/agent/language.json` and survives restarts. When `COCO_CODING_AGENT_DIR` is set, the selection and language-pack directory follow that agent directory.

The selected language applies to Coco-owned commands and messages, including `/language`, `/goal`, safety confirmation labels, and the instruction asking the model to respond in that language. Command names, code, identifiers, paths, API names, and quoted source remain unchanged. Some inherited Pi core screens are not yet exposed to Coco's translation layer and can remain in English. Model response language is guidance: an explicit user request for another language takes priority.

### Create A Language Pack

User language packs are inert JSON files in:

```text
~/.coco/agent/languages/<locale>.json
```

They are global user data. Coco does not load project-local language packs, download packs, or execute code from a pack.

Example `~/.coco/agent/languages/es.json`:

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

Then run:

```text
/language list
/language es
```

Pack rules:

- The filename without `.json` must exactly equal `locale`.
- `schemaVersion` must be `1`.
- Locale identifiers use letters followed by optional hyphen-separated letters or digits, such as `pt-BR`.
- `name` is the human-readable language name.
- `messages` is a flat object of string keys and string values.
- A user pack may translate only some keys; missing keys fall back to built-in English.
- Files larger than 1 MiB, symbolic links, unknown message keys, non-string values, NUL bytes, and terminal escape characters are rejected.
- Invalid packs are ignored and cannot prevent Coco from starting.
- Placeholders such as `{locale}`, `{name}`, `{status}`, `{completed}`, `{total}`, `{goal}`, and `{locales}` must be preserved where they appear in the English source message.

Supported message keys can be copied from `resources/languages/en.json` in the installed Coco runtime. That file is the authoritative template; `resources/languages/zh-CN.json` is a complete example. To update a pack safely:

1. Copy `resources/languages/en.json` outside the installation.
2. Change `locale` and `name`.
3. Translate message values without changing keys, command names, or placeholders.
4. Save it as `~/.coco/agent/languages/<locale>.json` with mode `0600`.
5. Run `/language list`, then `/language <locale>`.
6. Run `/language status` and test `/goal status` plus one normal model response.

Do not edit the packaged built-in catalogs: runtime integrity verification protects them, and an installer upgrade replaces packaged files. Keep custom packs in the global user language directory.

## Persistent Goals

`/goal` stores an objective and plan on the current session branch. It is an interactive command, not a shell command or top-level CLI option.

The complete grammar is:

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

### Goal Lifecycle

- `/goal` and `/goal status` show the objective and step progress.
- `/goal <description>` and `/goal set <description>` create a new active goal and clear the previous plan.
- `/goal plan` asks the model to create and store a concise, verifiable plan. It does not ask the model to execute that plan yet.
- `/goal pause` stops active goal context injection without deleting state.
- `/goal resume` makes an existing goal active.
- `/goal continue` resumes the goal and asks the agent to begin with the first unfinished step.
- `/goal done <step>` marks a numbered step done only after its work and verification are complete.
- `/goal active <step>`, `/goal block <step>`, and `/goal reopen <step>` set a step to active, blocked, or pending.
- `/goal complete` completes the goal and marks all planned steps done.
- `/goal clear` removes the goal and plan.

The model receives a `goal` tool with `status`, `set_steps`, `activate_step`, `block_step`, `reopen_step`, `complete_step`, and `complete` actions.

Goal snapshots are appended to session history and restored from the active branch. A forked branch can therefore have a different latest goal state. Active goal context is regenerated after compaction before the next agent turn.

A goal is guidance, not authorization. The current user instruction and Coco safety policy take priority.

## Built-In Tools And Guard Behavior

The forwarded runtime provides these built-in tools:

```text
read
bash
edit
write
grep
find
ls
```

Control tool availability with:

```bash
coco --tools read,grep,find,ls -p "Review without modifying files"
coco --exclude-tools bash "Analyze this project"
coco --no-builtin-tools "Use only extension tools"
coco --no-tools -p "Give advice without tools"
```

Coco injects a guard that classifies some shell commands and file writes. It may allow, ask for confirmation, or block an operation. In modes without interactive confirmation, confirmation-required actions fail closed.

Tool restrictions and guard checks reduce risk, but they are not process isolation. Tools and extensions run with the permissions of the user who launched Coco.

## Sessions, Trees, Forks, And Clones

Coco sessions are append-only JSONL trees organized by working directory.

Common startup options are:

```bash
coco -c
coco -r
coco --session <path-or-id>
coco --fork <path-or-id>
coco --session-dir <directory>
coco --no-session
coco --name "release work"
```

Use `/resume` to search previous sessions and `/session` to inspect the current session.

Use `/tree` to move within the same session file. Selecting an earlier user message lets you edit and resubmit it as a new branch. Selecting another entry type moves the active leaf to that point.

Use `/fork` to create a new session from an earlier user message. Use `/clone` to copy the complete active branch into a new session.

| Need | Command |
|---|---|
| Explore an alternative in the same history | `/tree` |
| Start independently from an older prompt | `/fork` |
| Duplicate current progress | `/clone` |

See [sessions](sessions.md) and [session format](session-format.md).

## Context Compaction

Automatic compaction summarizes older messages as the context window fills. Manual compaction is available with:

```text
/compact
/compact Focus the summary on unresolved test failures
```

Compaction keeps recent context and a structured summary, but does not preserve every old message verbatim. Branch summarization during `/tree` navigation is related but serves a different purpose.

Persistent active goal context is regenerated for the next agent turn after compaction.

See [compaction](compaction.md) for settings and extension hooks.

## Print, JSON, And RPC Modes

### Print Mode

Print one answer and exit:

```bash
coco -p "List the likely causes"
cat README.md | coco -p "Summarize this input"
```

Print mode has no interactive UI. Guard operations that require confirmation are blocked.

### JSON Event Stream

Emit JSONL events:

```bash
coco --mode json "List the files"
```

The stream includes session, agent, turn, message, tool, queue, retry, and compaction events. See [JSON event stream mode](json.md).

### RPC Mode

Run a long-lived JSONL process over stdin and stdout:

```bash
coco --mode rpc
```

RPC supports prompting, steering, follow-ups, aborts, model and thinking changes, session operations, compaction, shell commands, exports, and an extension UI protocol.

RPC is not the terminal UI. Terminal-specific custom components and theme APIs are unavailable or reduced. See [RPC mode](rpc.md).

## Global State And Settings

The default state root is `~/.coco/agent/`. Set `COCO_CODING_AGENT_DIR` to use another absolute agent directory.

| Path | Purpose |
|---|---|
| `~/.coco/agent/settings.json` | Model, UI, retry, queue, and session settings |
| `~/.coco/agent/models.json` | Managed and custom model metadata |
| `~/.coco/agent/auth.json` | Stored credentials (`0600`) |
| `~/.coco/agent/ownership.json` | Ownership metadata for managed files |
| `~/.coco/agent/migration.json` | Migration and rotation state |
| `~/.coco/agent/catalogs/` | Current and previous provider catalogs |
| `~/.coco/agent/sessions/` | Session storage |
| `~/.coco/agent/extensions/` | Global extensions |
| `~/.coco/agent/languages/` | Data-only user language packs |
| `~/.coco/agent/skills/` | Global skills |
| `~/.coco/agent/prompts/` | Global prompt templates |
| `~/.coco/agent/themes/` | Global themes |

Use `/settings` for common interactive preferences. Direct JSON editing is also supported for user-owned settings. Do not commit credentials or managed state to source control.

See [settings](settings.md), but translate inherited `~/.pi/agent` examples to Coco's global directory and ignore project-local loading instructions.

## Extensions, Skills, Templates, And Themes

Coco uses a `global-only` project-resource policy.

Automatically discovered user resources belong under the global agent directory:

```text
~/.coco/agent/extensions/
~/.coco/agent/skills/
~/.coco/agent/prompts/
~/.coco/agent/themes/
```

Project-local settings, extensions, skills, templates, themes, and system prompt files are not loaded, even if inherited Pi documentation describes a project trust flow.

Explicit compatible options remain available for reviewed resources:

```text
-e, --extension <source>
--skill <path>
--prompt-template <path>
--theme <path>
```

Disable discovery with `--no-extensions`, `--no-skills`, `--no-prompt-templates`, or `--no-themes`.

Extensions execute code with your user permissions. Review them before use. See [extensions](extensions.md), [skills](skills.md), [prompt templates](prompt-templates.md), and [themes](themes.md), applying Coco's global-only rule.

## Diagnostics And State Maintenance

Run local diagnostics:

```bash
coco doctor
coco doctor --json
```

Doctor checks runtime identity and integrity, configuration schemas, ownership, secret permissions, default-provider auth, model resolution, catalogs, session writability, trust policy, managed prompt ownership, and guard availability.

Request provider probes explicitly:

```bash
coco doctor --connectivity
```

Offline connectivity checks are reported as skipped rather than silently enabling network access.

Inspect the bundled core:

```bash
coco core status
coco core check
PI_OFFLINE=0 coco core check
```

`core status` is local. `core check` adds a remote registry comparison when startup networking is enabled. Neither command updates Coco.

Preview or apply managed-state bootstrap:

```bash
coco manage bootstrap --dry-run --json
coco manage bootstrap --yes
```

Preview or apply legacy-state migration:

```bash
coco manage migrate --dry-run --json
coco manage migrate --yes
```

Migration can move legacy credentials out of `models.json`, mark them for rotation, and preserve redacted backup state. Inspect the result with `coco manage auth status` and replace credentials marked for rotation.

## Security And Trust Boundary

Coco's packaged resources are integrity-checked. The runtime rejects unexpected or modified governed runtime files before normal startup.

The `global-only` policy prevents repositories from automatically supplying executable configuration to Coco. It does not make repository content trustworthy: source files, documentation, generated files, prompts, and tool output can all contain malicious or misleading instructions.

The guard is best-effort and not a sandbox. Coco, Pi tools, shell commands, and extensions run with the invoking user's operating-system permissions.

For untrusted repositories, unattended work, or valuable credentials, use a container, VM, micro-VM, or remote sandbox. Give the isolated environment only the workspace, credentials, network access, and host mounts it needs.

Read [Coco security](coco-security.md) before high-risk use.

## Troubleshooting

| Error or symptom | Meaning | Action |
|---|---|---|
| `API_KEY_ARG_FORBIDDEN` | `--api-key` was used | Use `coco manage auth set`, `--stdin`, or a provider environment variable |
| `UPDATE_COMMAND_FORBIDDEN` | `coco update` was used | Run the stable installer again |
| `NATIVE_USAGE` | Native command syntax is invalid | Check `coco --help` |
| `CONFIRMATION_REQUIRED` | A state-changing command is running without a TTY | Review it, then use `--yes`, or start with `--dry-run` |
| `AUTH_TTY_UNAVAILABLE` | Hidden interactive key entry has no TTY | Pipe the key to `--stdin` securely |
| `AUTH_CONFIRMATION_MISMATCH` | The two hidden entries differ | Run the command again |
| `AUTH_KEY_INVALID` | The key is empty, malformed, multiline, or too large | Supply one valid line without surrounding whitespace |
| `AUTH_PROVIDER_INVALID` | Provider is not managed | Use `agnes`, `idepub`, `achai`, `stepfun`, or `deepseek` |
| Model absent from `/model` | Registration or auth is missing | Check auth status and `coco --list-models`; synchronize if needed |
| `EMPTY_CATALOG_REJECTED` | Sync returned no models | Fix provider/network problems; use `--allow-empty` only intentionally |
| Project extension does not load | Coco blocks project-local resources | Install a reviewed extension globally or pass it explicitly |
| Registry check is skipped | Startup is offline | Use `PI_OFFLINE=0 coco core check` for a remote comparison |
| Tool action is blocked | Coco guard rejected or could not confirm it | Review the action; use real isolation for sensitive work |
| Integrity or ownership failure | Runtime or managed state differs from its contract | Run `coco doctor`; repair with approved installer/bootstrap paths |

Diagnostic JSON is designed not to reveal credential values, but review paths and project metadata before sharing it.

## Uninstall

Use the `uninstall.sh` shipped with the release.

The uninstaller validates ownership before removing the runtime and managed launchers. It refuses dangerous paths such as `/`, the home directory, unrecognized installations, and unrelated launchers.

The default installation stores user state inside `~/.coco`, so uninstalling the default installation removes its `agent` directory, including stored auth, models, and sessions. Back up only the state you intend to keep before running it.

If another `coco` remains on `PATH`, inspect it with:

```bash
command -v coco
```

Do not manually delete an unrelated executable merely because it has the same name.

## Quick Command Reference

```bash
# Start, help, and one-shot mode
coco
coco --help
coco --version
coco -p "Explain this error"

# Models and credentials
coco --list-models
coco manage auth set idepub
printf '%s\n' "$IDEPUB_API_KEY" | coco manage auth set idepub --stdin
coco manage auth status
coco manage auth remove idepub --yes
coco manage models sync --provider idepub --yes --json

# Sessions and automation
coco -c
coco -r
coco --no-session -p "Analyze once"
coco --mode json "List files"
coco --mode rpc

# Diagnostics and maintenance
coco doctor
coco doctor --connectivity --json
coco core status
PI_OFFLINE=0 coco core check
coco manage bootstrap --dry-run --json
coco manage migrate --dry-run --json
```

Interactive essentials:

```text
/model
/settings
/resume
/tree
/compact
/goal set Prepare and verify the release
/goal plan
/goal done 1
/goal status
```

## Detailed Local References

- [Coco CLI](coco-cli.md): normative Coco installation, native CLI, offline, auth, and goal behavior.
- [Coco security](coco-security.md): resource policy, guard limitations, and goal trust boundary.
- [Settings](settings.md): compatible UI, queue, retry, compaction, and model settings.
- [Models](models.md): custom provider/model configuration.
- [Sessions](sessions.md): resume picker, trees, branches, forks, and clones.
- [Compaction](compaction.md): context compaction and branch summaries.
- [Keybindings](keybindings.md): shortcuts and customization.
- [Extensions](extensions.md): extension API, subject to Coco's global-only policy.
- [Skills](skills.md): skill format and invocation, subject to Coco's global-only policy.
- [Prompt templates](prompt-templates.md): template syntax and invocation.
- [Themes](themes.md): theme files and selection.
- [JSON mode](json.md): JSONL event format.
- [RPC mode](rpc.md): headless protocol and extension UI messages.
- [Containerization](containerization.md): real isolation for untrusted work.
- [Terminal setup](terminal-setup.md): terminal compatibility and shortcut setup.

Use `coco --help` to confirm the native grammar of the installed version. For forwarded features, use the corresponding inherited reference only where it does not conflict with Coco's CLI and security contracts.
