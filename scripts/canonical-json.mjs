import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export class VerificationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "VerificationError";
  }
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readCanonicalJson(path, code) {
  const bytes = await readFile(path);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new VerificationError(code);
  }
  if (bytes.toString("utf8") !== canonicalJson(parsed)) throw new VerificationError(code);
  return { bytes, parsed };
}
