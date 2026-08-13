import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const contractPath = join(root, "resources", "coco-model-panel-runtime-capabilities.v1.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const boundedStates = new Set(["baseline-patched", "candidate-before-patch", "candidate-after-patch", "fixture"]);

function lexical(source) {
  let output = "", state = "code";
  for (let index = 0; index < source.length; index++) { const char = source[index], next = source[index + 1];
    if (state === "code" && char === "/" && next === "/") { output += "  "; index++; state = "line"; continue; }
    if (state === "code" && char === "/" && next === "*") { output += "  "; index++; state = "block"; continue; }
    if (state === "line") { output += char === "\n" ? "\n" : " "; if (char === "\n") state = "code"; continue; }
    if (state === "block") { output += char === "\n" ? "\n" : " "; if (char === "*" && next === "/") { output += " "; index++; state = "code"; } continue; }
    if (state === "string") { output += char === "\n" ? "\n" : " "; if (char === "\\") { output += " "; index++; } else if (char === quote) state = "code"; continue; }
    if (["\"", "'", "`"].includes(char)) { var quote = char; state = "string"; output += " "; continue; }
    output += char;
  }
  return output;
}

function directMethod(source, container, symbol) {
  const clean = lexical(source); const declaration = new RegExp(`\\b(?:export\\s+)?(?:declare\\s+)?(?:class|interface)\\s+${container}\\b[^\\{]*\\{`, "g"); const matches = [...clean.matchAll(declaration)];
  if (matches.length !== 1) return { present: false, reason: matches.length > 1 ? "declaration-ambiguous" : "container-missing" };
  const start = matches[0].index + matches[0][0].length; let depth = 0, body = "";
  for (let index = start; index < clean.length; index++) { const char = clean[index]; if (char === "{" ) depth++; else if (char === "}") { if (depth === 0) break; depth--; } body += depth === 0 ? char : " "; }
  const found = new RegExp(`(?:^|[;}]|\\n)\\s*(?:public\\s+|private\\s+|protected\\s+|static\\s+|async\\s+|readonly\\s+)*${symbol}\\s*(?:[?]\\s*)?(?:\\(|:)`, "m").test(body);
  return { present: found, reason: found ? null : "symbol-not-declared" };
}

async function inspect(packageRoot, requirement, container) {
  if (requirement.path.startsWith("/") || requirement.path.split("/").includes("..")) return { missing: { kind: requirement.kind, path: requirement.path, reason: "artifact-invalid", symbol: `${container}.${requirement.symbol}` } };
  const path = resolve(packageRoot, requirement.path); const rel = relative(packageRoot, path); if (rel.startsWith(`..${sep}`) || rel === "..") return { missing: { kind: requirement.kind, path: requirement.path, reason: "artifact-invalid", symbol: `${container}.${requirement.symbol}` } };
  try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw new Error("invalid"); const bytes = await readFile(path); const result = directMethod(bytes.toString("utf8"), container, requirement.symbol); return result.present ? { evidence: { kind: requirement.kind, path: requirement.path, sha256: sha256(bytes), symbol: `${container}.${requirement.symbol}` } } : { missing: { kind: requirement.kind, path: requirement.path, reason: result.reason, symbol: `${container}.${requirement.symbol}` } }; }
  catch { return { missing: { kind: requirement.kind, path: requirement.path, reason: "artifact-invalid", symbol: `${container}.${requirement.symbol}` } }; }
}

export async function detectPiModelPanelCapabilities({ artifactState, packageRoot } = {}) {
  if (!boundedStates.has(artifactState) || typeof packageRoot !== "string") throw new Error("MODEL_PANEL_CAPABILITY_INPUT_INVALID");
  const canonicalRoot = await realpath(packageRoot); const pkg = JSON.parse(await readFile(join(canonicalRoot, "package.json"), "utf8")); const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const capabilities = [];
  for (const capability of contract.capabilities) { const results = await Promise.all(capability.requirements.map((requirement) => inspect(canonicalRoot, requirement, capability.container))); const missing = results.flatMap((entry) => entry.missing ? [entry.missing] : []); capabilities.push({ evidence: results.flatMap((entry) => entry.evidence ? [entry.evidence] : []), id: capability.id, missing, status: missing.length === 0 ? "present" : "missing" }); }
  return { artifact: { package: pkg.name, state: artifactState, version: pkg.version }, capabilities, contract: { id: contract.id, version: contract.schemaVersion }, schemaVersion: 1, status: capabilities.every(({ status }) => status === "present") ? "present" : "missing" };
}
