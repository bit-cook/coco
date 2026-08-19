import assert from "node:assert/strict";
import test from "node:test";

import { createExecutionProviderRegistry } from "../scripts/execution-provider.mjs";
import { bindGenerationRequest, createRuntimeGenerationRegistry } from "../scripts/runtime-generation-registry.mjs";

const source = (name) => ({ endpoint: `https://${name}.example`, name });
const prepare = async (input) => ({ mcp: { client: `${input.name}-mcp` }, provider: { endpoint: input.endpoint, token: `${input.name}-secret` } });

test("generation publish is revision-CAS and in-flight leases keep one immutable snapshot", async () => {
  const disposed = [], registry = createRuntimeGenerationRegistry({ initial: source("one"), prepare, dispose: async (value) => disposed.push(value.provider.endpoint) });
  assert.equal((await registry.initialize()).revision, 1);
  const first = registry.acquire(); assert.equal(first.provider.endpoint, "https://one.example");
  const secondState = await registry.publish(source("two"), { expectedRevision: 1 }); assert.equal(secondState.revision, 2);
  const second = registry.acquire(); assert.equal(second.provider.endpoint, "https://two.example"); assert.equal(first.provider.endpoint, "https://one.example"); assert.equal(first.provider.token, "one-secret"); assert.equal(second.provider.token, "two-secret");
  assert.throws(() => registry.assertCurrent(first.generationId), { code: "RUNTIME_GENERATION_STALE" }); assert.equal(registry.assertCurrent(second.generationId), true);
  await assert.rejects(registry.publish(source("stale"), { expectedRevision: 1 }), { code: "RUNTIME_GENERATION_REVISION_CONFLICT" });
  await first.release(); assert.ok(disposed.includes("https://one.example")); await second.release(); await registry.close();
});

test("concurrent writers with one expected revision elect one generation", async () => {
  const registry = createRuntimeGenerationRegistry({ initial: source("one"), prepare }); await registry.initialize();
  const results = await Promise.allSettled([registry.publish(source("two"), { expectedRevision: 1 }), registry.publish(source("three"), { expectedRevision: 1 })]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = results.find(({ status }) => status === "rejected"); assert.equal(rejected.reason.code, "RUNTIME_GENERATION_REVISION_CONFLICT");
  assert.equal(registry.snapshot().revision, 2); const lease = registry.acquire(); assert.ok(["https://two.example", "https://three.example"].includes(lease.provider.endpoint)); await lease.release(); await registry.close();
});

test("failed prepare retains last-good and rollback creates a fresh generation", async () => {
  let failNext = false;
  const registry = createRuntimeGenerationRegistry({ initial: source("one"), prepare: async (input) => { if (failNext) { failNext = false; throw new Error("prepare failed"); } return prepare(input); } });
  await registry.initialize(); const firstId = registry.snapshot().generationId;
  failNext = true; await assert.rejects(registry.publish(source("bad"), { expectedRevision: 1 }), /prepare failed/); assert.equal(registry.snapshot().generationId, firstId);
  await registry.publish(source("two"), { expectedRevision: 1 });
  const rollback = await registry.rollback(firstId, { expectedRevision: 2 }); assert.equal(rollback.revision, 3); assert.notEqual(rollback.generationId, firstId);
  const lease = registry.acquire(); assert.equal(lease.provider.endpoint, "https://one.example"); await lease.release(); await registry.close();
});

test("close rejects live leases and public snapshots exclude prepared resources", async () => {
  const registry = createRuntimeGenerationRegistry({ initial: source("one"), prepare }); await registry.initialize();
  const lease = registry.acquire(); assert.deepEqual(Object.keys(registry.snapshot()).sort(), ["generationId", "retained", "revision", "schemaVersion"]);
  await assert.rejects(registry.close(), { code: "RUNTIME_GENERATION_IN_USE" }); await lease.release(); await registry.close();
});

test("provider preflight records the exact acquired generation", async () => {
  const descriptors = [{ id: "local", capabilities: { isolated: true, networkControl: true, secretsControl: true, workspaceRead: true, workspaceWrite: true } }];
  const registry = createRuntimeGenerationRegistry({ initial: { descriptors }, prepare: async (input) => ({ mcp: {}, provider: createExecutionProviderRegistry(input.descriptors) }) }); await registry.initialize();
  const lease = registry.acquire(); const binding = bindGenerationRequest(lease, "local", { mode: "isolated-required", policy: { network: "deny", secrets: "deny", workspace: "write" } });
  assert.equal(binding.generationId, lease.generationId); assert.equal(binding.generationRevision, lease.revision); assert.equal(binding.preflight.providerId, "local"); assert.match(binding.bindingSha256, /^[0-9a-f]{64}$/);
  await lease.release(); await registry.close();
});
