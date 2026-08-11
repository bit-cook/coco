import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createExecutionBindingStore, validExecutionBinding } from "../scripts/execution-bindings.mjs";
import { statePaths } from "../scripts/state-paths.mjs";

const taskId = "bindtest0001";
const runId = "018f47a0-7b20-7cc5-8a33-111111111111";
const hash = "a".repeat(64);

test("execution bindings are private, canonical, and idempotent", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-execution-binding-"));
  try {
    const store = createExecutionBindingStore({ agentDir });
    const first = await store.write({ providerId: "linux-bwrap", requestSha256: hash, runId, taskId });
    assert.deepEqual(first, await store.write({ providerId: "linux-bwrap", requestSha256: hash, runId, taskId }));
    assert.equal(validExecutionBinding(first), true);
    assert.equal((await stat(statePaths(agentDir).taskExecutionBindings)).mode & 0o777, 0o700);
    assert.equal((await stat(store.pathFor(taskId, runId))).mode & 0o777, 0o600);
    assert.equal(await readFile(store.pathFor(taskId, runId), "utf8"), `${JSON.stringify(first)}\n`);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("execution bindings reject conflicts, malformed IDs, and unknown status", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-execution-binding-invalid-"));
  try {
    const store = createExecutionBindingStore({ agentDir });
    await store.write({ providerId: "linux-bwrap", requestSha256: hash, runId, taskId });
    await assert.rejects(store.write({ providerId: "linux-bwrap", requestSha256: "b".repeat(64), runId, taskId }), /EXECUTION_BINDING_CONFLICT/);
    await assert.rejects(store.write({ providerId: "linux-bwrap", requestSha256: hash, runId, status: "completed", taskId }), /EXECUTION_BINDING_INVALID/);
    await assert.rejects(store.write({ providerId: "linux-bwrap", requestSha256: hash, runId: "bad", taskId }), /EXECUTION_BINDING_INVALID|EXECUTION_BINDING_ID_INVALID/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
