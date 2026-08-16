import { lstat, readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { collectRuntimeNames } from "./runtime-store-policy.cjs";

const KEY = /^[a-f0-9]{64}-node[0-9]+-[a-z0-9]+-[a-z0-9]+$/;
export async function collectRuntimeGarbage({ runtimeStore, currentKey, references = new Set(), now = Date.now, isLeaseAlive = async () => false, graceMs = 24 * 60 * 60 * 1000, staleMs = 60_000 } = {}) {
  const root = resolve(runtimeStore), active = new Set();
  const leaseRoot = join(root, ".leases");
  for (const name of await readdir(leaseRoot).catch(() => [])) {
    const path = join(leaseRoot, name);
    try { const value = JSON.parse(await readFile(path, "utf8")); if (await isLeaseAlive(value)) active.add(value.key); else await rm(path, { force: true }); } catch { await rm(path, { force: true }); }
  }
  const entries = []; for (const name of await readdir(root).catch(() => [])) { const path = join(root, name), info = await lstat(path).catch(() => null); if (info) entries.push({ directory: info.isDirectory() && !info.isSymbolicLink(), mtimeMs: info.mtimeMs, name, path: resolve(path) }); }
  for (const path of collectRuntimeNames({ activeKeys: active, currentKey, entries, graceMs, now: now(), references, staleMs })) await rm(path, { force: true, recursive: true });
  return { activeKeys: [...active].sort() };
}
