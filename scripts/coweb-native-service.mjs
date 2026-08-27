import { timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import http from "node:http";
import { constants } from "node:fs";
import { lstat, open as openFile, readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContextEntries, buildSessionContext, createAgentSessionFromServices, createAgentSessionServices, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

import { DEFAULT_PORT, parseCowebArgs } from "./coweb.mjs";
import { createCowebProxy, listenCowebProxy } from "./coweb-proxy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_ROOT = join(ROOT, "coweb", "desktop");
const MOBILE_CSS = join(ROOT, "coweb", "coweb-mobile.css");
const MAX_BODY_BYTES = 1_000_000;
const MAX_PREVIEW_BYTES = 256 * 1024;
const MAX_PROJECT_FILES = 500;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".rsc": "text/x-component; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function error(code) { return new Error(code); }
function errorCode(value) { return value instanceof Error && value.message.startsWith("COWEB_") ? value.message : "COWEB_REQUEST_FAILED"; }
function isLoopbackHost(value) { return ["127.0.0.1", "::1", "localhost"].includes(value.replace(/^\[|\]$/gu, "").toLowerCase()); }
function isTrustedLoopbackRequest(request) {
  try {
    const host = new URL(`http://${request.headers.host}`).hostname;
    if (!isLoopbackHost(host)) return false;
    if (!request.headers.origin) return true;
    const origin = new URL(request.headers.origin);
    return isLoopbackHost(origin.hostname) && (!origin.port || Number(origin.port) === request.socket.localPort);
  } catch { return false; }
}
function json(response, status, value) {
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" });
  response.end(`${JSON.stringify(value)}\n`);
}
function event(response, value) { response.write(`data: ${JSON.stringify(value)}\n\n`); }
function authorized(request, password, username = "coco") {
  if (!password) return true;
  const expected = Buffer.from(`${username}:${password}`);
  const value = request.headers.authorization;
  const actual = typeof value === "string" && value.startsWith("Basic ") ? Buffer.from(value.slice(6), "base64") : Buffer.alloc(0);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw error("COWEB_REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw error("COWEB_JSON_INVALID"); }
}
function isWithin(path, root) { return path === root || path.startsWith(`${root}/`); }
async function directory(path) {
  const resolved = resolve(path);
  try {
    const info = await lstat(resolved);
    if (!info.isDirectory() || info.isSymbolicLink()) throw error("COWEB_CWD_INVALID");
  } catch (cause) { if (errorCode(cause) === "COWEB_CWD_INVALID") throw cause; throw error("COWEB_CWD_INVALID"); }
  try { return await realpath(resolved); } catch { throw error("COWEB_CWD_INVALID"); }
}
function sessionDirectory(cwd, agentDir) {
  return join(agentDir, "sessions", `--${resolve(cwd).replace(/^[/\\]/u, "").replace(/[/\\:]/gu, "-")}--`);
}
function text(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("");
}
function infoFromHeader(path, header, modified, entries = []) {
  const messages = entries.filter((entry) => entry?.type === "message");
  const firstMessage = messages.find((entry) => entry.message?.role === "user");
  return {
    path,
    id: header.id,
    cwd: header.cwd,
    created: new Date(header.timestamp ?? modified).toISOString(),
    modified,
    messageCount: messages.length,
    firstMessage: text(firstMessage?.message?.content),
    projectRoot: header.cwd,
    projectKey: header.cwd,
  };
}
async function sessionInfo(path) {
  try {
    const file = await readFile(path, "utf8");
    const values = file.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const [header, ...entries] = values;
    if (header?.type !== "session" || typeof header.id !== "string" || typeof header.cwd !== "string") return null;
    const metadata = await stat(path);
    return infoFromHeader(path, header, metadata.mtime.toISOString(), entries);
  } catch { return null; }
}
async function listSessions(agentDir) {
  const root = join(agentDir, "sessions");
  let groups;
  try { groups = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const result = [];
  for (const group of groups) {
    if (!group.isDirectory() || group.isSymbolicLink()) continue;
    let files;
    try { files = await readdir(join(root, group.name), { withFileTypes: true }); } catch { continue; }
    for (const file of files) {
      if (!file.isFile() || file.isSymbolicLink() || !file.name.endsWith(".jsonl")) continue;
      const info = await sessionInfo(join(root, group.name, file.name));
      if (info) result.push(info);
    }
  }
  return result.sort((left, right) => right.modified.localeCompare(left.modified));
}
async function listProjectFiles(cwd) {
  const root = await directory(cwd);
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    try {
      const metadata = await stat(path);
      files.push({ name: entry.name, isDir: entry.isDirectory(), size: entry.isDirectory() ? 0 : metadata.size, modified: metadata.mtime.toISOString() });
    } catch { /* Files can disappear during enumeration. */ }
  }
  return files.sort((left, right) => Number(right.isDir) - Number(left.isDir) || left.name.localeCompare(right.name)).slice(0, MAX_PROJECT_FILES);
}
async function browseDirectory(value, roots) {
  const path = await directory(value);
  const allowedRoot = roots.find((root) => isWithin(path, root));
  if (!allowedRoot) throw error("COWEB_BROWSE_ROOT_INVALID");
  const entries = await readdir(path, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => ({ name: entry.name, path: join(path, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { path, parentPath: path === allowedRoot ? path : dirname(path), directories };
}
async function projectFile(path, cwd) {
  const root = await directory(cwd);
  const requested = resolve(path);
  if (!isWithin(requested, root)) throw error("COWEB_PROJECT_FILE_INVALID");
  let descriptor;
  try {
    const resolved = await realpath(requested);
    if (!isWithin(resolved, root)) throw error("COWEB_PROJECT_FILE_INVALID");
    descriptor = await openFile(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await descriptor.stat();
    if (!metadata.isFile() || metadata.size > MAX_PREVIEW_BYTES) throw error("COWEB_PROJECT_FILE_INVALID");
    return { path: resolved, text: await descriptor.readFile({ encoding: "utf8" }), size: metadata.size, modified: metadata.mtime.toISOString() };
  } catch (cause) { if (errorCode(cause) === "COWEB_PROJECT_FILE_INVALID") throw cause; throw error("COWEB_PROJECT_FILE_INVALID"); } finally { await descriptor?.close(); }
}
function staticPath(pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/u, "");
  const target = resolve(STATIC_ROOT, normalize(requested));
  if (!isWithin(target, STATIC_ROOT)) throw error("COWEB_NOT_FOUND");
  return target;
}
function pathnameDirectory(value) {
  const decoded = decodeURIComponent(value);
  return decoded.startsWith("/") ? decoded : `/${decoded}`;
}
function language(path) {
  return ({ ".css": "css", ".html": "html", ".js": "javascript", ".json": "json", ".md": "markdown", ".mjs": "javascript", ".py": "python", ".sh": "shell", ".ts": "typescript", ".tsx": "tsx", ".yaml": "yaml", ".yml": "yaml" })[extname(path).toLowerCase()] ?? "text";
}
function eventPayload(value) {
  if (value?.type === "message_update" && value.assistantMessageEvent) {
    const partial = value.assistantMessageEvent;
    if (partial.partial) {
      const { partial: message, ...rest } = partial;
      return { type: "message_update", assistantMessageEvent: { ...rest, ...toolCallIdentity(message) } };
    }
  }
  if (value?.type === "agent_end") return { type: "agent_end" };
  try { JSON.stringify(value); return value; } catch { return { type: "runtime_error", errorMessage: "Co Web event serialization failed" }; }
}
function toolCallIdentity(message) {
  if (!message || !Array.isArray(message.content)) return message;
  return { ...message, content: message.content.map((part) => part?.type === "toolCall" ? { ...part, toolCallId: part.toolCallId ?? part.id, toolName: part.toolName ?? part.name, input: part.input ?? part.arguments } : part) };
}
function modelPayload(services) {
  const available = services.modelRuntime.getAvailableSnapshot();
  const list = (available.length > 0 ? available : services.modelRuntime.getVisibleSnapshot()).map((model) => ({ id: model.id, name: model.name ?? model.id, provider: model.provider }));
  const models = Object.fromEntries(list.map((model) => [`${model.provider}:${model.id}`, model.name]));
  const provider = services.settingsManager.getDefaultProvider();
  const modelId = services.settingsManager.getDefaultModel();
  const configured = provider && modelId ? list.find((model) => model.provider === provider && model.id === modelId) : undefined;
  const defaultModel = configured ? { provider: configured.provider, modelId: configured.id } : list[0] ? { provider: list[0].provider, modelId: list[0].id } : null;
  return {
    models,
    modelList: list,
    defaultModel,
    thinkingLevels: Object.fromEntries(list.map((model) => [`${model.provider}:${model.id}`, ["off", "minimal", "low", "medium", "high", "xhigh"]])),
    thinkingLevelMaps: {},
    thinkingLevelPins: {},
  };
}
function contextPayload(session, info, leafId) {
  const manager = session.sessionManager;
  const entries = manager.getEntries();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const selectedLeaf = leafId ?? manager.getLeafId();
  if (selectedLeaf && !byId.has(selectedLeaf)) throw error("COWEB_LEAF_NOT_FOUND");
  const contextEntries = buildContextEntries(entries, selectedLeaf, byId);
  const context = buildSessionContext(entries, selectedLeaf, byId);
  const messages = contextEntries.flatMap((entry) => entry.type === "message" ? [toolCallIdentity(entry.message)] : []);
  return {
    sessionId: session.sessionId,
    filePath: manager.getSessionFile(),
    info,
    leafId: manager.getLeafId(),
    tree: manager.getTree(),
    context: { ...context, messages, entryIds: contextEntries.filter((entry) => entry.type === "message").map((entry) => entry.id) },
    totalActiveMs: 0,
  };
}
function statePayload(session) {
  const stats = session.getSessionStats();
  return {
    sessionId: session.sessionId,
    sessionFile: session.sessionFile,
    isStreaming: session.isStreaming,
    isPromptRunning: session.isStreaming,
    isBashRunning: session.isBashRunning,
    isCompacting: session.isCompacting,
    autoCompactionEnabled: session.autoCompactionEnabled,
    autoRetryEnabled: session.autoRetryEnabled,
    model: session.model ? { provider: session.model.provider, modelId: session.model.id } : null,
    messageCount: stats.totalMessages,
    pendingMessageCount: session.pendingMessageCount,
    queuedMessages: { steering: [...session.getSteeringMessages()], followUp: [...session.getFollowUpMessages()] },
    contextUsage: session.getContextUsage(),
    systemPrompt: session.systemPrompt,
    thinkingLevel: session.thinkingLevel,
    messages: session.messages,
    tools: session.getActiveToolNames(),
  };
}
function run(command, args, cwd) {
  return new Promise((resolveResult) => execFile(command, args, { cwd, timeout: 5_000, maxBuffer: 1_000_000 }, (cause, stdout) => resolveResult({ cause, stdout })));
}

export async function createNativeCowebApp({ agentDir, cwd = process.cwd() }) {
  const fallbackCwd = await directory(cwd);
  const services = new Map();
  const active = new Map();
  const approvedWorkspaces = new Set([fallbackCwd]);
  const browseRoots = [...new Set([await directory(homedir()).catch(() => fallbackCwd), fallbackCwd])];
  async function workspaceFor(value, { approve = false } = {}) {
    const effectiveCwd = await directory(value || fallbackCwd);
    if (approve) approvedWorkspaces.add(effectiveCwd);
    if (!approvedWorkspaces.has(effectiveCwd)) throw error("COWEB_WORKSPACE_UNAPPROVED");
    return effectiveCwd;
  }
  async function serviceFor(value) {
    const effectiveCwd = await workspaceFor(value);
    if (!services.has(effectiveCwd)) services.set(effectiveCwd, await createAgentSessionServices({ agentDir, cwd: effectiveCwd }));
    return services.get(effectiveCwd);
  }
  async function openManager(manager, info, options = {}) {
    const managerCwd = await workspaceFor(manager.getCwd(), { approve: true });
    const settingsManager = SettingsManager.create(managerCwd, agentDir, { projectTrusted: false });
    const runtime = await createAgentSessionServices({ agentDir, cwd: managerCwd, settingsManager });
    let model;
    if (options.provider || options.modelId) {
      if (!options.provider || !options.modelId) throw error("COWEB_MODEL_INVALID");
      model = runtime.modelRuntime.getModel(options.provider, options.modelId);
      if (!model) throw error("COWEB_MODEL_NOT_FOUND");
    }
    if (!model && !info) {
      await runtime.modelRuntime.getAvailable().catch(() => {});
      const provider = runtime.settingsManager.getDefaultProvider();
      const modelId = runtime.settingsManager.getDefaultModel();
      if (provider && modelId) model = runtime.modelRuntime.getModel(provider, modelId);
      if (!model) model = runtime.modelRuntime.getAvailableSnapshot()[0];
    }
    const created = await createAgentSessionFromServices({ services: runtime, sessionManager: manager, ...(model ? { model } : {}), ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}), ...(Array.isArray(options.toolNames) ? { tools: options.toolNames } : {}) });
    active.set(created.session.sessionId, { session: created.session, info: info ?? infoFromHeader(manager.getSessionFile() ?? "", { cwd: manager.getCwd(), id: created.session.sessionId, timestamp: new Date().toISOString() }, new Date().toISOString()) });
    return active.get(created.session.sessionId);
  }
  async function open(id) {
    if (active.has(id)) return active.get(id);
    const info = (await listSessions(agentDir)).find((entry) => entry.id === id);
    if (!info) throw error("COWEB_SESSION_NOT_FOUND");
    const manager = SessionManager.open(info.path, dirname(info.path));
    return openManager(manager, info);
  }
  async function create(input = {}) {
    const effectiveCwd = await workspaceFor(typeof input.cwd === "string" ? input.cwd : fallbackCwd, { approve: true });
    const manager = SessionManager.create(effectiveCwd, sessionDirectory(effectiveCwd, agentDir));
    const record = await openManager(manager, null, input);
    return record;
  }
  return {
    async sessions() { return listSessions(agentDir); },
    running() { return [...active.values()].filter(({ session }) => session.isStreaming).map(({ session }) => session.sessionId); },
    async models(cwdValue) {
      const runtime = await serviceFor(cwdValue || fallbackCwd);
      await runtime.modelRuntime.getAvailable().catch(() => {});
      return modelPayload(runtime);
    },
    async create(input) { return create(input); },
    async open(id) { return open(id); },
    async context(id, leafId) { const record = await open(id); return contextPayload(record.session, record.info, leafId); },
    async state(id) { const record = await open(id); return { running: record.session.isStreaming, state: statePayload(record.session) }; },
    async command(id, input) {
      const record = await open(id);
      const { session } = record;
      switch (input.type) {
        case "prompt":
          if (typeof input.message !== "string" || !input.message.trim()) throw error("COWEB_PROMPT_INVALID");
          await session.prompt(input.message, session.isStreaming ? { streamingBehavior: input.streamingBehavior === "followUp" ? "followUp" : "steer" } : undefined);
          break;
        case "abort": await session.abort(); break;
        case "get_state": return statePayload(session);
        case "set_model": {
          const runtime = await serviceFor(session.sessionManager.getCwd());
          const model = runtime.modelRuntime.getModel(input.provider, input.modelId);
          if (!model) throw error("COWEB_MODEL_NOT_FOUND");
          await session.setModel(model);
          break;
        }
        case "set_thinking_level": session.setThinkingLevel(input.level); break;
        case "get_tools": return session.getAllTools();
        case "set_tools": session.setActiveToolsByName(Array.isArray(input.toolNames) ? input.toolNames : []); break;
        case "compact": await session.compact(); break;
        case "clear_queue": return session.clearQueue();
        case "set_session_name": session.setSessionName(typeof input.name === "string" ? input.name : ""); break;
        case "get_session_stats": return session.getSessionStats();
        case "get_last_assistant_text": return session.getLastAssistantText();
        case "set_auto_compaction": session.setAutoCompactionEnabled(Boolean(input.enabled)); break;
        case "set_auto_retry": session.setAutoRetryEnabled(Boolean(input.enabled)); break;
        case "steer": await session.steer(input.message); break;
        case "follow_up": await session.followUp(input.message); break;
        case "reload": await session.reload(); break;
        case "abort_compaction": session.abortCompaction(); break;
        case "abort_bash": session.abortBash(); break;
        case "bash": return session.executeBash(input.command, undefined, { id: input.id, excludeFromContext: Boolean(input.excludeFromContext) });
        case "navigate_tree": return session.navigateTree(input.targetId, input.options);
        case "get_commands": return [];
        default: throw error("COWEB_COMMAND_UNSUPPORTED");
      }
      return null;
    },
    async events(id, response, request) {
      const record = await open(id);
      response.writeHead(200, { "cache-control": "no-cache, no-transform", connection: "keep-alive", "content-type": "text/event-stream", "x-accel-buffering": "no" });
      response.flushHeaders();
      response.write(":\n\n");
      event(response, { type: "connected", sessionId: record.session.sessionId, isStreaming: record.session.isStreaming });
      const unsubscribe = record.session.subscribe((value) => event(response, eventPayload(value)));
      const keepalive = setInterval(() => response.write(":\n\n"), 30_000);
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        if (!response.writableEnded) response.end();
      };
      request.once("aborted", close); response.once("close", close);
    },
    async validateWorkspace(cwdValue) {
      const effectiveCwd = await workspaceFor(cwdValue || fallbackCwd, { approve: true });
      return this.workspace(effectiveCwd);
    },
    async browse(cwdValue) { return browseDirectory(cwdValue || fallbackCwd, browseRoots); },
    async workspace(cwdValue) {
      const effectiveCwd = await workspaceFor(cwdValue || fallbackCwd);
      const git = await run("git", ["rev-parse", "--show-toplevel"], effectiveCwd);
      const root = git.cause ? effectiveCwd : git.stdout.trim() || effectiveCwd;
      const branch = await run("git", ["branch", "--show-current"], effectiveCwd);
      return { cwd: effectiveCwd, projectRoot: root, projectKey: root, isGit: !git.cause, isTopLevel: effectiveCwd === root, currentWorktreePath: effectiveCwd, worktrees: [{ path: effectiveCwd, branch: branch.stdout.trim() || undefined, isMain: effectiveCwd === root }] };
    },
    async files(cwdValue) { const effectiveCwd = await workspaceFor(cwdValue || fallbackCwd); return { entries: await listProjectFiles(effectiveCwd), path: effectiveCwd }; },
    async readFile(path, cwdValue) { const effectiveCwd = await workspaceFor(cwdValue || fallbackCwd); return projectFile(path, effectiveCwd); },
    async readSessionFile(id, path) {
      const record = await open(id);
      const value = await projectFile(path, record.session.sessionManager.getCwd());
      return { content: value.text, language: language(value.path), modified: value.modified, path: value.path, size: value.size };
    },
    async fileIndex(cwdValue) {
      const root = await workspaceFor(cwdValue || fallbackCwd);
      const files = [];
      async function walk(current) {
        if (files.length >= 5_000) return;
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;
          const path = join(current, entry.name);
          if (entry.isDirectory()) await walk(path);
          else if (entry.isFile()) files.push(relative(root, path).split("\\").join("/"));
          if (files.length >= 5_000) return;
        }
      }
      await walk(root);
      return { files: files.sort((left, right) => left.localeCompare(right)) };
    },
    async gitStatus(cwdValue) {
      const workspace = await this.workspace(cwdValue);
      if (!workspace.isGit) return { isGitRepository: false, repositoryRoot: workspace.projectRoot, files: [], additions: 0, deletions: 0 };
      const result = await run("git", ["status", "--porcelain=v1"], workspace.cwd);
      const files = result.stdout.split("\n").filter(Boolean).map((line) => ({ filePath: join(workspace.cwd, line.slice(3)), status: line.slice(0, 2).trim() || "modified", code: line.slice(0, 1), indexStatus: line.slice(0, 1), worktreeStatus: line.slice(1, 2) }));
      return { isGitRepository: true, repositoryRoot: workspace.projectRoot, files, additions: 0, deletions: 0 };
    },
  };
}

export function createNativeCowebServer(app, { password, username = "coco" } = {}) {
  return http.createServer(async (request, response) => {
    if (!isTrustedLoopbackRequest(request)) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end('{"error":"COWEB_UNTRUSTED_REQUEST"}');
      return;
    }
    if (!authorized(request, password, username)) {
      response.writeHead(401, { "content-type": "application/json", "www-authenticate": 'Basic realm="Co Web"' });
      response.end('{"error":"COWEB_UNAUTHORIZED"}');
      return;
    }
    try {
      const url = new URL(request.url, "http://localhost");
      const pathname = url.pathname;
      if (request.method === "GET" && pathname === "/api/home") return json(response, 200, { home: homedir() });
      if (request.method === "GET" && pathname === "/api/sessions") return json(response, 200, { sessions: await app.sessions(), runningSessionIds: app.running() });
      if (request.method === "GET" && pathname === "/api/agent/running") return json(response, 200, { runningSessionIds: app.running() });
      if (request.method === "GET" && pathname === "/api/models") return json(response, 200, await app.models(url.searchParams.get("cwd")));
      if ((request.method === "GET" || request.method === "POST") && pathname === "/api/default-cwd") return json(response, 200, { cwd: (await app.workspace(url.searchParams.get("cwd"))).cwd });
      if (request.method === "POST" && pathname === "/api/cwd/validate") {
        const input = await body(request); const workspace = await app.validateWorkspace(input.cwd);
        return json(response, 200, { success: true, cwd: workspace.cwd, projectRoot: workspace.projectRoot, projectKey: workspace.projectKey });
      }
      if (request.method === "GET" && pathname === "/api/worktrees") return json(response, 200, await app.workspace(url.searchParams.get("cwd")));
      if (request.method === "GET" && pathname === "/api/git/status") return json(response, 200, await app.gitStatus(url.searchParams.get("cwd")));
      if (request.method === "GET" && pathname === "/api/project-trust") return json(response, 200, { requiresTrust: false, trusted: false });
      if (request.method === "GET" && pathname.startsWith("/api/files/")) {
        const target = pathnameDirectory(pathname.slice("/api/files/".length));
        if (url.searchParams.get("type") === "list") return json(response, 200, await app.files(target));
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) throw error("COWEB_SESSION_REQUIRED");
        const value = await app.readSessionFile(sessionId, target);
        if (url.searchParams.get("type") === "download") {
          response.writeHead(200, { "content-disposition": `attachment; filename="${basename(value.path).replaceAll('"', "")}"`, "content-type": "application/octet-stream", "x-content-type-options": "nosniff" });
          response.end(value.content);
          return;
        }
        return json(response, 200, value);
      }
      if (request.method === "GET" && pathname === "/api/cwd/browse") return json(response, 200, await app.browse(url.searchParams.get("path")));
      if (request.method === "GET" && pathname === "/api/file-index") return json(response, 200, await app.fileIndex(url.searchParams.get("cwd")));
      if (request.method === "GET" && pathname === "/api/git/diff") {
        const workspace = await app.workspace(url.searchParams.get("cwd"));
        const result = await run("git", ["diff", "--no-ext-diff", "--no-color"], workspace.cwd);
        return json(response, 200, { diff: result.stdout });
      }
      if (request.method === "GET" && ["/api/plugins", "/api/skills", "/api/auth/providers", "/api/auth/all-providers"].includes(pathname)) return json(response, 200, pathname === "/api/skills" ? { skills: [] } : pathname === "/api/plugins" ? { plugins: [] } : { providers: [] });
      const sessionMatch = /^\/api\/sessions\/([^/]+)(?:\/(state|context))?$/u.exec(pathname);
      if (sessionMatch && request.method === "GET") {
        const [, id, action] = sessionMatch;
        return json(response, 200, action === "state" ? await app.state(id) : await app.context(id));
      }
      if (sessionMatch && request.method === "PATCH") {
        const [, id] = sessionMatch;
        const input = await body(request);
        await app.command(id, { type: "set_session_name", name: input.name });
        return json(response, 200, await app.context(id));
      }
      if (request.method === "POST" && /^\/api\/sessions\/[^/]+\/(auto-name|export)$/.test(pathname)) throw error("COWEB_COMMAND_UNSUPPORTED");
      if (request.method === "POST" && pathname === "/api/agent/new") {
        const input = await body(request);
        if (input.type !== "ensure_session") throw error("COWEB_SESSION_TYPE_INVALID");
        const record = await app.create(input);
        return json(response, 200, { success: true, sessionId: record.session.sessionId, data: null, model: record.session.model ? { provider: record.session.model.provider, modelId: record.session.model.id } : null, thinkingLevel: record.session.thinkingLevel });
      }
      const agentMatch = /^\/api\/agent\/([^/]+)(?:\/(events))?$/u.exec(pathname);
      if (agentMatch) {
        const [, id, action] = agentMatch;
        if (request.method === "GET" && action === "events") return app.events(id, response, request);
        if (request.method === "GET") return json(response, 200, await app.state(id));
        if (request.method === "POST") return json(response, 200, { success: true, data: await app.command(id, await body(request)) });
      }
      if (pathname === "/coweb-mobile.css") {
        const bytes = await readFile(MOBILE_CSS); response.writeHead(200, { "cache-control": "public, max-age=3600", "content-type": MIME_TYPES[".css"] }); response.end(bytes); return;
      }
      if (request.headers.rsc && pathname === "/") {
        const bytes = await readFile(join(STATIC_ROOT, "index.rsc")); response.writeHead(200, { "content-type": MIME_TYPES[".rsc"] }); response.end(bytes); return;
      }
      const file = staticPath(pathname);
      let bytes;
      try { bytes = await readFile(file); } catch (cause) { if (cause?.code === "ENOENT") throw error("COWEB_NOT_FOUND"); throw cause; }
      response.writeHead(200, { "cache-control": pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache", "content-type": MIME_TYPES[extname(file)] ?? "application/octet-stream", "x-content-type-options": "nosniff" });
      response.end(bytes);
    } catch (cause) {
      const code = errorCode(cause);
      json(response, code === "COWEB_NOT_FOUND" || code === "COWEB_SESSION_NOT_FOUND" ? 404 : code === "COWEB_COMMAND_UNSUPPORTED" ? 501 : 400, { error: code });
    }
  });
}

export async function runNativeCoweb(options, { agentDir, cwd = process.cwd(), proxyPort = 30142 } = {}) {
  if (options.hostname && !["127.0.0.1", "localhost"].includes(options.hostname)) throw error("COWEB_LOOPBACK_REQUIRED");
  if (options.publicHost && !options.password) throw error("COWEB_PUBLIC_PASSWORD_REQUIRED");
  const app = await createNativeCowebApp({ agentDir, cwd });
  const server = createNativeCowebServer(app, { password: options.password });
  const port = Number(options.port ?? DEFAULT_PORT);
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolveListen); });
  const bound = server.address();
  const upstreamPort = typeof bound === "object" && bound ? bound.port : port;
  let proxy;
  try {
    if (options.publicHost) {
      proxy = createCowebProxy({ expectedHost: options.publicHost, password: options.password, proxyPort, upstreamPort });
      await listenCowebProxy(proxy);
    }
  } catch (cause) {
    await new Promise((resolveClose) => server.close(resolveClose));
    throw cause;
  }
  const stop = () => {
    server.close();
    proxy?.close();
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
  return { app, proxy, server };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "--serve") {
  const parsed = parseCowebArgs(process.argv.slice(3));
  if (parsed.error) throw error(`${parsed.error}:${parsed.flag ?? parsed.value ?? ""}`);
  const agentDir = process.env.COCO_CODING_AGENT_DIR || join(process.env.HOME || homedir(), ".coco", "agent");
  const running = await runNativeCoweb(parsed.options, { agentDir });
  process.stdout.write(`COWEB_READY ${running.server.address().port}\n`);
}
