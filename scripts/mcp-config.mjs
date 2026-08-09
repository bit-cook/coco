import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";

const NAME = /^[a-z][a-z0-9_-]{0,63}$/;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function fail(code) { throw new StateError(code); }
export function emptyMcpConfig() { return { schemaVersion: 1, servers: {} }; }
export function validMcpConfig(value) {
  return object(value) && Object.keys(value).sort().join(",") === "schemaVersion,servers" && value.schemaVersion === 1 && object(value.servers) && Object.entries(value.servers).every(([name, server]) => NAME.test(name) && object(server) && Object.keys(server).sort().join(",") === "approval,args,command,enabled,transport" && server.transport === "stdio" && typeof server.command === "string" && server.command.length > 0 && server.command.length <= 4096 && Array.isArray(server.args) && server.args.length <= 100 && server.args.every((arg) => typeof arg === "string" && arg.length <= 4096) && typeof server.enabled === "boolean" && ["allow", "ask", "deny"].includes(server.approval));
}
export async function readMcpConfig(agentDir) {
  const path = statePaths(agentDir).mcp;
  if (await inspectRegular(path) === null) return emptyMcpConfig();
  let value; try { value = JSON.parse(await readFile(path, "utf8")); } catch { fail("MCP_CONFIG_INVALID"); }
  if (!validMcpConfig(value)) fail("MCP_CONFIG_INVALID"); return value;
}
export async function updateMcpConfig(agentDir, change) {
  await ensureAgentDirectory(agentDir); await recoverTransactions(agentDir);
  let output;
  await applyStateTransaction({ agentDir, operations: async () => {
    const next = await change(structuredClone(await readMcpConfig(agentDir)));
    if (!validMcpConfig(next)) fail("MCP_CONFIG_INVALID"); output = next;
    return [{ bytes: canonicalJson(next), path: statePaths(agentDir).mcp }];
  } });
  return output;
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
