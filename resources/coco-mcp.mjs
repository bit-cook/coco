import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { createCommandRecoveryJournal } from "../scripts/command-recovery-journal.mjs";
import { createMcpRuntimeRegistry } from "../scripts/mcp-runtime-registry.mjs";
import { createMcpRouterTool } from "../scripts/mcp-router-tool.mjs";

export default function cocoMcp(pi, options = {}) {
  let registry;
  pi.on("session_start", async (_event, ctx) => {
    const agentDir = options.agentDir ?? getAgentDir();
    const journal = createCommandRecoveryJournal({ directory: join(agentDir, "command-recovery", "mcp") });
    await journal.recover();
    registry = createMcpRuntimeRegistry({
      agentDir,
      selectServer: async (server, serverName) => server.approval === "allow" || server.approval === "ask" && ctx.hasUI && await ctx.ui.confirm("Enable MCP server?", `${serverName}: ${server.command} ${server.args.join(" ")}`),
      connect: async (server) => {
        const transport = new StdioClientTransport({ args: server.args, command: server.command, cwd: ctx.cwd, stderr: "pipe" });
        const client = new Client({ name: "coco", version: "0.7.4" });
        await client.connect(transport);
        return client;
      },
    });
    try { await registry.reload(); pi.registerTool(createMcpRouterTool({ journal, registry })); }
    catch (error) { await registry.close(); registry = undefined; if (ctx.hasUI) ctx.ui.notify(`MCP unavailable: ${error instanceof Error ? error.message : "connection failed"}`, "warning"); }
  });
  pi.on("session_shutdown", async () => { await registry?.close(); registry = undefined; });
}
