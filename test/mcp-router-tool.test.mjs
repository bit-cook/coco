import assert from "node:assert/strict";
import test from "node:test";

import { createMcpRouterTool } from "../scripts/mcp-router-tool.mjs";

test("router invokes a tool from the current complete generation", async () => {
  const calls = [];
  const client = { async callTool(request) { calls.push(request); return { content: [{ type: "text", text: "ok" }] }; } };
  const registry = { current: () => ({ generation: 7, tools: [{ client, serverName: "alpha", tool: { name: "search" } }] }) };
  const tool = createMcpRouterTool({ registry });
  const result = await tool.execute("id", { arguments: { q: "x" }, server: "alpha", tool: "search" });
  assert.deepEqual(calls, [{ arguments: { q: "x" }, name: "search" }]);
  assert.deepEqual(result.details, { generation: 7, server: "alpha", tool: "search" });
  assert.equal(result.content[0].text, "ok");
});

test("router rejects tools outside the current generation", async () => {
  const tool = createMcpRouterTool({ registry: { current: () => ({ generation: 1, tools: [] }) } });
  await assert.rejects(tool.execute("id", { arguments: {}, server: "old", tool: "gone" }), { code: "MCP_TOOL_NOT_FOUND" });
});
