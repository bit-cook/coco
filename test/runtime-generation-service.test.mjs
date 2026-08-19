import assert from "node:assert/strict";
import test from "node:test";

import { createExecutionProviderRegistry } from "../scripts/execution-provider.mjs";
import { createRuntimeGenerationService } from "../scripts/runtime-generation-service.mjs";

const capabilities = { isolated: true, networkControl: true, secretsControl: true, workspaceRead: true, workspaceWrite: true };
const source = (id) => ({ mcp: { id }, provider: { descriptors: [{ capabilities, id }] } });
const request = { mode: "isolated-required", policy: { network: "deny", secrets: "deny", workspace: "write" } };

test("service reload binds provider and MCP calls to one generation", async () => {
  const service = createRuntimeGenerationService({
    initial: source("one"),
    prepareProvider: async ({ descriptors }) => createExecutionProviderRegistry(descriptors),
    prepareMcp: async ({ id }) => ({ id }),
    executeProvider: async ({ generationId, resource }) => ({ generationId, provider: resource.ids[0] }),
    executeMcp: async ({ generationId, resource }) => ({ generationId, mcp: resource.id }),
  });
  assert.equal((await service.initialize()).revision, 1);
  assert.equal((await service.provider({ providerId: "one", request })).result.provider, "one");
  await service.reload(source("two"), 1);
  const provider = await service.provider({ providerId: "two", request }), mcp = await service.mcp({ operation: "list" });
  assert.equal(provider.generationId, mcp.generationId); assert.deepEqual(provider.result, { generationId: provider.generationId, provider: "two" }); assert.equal(mcp.result.mcp, "two");
  await service.close();
});

test("service status is non-secret and rollback creates a new current generation", async () => {
  const service = createRuntimeGenerationService({
    initial: source("one"),
    prepareProvider: async ({ descriptors }) => createExecutionProviderRegistry(descriptors),
    prepareMcp: async ({ id }) => ({ id, token: `${id}-secret` }),
    executeProvider: async () => null,
    executeMcp: async () => null,
  });
  const first = await service.initialize(); await service.reload(source("two"), 1); const rolled = await service.rollback(first.generationId, 2);
  assert.equal(rolled.revision, 3); assert.notEqual(rolled.generationId, first.generationId); assert.equal(JSON.stringify(service.status()).includes("secret"), false);
  await service.close();
});
