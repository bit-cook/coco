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

No event replay rebuilds `tasks.json`. Older tasks may have no complete history, and log capture does not promise byte-perfect recovery after a process crash.
