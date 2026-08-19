import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMcpPublisher, readMcpConfig, updateMcpConfig, validMcpConfig } from "../scripts/mcp-config.mjs";

async function fixture(run) {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-mcp-"));
  try { await run(agentDir); } finally { await rm(agentDir, { recursive: true, force: true }); }
}

const server = { approval: "ask", args: [], command: "node", enabled: true, transport: "stdio" };

test("MCP registry accepts bounded stdio servers without credentials", async () => {
  await fixture(async (agentDir) => {
    await updateMcpConfig(agentDir, (config) => {
      config.servers.local = { approval: "ask", args: ["server.mjs"], command: "node", enabled: true, transport: "stdio" };
      return config;
    });
    const config = await readMcpConfig(agentDir);
    assert.equal(validMcpConfig(config), true);
    assert.equal(config.revision, 1);
    assert.deepEqual(Object.keys(config.servers.local).sort(), ["approval", "args", "command", "enabled", "transport"]);
  });
});

test("MCP registry rejects unknown process policy fields", () => {
  const value = { generation: 0, revision: 0, schemaVersion: 2, servers: { bad: { approval: "allow", args: [], command: "x", enabled: true, shell: true, transport: "stdio" } } };
  assert.equal(validMcpConfig(value), false);
});

test("MCP publication discovers every page before one visible generation swap", async () => fixture(async (agentDir) => {
  const calls = [];
  const client = { close: async () => calls.push("close"), listTools: async ({ cursor } = {}) => cursor ? { tools: [{ inputSchema: {}, name: "second" }] } : { nextCursor: "page-2", tools: [{ inputSchema: {}, name: "first" }] } };
  const publisher = createMcpPublisher({ agentDir, connect: async () => client, prepareTool: async ({ name }) => { calls.push(name); return `prepared:${name}`; } });
  const published = await publisher.reload((config) => { config.servers.local = server; return config; });
  assert.deepEqual(published.tools.map(({ name, prepared }) => [name, prepared]), [["local_first", "prepared:local_first"], ["local_second", "prepared:local_second"]]);
  assert.equal(publisher.current(), published);
  assert.equal(published.generation, 1);
  assert.equal(published.revision, 1);
  assert.equal(Object.isFrozen(published.config.servers.local), true);
  assert.equal(Object.isFrozen(published.tools[0].tool.inputSchema), true);
  assert.deepEqual(calls, ["local_first", "local_second"]);
}));

test("MCP candidate faults retain last-good without partially exposing prepared tools", async () => fixture(async (agentDir) => {
  let mode = "good", failedClosed = false;
  const goodClient = { close: async () => {}, listTools: async () => ({ tools: [{ inputSchema: {}, name: "stable" }] }) };
  const badClient = { close: async () => { failedClosed = true; }, listTools: async () => ({ tools: [{ inputSchema: {}, name: "one" }, { inputSchema: {}, name: "two" }] }) };
  const publisher = createMcpPublisher({ agentDir, connect: async () => mode === "good" ? goodClient : badClient, prepareTool: async ({ name }) => { if (name.endsWith("two")) throw new Error("registration fault"); return name; } });
  const lastGood = await publisher.reload((config) => { config.servers.local = server; return config; });
  mode = "bad";
  await assert.rejects(publisher.reload(), /registration fault/);
  assert.equal(publisher.current(), lastGood);
  assert.deepEqual(publisher.current().tools.map(({ name }) => name), ["local_stable"]);
  assert.equal(failedClosed, true);
  assert.deepEqual(await readMcpConfig(agentDir), lastGood.config);
}));

test("MCP duplicate normalization, invalid schema, pagination, and client faults publish nothing", async () => fixture(async (agentDir) => {
  let prepared = 0;
  const faults = [
    async () => ({ tools: [{ inputSchema: {}, name: "a.b" }, { inputSchema: {}, name: "a_b" }] }),
    async () => ({ tools: [{ name: "missing-schema" }] }),
    async ({ cursor } = {}) => ({ nextCursor: cursor ?? "same", tools: [] }),
    async () => { throw new Error("client closed"); },
  ];
  for (const listTools of faults) {
    let closed = false;
    const publisher = createMcpPublisher({ agentDir, connect: async () => ({ close: async () => { closed = true; }, listTools }), prepareTool: async () => { prepared += 1; } });
    await assert.rejects(publisher.reload((config) => { config.servers.local = server; return config; }));
    assert.equal(publisher.current().generation, 0);
    assert.equal(closed, true);
  }
  assert.equal(prepared, 0);
  assert.deepEqual(await readMcpConfig(agentDir), { generation: 0, revision: 0, schemaVersion: 2, servers: {} });
}));

test("MCP generations and revisions recover across publisher restart and legacy config", async () => fixture(async (agentDir) => {
  await writeFile(join(agentDir, "mcp.json"), `${JSON.stringify({ schemaVersion: 1, servers: { local: server } })}\n`, { mode: 0o600 });
  const connect = async () => ({ close: async () => {}, listTools: async () => ({ tools: [{ inputSchema: {}, name: "tool" }] }) });
  const first = await createMcpPublisher({ agentDir, connect }).reload();
  const second = await createMcpPublisher({ agentDir, connect }).reload();
  assert.deepEqual([first.generation, first.revision], [1, 1]);
  assert.deepEqual([second.generation, second.revision], [2, 2]);
  assert.deepEqual(await readMcpConfig(agentDir), second.config);
}));
