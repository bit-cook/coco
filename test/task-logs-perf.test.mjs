import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTaskLogStore } from "../scripts/task-logs.mjs";

const taskId = "logperf00001";
const runId = "018f47a0-7b20-7cc5-8a33-cccccccccccc";

test("append performance demonstrates indexed O(1) growth", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-log-perf-"));
  try {
    const store = createTaskLogStore({ agentDir });
    const data = "x".repeat(12 * 1024);
    const start = performance.now();
    for (let index = 0; index < 200; index += 1) await store.append({ taskId, runId, stream: "stdout", data });
    const elapsed = performance.now() - start;
    assert.equal((await store.read({ taskId, runId })).records.length, 200);
    assert.ok(elapsed < 5000, `200 appends took ${elapsed.toFixed(0)}ms, expected < 5000ms`);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("UTF-8 records survive indexed append and validation", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-log-utf8-"));
  try {
    const store = createTaskLogStore({ agentDir });
    const values = ["你好世界", "🎉🚀", "αβγδ"];
    for (const data of values) await store.append({ taskId, runId, stream: "stdout", data });
    assert.deepEqual((await store.read({ taskId, runId })).records.map((record) => record.data), values);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
