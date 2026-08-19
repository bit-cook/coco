import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";

const NAME = /^[a-z][a-z0-9_-]{0,63}$/;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function fail(code) { throw new StateError(code); }
export function emptyMcpConfig() { return { generation: 0, revision: 0, schemaVersion: 2, servers: {} }; }
export function validMcpConfig(value) {
  return object(value) && Object.keys(value).sort().join(",") === "generation,revision,schemaVersion,servers" && value.schemaVersion === 2 && Number.isSafeInteger(value.generation) && value.generation >= 0 && Number.isSafeInteger(value.revision) && value.revision >= value.generation && object(value.servers) && Object.entries(value.servers).every(([name, server]) => NAME.test(name) && object(server) && Object.keys(server).sort().join(",") === "approval,args,command,enabled,transport" && server.transport === "stdio" && typeof server.command === "string" && server.command.length > 0 && server.command.length <= 4096 && Array.isArray(server.args) && server.args.length <= 100 && server.args.every((arg) => typeof arg === "string" && arg.length <= 4096) && typeof server.enabled === "boolean" && ["allow", "ask", "deny"].includes(server.approval));
}
export async function readMcpConfig(agentDir) {
  const path = statePaths(agentDir).mcp;
  if (await inspectRegular(path) === null) return emptyMcpConfig();
  let value; try { value = JSON.parse(await readFile(path, "utf8")); } catch { fail("MCP_CONFIG_INVALID"); }
  if (object(value) && value.schemaVersion === 1 && Object.keys(value).sort().join(",") === "schemaVersion,servers") value = { generation: 0, revision: 0, schemaVersion: 2, servers: value.servers };
  if (!validMcpConfig(value)) fail("MCP_CONFIG_INVALID"); return value;
}
export async function updateMcpConfig(agentDir, change) {
  await ensureAgentDirectory(agentDir); await recoverTransactions(agentDir);
  let output;
  await applyStateTransaction({ agentDir, operations: async () => {
    const current = await readMcpConfig(agentDir);
    const next = await change(structuredClone(current));
    if (!validMcpConfig(next) || next.generation !== current.generation || next.revision !== current.revision) fail("MCP_CONFIG_INVALID");
    next.revision += 1; output = next;
    return [{ bytes: canonicalJson(next), path: statePaths(agentDir).mcp }];
  } });
  return output;
}

