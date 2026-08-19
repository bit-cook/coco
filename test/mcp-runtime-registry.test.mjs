import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMcpRuntimeRegistry } from "../scripts/mcp-runtime-registry.mjs";

const server = { approval: "ask", args: [], command: "node", enabled: true, transport: "stdio" };

async function fixture(run) {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-mcp-runtime-"));
  try { await run(agentDir); } finally { await rm(agentDir, { recursive: true, force: true }); }
}

test("runtime registry swaps the complete tool generation atomically", async () => fixture(async (agentDir) => {
  const clients = [];
  const registry = createMcpRuntimeRegistry({
    agentDir,
    connect: async () => {
      const client = { close: async () => {}, listTools: async () => ({ tools: [{ inputSchema: {}, name: "tool" }] }) };
      clients.push(client);
      return client;
    },
    prepareTool: async ({ name }) => {
      assert.equal(registry.current().generation, 0);
      return name;
    },
  });

  const first = await registry.reload((config) => { config.servers.local = server; return config; });
  assert.equal(registry.current(), first);
  assert.deepEqual(registry.tools().map(({ name, generation }) => [name, generation]), [["local_tool", 1]]);
  assert.equal(clients.length, 1);
}));

test("runtime registry closes the replaced generation", async () => fixture(async (agentDir) => {
  const closed = [];
  let sequence = 0;
  const registry = createMcpRuntimeRegistry({
    agentDir,
    connect: async () => {
      const id = ++sequence;
      return { close: async () => closed.push(id), listTools: async () => ({ tools: [{ inputSchema: {}, name: `tool-${id}` }] }) };
    },
  });
  await registry.reload((config) => { config.servers.local = server; return config; });
  const second = await registry.reload();
  assert.equal(second.generation, 2);
  assert.deepEqual(closed, [1]);
  assert.deepEqual(registry.tools().map(({ name }) => name), ["local_tool-2"]);
}));

test("runtime registry retains last-good tools when reload fails", async () => fixture(async (agentDir) => {
  let bad = false;
  let badClosed = false;
  const goodClient = { close: async () => {}, listTools: async () => ({ tools: [{ inputSchema: {}, name: "stable" }] }) };
  const registry = createMcpRuntimeRegistry({
    agentDir,
    connect: async () => bad
      ? { close: async () => { badClosed = true; }, listTools: async () => ({ tools: [{ inputSchema: {}, name: "replacement" }] }) }
      : goodClient,
    prepareTool: async ({ name }) => { if (name === "local_replacement") throw new Error("reload fault"); return name; },
  });
  const lastGood = await registry.reload((config) => { config.servers.local = server; return config; });
  bad = true;
  await assert.rejects(registry.reload(), /reload fault/);
  assert.equal(registry.current(), lastGood);
  assert.deepEqual(registry.tools().map(({ name }) => name), ["local_stable"]);
  assert.equal(badClosed, true);
}));
