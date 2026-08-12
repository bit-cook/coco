import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readMcpConfig } from "../scripts/mcp-config.mjs";

const safe = (value) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
function text(result) {
  const content = Array.isArray(result.content) ? result.content : [];
  return content.map((part) => part.type === "text" ? { type: "text", text: part.text } : part.type === "image" ? { type: "image", data: part.data, mimeType: part.mimeType } : { type: "text", text: JSON.stringify(part) });
}

export default function cocoMcp(pi) {
  const clients = [];
  pi.on("session_start", async (_event, ctx) => {
    const config = await readMcpConfig(getAgentDir());
    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!server.enabled || server.approval === "deny") continue;
      if (server.approval === "ask" && (!ctx.hasUI || !await ctx.ui.confirm("Enable MCP server?", `${serverName}: ${server.command} ${server.args.join(" ")}`))) continue;
      let client;
      try {
        const transport = new StdioClientTransport({ args: server.args, command: server.command, cwd: ctx.cwd, stderr: "pipe" });
        client = new Client({ name: "coco", version: "0.3.12" });
        await client.connect(transport);
        const listed = await client.listTools();
        clients.push({ client, transport });
        for (const tool of listed.tools) {
          pi.registerTool({
            description: `[MCP ${serverName}] ${tool.description ?? tool.name}`,
            label: `${serverName}: ${tool.name}`,
            name: `mcp__${safe(serverName)}__${safe(tool.name)}`,
            parameters: tool.inputSchema,
            async execute(_id, args, signal) {
              const result = await client.callTool({ arguments: args, name: tool.name }, undefined, { signal });
              return { content: text(result), details: { server: serverName, tool: tool.name }, isError: result.isError === true };
            },
          });
        }
      } catch (error) {
        await client?.close().catch(() => {});
        if (ctx.hasUI) ctx.ui.notify(`MCP server ${serverName} unavailable: ${error instanceof Error ? error.message : "connection failed"}`, "warning");
      }
    }
  });
  pi.on("session_shutdown", async () => { await Promise.allSettled(clients.map(({ client }) => client.close())); clients.length = 0; });
}
