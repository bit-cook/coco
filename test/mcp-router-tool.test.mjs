import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCommandRecoveryJournal } from "../scripts/command-recovery-journal.mjs";
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

test("router journals MCP effects and replays one durable result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-mcp-router-journal-"));
  try {
    let calls = 0;
    const client = { async callTool() { calls += 1; return { content: [{ type: "text", text: "once" }] }; } };
    const registry = { current: () => ({ generation: 3, tools: [{ client, serverName: "alpha", tool: { name: "write" } }] }) };
    const tool = createMcpRouterTool({ journal: createCommandRecoveryJournal({ directory }), registry });
    const input = { arguments: { value: 1 }, server: "alpha", tool: "write" };
    assert.equal((await tool.execute("call-1", input)).content[0].text, "once");
    assert.equal((await tool.execute("call-1", input)).content[0].text, "once");
    assert.equal(calls, 1);
    await assert.rejects(tool.execute("call-1", { ...input, arguments: { value: 2 } }), { code: "MCP_COMMAND_CONFLICT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("router never replays an uncertain MCP effect", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-mcp-router-uncertain-"));
  try {
    let calls = 0;
    const client = { async callTool() { calls += 1; throw new Error("connection lost"); } };
    const registry = { current: () => ({ generation: 4, tools: [{ client, serverName: "alpha", tool: { name: "write" } }] }) };
    const tool = createMcpRouterTool({ journal: createCommandRecoveryJournal({ directory }), registry });
    const input = { arguments: {}, server: "alpha", tool: "write" };
    await assert.rejects(tool.execute("call-uncertain", input), { code: "MCP_OUTCOME_UNCERTAIN" });
    await assert.rejects(tool.execute("call-uncertain", input), { code: "MCP_OUTCOME_UNCERTAIN" });
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
