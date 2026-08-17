# Prime Agent and DeepSeek Harness Research

Last reviewed: 2026-08-17

This report studies two external agent systems at fixed source commits and evaluates mechanisms that may improve CoCo. It is not an integration announcement. No source code or dependency from either project was added to CoCo.

## Research Baseline

| Project | Commit | State | License |
|---|---|---|---|
| Prime Agent | `849c92114b0b4372fa272281b87cdbe8f7c9ed8d` | active beta, rapidly evolving | MIT |
| DeepSeek Harness | `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` | `0.1.0-rc.7`, developer preview | MIT |

The reproducible source inventory is recorded in `development/research/prime-agent-deepseek-harness-snapshot.md`.

## Executive Decision

CoCo should not embed either runtime wholesale.

- Prime Agent demonstrates strong long-running daemon, command recovery, recursive-agent lineage, and reviewable harness-refinement patterns. Its persistent Python execution and current authority gaps are incompatible with CoCo's present containment and global-only rules.
- DeepSeek Harness demonstrates strong event-sourced model context, durability fencing, ordered tool execution, provider generations, atomic reload, and plugin lifecycle design. Its Cordis-wide architecture, 248-package granularity, developer-preview API, unauthenticated LAN posture, and partial sandbox are not suitable as a CoCo foundation.

Adopt mechanisms through CoCo-owned contracts and tests, not by importing either framework.

## Prime Agent Architecture

Prime Agent separates UI clients, a daemon supervisor, worker processes, root/child agent sessions, persistent IPython kernels, and durable JSONL/artifact state. The supervisor owns routing, attachments, worker generations, recovery, direct agent messaging, and an authoritative RLM spawn ledger. Each worker owns one root session family.

The model primarily receives one programmable IPython tool. File, shell, skill, memory, and recursive subagent operations are exposed through that persistent environment. A continual harness stores supplemental prompt notes, memories, skill descriptions, and subagent specifications with refinement history and rollback.

### Valuable mechanisms

1. **Host continuation policy**: a host decides whether a model that would stop should continue, based on user follow-up, goals, budget, and quality gates. CoCo should unify goal, loop, schedule, and durable task continuation behind one bounded policy.
2. **Steering versus follow-up queues**: steering is admitted after an in-flight tool boundary; follow-up is admitted only when the agent would stop. This gives a deterministic place for user input, heartbeats, and agent-to-agent messages.
3. **Command recovery journal**: persist command receipt before execution and result before response; duplicate command IDs return the durable result, while unknown side effects become explicit `uncertain` rather than being replayed.
4. **Worker generation fencing**: recovered workers carry a new generation; stale workers cannot publish results. Orphans are reconciled and interrupted work is visible.
5. **PID plus process-start identity leases**: atomic lease takeover resists PID reuse and supports stale-owner recovery.
6. **Authoritative lineage ledger**: child topology is append-only state owned by the supervisor rather than inferred from transcripts.
7. **Reviewable continual harness**: small evidence-backed proposals and rollback history are valuable, but writes must be authorized and transactional in CoCo.

### Risks and rejected adoption

- IPython executes with user permissions and is not a sandbox.
- An example shell sandbox does not constrain Python file, network, environment, or subprocess access.
- Global harness mutation lacks the authorization and provenance CoCo requires.
- Harness whole-file updates need stronger locking, CAS, atomic rename, and fsync semantics.
- The inspected Jupyter receive path contains an HMAC-verification concern.
- Recursive children need hard concurrency, rate, token, time, and cost budgets.
- Persistent Python kernels are deferred until CoCo has real containment and secret isolation.
- Trace upload is deferred until bounded redaction and per-upload consent exist.

## DeepSeek Harness Architecture

DeepSeek Harness composes almost everything as a Cordis plugin. Profiles stack bundles and patches into a plugin tree. Host, agent, and client planes use scoped services, typed events, reversible effects, and per-agent isolation.

The session is an append-only event log. Turn, step, model input/output, tool calls/results, and stopping reasons are durable events. The model request is derived from that log, and a runtime invariant enforces the rule: model-visible means logged.

### Valuable mechanisms

