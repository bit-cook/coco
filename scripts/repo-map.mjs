import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const IGNORED = new Set([".git", "node_modules", "dist", "build", "coverage"]);
const DEFAULTS = Object.freeze({ maxBytes: 4 * 1024 * 1024, maxFiles: 512, maxSymbols: 4096 });
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

function bounded(value, name) { if (!Number.isSafeInteger(value) || value < 1) fail(`REPO_MAP_${name}_INVALID`); return value; }
function sourceExtension(path) { const dot = path.lastIndexOf("."); return dot === -1 ? "" : path.slice(dot).toLowerCase(); }
function symbol(kind, name, line, exported = false) { return { exported, kind, line, name }; }

function extractSymbols(source, limit) {
  const result = [];
  const add = (value) => { if (result.length >= limit) fail("REPO_MAP_SYMBOL_LIMIT_EXCEEDED"); result.push(value); };
  for (const [index, line] of source.split("\n").entries()) {
    const lineNumber = index + 1;
    let match;
    if ((match = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line))) add(symbol("function", match[1], lineNumber, /^\s*export\b/.test(line)));
    if ((match = /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line))) add(symbol("class", match[1], lineNumber, /^\s*export\b/.test(line)));
    if ((match = /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line))) add(symbol("variable", match[1], lineNumber, true));
    if ((match = /^\s*export\s+default\s+(.+)$/.exec(line))) add(symbol("default", match[1].trim().slice(0, 120), lineNumber, true));
  }
  return result;
}

function extractImports(source) {
  const imports = new Set();
  for (const line of source.split("\n")) {
    const matches = [
      /^\s*import(?:[^"']*from\s*)?["']([^"']+)["']/.exec(line),
      /^\s*export(?:[^"']*from\s*)?["']([^"']+)["']/.exec(line),
      /\b(?:require|import)\(\s*["']([^"']+)["']\s*\)/.exec(line),
    ];
    for (const match of matches) if (match) imports.add(match[1]);
  }
  return [...imports].sort();
}

function queryTokens(query) {
  return [...new Set(String(query ?? "").toLowerCase().split(/[^a-z0-9_$]+/).filter(Boolean))];
}

export function selectRepoContext(map, { query = "", maxBytes = 128 * 1024, maxFiles = 32, maxSymbols = 256 } = {}) {
  if (!map || map.schemaVersion !== 1 || !Array.isArray(map.files)) fail("REPO_CONTEXT_MAP_INVALID");
  bounded(maxBytes, "CONTEXT_BYTE_LIMIT"); bounded(maxFiles, "CONTEXT_FILE_LIMIT"); bounded(maxSymbols, "CONTEXT_SYMBOL_LIMIT");
  const tokens = queryTokens(query);
  const score = (entry) => {
    const haystack = [entry.path, ...entry.imports, ...entry.symbols.flatMap(({ name }) => [name])].join(" ").toLowerCase();
    return tokens.reduce((value, token) => value + (haystack.includes(token) ? 1 : 0), 0);
  };
  const ranked = map.files.map((entry) => ({ entry, score: score(entry) })).sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));
  const files = []; let bytes = 0; let symbols = 0;
  for (const { entry, score: relevance } of ranked) {
    if (files.length >= maxFiles) break;
    const selectedSymbols = entry.symbols.slice(0, Math.max(0, maxSymbols - symbols));
    const candidate = { imports: entry.imports, path: entry.path, relevance, symbols: selectedSymbols };
    const candidateBytes = Buffer.byteLength(JSON.stringify(candidate));
    if (bytes + candidateBytes > maxBytes) continue;
    files.push(candidate); bytes += candidateBytes; symbols += selectedSymbols.length;
  }
  return { files, query: String(query ?? ""), schemaVersion: 1, stats: { bytes, files: files.length, symbols } };
}

async function collectFiles(root, directory, state) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail("REPO_MAP_SYMLINK_FORBIDDEN");
    if (entry.isDirectory()) await collectFiles(root, path, state);
    else if (entry.isFile() && EXTENSIONS.has(sourceExtension(entry.name))) {
      const info = await lstat(path);
      if (state.files.length >= state.maxFiles) fail("REPO_MAP_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(path);
      state.bytes += bytes.length;
      if (state.bytes > state.maxBytes) fail("REPO_MAP_BYTE_LIMIT_EXCEEDED");
      state.files.push({ bytes, path });
    }
  }
}

export async function buildRepoMap({ root, maxBytes = DEFAULTS.maxBytes, maxFiles = DEFAULTS.maxFiles, maxSymbols = DEFAULTS.maxSymbols } = {}) {
  const absolute = resolve(root); bounded(maxBytes, "BYTE_LIMIT"); bounded(maxFiles, "FILE_LIMIT"); bounded(maxSymbols, "SYMBOL_LIMIT");
  const state = { bytes: 0, files: [], maxBytes, maxFiles };
  await collectFiles(absolute, absolute, state);
  const fileEntries = state.files.map(({ bytes, path }) => {
    const relativePath = relative(absolute, path).split(sep).join("/");
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { bytes: bytes.length, imports: extractImports(source), path: relativePath, symbols: extractSymbols(source, maxSymbols) };
  });
  const symbols = fileEntries.reduce((total, entry) => total + entry.symbols.length, 0);
  if (symbols > maxSymbols) fail("REPO_MAP_SYMBOL_LIMIT_EXCEEDED");
  return { files: fileEntries, root: absolute, schemaVersion: 1, stats: { bytes: state.bytes, files: fileEntries.length, symbols } };
}

export { DEFAULTS as repoMapDefaults };
