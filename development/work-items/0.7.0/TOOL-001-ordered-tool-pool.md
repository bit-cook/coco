# TOOL-001: Ordered Bounded Tool Pool

```text
Status: pending
Priority: P1 prototype
Target: 0.7.0
Owner: unassigned
Depends on: EVID-002, CON-001
Blocks: none
Sources: DeepSeek Harness 99f6f02f
```

## Problem

Serial tool execution limits throughput, but unconstrained parallel execution makes side effects, transcript order, cancellation, and recovery nondeterministic.

## Reproduction

Issue multiple independent read/search calls mixed with a write or shell call. Compare serial latency against naive parallel execution and observe ordering/side-effect ambiguity.

## Required Invariants

- Only tools explicitly classified `parallel-safe` may overlap.
- Exclusive tools form a barrier before and after execution.
- Results commit in original request order.
- Every admitted call receives exactly one terminal result, including cancellation and recovery.
- Concurrency, time, output, and resource use are bounded.

## Scope

- tool capability metadata
- scheduler and ordered result commit
- synthetic cancelled/interrupted results
- performance and race tests

## Out of Scope

- Guessing safety from tool names
- Parallel workspace writes
- External framework scheduler adoption

## Design

Add explicit capability metadata. Schedule contiguous safe calls into a bounded pool, stop at exclusive barriers, collect out of order internally, and append terminal results in request order after durability fences.

## Acceptance Tests

- Read/search speedup benchmark.
- Write/shell calls never overlap unless a separately reviewed capability permits it.
- Deterministic transcript under randomized completion order.
- Cancellation and crash close every call exactly once.

## Verification

Property/race tests, resource limits, transcript/receipt validation, complete core.

## Rollback

Set pool size to one while preserving metadata and event schema.

## Evidence

Research only. Inspired by DeepSeek Harness `packages/core/agent-loop/src/tool-calls.ts`. No external code copied.
