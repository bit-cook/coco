# Tasks, Agents, and Control

CoCo 0.2 runs durable tasks through one local runner. A task keeps its status and result under `~/.coco/agent/tasks.json`, while each coding task uses a Git worktree by default.

```bash
coco task create "Implement and test the feature"
coco task list --json
coco task active
coco task cancel <id>
coco task stop-all
```

`active` reports the runner and every running Agent PID. `stop-all` first terminates every Agent process group, escalates from `SIGTERM` to `SIGKILL`, verifies that the groups are gone, marks their tasks cancelled, and stops the runner so schedules cannot immediately restart work.

## Triggers

```bash
coco task create "Run the maintenance review" --schedule 6h
coco task create "Review the incoming payload" --webhook
coco task create "Review pushes" --github-event push
```

Webhook and GitHub tasks remain blocked until their generated endpoint receives a valid bearer token or `X-Hub-Signature-256` HMAC. Missed schedules are not replayed in a burst.

## Control Dashboard

```bash
coco control start
coco control token
coco control status
```

Open the reported loopback URL and enter the token. The dashboard can create approval-gated worktree tasks, show history and live Agents, cancel one task, or completely terminate all tasks. It does not expose raw RPC, provider credentials, arbitrary session paths, or a direct shell endpoint.

The control server only accepts loopback listeners. For remote access, keep it on `127.0.0.1` and use an authenticated SSH tunnel or a TLS-terminating tunnel that keeps the origin private. The built-in server is HTTP and does not terminate TLS.

## MCP

```bash
coco mcp add filesystem -- node /absolute/path/to/server.mjs
coco mcp approve filesystem
coco mcp list
coco mcp remove filesystem
```

MCP stdio servers use the official SDK and a restricted inherited environment. New servers default to interactive approval and are denied in headless sessions until `coco mcp approve <name>` explicitly changes their policy. Use `ask` or `deny` to tighten it again.

## VS Code

The packaged `vscode/` extension connects to the same control API. It can include the active selection and open tabs, create immediate or approval-gated tasks, browse task history, and open a native Git diff.
