import { readFile } from "node:fs/promises";

import { canonicalJson, canonicalize, sha256 } from "./canonical-json.mjs";

export const WINDOWS_ABI_SHA256 = "92d2991c2b39e6c6099c61fe8a876ad0106b2d8204cbb7756bbf85be70091083";

class WindowsAbiError extends Error {
  constructor() { super("WINDOWS_ABI_BOOTSTRAP_INVALID"); this.code = "WINDOWS_ABI_BOOTSTRAP_INVALID"; this.name = "WindowsAbiError"; }
}

function validateAbi(abi) {
  if (!abi || abi.schemaVersion !== 1 || !Array.isArray(abi.calls) || !Array.isArray(abi.failureTransitions) || typeof abi.constants !== "object" || abi.identityEncoding !== "volume-u64behex16-fileid128-nativebyteshex32") throw new WindowsAbiError();
  const identifiers = new Set();
  for (const call of abi.calls) {
    if (!call || typeof call.id !== "string" || identifiers.has(call.id) || !("expect" in call)) throw new WindowsAbiError();
    identifiers.add(call.id);
  }
  if (abi.calls[0]?.id !== "openProcessCwd" || abi.calls.at(-1)?.id !== "closeFsRoot") throw new WindowsAbiError();
}

function transition(call, index) {
  return { call: canonicalize(call), id: call.id, index, result: canonicalize(call.expect) };
}

export async function executeWindowsAbi({ source = "/tmp/windows-native-adapter-abi.v1.json" }) {
  let bytes;
  try { bytes = await readFile(source); } catch { throw new WindowsAbiError(); }
  if (sha256(bytes) !== WINDOWS_ABI_SHA256) throw new WindowsAbiError();
  let abi;
  try { abi = JSON.parse(bytes.toString("utf8")); } catch { throw new WindowsAbiError(); }
  if (canonicalJson(abi) !== bytes.toString("utf8")) throw new WindowsAbiError();
  validateAbi(abi);
  return {
    constants: canonicalize(abi.constants),
    evidenceKind: "adapter",
    failureTransitions: canonicalize(abi.failureTransitions),
    identityEncoding: abi.identityEncoding,
    schemaVersion: abi.schemaVersion,
    sha256: WINDOWS_ABI_SHA256,
    transitions: abi.calls.map(transition),
  };
}
