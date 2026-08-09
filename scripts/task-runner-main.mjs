import { resolve } from "node:path";
import { createTaskRunner } from "./task-runner.mjs";

function option(name) { const index = process.argv.indexOf(name); return index === -1 ? null : process.argv[index + 1]; }
const agentDir = option("--agent-dir");
const root = option("--root");
if (!agentDir || !root) throw new Error("RUNNER_USAGE");
await createTaskRunner({ agentDir: resolve(agentDir), root: resolve(root) }).run();