export function normalizeMcpToolName(serverName, toolName) {
  if (!NAME.test(serverName) || typeof toolName !== "string" || toolName.length === 0 || toolName.length > 128) fail("MCP_TOOL_SCHEMA_INVALID");
  const normalized = `${serverName}_${toolName}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!NAME.test(normalized)) fail("MCP_TOOL_NAME_INVALID");
  return normalized;
}

function validTool(tool) {
  if (!object(tool) || typeof tool.name !== "string" || tool.name.length === 0 || tool.name.length > 128 || !object(tool.inputSchema)) return false;
  if (tool.description !== undefined && (typeof tool.description !== "string" || tool.description.length > 16384)) return false;
  if (tool.outputSchema !== undefined && !object(tool.outputSchema)) return false;
  return true;
}

function immutable(value) {
  if (!object(value) && !Array.isArray(value)) return value;
  for (const child of Object.values(value)) immutable(child);
  return Object.freeze(value);
}

async function closeClients(clients) {
  await Promise.allSettled([...new Set(clients)].map((client) => typeof client?.close === "function" ? client.close() : undefined));
}

export function createMcpPublisher({ agentDir, connect, prepareTool = ({ tool }) => tool, selectServer = () => true }) {
  if (typeof connect !== "function" || typeof prepareTool !== "function" || typeof selectServer !== "function") fail("MCP_PUBLISHER_INVALID");
  let current = Object.freeze({ config: emptyMcpConfig(), generation: 0, revision: 0, tools: Object.freeze([]) });
  return Object.freeze({
    current: () => current,
    async reload(change = (config) => config) {
      const clients = [], tools = [];
      let published;
      try {
        await ensureAgentDirectory(agentDir); await recoverTransactions(agentDir);
        await applyStateTransaction({ agentDir, operations: async () => {
          const previous = await readMcpConfig(agentDir);
          const config = await change(structuredClone(previous));
          if (!validMcpConfig(config) || config.generation !== previous.generation || config.revision !== previous.revision) fail("MCP_CONFIG_INVALID");
          const names = new Set();
          for (const [serverName, server] of Object.entries(config.servers).sort(([left], [right]) => left.localeCompare(right))) {
            if (!server.enabled || !await selectServer(structuredClone(server), serverName)) continue;
            const client = await connect(structuredClone(server), serverName); clients.push(client);
            if (!client || typeof client.listTools !== "function") fail("MCP_CLIENT_INVALID");
            let cursor;
            const cursors = new Set();
            do {
              const page = await client.listTools(cursor === undefined ? {} : { cursor });
              if (!object(page) || !Array.isArray(page.tools) || page.tools.length > 1000 || (page.nextCursor !== undefined && (typeof page.nextCursor !== "string" || page.nextCursor.length === 0 || page.nextCursor.length > 4096))) fail("MCP_TOOL_SCHEMA_INVALID");
              for (const tool of page.tools) {
                if (!validTool(tool)) fail("MCP_TOOL_SCHEMA_INVALID");
                const name = normalizeMcpToolName(serverName, tool.name);
                if (names.has(name)) fail("MCP_TOOL_NAME_COLLISION"); names.add(name);
                tools.push({ client, name, serverName, tool: structuredClone(tool) });
              }
              cursor = page.nextCursor;
              if (cursor !== undefined && (cursors.has(cursor) || cursors.size >= 9999)) fail("MCP_PAGINATION_INVALID");
              if (cursor !== undefined) cursors.add(cursor);
            } while (cursor !== undefined);
          }
          for (const entry of tools) entry.prepared = await prepareTool({ client: entry.client, name: entry.name, serverName: entry.serverName, tool: structuredClone(entry.tool) });
          config.generation += 1; config.revision += 1;
          published = Object.freeze({ config: immutable(structuredClone(config)), generation: config.generation, revision: config.revision, tools: Object.freeze(tools.map((entry) => Object.freeze({ ...entry, generation: config.generation, tool: immutable(entry.tool) }))) });
          return [{ bytes: canonicalJson(config), path: statePaths(agentDir).mcp }];
        } });
      } catch (error) { await closeClients(clients); throw error; }
      const previousClients = [...new Set(current.tools.map(({ client }) => client))];
      current = published;
      await closeClients(previousClients);
      return current;
    },
  });
}
export async function mcpCommand(argv, agentDir) {
  const [action, name, ...rest] = argv;
  if (action === "list") { const config = await readMcpConfig(agentDir); process.stdout.write(`${JSON.stringify(config)}\n`); return { exitCode: 0, kind: "native" }; }
  if (action === "add") {
    if (!NAME.test(name ?? "") || rest[0] !== "--" || !rest[1]) fail("MCP_USAGE");
    const config = await updateMcpConfig(agentDir, (value) => { value.servers[name] = { approval: "ask", args: rest.slice(2), command: rest[1], enabled: true, transport: "stdio" }; return value; });
    process.stdout.write(`${JSON.stringify(config.servers[name])}\n`); return { exitCode: 0, kind: "native" };
  }
  if (action === "remove" && NAME.test(name ?? "")) {
    await updateMcpConfig(agentDir, (value) => { delete value.servers[name]; return value; });
    process.stdout.write(`${JSON.stringify({ name, removed: true })}\n`); return { exitCode: 0, kind: "native" };
  }
  if (["approve", "ask", "deny"].includes(action) && NAME.test(name ?? "")) {
    const config = await updateMcpConfig(agentDir, (value) => { if (!value.servers[name]) fail("MCP_SERVER_NOT_FOUND"); value.servers[name].approval = action === "approve" ? "allow" : action; return value; });
    process.stdout.write(`${JSON.stringify(config.servers[name])}\n`); return { exitCode: 0, kind: "native" };
  }
  fail("MCP_USAGE");
}
