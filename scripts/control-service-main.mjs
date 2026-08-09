import { resolve } from "node:path";
import { runControlServer } from "./control-service.mjs";
function option(name) { const index = process.argv.indexOf(name); return index === -1 ? null : process.argv[index + 1]; }
const agentDir = option("--agent-dir"); const root = option("--root"); const host = option("--host"); const port = Number(option("--port"));
if (!agentDir || !root || !host || !Number.isSafeInteger(port)) throw new Error("CONTROL_USAGE");
await runControlServer({ agentDir: resolve(agentDir), host, port, root: resolve(root) });