1. **Model-input ledger invariant**: every byte visible to the model must be reconstructable from durable session state. CoCo should compare the actual request projection with persisted evidence.
2. **Durability fence before side effects**: flush model/tool intent before invoking a provider, Bash, or MCP. If persistence fails, the external effect must not start.
3. **Tool-call closure**: every admitted tool call receives exactly one terminal result, including cancellation or recovery-generated synthetic results.
4. **Bounded ordered tool pool**: only explicitly safe tools run in parallel; exclusive tools form barriers; results commit in request order.
5. **Provider generation snapshot**: an in-flight request stays bound to one validated provider/config/credential generation while new requests atomically adopt the next generation.
6. **MCP two-phase reload**: fetch and validate a complete tool generation before publishing it; failed reload retains the last-good set.
7. **Last-good configuration with revision CAS**: writes serialize and compare revisions; invalid external edits do not replace live configuration.
8. **Transactional agent publication**: prepare and set up completely before publishing a live handle; failure tears down every partial registration.
9. **Runtime invariant registry**: lightweight diagnostics register stable error codes and lifecycle-bound checks without coupling every invariant to the core loop.

### Risks and rejected adoption

- The project explicitly declares developer-preview compatibility.
- Importing Cordis and the 248-package decomposition would multiply CoCo ownership, build, and publication risk.
- LAN accessibility without strong authentication is incompatible with CoCo's loopback/token posture.
- Secret redaction can fail open for complex schema forms.
- MCP stdio remains local-code execution and may bypass a unified subprocess/sandbox path.
- File-effect sandboxing does not imply network or process containment.
- General module HMR and plugin-owned settings UI remain immature; CoCo should adopt only validated configuration generations.

## CoCo Fit Analysis

CoCo already has production foundations that must remain authoritative:

- runtime and package integrity;
- durable task state, worktree provisioning, supervisor authorization/outcome, terminal evidence, logs, and receipts;
- managed/custom providers and global MCP;
- goal/session state and an execution evidence object model;
- global-only project-resource policy.

The major gaps are deterministic pre-authorization recovery, truthful process containment, real adapter execution, command-level idempotency, model-input evidence, durability fences before all external effects, and atomic provider/MCP configuration generations.

## Adoption Matrix

| Mechanism | Decision | Earliest phase |
|---|---|---|
| Command recovery journal and explicit uncertain result | adopt through CoCo state transactions | after RUN-001, `0.6.x` |
| Model-visible-means-logged invariant | prototype in CoCo session/task evidence | `0.7.0` |
| Durability fence before model/Bash/MCP effects | adopt | `0.7.0` |
| Ordered bounded safe-tool parallelism | prototype with explicit capability metadata | `0.7.0` |
| Provider generation snapshots | adopt | `0.7.0` |
| MCP atomic last-good reload | prototype | `0.7.0` |
| Config revision CAS and last-good state | adopt | `0.7.0` |
| Authoritative parent/child lineage ledger | prototype after task recovery closure | `0.7.0` |
| Steering/follow-up dual queue | prototype after durable inbox design | `0.7.0` |
| Reviewable harness proposals | research only until authorization/provenance exists | `0.8.0+` |
| Persistent Python RLM kernel | defer | after containment and secret isolation |
| Cordis wholesale migration | reject | never planned |
| Unauthenticated LAN Web control | reject | incompatible |
| File sandbox as a complete security boundary | reject | incompatible |

## Plan Changes

The research adds five candidate work packets under `development/work-items/0.7.0/`:

- `EVID-001-model-input-ledger.md`
- `EVID-002-durability-fence.md`
- `TOOL-001-ordered-tool-pool.md`
- `CFG-001-provider-mcp-generations.md`
- `ORCH-001-lineage-and-continuation.md`

They are deliberately `pending` and blocked by the `0.6.2` P0 recovery/release work. No external runtime, dependency, project-local skill, or plugin is authorized by this report.

## Adoption Gates

Any external mechanism or code proposal must provide:

```text
fixed source commit and license provenance
dependency and publication closure
global-only installation and no project-local auto-load
explicit workspace/network/secret/process capability declaration
supervisor authorization, outcome, receipt, and crash recovery
bounded output, concurrency, time, tokens, and cost
containment claim no stronger than platform evidence
rollback and last-good behavior
focused fault tests and complete CoCo gates
```

If one gate fails, the proposal is rejected rather than compensated by a feature score.
