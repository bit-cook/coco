import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const MAX_ADAPTER_BYTES = 64 * 1024 * 1024;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export async function discoverExecutionAdapter(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) fail("EXECUTION_ADAPTER_PATH_INVALID");
  let info; try { info = await lstat(path); } catch { fail("EXECUTION_ADAPTER_UNAVAILABLE"); }
  if (!info.isFile() || info.isSymbolicLink()) fail("EXECUTION_ADAPTER_ENTRY_INVALID");
  if (info.size < 1 || info.size > MAX_ADAPTER_BYTES) fail("EXECUTION_ADAPTER_SIZE_INVALID");
  if (process.platform !== "win32" && (info.mode & 0o022) !== 0) fail("EXECUTION_ADAPTER_PERMISSION_INVALID");
  let handle;
  try { handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); } catch { fail("EXECUTION_ADAPTER_UNAVAILABLE"); }
  let bytes;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino || opened.size !== info.size || opened.mtimeMs !== info.mtimeMs) fail("EXECUTION_ADAPTER_CHANGED");
    bytes = await handle.readFile();
    const after = await handle.stat();
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) fail("EXECUTION_ADAPTER_CHANGED");
  } finally { await handle.close(); }
  return Object.freeze({ bytes: bytes.length, path, schemaVersion: 1, sha256: createHash("sha256").update(bytes).digest("hex") });
}
