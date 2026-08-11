import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { discoverExecutionAdapter } from "../scripts/execution-adapter-discovery.mjs";

test("adapter discovery hashes a stable private regular file without executing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-adapter-discovery-"));
  try {
    const path = join(root, "adapter"); await writeFile(path, "not an executable payload\n", { mode: 0o500 });
    const evidence = await discoverExecutionAdapter(path);
    assert.equal(evidence.path, path); assert.match(evidence.sha256, /^[0-9a-f]{64}$/); assert.equal(evidence.bytes, 26);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("adapter discovery rejects relative paths, symlinks, and group-writable files", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-adapter-discovery-invalid-"));
  try {
    const path = join(root, "adapter"); await writeFile(path, "adapter\n", { mode: 0o500 });
    const link = join(root, "link"); await symlink(path, link);
    await assert.rejects(discoverExecutionAdapter("relative"), /EXECUTION_ADAPTER_PATH_INVALID/);
    await assert.rejects(discoverExecutionAdapter(link), /EXECUTION_ADAPTER_ENTRY_INVALID/);
    if (process.platform !== "win32") { await chmod(path, 0o520); await assert.rejects(discoverExecutionAdapter(path), /EXECUTION_ADAPTER_PERMISSION_INVALID/); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
