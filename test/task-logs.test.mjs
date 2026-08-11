import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTaskLogStore } from "../scripts/task-logs.mjs";
import { statePaths } from "../scripts/state-paths.mjs";

const taskId = "tasklogtest1";
const runId = "018f47a0-7b20-7cc5-8a33-111111111111";

test("task logs are bounded, sequenced, cursor-readable, and private", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-logs-"));
  try {
    const store = createTaskLogStore({ agentDir });
    await store.append({ taskId, runId, stream: "stdout", data: "one" });
    await store.append({ taskId, runId, stream: "stderr", data: "two" });
    const page = await store.read({ taskId, runId, cursor: 1, limit: 1 });
    assert.deepEqual(page.records.map(({ seq, data }) => ({ seq, data })), [{ seq: 2, data: "two" }]);
    assert.equal(page.nextCursor, 2); assert.equal(page.hasMore, false);
    assert.equal((await stat(statePaths(agentDir).taskLogs)).mode & 0o777, 0o700);
    assert.equal((await stat(store.pathFor(taskId, runId))).mode & 0o777, 0o600);
    assert.equal((await readFile(store.pathFor(taskId, runId), "utf8")).endsWith("\n"), true);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("task logs reject oversized records and preserve stream caps", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-log-limit-"));
  try {
    const store = createTaskLogStore({ agentDir });
    await assert.rejects(store.append({ taskId, runId, stream: "stdout", data: "x".repeat(16 * 1024 + 1) }), /TASK_LOG_RECORD_INVALID/);
    let limited = false;
    for (let index = 0; index < 400 && !limited; index += 1) {
      try { await store.append({ taskId, runId, stream: "diagnostic", data: "x".repeat(12000) }); }
      catch (error) { assert.match(error.message, /TASK_LOG_LIMIT_EXCEEDED/); limited = true; }
    }
    assert.equal(limited, true);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("task log reads reject malformed cursors", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-log-query-"));
  try {
    const store = createTaskLogStore({ agentDir });
    await assert.rejects(store.read({ taskId, runId, cursor: -1 }), /TASK_LOG_QUERY_INVALID/);
    await assert.rejects(store.read({ taskId, runId, limit: 257 }), /TASK_LOG_QUERY_INVALID/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
