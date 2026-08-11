import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const MAX_ADAPTER_BYTES = 64 * 1024 * 1024;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

export async function discoverExecutionAdapter(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) fail("EXECUTION_ADAPTER_PATH_INVALID");
  let info; try { info = await lstat(path); } catch { fail("EXECUTION_ADAPTER_UNAVAILABLE"); }
  if (!info.isFile() || info.isSymbolicLink()) fail("EXECUTION_ADAPTER_ENTRY_INVALID");
  if (info.size < 1 || info.size > MAX_ADAPTER_BYTES) fail("EXECUTION_ADAPTER_SIZE_INVALID");
  if (process.platform !== "win32" && (info.mode & 0o022) !== 0) fail("EXECUTION_ADAPTER_PERMISSION_INVALID");
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (after.dev !== info.dev || after.ino !== info.ino || after.size !== info.size || after.mtimeMs !== info.mtimeMs) fail("EXECUTION_ADAPTER_CHANGED");
  return Object.freeze({ bytes: bytes.length, path, schemaVersion: 1, sha256: createHash("sha256").update(bytes).digest("hex") });
}
