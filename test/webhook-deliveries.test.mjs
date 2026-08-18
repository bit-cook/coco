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
import { cancelTask, createTaskRunner } from "../scripts/task-runner.mjs";

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
    const intents = results.map(({ intent }) => intent);
    assert.equal(new Set(intents.map(({ dispatchId }) => dispatchId)).size, 1);
    assert.ok(intents.every((intent) => intent.taskId === task.id && intent.deliveryId === input.deliveryId && intent.generation === 1));
    assert.deepEqual((await createWebhookDeliveryStore({ agentDir }).accept(input)).intent, intents[0]);
    const tasks = await createTaskStore({ agentDir }).load(); assert.equal(tasks.tasks[0].status, "queued"); assert.equal(tasks.revision, 2);
    const ledger = JSON.parse(await readFile(statePaths(agentDir).webhookDeliveries, "utf8"));
    assert.equal(ledger.schemaVersion, 2); assert.equal(ledger.deliveries.length, 1); assert.deepEqual(ledger.dispatchPending, [intents[0]]);
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

test("pending dispatch remains idempotent beyond the delivery retry window", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-pending-retention-"));
  try {
    const task = await blockedTask(agentDir); let current = new Date("2026-08-01T00:00:00.000Z");
    const deliveries = createWebhookDeliveryStore({ agentDir, now: () => current }); const input = { deliveryId: "pending", kind: "generic", taskId: task.id };
    const accepted = await deliveries.accept(input); current = new Date("2026-08-09T00:00:00.000Z");
    assert.deepEqual(await deliveries.accept(input), { accepted: false, duplicate: true, intent: accepted.intent });
    assert.deepEqual(await deliveries.listPending(), [accepted.intent]);
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

test("running and queued tasks reject deliveries without consuming their keys", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-busy-"));
  try {
    const task = await blockedTask(agentDir); const store = createTaskStore({ agentDir });
    await store.update((state) => { const target = state.tasks[0]; target.activeRunId = "018f47a0-7b20-7cc5-8a33-555555555555"; target.status = "running"; return state; });
    const deliveries = createWebhookDeliveryStore({ agentDir }); const input = { deliveryId: "retry-me", kind: "generic", taskId: task.id };
    assert.deepEqual(await deliveries.accept(input), { accepted: false, duplicate: false, reason: "running" });
    assert.deepEqual(await deliveries.accept({ ...input, deliveryId: "queued-retry" }), { accepted: false, duplicate: false, reason: "running" });
    await store.update((state) => { const target = state.tasks[0]; target.activeRunId = null; target.status = "queued"; return state; });
    assert.deepEqual(await deliveries.accept({ ...input, deliveryId: "queued-retry" }), { accepted: false, duplicate: false, reason: "queued" });
    assert.deepEqual(JSON.parse(await readFile(statePaths(agentDir).webhookDeliveries, "utf8")).deliveries, []);
    await store.update((state) => { const target = state.tasks[0]; target.activeRunId = null; target.status = "completed"; target.finishedAt = new Date().toISOString(); return state; });
    const accepted = await deliveries.accept(input); assert.equal(accepted.accepted, true); assert.equal(accepted.duplicate, false); assert.equal(accepted.intent.deliveryId, input.deliveryId);
    assert.equal((await store.load()).tasks[0].status, "queued");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner stopping rejects a delivery without consuming its key", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-stopping-"));
  try {
    const task = await blockedTask(agentDir); const paths = statePaths(agentDir);
    await writeFile(`${paths.runner}.stopping`, JSON.stringify({ operationId: "018f47a0-7b20-7cc5-8a33-080808080808", ownerIdentity: "test-owner", ownerPid: process.pid, phase: "stopping", predecessor: null, schemaVersion: 1, stopping: true, stoppingAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
    const input = { deliveryId: "stopping-retry", kind: "generic", taskId: task.id };
    assert.deepEqual(await createWebhookDeliveryStore({ agentDir }).accept(input), { accepted: false, duplicate: false, reason: "runner-stopping" });
    assert.deepEqual(JSON.parse(await readFile(paths.webhookDeliveries, "utf8")).deliveries, []);
    await rm(`${paths.runner}.stopping`);
    assert.equal((await createWebhookDeliveryStore({ agentDir }).accept(input)).accepted, true);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("legacy delivery keys migrate without synthesizing dispatch work", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-legacy-"));
  try {
    const task = await blockedTask(agentDir); const path = statePaths(agentDir).webhookDeliveries; const acceptedAt = new Date().toISOString();
    await writeFile(path, canonicalJson({ deliveries: [{ acceptedAt, deliveryId: "legacy", kind: "generic", taskId: task.id }], schemaVersion: 1 }), { mode: 0o600 });
    assert.deepEqual(await createWebhookDeliveryStore({ agentDir }).accept({ deliveryId: "legacy", kind: "generic", taskId: task.id }), { accepted: false, duplicate: true, intent: null });
    const migrated = JSON.parse(await readFile(path)); assert.equal(migrated.schemaVersion, 2); assert.deepEqual(migrated.dispatchPending, []); assert.equal(migrated.deliveries[0].dispatchId, null);
    assert.equal((await createTaskStore({ agentDir }).load()).tasks[0].status, "blocked");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("legacy queued delivery migration recreates a durable dispatch intent", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-legacy-queued-"));
  try {
    const task = await createTaskStore({ agentDir }).create({ cwd: process.cwd(), initialStatus: "queued", prompt: "legacy queued", trigger: "webhook", webhookSecret: "a".repeat(64), worktree: false });
    await writeFile(statePaths(agentDir).webhookDeliveries, canonicalJson({ deliveries: [{ acceptedAt: "2026-08-18T00:00:00.000Z", deliveryId: "legacy-queued", kind: "generic", taskId: task.id }], schemaVersion: 1 }), { mode: 0o600 });
    const pending = await createWebhookDeliveryStore({ agentDir }).listPending();
    assert.equal(pending.length, 1); assert.equal(pending[0].deliveryId, "legacy-queued");
    assert.deepEqual((await createWebhookDeliveryStore({ agentDir }).accept({ deliveryId: "legacy-queued", kind: "generic", taskId: task.id })).intent, pending[0]);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("legacy queued migration restores only the latest delivery per task", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-legacy-latest-"));
  try {
    const task = await createTaskStore({ agentDir }).create({ cwd: process.cwd(), initialStatus: "queued", prompt: "legacy latest", trigger: "webhook", webhookSecret: "a".repeat(64), worktree: false });
    const deliveries = ["older", "latest"].map((deliveryId, index) => ({ acceptedAt: `2026-08-18T00:00:0${index}.000Z`, deliveryId, kind: "generic", taskId: task.id }));
    await writeFile(statePaths(agentDir).webhookDeliveries, canonicalJson({ deliveries, schemaVersion: 1 }), { mode: 0o600 });
    const pending = await createWebhookDeliveryStore({ agentDir }).listPending();
    assert.equal(pending.length, 1); assert.equal(pending[0].deliveryId, "latest");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("delivery transaction recovers a crash between ledger and task replacement", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-crash-"));
  try {
    const task = await blockedTask(agentDir); const paths = statePaths(agentDir); const transactionId = "11111111-1111-4111-8111-111111111111";
    const beforeTasks = await readFile(paths.tasks); const nextTasks = JSON.parse(beforeTasks); nextTasks.revision += 1; nextTasks.tasks[0].status = "queued"; nextTasks.tasks[0].updatedAt = "2026-08-16T00:00:00.000Z";
    const intent = { createdAt: "2026-08-16T00:00:00.000Z", deliveryId: "crashed", dispatchId: "22222222-2222-4222-8222-222222222222", generation: 1, kind: "generic", taskId: task.id };
    const taskBytes = canonicalJson(nextTasks); const deliveryBytes = canonicalJson({ deliveries: [{ acceptedAt: intent.createdAt, deliveryId: "crashed", dispatchId: intent.dispatchId, kind: "generic", taskId: task.id }], dispatchPending: [intent], schemaVersion: 2 });
    const taskTemp = join(agentDir, `.tasks.json.${transactionId}.tmp`); const deliveryTemp = join(agentDir, `.webhook-deliveries.json.${transactionId}.tmp`);
    await mkdir(paths.journal, { recursive: true, mode: 0o700 }); await writeFile(paths.webhookDeliveries, deliveryBytes, { mode: 0o600 }); await writeFile(taskTemp, taskBytes, { mode: 0o600 }); await writeFile(deliveryTemp, deliveryBytes, { mode: 0o600 });
    const operations = [
      { afterSha256: digest(deliveryBytes), beforeSha256: null, containsSecret: false, path: paths.webhookDeliveries, redactedBackupPath: null, tempPath: deliveryTemp },
      { afterSha256: digest(taskBytes), beforeSha256: digest(beforeTasks), containsSecret: false, path: paths.tasks, redactedBackupPath: null, tempPath: taskTemp },
    ];
    await writeFile(join(paths.journal, `${transactionId}.json`), canonicalJson({ nextIndex: 1, operations, phase: "applying", schemaVersion: 1, transactionId }), { mode: 0o600 });
    assert.deepEqual(await createWebhookDeliveryStore({ agentDir }).accept({ deliveryId: "crashed", kind: "generic", taskId: task.id }), { accepted: false, duplicate: true, intent });
    assert.equal((await createTaskStore({ agentDir }).load()).tasks[0].status, "queued");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("pending listing recovers a transaction crash without consuming the intent", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-list-crash-"));
  try {
    const task = await blockedTask(agentDir); const paths = statePaths(agentDir); const transactionId = "33333333-3333-4333-8333-333333333333";
    const beforeTasks = await readFile(paths.tasks); const nextTasks = JSON.parse(beforeTasks); nextTasks.revision += 1; nextTasks.tasks[0].status = "queued"; nextTasks.tasks[0].updatedAt = "2026-08-17T00:00:00.000Z";
    const intent = { createdAt: "2026-08-17T00:00:00.000Z", deliveryId: "restart-crash", dispatchId: "44444444-4444-4444-8444-444444444444", generation: 1, kind: "generic", taskId: task.id };
    const taskBytes = canonicalJson(nextTasks); const deliveryBytes = canonicalJson({ deliveries: [{ acceptedAt: intent.createdAt, deliveryId: intent.deliveryId, dispatchId: intent.dispatchId, kind: intent.kind, taskId: task.id }], dispatchPending: [intent], schemaVersion: 2 });
    const taskTemp = join(agentDir, `.tasks.json.${transactionId}.tmp`); const deliveryTemp = join(agentDir, `.webhook-deliveries.json.${transactionId}.tmp`);
    await mkdir(paths.journal, { recursive: true, mode: 0o700 }); await writeFile(paths.webhookDeliveries, deliveryBytes, { mode: 0o600 }); await writeFile(taskTemp, taskBytes, { mode: 0o600 }); await writeFile(deliveryTemp, deliveryBytes, { mode: 0o600 });
    const operations = [
      { afterSha256: digest(deliveryBytes), beforeSha256: null, containsSecret: false, path: paths.webhookDeliveries, redactedBackupPath: null, tempPath: deliveryTemp },
      { afterSha256: digest(taskBytes), beforeSha256: digest(beforeTasks), containsSecret: false, path: paths.tasks, redactedBackupPath: null, tempPath: taskTemp },
    ];
    await writeFile(join(paths.journal, `${transactionId}.json`), canonicalJson({ nextIndex: 1, operations, phase: "applying", schemaVersion: 1, transactionId }), { mode: 0o600 });
    const deliveries = createWebhookDeliveryStore({ agentDir });
    assert.deepEqual(await deliveries.listPending(), [intent]); assert.deepEqual(await deliveries.listPending(), [intent]);
    assert.equal((await createTaskStore({ agentDir }).load()).tasks[0].status, "queued");
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("dispatch claim and acknowledgement are owner-generation CAS operations", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-claim-"));
  try {
    const task = await blockedTask(agentDir); const deliveries = createWebhookDeliveryStore({ agentDir });
    const accepted = await deliveries.accept({ deliveryId: "claim-me", kind: "generic", taskId: task.id });
    const ownerA = "11111111-1111-4111-8111-111111111111", ownerB = "22222222-2222-4222-8222-222222222222";
    const claimedA = await deliveries.claimPending({ ownerId: ownerA, generation: 10 });
    assert.equal(claimedA[0].ownerId, ownerA); assert.equal(claimedA[0].generation, 10);
    assert.deepEqual(await deliveries.acknowledgePending({ ownerId: ownerB, generation: 10, dispatchIds: [accepted.intent.dispatchId] }), []);
    assert.deepEqual(await deliveries.listPending(), [claimedA[0]]);
    const claimedB = await deliveries.claimPending({ ownerId: ownerB, generation: 11 });
    assert.equal(claimedB[0].ownerId, ownerB); assert.equal(claimedB[0].generation, 11);
    assert.deepEqual(await deliveries.acknowledgePending({ ownerId: ownerA, generation: 10, dispatchIds: [accepted.intent.dispatchId] }), []);
    assert.deepEqual(await deliveries.acknowledgePending({ ownerId: ownerB, generation: 11, dispatchIds: [accepted.intent.dispatchId] }), [claimedB[0]]);
    assert.deepEqual(await deliveries.listPending(), []);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("runner acknowledges dispatch only after durable task claim", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-runner-consumer-"));
  try {
    const task = await blockedTask(agentDir); const deliveries = createWebhookDeliveryStore({ agentDir });
    await deliveries.accept({ deliveryId: "runner-consume", kind: "generic", taskId: task.id });
    const runner = createTaskRunner({ agentDir, root: process.cwd(), spawnTask: async () => ({ code: 0, output: "consumed" }) });
    await runner.run({ once: true });
    assert.deepEqual(await deliveries.listPending(), []);
    const completed = (await createTaskStore({ agentDir }).load()).tasks[0];
    assert.equal(completed.status, "completed"); assert.equal(completed.activeRunId, null);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("attempt-limit terminal disposition clears dispatch without claiming execution", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-attempt-cap-"));
  try {
    const task = await blockedTask(agentDir); const deliveries = createWebhookDeliveryStore({ agentDir });
    await deliveries.accept({ deliveryId: "attempt-cap", kind: "generic", taskId: task.id });
    await createTaskStore({ agentDir }).update((state) => { state.tasks[0].attempts = 1000; return state; });
    await createTaskRunner({ agentDir, root: process.cwd(), spawnTask: async () => { throw new Error("must not execute"); } }).run({ once: true });
    const failed = (await createTaskStore({ agentDir }).load()).tasks[0];
    assert.equal(failed.status, "failed"); assert.equal(failed.lastError, "TASK_ATTEMPT_LIMIT_REACHED"); assert.equal(failed.activeRunId, null);
    assert.deepEqual(await deliveries.listPending(), []);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("cancelling queued webhook work disposes its pending dispatch", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-webhook-cancel-dispatch-"));
  try {
    const task = await blockedTask(agentDir); const deliveries = createWebhookDeliveryStore({ agentDir });
    await deliveries.accept({ deliveryId: "cancel-pending", kind: "generic", taskId: task.id });
    const cancelled = await cancelTask(createTaskStore({ agentDir }), task.id);
    assert.equal(cancelled.status, "cancelled"); assert.deepEqual(await deliveries.listPending(), []);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
