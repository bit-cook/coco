import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

function validKey(value) { return typeof value === "string" && /^[a-f0-9]{64}-node[0-9]+-[a-z0-9]+-[a-z0-9]+$/.test(value); }
async function stateRuntime(path) { try { const value = JSON.parse(await readFile(path, "utf8")); return validKey(value.runtimeKey) && typeof value.runtimeRoot === "string" ? value : null; } catch { return null; } }
export async function resolveRuntimeRoot({ agentDir, root, statePaths }) {
  const sourceRoot = resolve(root), states = await Promise.all([stateRuntime(statePaths.runner), stateRuntime(statePaths.control)]), candidates = states.filter(Boolean);
  if (candidates.length === 0) return sourceRoot;
  for (const candidate of candidates) {
    const runtimeRoot = resolve(candidate.runtimeRoot);
    if (!runtimeRoot.startsWith(`${resolve(agentDir)}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("RUNTIME_ROOT_INVALID");
    try { const marker = JSON.parse(await readFile(join(runtimeRoot, ".runtime-complete.json"), "utf8")), info = await stat(runtimeRoot); if (!info.isDirectory() || marker.key !== candidate.runtimeKey || marker.schemaVersion !== 1) throw new Error(); return runtimeRoot; } catch { /* stale state may coexist with a newer valid state */ }
  }
  throw new Error("RUNTIME_ROOT_UNAVAILABLE");
}
