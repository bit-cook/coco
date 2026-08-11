import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { createTaskEventStore, validTaskEvent } from "../scripts/task-events.mjs";

const taskId = "task_event01";

test("TaskEvent streams are canonical, private, sequenced, and idempotent", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-events-"));
  const runId = randomUUID(), eventId = randomUUID();
  try {
    const store = createTaskEventStore({ agentDir });
    const started = await store.append({ eventId, runId, taskId, type: "run.started" });
    assert.equal(started.seq, 1); assert.equal(validTaskEvent(started), true);
    assert.deepEqual(await store.append({ eventId, runId, taskId, type: "run.started" }), started);
    const heartbeat = await store.append({ eventId: randomUUID(), runId, taskId, type: "run.heartbeat" });
    assert.equal(heartbeat.seq, 2);
    assert.equal((await stat(store.pathFor(taskId, runId))).mode & 0o777, 0o600);
    assert.equal(await readFile(store.pathFor(taskId, runId), "utf8"), `${canonicalJson(started)}${canonicalJson(heartbeat)}`);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("TaskEvent pagination and lifecycle checks fail closed", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-event-page-"));
  const runId = randomUUID();
  try {
    const store = createTaskEventStore({ agentDir, enforceLifecycle: true });
    await assert.rejects(store.append({ eventId: randomUUID(), runId, taskId, type: "run.heartbeat" }), /TASK_EVENT_LIFECYCLE_INVALID/);
    await store.append({ eventId: randomUUID(), runId, taskId, type: "run.started" });
    await store.append({ eventId: randomUUID(), runId, taskId, type: "run.heartbeat" });
    const page = await store.readPage({ cursor: 1, limit: 1, runId, taskId });
    assert.deepEqual(page.events.map(({ seq }) => seq), [2]); assert.equal(page.hasMore, false);
    await store.append({ eventId: randomUUID(), outcome: "completed", runId, taskId, type: "run.finished" });
    await assert.rejects(store.append({ eventId: randomUUID(), runId, taskId, type: "run.heartbeat" }), /TASK_EVENT_LIFECYCLE_INVALID/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
