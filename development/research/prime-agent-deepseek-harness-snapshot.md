# External Agent Research Snapshot

```text
Captured: 2026-08-17
Research mode: read-only source inspection
CoCo base: 95f96df4f65f341523a30dc5d5faea2c5187813b
```

## Prime Agent

```text
repository: https://github.com/PrimeIntellect-ai/prime-agent
commit: 849c92114b0b4372fa272281b87cdbe8f7c9ed8d
branch: main
license: MIT
local snapshot: /tmp/opencode/prime-agent-research
```

Primary sources:

- `README.md`
- `packages/coding-agent/docs/architecture.md`
- `packages/coding-agent/docs/rlm.md`
- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/agent.ts`
- `packages/coding-agent/src/modes/daemon/command-recovery-journal.ts`
- `packages/coding-agent/src/modes/daemon/daemon-supervisor.ts`
- `packages/coding-agent/src/modes/daemon/rlm-ledger.ts`
- `packages/coding-agent/src/core/session-lease.ts`
- `packages/coding-agent/src/core/refinement/`

## DeepSeek Harness

```text
repository: https://github.com/deepseek-ai/deepseek-harness
commit: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
branch: master
tag: dsh-v0.1.0-rc.7
license: MIT
maturity: developer preview
local snapshot: /tmp/opencode/deepseek-harness-research
```

Primary sources:

- `README.md`
- `docs/architecture.md`
- `docs/subsystems/`
- `vendor/cordis/src/`
- `packages/core/session/`
- `packages/core/agent-loop/`
- `packages/core/tools/`
- `packages/session/session-checkpoint-policy/`
- `packages/llm/`
- `packages/mcp/`
- `packages/settings/`
- `packages/runtime-diagnostics/invariants/`

## Reproducibility

The local snapshots are research material outside the CoCo repository and package. Re-clone and verify the commits before future use:

```bash
git clone https://github.com/PrimeIntellect-ai/prime-agent.git
git -C prime-agent checkout 849c92114b0b4372fa272281b87cdbe8f7c9ed8d

git clone https://github.com/deepseek-ai/deepseek-harness.git
git -C deepseek-harness checkout 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
```

No external code was copied into CoCo during this research. Any future code adoption requires a separate license/notice review, dependency closure, provenance record, security review, and explicit work item.
