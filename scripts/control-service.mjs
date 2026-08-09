import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { StateError } from "./state-schema.mjs";
import { agentDirectory, ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { atomicReplace } from "./state-transaction.mjs";
import { createTaskStore } from "./task-state.mjs";
import { cancelTask, startDetachedRunner, stopRunner } from "./task-runner.mjs";
import { processAlive, processIdentity, processMatches, terminateProcessTree } from "./task-process.mjs";

const MAX_BODY = 1024 * 1024;
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
function fail(code) { throw new StateError(code); }
function requireLoopback(host) { if (host !== "127.0.0.1" && host !== "::1") fail("CONTROL_LOOPBACK_REQUIRED"); }
function controlUrl(host, port) { return `http://${host === "::1" ? `[${host}]` : host}:${port}`; }
function cleanTask({ webhookSecret: _secret, pid: _pid, ...task }) { return task; }
function json(response, status, body) { const bytes = Buffer.from(JSON.stringify(body)); response.writeHead(status, { "cache-control": "no-store", "content-length": bytes.length, "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" }); response.end(bytes); }
async function body(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) fail("REQUEST_TOO_LARGE"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function authorized(request, token) {
  const actual = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(actual); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function webhookAuthorized(request, bytes, task) {
  const signature = request.headers["x-hub-signature-256"];
  if (typeof signature === "string" && signature.startsWith("sha256=")) {
    const expected = `sha256=${createHmac("sha256", task.webhookSecret).update(bytes).digest("hex")}`;
    return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
  return authorized(request, task.webhookSecret);
}
async function state(agentDir) {
  const path = statePaths(agentDir).control;
  if (await inspectRegular(path) === null) return null;
  try { return JSON.parse(await readFile(path, "utf8")); } catch { fail("CONTROL_STATE_INVALID"); }
}
export async function controlStatus(agentDir) {
  const value = await state(agentDir);
  const running = value && (value.processIdentity ? await processMatches(value.pid, value.processIdentity) : await processAlive(value.pid));
  return running ? { host: value.host, legacyIdentity: !value.processIdentity, pid: value.pid, port: value.port, status: "running", url: controlUrl(value.host, value.port) } : { status: "stopped" };
}
export async function startDetachedControl({ agentDir, host = "127.0.0.1", port = 3210, root }) {
  const current = await controlStatus(agentDir); if (current.status === "running") return current;
  requireLoopback(host);
  await ensureAgentDirectory(agentDir); const logs = join(agentDir, "logs"); await mkdir(logs, { recursive: true, mode: 0o700 });
  const output = await open(join(logs, "control.log"), "a", 0o600);
  const child = spawn(process.execPath, [join(root, "scripts", "control-service-main.mjs"), "--agent-dir", agentDir, "--root", root, "--host", host, "--port", String(port)], { detached: true, env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", output.fd, output.fd] });
  child.unref(); await output.close();
  for (let attempt = 0; attempt < 100; attempt += 1) { await new Promise((done) => setTimeout(done, 20)); const next = await controlStatus(agentDir); if (next.status === "running") return next; }
  fail("CONTROL_START_FAILED");
}
export async function stopControl(agentDir) {
  const current = await state(agentDir); if (!current || !await processAlive(current.pid)) return { status: "stopped" };
  if (!current.processIdentity) return { status: "identity-unavailable" };
  if (!await processMatches(current.pid, current.processIdentity)) return { status: "identity-mismatch" };
  const result = await terminateProcessTree(current.pid, { identity: current.processIdentity }); return { status: result.status === "terminated" ? "stopped" : result.status };
}

export async function runControlServer({ agentDir, host, port, root, signal }) {
  requireLoopback(host);
  await ensureAgentDirectory(agentDir);
  const previous = await state(agentDir); if (previous && previous.pid !== process.pid && (previous.processIdentity ? await processMatches(previous.pid, previous.processIdentity) : await processAlive(previous.pid))) fail("CONTROL_ALREADY_RUNNING");
  const token = randomBytes(32).toString("base64url");
  const store = createTaskStore({ agentDir }); const publicRoot = join(root, "control", "public");
  const server = createServer(async (request, response) => {
    response.setHeader("content-security-policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'");
    response.setHeader("referrer-policy", "no-referrer");
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && !url.pathname.startsWith("/v1/")) {
        const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return json(response, 404, { error: "NOT_FOUND" });
        const path = join(publicRoot, name); if (await inspectRegular(path) === null) return json(response, 404, { error: "NOT_FOUND" });
        response.writeHead(200, { "cache-control": "no-cache", "content-type": TYPES[extname(path)] ?? "application/octet-stream", "x-content-type-options": "nosniff" }); createReadStream(path).pipe(response); return;
      }
      const hook = /^\/v1\/hooks\/([a-z0-9_-]{12})$/.exec(url.pathname);
      if (request.method === "POST" && hook) {
        const bytes = await body(request); const snapshot = await store.load(); const task = snapshot.tasks.find(({ id }) => id === hook[1]);
        if (!task || !task.webhookSecret || !webhookAuthorized(request, bytes, task)) return json(response, 401, { error: "UNAUTHORIZED" });
        const event = request.headers["x-github-event"];
        if (task.github && (event !== task.github.event || (task.github.repository && JSON.parse(bytes).repository?.full_name !== task.github.repository))) return json(response, 202, { accepted: false });
        await store.update((value) => { const target = value.tasks.find(({ id }) => id === task.id); if (target && !["running", "cancelled"].includes(target.status)) { target.status = "queued"; target.updatedAt = new Date().toISOString(); target.finishedAt = null; } return value; });
        await startDetachedRunner({ agentDir, root }); return json(response, 202, { accepted: true, taskId: task.id });
      }
      if (!authorized(request, token)) return json(response, 401, { error: "UNAUTHORIZED" });
      if (request.method === "GET" && url.pathname === "/v1/health") return json(response, 200, { schemaVersion: 1, status: "ok" });
      if (request.method === "GET" && url.pathname === "/v1/tasks") return json(response, 200, { tasks: (await store.load()).tasks.map(cleanTask) });
      if (request.method === "GET" && url.pathname === "/v1/agents") {
        const active = (await store.load()).tasks.filter((task) => task.status === "running" && task.pid);
        return json(response, 200, { agents: await Promise.all(active.map(async (task) => ({ ...cleanTask(task), alive: await processMatches(task.pid, task.processIdentity), pid: task.pid }))) });
      }
      if (request.method === "POST" && url.pathname === "/v1/tasks") {
        const input = JSON.parse((await body(request)).toString("utf8"));
        if (typeof input.prompt !== "string" || !input.prompt.trim() || typeof input.cwd !== "string") return json(response, 400, { error: "TASK_INVALID" });
        const task = await store.create({ cwd: input.cwd, initialStatus: input.approved === false ? "blocked" : "queued", prompt: input.prompt, trigger: "manual", worktree: input.worktree !== false });
        if (task.status === "queued") await startDetachedRunner({ agentDir, root }); return json(response, 201, { task: cleanTask(task) });
      }
      const approve = /^\/v1\/tasks\/([a-z0-9_-]{12})\/approve$/.exec(url.pathname);
      if (request.method === "POST" && approve) {
        await store.update((value) => { const task = value.tasks.find(({ id }) => id === approve[1]); if (!task || task.status !== "blocked" || task.trigger !== "manual") fail("TASK_NOT_APPROVABLE"); task.status = "queued"; task.updatedAt = new Date().toISOString(); return value; });
        await startDetachedRunner({ agentDir, root }); return json(response, 202, { approved: true });
      }
      const cancel = /^\/v1\/tasks\/([a-z0-9_-]{12})\/cancel$/.exec(url.pathname);
      if (request.method === "POST" && cancel) {
        const snapshot = await store.load(); const task = snapshot.tasks.find(({ id }) => id === cancel[1]); if (!task) fail("TASK_NOT_FOUND");
        await cancelTask(store, task.id);
        return json(response, 200, { cancelled: true });
      }
      if (request.method === "POST" && url.pathname === "/v1/tasks/stop-all") {
        const snapshot = await store.load(); const running = snapshot.tasks.filter(({ pid, status }) => pid || status === "running");
        const result = await stopRunner(agentDir);
        if (result.status !== "stopped") return json(response, 500, { error: "TASK_PROCESS_STILL_ALIVE" });
        return json(response, 200, { status: "terminated", stopped: running.length });
      }
      return json(response, 404, { error: "NOT_FOUND" });
    } catch (error) { return json(response, error?.code === "REQUEST_TOO_LARGE" ? 413 : 400, { error: error instanceof Error ? error.message : "REQUEST_FAILED" }); }
  });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(port, host, done); });
  const address = server.address(); const selectedPort = typeof address === "object" && address ? address.port : port;
  await atomicReplace({ agentDir, containsSecret: true, path: statePaths(agentDir).control, bytes: canonicalJson({ host, pid: process.pid, port: selectedPort, processIdentity: await processIdentity(process.pid), schemaVersion: 1, startedAt: new Date().toISOString(), token }) });
  const close = () => server.close(); process.once("SIGINT", close); process.once("SIGTERM", close); signal?.addEventListener("abort", close, { once: true });
  await new Promise((done) => server.once("close", done));
  process.removeListener("SIGINT", close); process.removeListener("SIGTERM", close); signal?.removeEventListener("abort", close);
  await rm(statePaths(agentDir).control, { force: true });
}

export async function controlCommand(argv, { agentDir, root }) {
  const [action, ...args] = argv;
  if (action === "status") { process.stdout.write(`${JSON.stringify(await controlStatus(agentDir))}\n`); return { exitCode: 0, kind: "native" }; }
  if (action === "stop") { process.stdout.write(`${JSON.stringify(await stopControl(agentDir))}\n`); return { exitCode: 0, kind: "native" }; }
  if (action === "token") { const value = await state(agentDir); if (!value || !(value.processIdentity ? await processMatches(value.pid, value.processIdentity) : await processAlive(value.pid))) fail("CONTROL_NOT_RUNNING"); process.stdout.write(`${value.token}\n`); return { exitCode: 0, kind: "native" }; }
  if (action === "start") {
    const hostIndex = args.indexOf("--host"); const portIndex = args.indexOf("--port"); const host = hostIndex === -1 ? "127.0.0.1" : args[hostIndex + 1]; const port = portIndex === -1 ? 3210 : Number(args[portIndex + 1]);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) fail("CONTROL_PORT_INVALID");
    const value = await startDetachedControl({ agentDir, host, port, root }); process.stdout.write(`${JSON.stringify(value)}\n`); return { exitCode: 0, kind: "native" };
  }
  fail("CONTROL_USAGE");
}
