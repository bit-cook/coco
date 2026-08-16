import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { statePaths } from "../scripts/state-paths.mjs";
import { createTaskStore } from "../scripts/task-state.mjs";
import { createWebhookDeliveryStore } from "../scripts/webhook-deliveries.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function blockedTask(agentDir) {
  return createTaskStore({ agentDir }).create({ cwd: process.cwd(), initialStatus: "blocked", prompt: "hook", trigger: "webhook", webhookSecret: "a".repeat(64), worktree: false });
}

test("webhook delivery acceptance is durable and idempotent under concurrency", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-delivery-"));
  try {
    const task = await blockedTask(agentDir);
    const input = { deliveryId: "delivery-1", kind: "generic", taskId: task.id };
    const results = await Promise.all(Array.from({ length: 20 }, () => createWebhookDeliveryStore({ agentDir }).accept(input)));
    assert.equal(results.filter(({ accepted }) => accepted).length, 1);
    assert.equal(results.filter(({ duplicate }) => duplicate).length, 19);
    assert.deepEqual(await createWebhookDeliveryStore({ agentDir }).accept(input), { accepted: false, duplicate: true });
    assert.equal((await createTaskStore({ agentDir }).load()).tasks[0].status, "queued");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("expired delivery keys are pruned after the retry retention window", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-retention-"));
  try {
    const task = await createTaskStore({ agentDir }).create({ cwd: process.cwd(), initialStatus: "blocked", prompt: "retention", trigger: "webhook", webhookSecret: "a".repeat(64), worktree: false });
    await writeFile(statePaths(agentDir).webhookDeliveries, JSON.stringify({ deliveries: [{ acceptedAt: "2000-01-01T00:00:00.000Z", deliveryId: "expired", kind: "generic", taskId: task.id }], schemaVersion: 1 }) + "\n", { mode: 0o600 });
    const result = await createWebhookDeliveryStore({ agentDir }).accept({ deliveryId: "expired", kind: "generic", taskId: task.id });
    assert.equal(result.accepted, true); assert.equal(result.duplicate, false);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("concurrent deliveries cannot consume more triggers than the task can queue", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-race-"));
  try {
    const task = await blockedTask(agentDir);
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => createWebhookDeliveryStore({ agentDir }).accept({ deliveryId: `delivery-${index}`, kind: "generic", taskId: task.id })));
    assert.equal(results.filter(({ accepted }) => accepted).length, 1);
    assert.equal(results.filter(({ reason }) => reason === "queued").length, 19);
    const ledger = JSON.parse(await readFile(statePaths(agentDir).webhookDeliveries, "utf8"));
    assert.equal(ledger.deliveries.length, 1);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("running task rejects a delivery without consuming its key", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-running-"));
  try {
    const task = await blockedTask(agentDir); const store = createTaskStore({ agentDir });
    await store.update((state) => { const target = state.tasks[0]; target.activeRunId = "018f47a0-7b20-7cc5-8a33-555555555555"; target.status = "running"; return state; });
    const deliveries = createWebhookDeliveryStore({ agentDir }); const input = { deliveryId: "retry-me", kind: "generic", taskId: task.id };
    assert.deepEqual(await deliveries.accept(input), { accepted: false, duplicate: false, reason: "running" });
    assert.deepEqual(JSON.parse(await readFile(statePaths(agentDir).webhookDeliveries, "utf8")).deliveries, []);
    await store.update((state) => { const target = state.tasks[0]; target.activeRunId = null; target.status = "completed"; target.finishedAt = new Date().toISOString(); return state; });
    assert.deepEqual(await deliveries.accept(input), { accepted: true, duplicate: false });
    assert.equal((await store.load()).tasks[0].status, "queued");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("delivery transaction recovers a crash between ledger and task replacement", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-crash-"));
  try {
    const task = await blockedTask(agentDir); const paths = statePaths(agentDir); const transactionId = "11111111-1111-4111-8111-111111111111";
    const beforeTasks = await readFile(paths.tasks); const nextTasks = JSON.parse(beforeTasks); nextTasks.revision += 1; nextTasks.tasks[0].status = "queued"; nextTasks.tasks[0].updatedAt = "2026-08-16T00:00:00.000Z";
    const taskBytes = canonicalJson(nextTasks); const deliveryBytes = canonicalJson({ deliveries: [{ acceptedAt: "2026-08-16T00:00:00.000Z", deliveryId: "crashed", kind: "generic", taskId: task.id }], schemaVersion: 1 });
    const taskTemp = join(agentDir, `.tasks.json.${transactionId}.tmp`); const deliveryTemp = join(agentDir, `.webhook-deliveries.json.${transactionId}.tmp`);
    await mkdir(paths.journal, { recursive: true, mode: 0o700 }); await writeFile(paths.webhookDeliveries, deliveryBytes, { mode: 0o600 }); await writeFile(taskTemp, taskBytes, { mode: 0o600 }); await writeFile(deliveryTemp, deliveryBytes, { mode: 0o600 });
    const operations = [
      { afterSha256: digest(deliveryBytes), beforeSha256: null, containsSecret: false, path: paths.webhookDeliveries, redactedBackupPath: null, tempPath: deliveryTemp },
      { afterSha256: digest(taskBytes), beforeSha256: digest(beforeTasks), containsSecret: false, path: paths.tasks, redactedBackupPath: null, tempPath: taskTemp },
    ];
    await writeFile(join(paths.journal, `${transactionId}.json`), canonicalJson({ nextIndex: 1, operations, phase: "applying", schemaVersion: 1, transactionId }), { mode: 0o600 });
    assert.deepEqual(await createWebhookDeliveryStore({ agentDir }).accept({ deliveryId: "crashed", kind: "generic", taskId: task.id }), { accepted: false, duplicate: true });
    assert.equal((await createTaskStore({ agentDir }).load()).tasks[0].status, "queued");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
