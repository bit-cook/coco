import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import cocoMcp from "../resources/coco-mcp.mjs";

test("production MCP extension registers one generation router and shuts down cleanly", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "coco-mcp-extension-")), agentDir = join(root, "agent");
  await mkdir(agentDir, { mode: 0o700 }); t.after(() => rm(root, { recursive: true, force: true }));
  const handlers = new Map(), tools = [];
  const pi = { on(name, handler) { handlers.set(name, handler); }, registerTool(tool) { tools.push(tool); } };
  cocoMcp(pi, { agentDir });
  await handlers.get("session_start")({}, { cwd: process.cwd(), hasUI: false });
  assert.equal(tools.length, 1); assert.equal(tools[0].name, "mcp");
  await assert.rejects(tools[0].execute("id", { arguments: {}, server: "missing", tool: "missing" }), { code: "MCP_TOOL_NOT_FOUND" });
  await handlers.get("session_shutdown")();
});
