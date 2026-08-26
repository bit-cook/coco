import { timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import { constants } from "node:fs";
import { lstat, open as openFile, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentSessionFromServices, createAgentSessionServices, SessionManager } from "@earendil-works/pi-coding-agent";

export const DEFAULT_PORT = 30141;
const ROOT = dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = resolve(ROOT, "..", "coweb");
const MIME_TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const MAX_PROJECT_FILES = 500;
const MAX_PREVIEW_BYTES = 256 * 1024;

export function parseCowebArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag !== "--port" && flag !== "--password") return { error: "COWEB_UNKNOWN_ARGUMENT", value: flag };
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) return { error: "COWEB_FLAG_VALUE_MISSING", flag };
    options[flag.slice(2)] = value;
    index += 1;
  }
  if (options.port && (!/^\d+$/u.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535)) return { error: "COWEB_PORT_INVALID" };
  return { options };
}

function json(response, status, value) {
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" });
  response.end(`${JSON.stringify(value)}\n`);
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("COWEB_REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("COWEB_JSON_INVALID"); }
}

function authorized(request, password) {
  if (!password) return true;
  const expected = Buffer.from(`pi:${password}`);
  const supplied = request.headers.authorization?.startsWith("Basic ") ? Buffer.from(request.headers.authorization.slice(6), "base64") : Buffer.alloc(0);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((part) => part?.type === "text").map((part) => part.text).join("");
  return "";
}

function sessionState(session) {
  return {
    id: session.sessionId,
    isStreaming: session.isStreaming,
    messages: session.messages.map((message) => ({ content: messageText(message), role: message.role, ...(message.stopReason && { stopReason: message.stopReason }) })),
    model: session.model ? { id: session.model.id, provider: session.model.provider } : null,
    thinkingLevel: session.thinkingLevel,
    cwd: session.sessionManager.cwd,
  };
}

async function projectRoot(cwd) {
  const root = resolve(cwd);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("COWEB_PROJECT_ROOT_INVALID");
  return root;
}

function projectFilePath(root, name) {
  if (typeof name !== "string" || !name || name === "." || name === ".." || name !== basename(name)) throw new Error("COWEB_PROJECT_FILE_INVALID");
  const file = resolve(root, name);
  if (!file.startsWith(`${root}/`)) throw new Error("COWEB_PROJECT_FILE_INVALID");
  return file;
}

export async function listProjectFiles(cwd) {
  const root = await projectRoot(cwd);
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => !entry.isSymbolicLink() && (entry.isFile() || entry.isDirectory())).sort((left, right) => left.name.localeCompare(right.name)).slice(0, MAX_PROJECT_FILES).map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" }));
}

export async function readProjectFile(cwd, name) {
  const root = await projectRoot(cwd);
  const file = projectFilePath(root, name);
  let handle;
  try {
    const link = await lstat(file);
    if (!link.isFile() || link.isSymbolicLink()) throw new Error("COWEB_PROJECT_FILE_INVALID");
    handle = await openFile(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_PREVIEW_BYTES) throw new Error("COWEB_PROJECT_FILE_INVALID");
    const bytes = Buffer.alloc(info.size);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return { name, text: bytes.subarray(0, bytesRead).toString("utf8") };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("COWEB_")) throw error;
    throw new Error("COWEB_PROJECT_FILE_INVALID");
  } finally { await handle?.close(); }
}

function modelList(services) {
  return services.modelRuntime.getModels().map((model) => ({ id: model.id, name: model.name ?? model.id, provider: model.provider }));
}

function sessionDirectory(cwd, agentDir) {
  const resolved = resolve(cwd);
  return join(agentDir, "sessions", `--${resolved.replace(/^[/\\]/u, "").replace(/[/\\:]/gu, "-")}--`);
}

async function listSessions(agentDir) {
  const root = join(agentDir, "sessions");
  let directories;
  try { directories = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const sessions = [];
  for (const directory of directories) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue;
    const base = join(root, directory.name);
    let files;
    try { files = await readdir(base, { withFileTypes: true }); } catch { continue; }
    for (const file of files) {
      if (!file.isFile() || file.isSymbolicLink() || !file.name.endsWith(".jsonl")) continue;
      const path = join(base, file.name);
      try {
        const info = await lstat(path);
        const header = JSON.parse((await readFile(path, "utf8")).split("\n", 1)[0]);
        if (header?.type !== "session" || typeof header.id !== "string" || typeof header.cwd !== "string") continue;
        sessions.push({ cwd: header.cwd, id: header.id, modified: info.mtime.toISOString(), name: undefined, path });
      } catch { /* Corrupt or replaced sessions are not exposed. */ }
    }
  }
  return sessions.sort((left, right) => right.modified.localeCompare(left.modified));
}

