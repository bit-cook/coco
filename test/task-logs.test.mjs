import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
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

test("missing, corrupt, and stale indexes recover and resume sequence", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-log-index-recovery-"));
  try {
    const store = createTaskLogStore({ agentDir });
    const idxPath = join(agentDir, "task-logs", taskId, `${runId}.idx`);
    await store.append({ taskId, runId, stream: "stdout", data: "first" });
    await rm(idxPath);
    await store.append({ taskId, runId, stream: "stdout", data: "second" });
    await writeFile(idxPath, "not-json\n", { mode: 0o600 });
    await store.append({ taskId, runId, stream: "stdout", data: "third" });
    const stale = await readFile(idxPath);
    await store.append({ taskId, runId, stream: "stdout", data: "fourth" });
    await writeFile(idxPath, stale, { mode: 0o600 });
    await store.append({ taskId, runId, stream: "stdout", data: "fifth" });
    const page = await store.read({ taskId, runId });
    assert.deepEqual(page.records.map(({ data, seq }) => ({ data, seq })), [
      { data: "first", seq: 1 }, { data: "second", seq: 2 }, { data: "third", seq: 3 },
      { data: "fourth", seq: 4 }, { data: "fifth", seq: 5 },
    ]);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("partial tail recovers but complete invalid json fails closed", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-log-tail-"));
  try {
    const store = createTaskLogStore({ agentDir });
    await store.append({ taskId, runId, stream: "stdout", data: "first" });
    const path = store.pathFor(taskId, runId);
    const original = await readFile(path);
    await writeFile(path, Buffer.concat([original, Buffer.from('{"at":"partial')]), { mode: 0o600 });
    await store.append({ taskId, runId, stream: "stdout", data: "second" });
    assert.deepEqual((await store.read({ taskId, runId })).records.map((record) => record.data), ["first", "second"]);
    const valid = await readFile(path);
    const corrupted = Buffer.concat([valid, Buffer.from("{}")]);
    await writeFile(path, corrupted, { mode: 0o600 });
    await assert.rejects(store.append({ taskId, runId, stream: "stdout", data: "third" }), /TASK_LOG_CORRUPT/);
    assert.deepEqual(await readFile(path), corrupted);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("complete canonical tail missing only newline is preserved", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-log-newline-"));
  try {
    const store = createTaskLogStore({ agentDir });
    await store.append({ taskId, runId, stream: "stdout", data: "first" });
    const path = store.pathFor(taskId, runId), bytes = await readFile(store.pathFor(taskId, runId));
    await writeFile(path, bytes.subarray(0, bytes.length - 1), { mode: 0o600 });
    await store.append({ taskId, runId, stream: "stdout", data: "second" });
    assert.deepEqual((await store.read({ taskId, runId })).records.map((record) => record.data), ["first", "second"]);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("global lock serializes independent stores", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-log-concurrent-"));
  try {
    const stores = [createTaskLogStore({ agentDir }), createTaskLogStore({ agentDir })];
    await Promise.all(Array.from({ length: 20 }, (_, index) => stores[index % 2].append({ taskId, runId, stream: "stdout", data: `record-${index}` })));
    const records = (await stores[0].read({ taskId, runId })).records;
    assert.deepEqual(records.map((record) => record.seq), Array.from({ length: 20 }, (_, index) => index + 1));
    assert.equal(new Set(records.map((record) => record.data)).size, 20);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("describe includes latestAt and seal is immutable", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-log-seal-"));
  try {
    const store = createTaskLogStore({ agentDir, now: () => new Date("2026-08-15T12:00:00.000Z") });
    await store.append({ taskId, runId, stream: "stdout", data: "evidence" });
    const description = await store.describe({ taskId, runId });
    assert.equal(await store.latestAt({ taskId, runId }), description.latestAt);
    assert.equal(description.latestAt, "2026-08-15T12:00:00.000Z");
    const seal = await store.seal({ taskId, runId });
    assert.deepEqual(await store.seal({ taskId, runId }), seal);
    assert.equal(seal.latestAt, description.latestAt);
    assert.equal(seal.sha256, createHash("sha256").update(await readFile(store.pathFor(taskId, runId))).digest("hex"));
    await assert.rejects(store.append({ taskId, runId, stream: "stderr", data: "late" }), /TASK_LOG_SEALED/);
    await writeFile(store.pathFor(taskId, runId), "tampered\n", { mode: 0o600 });
    await assert.rejects(store.seal({ taskId, runId }), /TASK_LOG_(?:CORRUPT|SEAL_CORRUPT)/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("sealing an empty run materializes an immutable evidence target", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-log-seal-empty-"));
  try {
    const store = createTaskLogStore({ agentDir });
    const seal = await store.seal({ taskId, runId });
    assert.deepEqual({ bytes: seal.bytes, latestAt: seal.latestAt, records: seal.records }, { bytes: 0, latestAt: null, records: 0 });
    assert.deepEqual(await readFile(store.pathFor(taskId, runId)), Buffer.alloc(0));
    assert.equal((await stat(store.sealPathFor(taskId, runId))).mode & 0o777, 0o600);
    await assert.rejects(store.append({ taskId, runId, stream: "stdout", data: "late" }), /TASK_LOG_SEALED/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("task log append and canonical metadata reads reject symlinks", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-log-symlink-"));
  try {
    const store = createTaskLogStore({ agentDir });
    await store.append({ taskId, runId, stream: "stdout", data: "safe" });
    const logPath = store.pathFor(taskId, runId);
    const outside = join(agentDir, "outside");
    await writeFile(outside, "outside\n", { mode: 0o600 });
    await rm(logPath);
    await symlink(outside, logPath);
    await assert.rejects(store.append({ taskId, runId, stream: "stdout", data: "blocked" }), /TASK_LOG_/);
    await assert.rejects(store.read({ taskId, runId }), /TASK_LOG_/);

    await rm(logPath);
    await writeFile(logPath, Buffer.alloc(0), { mode: 0o600 });
    const indexPath = join(agentDir, "task-logs", taskId, `${runId}.idx`);
    await rm(indexPath);
    await symlink(outside, indexPath);
    await assert.rejects(store.append({ taskId, runId, stream: "stdout", data: "blocked" }), /TASK_LOG_INDEX_CORRUPT/);

    await rm(indexPath);
    await writeFile(indexPath, '{"bytesLength":0,"recordCount":0}\n', { mode: 0o600 });
    await store.seal({ taskId, runId });
    const sealPath = store.sealPathFor(taskId, runId);
    await rm(sealPath);
    await symlink(outside, sealPath);
    await assert.rejects(store.seal({ taskId, runId }), /TASK_LOG_SEAL_CORRUPT/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
