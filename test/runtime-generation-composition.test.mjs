import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeGenerationComposition } from "../scripts/runtime-generation-composition.mjs";

const source = (name) => ({ mcp: { name }, provider: { name } });

test("provider and MCP candidates publish as one generation", async () => {
  const registry = createRuntimeGenerationComposition({
    initial: source("one"),
    prepareProvider: async ({ name }) => ({ endpoint: `${name}-provider` }),
    prepareMcp: async ({ name }) => ({ tools: [`${name}-tool`] }),
  });
  await registry.initialize(); const first = registry.acquire();
  assert.equal(first.provider.endpoint, "one-provider"); assert.deepEqual(first.mcp.tools, ["one-tool"]);
  await registry.publish(source("two"), { expectedRevision: 1 }); const second = registry.acquire();
  assert.equal(second.provider.endpoint, "two-provider"); assert.deepEqual(second.mcp.tools, ["two-tool"]);
  await first.release(); await second.release(); await registry.close();
});

test("one failed candidate disposes its peer and retains last-good", async () => {
  const disposed = [];
  const registry = createRuntimeGenerationComposition({
    initial: source("one"),
    prepareProvider: async ({ name }) => ({ name }),
    prepareMcp: async ({ name }) => { if (name === "bad") throw new Error("mcp failed"); return { name }; },
    disposeProvider: async ({ name }) => disposed.push(`provider:${name}`),
    disposeMcp: async ({ name }) => disposed.push(`mcp:${name}`),
  });
  await registry.initialize(); const generationId = registry.snapshot().generationId;
  await assert.rejects(registry.publish(source("bad"), { expectedRevision: 1 }), /mcp failed/);
  assert.equal(registry.snapshot().generationId, generationId); assert.ok(disposed.includes("provider:bad"));
  const lease = registry.acquire(); assert.equal(lease.provider.name, "one"); await lease.release(); await registry.close();
});
