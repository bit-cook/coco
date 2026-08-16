import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { statePaths } from "../scripts/state-paths.mjs";
import { createTaskLogStore } from "../scripts/task-logs.mjs";
import { createTaskReceiptStore, validTaskReceipt } from "../scripts/task-receipts.mjs";

const taskId = "receipttest1";
const runId = "018f47a0-7b20-7cc5-8a33-111111111111";
const startedAt = "2026-08-11T12:00:00.000Z";
const endedAt = "2026-08-11T12:00:01.000Z";

test("task receipts are canonical, private, and idempotent", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-receipt-"));
  try {
    const store = createTaskReceiptStore({ agentDir });
    const seal = await createTaskLogStore({ agentDir }).seal({ taskId, runId });
    const log = { bytes: seal.bytes, records: seal.records, ref: seal.ref, sha256: seal.sha256 };
    const input = { endedAt, exitCode: 0, log, runId, startedAt, taskId };
    const first = await store.write(input); const second = await store.write(input);
    assert.deepEqual(second, first); assert.equal(validTaskReceipt(first), true);
    assert.equal(first.verdict, "passed"); assert.deepEqual(first.log, log);
    assert.equal((await stat(statePaths(agentDir).taskReceipts)).mode & 0o777, 0o700);
    assert.equal((await stat(store.pathFor(taskId, runId))).mode & 0o777, 0o600);
    assert.equal(await readFile(store.pathFor(taskId, runId), "utf8"), `${JSON.stringify(first)}\n`);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("task receipts reject conflicting terminal evidence and invalid log references", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-task-receipt-conflict-"));
  try {
    const store = createTaskReceiptStore({ agentDir });
    const seal = await createTaskLogStore({ agentDir }).seal({ taskId, runId }); const log = { bytes: seal.bytes, records: seal.records, ref: seal.ref, sha256: seal.sha256 };
    await store.write({ endedAt, exitCode: 1, log, runId, startedAt, taskId });
    await assert.rejects(store.write({ endedAt, exitCode: 0, log, runId, startedAt, taskId }), /TASK_RECEIPT_CONFLICT/);
    await assert.rejects(store.write({ endedAt, exitCode: 0, log: { ...log, sha256: "1".repeat(64) }, runId: "018f47a0-7b20-7cc5-8a33-222222222222", startedAt, taskId }), /TASK_RECEIPT_LOG_SEAL_MISMATCH|TASK_RECEIPT_INVALID/);
    await assert.rejects(store.write({ endedAt, exitCode: 0, log: { bytes: 1, records: 1, ref: "../escape", sha256: "0".repeat(64) }, runId: "018f47a0-7b20-7cc5-8a33-222222222222", startedAt, taskId }), /TASK_RECEIPT_INVALID/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
