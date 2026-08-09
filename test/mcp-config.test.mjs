import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readMcpConfig, updateMcpConfig, validMcpConfig } from "../scripts/mcp-config.mjs";

test("MCP registry accepts bounded stdio servers without credentials", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-mcp-"));
  try {
    await updateMcpConfig(agentDir, (config) => {
      config.servers.local = { approval: "ask", args: ["server.mjs"], command: "node", enabled: true, transport: "stdio" };
      return config;
    });
    const config = await readMcpConfig(agentDir);
    assert.equal(validMcpConfig(config), true);
    assert.deepEqual(Object.keys(config.servers.local).sort(), ["approval", "args", "command", "enabled", "transport"]);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

test("MCP registry rejects unknown process policy fields", () => {
  const value = { schemaVersion: 1, servers: { bad: { approval: "allow", args: [], command: "x", enabled: true, shell: true, transport: "stdio" } } };
  assert.equal(validMcpConfig(value), false);
});
