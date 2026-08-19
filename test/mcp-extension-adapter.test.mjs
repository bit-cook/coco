import assert from "node:assert/strict";
import test from "node:test";

import { createMcpExtensionAdapter } from "../scripts/mcp-extension-adapter.mjs";

function generation(closed = []) {
  const client = { close: async () => closed.push("closed") };
  return {
    generation: 7,
    tools: [
      { client, prepared: { description: "first", execute: async () => {}, label: "First", name: "local_first", parameters: {} } },
      { client, prepared: { description: "second", execute: async () => {}, label: "Second", name: "local_second", parameters: {} } },
    ],
  };
}

function activate(registry, host) {
  const events = new Map();
  createMcpExtensionAdapter({ registry })({ ...host, on: (name, handler) => events.set(name, handler) });
  return events;
}

test("extension commits one fully prepared generation", async () => {
  const candidate = generation();
  const commits = [];
  const events = activate({ reload: async () => candidate }, {
    registerGeneration: async (tools, metadata) => commits.push({ metadata, tools }),
  });

  await events.get("session_start")();
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].tools.map(({ name }) => name), ["local_first", "local_second"]);
  assert.deepEqual(commits[0].metadata, { generation: 7 });
  assert.equal(Object.isFrozen(commits[0].tools), true);
});

test("invalid candidate tool prevents every host registration", async () => {
  const candidate = generation();
  candidate.tools[1].prepared.name = "local_first";
  let registrations = 0;
  const events = activate({ reload: async () => candidate }, {
    registerTool: async () => { registrations += 1; },
    unregisterTool: async () => {},
  });

  await assert.rejects(events.get("session_start")(), /MCP_EXTENSION_TOOL_INVALID/);
  assert.equal(registrations, 0);
});

test("registration fault is compensated without leaving partial tools", async () => {
  const visible = new Set();
  const events = activate({ reload: async () => generation() }, {
    registerTool: async (tool) => {
      visible.add(tool.name);
      if (tool.name === "local_second") throw new Error("registration fault");
    },
    unregisterTool: async (name) => visible.delete(name),
  });

  await assert.rejects(events.get("session_start")(), /registration fault/);
  assert.deepEqual([...visible], []);
});

test("unsupported hosts fail closed before registering anything", () => {
  let registrations = 0;
  assert.throws(() => createMcpExtensionAdapter({ registry: { reload: async () => generation() } })({
    on: () => {},
    registerTool: () => { registrations += 1; },
  }), /MCP_EXTENSION_TRANSACTION_UNSUPPORTED/);
  assert.equal(registrations, 0);
});

test("shutdown disposes host registration and closes each client once", async () => {
  const closed = [];
  let disposed = 0;
  const events = activate({ reload: async () => generation(closed) }, {
    registerGeneration: async () => ({ dispose: async () => { disposed += 1; } }),
  });

  await events.get("session_start")();
  await events.get("session_shutdown")();
  assert.equal(disposed, 1);
  assert.deepEqual(closed, ["closed"]);
});

test("rollback-only hosts roll back on shutdown and close clients", async () => {
  const closed = [];
  const registered = [];
  const rollbacks = [];
  const events = activate({ reload: async () => generation(closed) }, {
    registerTool: async ({ name }) => registered.push(name),
    rollback: async (value) => rollbacks.push(value),
  });

  await events.get("session_start")();
  await events.get("session_shutdown")();
  assert.deepEqual(registered, ["local_first", "local_second"]);
  assert.deepEqual(rollbacks, [{ generation: 7, registered: ["local_first", "local_second"] }]);
  assert.deepEqual(closed, ["closed"]);
});
