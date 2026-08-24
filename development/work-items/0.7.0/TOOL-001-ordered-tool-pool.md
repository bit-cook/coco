# TOOL-001: Ordered Bounded Tool Pool

```text
Status: completed
Priority: P1 prototype
Target: 0.7.0
Owner: coordinator
Depends on: EVID-002, CON-002
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

First measure the proportion and latency benefit of safely parallelizable calls. Define one trusted capability authority; model output, tool names, and unvalidated MCP metadata cannot self-declare safety. Then schedule contiguous safe calls into a bounded pool, stop at exclusive barriers, collect out of order internally, and append terminal results in request order after durability fences.

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

Ordered pool and production Pi integration are complete. Pi `coco-v0.82.1-coco.11` executes contiguous parallel-safe segments concurrently, treats `executionMode: sequential` tools as barriers, and preserves source-order terminal results. Its coding-agent manifest and shrinkwrap pin the matching core asset, and focused Pi agent-loop and CoCo pool tests pass. No external code copied.
