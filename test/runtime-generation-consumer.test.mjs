import assert from "node:assert/strict";
import test from "node:test";

import { createExecutionProviderRegistry } from "../scripts/execution-provider.mjs";
import { createRuntimeGenerationConsumer } from "../scripts/runtime-generation-consumer.mjs";
import { createRuntimeGenerationRegistry } from "../scripts/runtime-generation-registry.mjs";

const descriptor = (label) => ({ capabilities: { isolated: true, networkControl: true, secretsControl: true, workspaceRead: true, workspaceWrite: true }, id: label });
const request = { mode: "isolated-required", policy: { network: "deny", secrets: "deny", workspace: "write" } };

test("in-flight provider calls retain and report their acquired generation", async () => {
  let releaseFirst; const gate = new Promise((done) => { releaseFirst = done; });
  const registry = createRuntimeGenerationRegistry({ initial: { id: "one" }, prepare: async ({ id }) => ({ mcp: { id }, provider: createExecutionProviderRegistry([descriptor(id)]) }) }); await registry.initialize();
  const consumer = createRuntimeGenerationConsumer({ registry, executeMcp: async () => null, executeProvider: async ({ generationId, resource }) => { if (generationId === "generation-1") await gate; return resource.ids[0]; } });
  const first = consumer.provider({ providerId: "one", request });
  await registry.publish({ id: "two" }, { expectedRevision: 1 });
  const second = await consumer.provider({ providerId: "two", request }); releaseFirst(); const old = await first;
  assert.deepEqual({ id: old.result, generation: old.generationId }, { id: "one", generation: "generation-1" });
  assert.deepEqual({ id: second.result, generation: second.generationId }, { id: "two", generation: "generation-2" });
  await registry.close();
});

test("provider and MCP failures release generation leases", async () => {
  const registry = createRuntimeGenerationRegistry({ initial: { id: "one" }, prepare: async ({ id }) => ({ mcp: { id }, provider: createExecutionProviderRegistry([descriptor(id)]) }) }); await registry.initialize();
  const consumer = createRuntimeGenerationConsumer({ registry, executeMcp: async () => { throw new Error("mcp failed"); }, executeProvider: async () => { throw new Error("provider failed"); } });
  await assert.rejects(consumer.provider({ providerId: "one", request }), /provider failed/);
  await assert.rejects(consumer.mcp({ operation: "list" }), /mcp failed/);
  await registry.close();
});