export async function createCowebApp({ agentDir, cwd = process.cwd() }) {
  const services = await createAgentSessionServices({ agentDir, cwd });
  const sessions = new Map();
  async function open(path, options = {}) {
    const sessionDir = sessionDirectory(cwd, agentDir);
    const resolvedPath = path && resolve(path);
    if (resolvedPath && !resolvedPath.startsWith(`${resolve(sessionDir)}/`)) throw new Error("COWEB_SESSION_PATH_INVALID");
    const manager = resolvedPath ? SessionManager.open(resolvedPath, sessionDir) : SessionManager.create(cwd, sessionDir);
    const model = options.model && services.modelRuntime.getModel(options.model.provider, options.model.id);
    if (options.model && !model) throw new Error("COWEB_MODEL_NOT_FOUND");
    const created = await createAgentSessionFromServices({ services, sessionManager: manager, ...(model && { model }), ...(options.thinkingLevel && { thinkingLevel: options.thinkingLevel }) });
    sessions.set(created.session.sessionId, created.session);
    return created.session;
  }
  return {
    async create(options) { return sessionState(await open(undefined, options)); },
    async list() { return listSessions(agentDir); },
    models() { return { models: modelList(services), thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh"] }; },
    async open(path) { return sessionState(await open(path)); },
    state(id) { const session = sessions.get(id); if (!session) throw new Error("COWEB_SESSION_NOT_OPEN"); return sessionState(session); },
    async files(id) { const session = sessions.get(id); if (!session) throw new Error("COWEB_SESSION_NOT_OPEN"); return { files: await listProjectFiles(session.sessionManager.cwd) }; },
    async file(id, name) { const session = sessions.get(id); if (!session) throw new Error("COWEB_SESSION_NOT_OPEN"); return readProjectFile(session.sessionManager.cwd, name); },
    async prompt(id, text) { const session = sessions.get(id); if (!session) throw new Error("COWEB_SESSION_NOT_OPEN"); await session.prompt(text, session.isStreaming ? { streamingBehavior: "steer" } : undefined); return sessionState(session); },
    async select(id, selection) {
      const session = sessions.get(id); if (!session) throw new Error("COWEB_SESSION_NOT_OPEN");
      if (selection.model) { const model = services.modelRuntime.getModel(selection.model.provider, selection.model.id); if (!model) throw new Error("COWEB_MODEL_NOT_FOUND"); await session.setModel(model); }
      if (selection.thinkingLevel) session.setThinkingLevel(selection.thinkingLevel);
      return sessionState(session);
    },
  };
}

function errorCode(error) { return error instanceof Error && error.message.startsWith("COWEB_") ? error.message : "COWEB_REQUEST_FAILED"; }

export function createCowebServer(app, { password } = {}) {
  return http.createServer(async (request, response) => {
    if (!authorized(request, password)) { response.writeHead(401, { "www-authenticate": 'Basic realm="Co Web"' }); response.end(); return; }
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/api/sessions") return json(response, 200, { sessions: await app.list() });
      if (request.method === "GET" && url.pathname === "/api/models") return json(response, 200, app.models());
      if (request.method === "POST" && url.pathname === "/api/sessions") {
        const options = await body(request);
        return json(response, options.path ? 200 : 201, options.path ? await app.open(options.path) : await app.create(options));
      }
      const match = /^\/api\/sessions\/([^/]+)(?:\/(prompt|selection|state|files|file))?$/u.exec(url.pathname);
      if (match) {
        const [, id, action] = match;
        if (request.method === "GET" && action === "state") return json(response, 200, app.state(id));
        if (request.method === "GET" && action === "files") return json(response, 200, await app.files(id));
        if (request.method === "GET" && action === "file") return json(response, 200, await app.file(id, url.searchParams.get("path")));
        if (request.method === "POST" && action === "prompt") { const value = await body(request); if (typeof value.text !== "string" || !value.text.trim()) throw new Error("COWEB_PROMPT_INVALID"); return json(response, 202, await app.prompt(id, value.text)); }
        if (request.method === "POST" && action === "selection") return json(response, 200, await app.select(id, await body(request)));
      }
      const relative = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^[/\\]+/u, "");
      const file = resolve(STATIC_ROOT, relative);
      if (!file.startsWith(`${STATIC_ROOT}/`)) return json(response, 404, { error: "COWEB_NOT_FOUND" });
      const bytes = await readFile(file);
      response.writeHead(200, { "cache-control": "public, max-age=3600", "content-type": MIME_TYPES[extname(file)] ?? "application/octet-stream", "x-content-type-options": "nosniff" }); response.end(bytes);
    } catch (error) { json(response, errorCode(error) === "COWEB_NOT_FOUND" ? 404 : 400, { error: errorCode(error) }); }
  });
}

export async function cowebCommand(args, { agentDir }) {
  const parsed = parseCowebArgs(args);
  if (parsed.error) { process.stderr.write(`coweb: ${parsed.error}:${parsed.flag ?? parsed.value ?? ""}\n`); return { exitCode: 2, kind: "native" }; }
  const port = Number(parsed.options.port ?? DEFAULT_PORT);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve", ...args], { detached: true, env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: "ignore" });
  child.unref();
  process.stdout.write(`coweb: Co Web available at http://127.0.0.1:${port} (pid ${child.pid})\n`);
  return { exitCode: 0, kind: "native" };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "--serve") {
  const parsed = parseCowebArgs(process.argv.slice(3));
  if (parsed.error) throw new Error(`${parsed.error}:${parsed.flag ?? parsed.value ?? ""}`);
  const agentDir = process.env.COCO_CODING_AGENT_DIR || join(process.env.HOME || homedir(), ".coco", "agent");
  const server = createCowebServer(await createCowebApp({ agentDir }), { password: parsed.options.password });
  const port = Number(parsed.options.port ?? DEFAULT_PORT);
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolveListen); });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)));
}
