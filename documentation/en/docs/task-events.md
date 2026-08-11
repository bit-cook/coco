# TaskEvent v1 Storage Protocol

TaskEvent is CoCo v0.3's bounded, non-authoritative observability layer. `tasks.json` remains the execution source of truth.

- Each task/run uses `task-events/<taskId>/<runId>.jsonl` with contiguous `seq`, canonical JSON, stable UUID event IDs, and idempotent retries.
- Streams are limited to 4096 events or 4 MiB; each event is limited to 16 KiB. Files use `0600` and directories use `0700`.
- V1 permits only runner lifecycle metadata. `payloadRef` and `payloadDigest` remain `null`; prompts, commands, logs, PIDs, environment values, and credentials are excluded.
- Active runs emit bounded heartbeats. Restart recovery replays pending terminal intents and records interrupted attempts as `run.abandoned` before requeueing.
- Non-interactive stdout/stderr is stored separately in `task-logs/<taskId>/<runId>.jsonl`, limited to 4096 records or 4 MiB per run.
- The loopback bearer-token Control API exposes read-only paginated endpoints at `GET /v1/tasks/<taskId>/runs/<runId>/events` and `/logs`, using exclusive `cursor` and bounded `limit` parameters.
- Each terminal run writes a private canonical receipt at `task-receipts/<taskId>/<runId>.json`, containing the runner contract, exit code, verdict, timestamps, and an optional SHA-256 summary of the bounded log artifact. Receipt publication is idempotent and happens before the terminal event.
- `GET /v1/tasks/<taskId>/runs/<runId>/receipt` returns the authenticated receipt without task prompts, credentials, or raw command output. `GET /v1/tasks/<taskId>/diagnosis` conservatively combines process identity, heartbeat age, and recent log activity into `healthy`, `waiting`, `stuck`, or `unknown`; an unobserved process is never called stuck.
- The first v0.4 context experiment exposes a bounded, read-only `buildRepoMap()` for JavaScript and TypeScript files. It reports candidate functions, classes, exported variables, imports, byte/file/symbol counts, and skips dependency/build directories. It is deliberately lexical and not a complete syntax graph; it does not edit files or run commands.
- The v0.4 execution contract is represented separately by a pure `plan -> edit -> verify` state machine. It rejects skipped phases, terminal-state mutation, and `completed` without an explicit passed verification verdict. The current slice performs no edits or command execution.
- Execution mode resolution is explicit: `isolated-required` rejects when isolation capability is unavailable, while `host-explicit` requires direct confirmation and always carries a visible `non-isolated` label. No mode automatically falls back to host execution.
- A resolved execution request combines mode, policy, and provider capabilities. Isolated requests require enforceable network, secret, and matching workspace controls; any missing capability rejects before execution. Host requests retain their policy declaration but report `host` enforcement rather than claiming provider isolation.
- Provider preflight accepts only a frozen provider ID and exact capability descriptor, then binds one approved request to that provider. Commands, environment values, and executable callbacks are not part of this descriptor or preflight slice, so preflight itself has no execution side effects.

No event replay rebuilds `tasks.json`. Older tasks may have no complete history, and log capture does not promise byte-perfect recovery after a process crash.
