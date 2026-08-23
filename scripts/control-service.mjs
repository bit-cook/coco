import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { createCommandRecoveryJournal } from "./command-recovery-journal.mjs";
import { runControlCommandMutation } from "./control-command-recovery.mjs";
import { createOrchService } from "./orch-service.mjs";
import { StateError } from "./state-schema.mjs";
import { agentDirectory, ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { acquireStateLock, atomicReplace } from "./state-transaction.mjs";
import { createTaskStore, readRunnerStoppingState } from "./task-state.mjs";
import { createTaskEventStore } from "./task-events.mjs";
import { createTaskLogStore } from "./task-logs.mjs";
import { createTaskReceiptStore } from "./task-receipts.mjs";
import { diagnoseTask } from "./task-diagnosis.mjs";
import { cancelTask, startDetachedRunner, stopRunner } from "./task-runner.mjs";
import { processAlive, processIdentity, processMatches, terminateProcessTree } from "./task-process.mjs";
import { createWebhookDeliveryStore } from "./webhook-deliveries.mjs";
import { resolveRuntimeRoot } from "./runtime-root.mjs";

const MAX_BODY = 1024 * 1024;
const MAX_OBSERVATION_RESPONSE = 1024 * 1024;
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
function fail(code) { throw new StateError(code); }
function requireLoopback(host) { if (host !== "127.0.0.1" && host !== "::1") fail("CONTROL_LOOPBACK_REQUIRED"); }
function controlUrl(host, port) { return `http://${host === "::1" ? `[${host}]` : host}:${port}`; }
function taskDto(task) {
  const { activeRunId, attempts, branch, createdAt, encodingLoss, finishedAt, github, heartbeatAt, id, logsTruncated, schedule, startedAt, status, trigger, updatedAt, worktree } = task;
  return { activeRunId, attempts, branch, createdAt, encodingLoss, finishedAt, github, heartbeatAt, id, logsTruncated, schedule, startedAt, status, trigger, updatedAt, worktree };
}
function taskDetailDto(task) { return { ...taskDto(task), cwd: task.cwd, lastError: task.lastError, prompt: task.prompt, result: task.result }; }
function agentDto(task, alive, observedAt) {
  const { activeRunId, heartbeatAt, id, startedAt, status, trigger, updatedAt } = task;
  return { activeRunId, alive, heartbeatAt, id, observedAt, startedAt, status, trigger, updatedAt };
}
function json(response, status, body) { const bytes = Buffer.from(JSON.stringify(body)); response.writeHead(status, { "cache-control": "no-store", "content-length": bytes.length, "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" }); response.end(bytes); }
async function body(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) fail("REQUEST_TOO_LARGE"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function authorized(request, token) {
  const match = typeof request.headers.authorization === "string" ? /^Bearer ([^\s]+)$/i.exec(request.headers.authorization) : null;
  const actual = match?.[1] ?? "";
  const a = Buffer.from(actual); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function webhookAuthorized(request, bytes, task) {
  if (!task.github) return authorized(request, task.webhookSecret);
  const signature = request.headers["x-hub-signature-256"];
  if (typeof signature === "string" && signature.startsWith("sha256=")) {
    const expected = `sha256=${createHmac("sha256", task.webhookSecret).update(bytes).digest("hex")}`;
    return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
  return false;
}
function idempotencyKey(request) {
  const value = request.headers["idempotency-key"];
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(value) ? value : null;
}
async function recoverableMutation({ commands, effect, operationId, request, requestValue }) {
  const commandId = idempotencyKey(request);
  if (!commandId && request.headers["idempotency-key"] !== undefined) return { body: { error: "IDEMPOTENCY_KEY_INVALID" }, status: 400 };
  if (!commandId) return effect();
  return runControlCommandMutation({ commandId, effect, effectGeneration: 1, journal: commands, operationId, request: { method: request.method, path: new URL(request.url ?? "/", "http://localhost").pathname, value: requestValue } });
}
const PUBLIC_ERRORS = new Map([
  ["REQUEST_TOO_LARGE", 413],
  ["REQUEST_PAYLOAD_INVALID", 400],
  ["TASK_INVALID", 400],
  ["TASK_NOT_APPROVABLE", 409],
  ["TASK_NOT_CANCELLABLE", 409],
  ["TASK_NOT_FOUND", 404],
  ["RUNNER_STOPPING", 503],
  ["RUNNER_START_FAILED", 503],
  ["CONTROL_ALREADY_RUNNING", 409],
]);
function httpError(error) {
  const status = PUBLIC_ERRORS.get(error?.code);
  return status ? { status, code: error.code } : { status: 500, code: "CONTROL_INTERNAL_ERROR" };
}
async function acquireControlOwnership(agentDir) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { return await acquireStateLock(agentDir); } catch (error) {
      if (error?.code !== "STATE_LOCKED" || attempt === 199) throw error;
      await new Promise((done) => setTimeout(done, 10));
    }
  }
  fail("CONTROL_START_FAILED");
}
async function state(agentDir) {
  const path = statePaths(agentDir).control;
  if (await inspectRegular(path) === null) return null;
  try { return JSON.parse(await readFile(path, "utf8")); } catch { fail("CONTROL_STATE_INVALID"); }
}
export async function controlStatus(agentDir) {
  const value = await state(agentDir);
  if (!value) return { status: "stopped" };
  if (!value.processIdentity) return { reason: "identity-unavailable", status: "stale" };
  return await processMatches(value.pid, value.processIdentity) ? { host: value.host, pid: value.pid, port: value.port, status: "running", url: controlUrl(value.host, value.port) } : { status: "stopped" };
}
export async function startDetachedControl({ agentDir, host = "127.0.0.1", port = 3210, root }) {
  const current = await controlStatus(agentDir); if (current.status === "running") return current;
  requireLoopback(host);
  await ensureAgentDirectory(agentDir); const logs = join(agentDir, "logs"); await mkdir(logs, { recursive: true, mode: 0o700 });
  const output = await open(join(logs, "control.log"), "a", 0o600);
  const runtimeRoot = await resolveRuntimeRoot({ agentDir, root, statePaths: statePaths(agentDir) });
  const child = spawn(process.execPath, [join(runtimeRoot, "scripts", "control-service-main.mjs"), "--agent-dir", agentDir, "--root", runtimeRoot, "--host", host, "--port", String(port)], { detached: true, env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, stdio: ["ignore", output.fd, output.fd] });
  child.unref(); await output.close();
  for (let attempt = 0; attempt < 100; attempt += 1) { await new Promise((done) => setTimeout(done, 20)); const next = await controlStatus(agentDir); if (next.status === "running") return next; }
  fail("CONTROL_START_FAILED");
}
async function recoverPendingDispatches({ agentDir, root, signal }) {
  while (!signal?.aborted) {
    try {
      const pending = await createWebhookDeliveryStore({ agentDir }).listPending();
      const tasks = await createTaskStore({ agentDir }).load();
      const cancelled = new Set(pending.filter(({ taskId }) => tasks.tasks.some((task) => task.id === taskId && task.status === "cancelled" && task.activeRunId === null)).map(({ taskId }) => taskId));
      for (const taskId of cancelled) await createWebhookDeliveryStore({ agentDir }).disposeCancelled({ taskId });
      const capped = new Set(pending.filter(({ taskId }) => tasks.tasks.some((task) => task.id === taskId && ["queued", "provisioning"].includes(task.status) && task.attempts >= 1000 && task.activeRunId === null)).map(({ taskId }) => taskId));
      for (const taskId of capped) await createWebhookDeliveryStore({ agentDir }).disposeAttemptLimited({ taskId });
      const pendingTasks = new Set(pending.map(({ taskId }) => taskId));
      const needsRunner = tasks.tasks.some((task) => task.terminalEvidence !== null || task.pendingRunEvent !== null || task.launchPending || (pendingTasks.has(task.id) && ["queued", "provisioning", "running"].includes(task.status)));
      if (needsRunner) await startDetachedRunner({ agentDir, root });
    }
    catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
}
export async function stopControl(agentDir) {
  const current = await state(agentDir); if (!current) return { status: "stopped" };
  if (!current.processIdentity) return { status: "identity-unavailable" };
  if (!await processAlive(current.pid)) return { status: "stopped" };
  if (!await processMatches(current.pid, current.processIdentity)) return { status: "identity-mismatch" };
  const result = await terminateProcessTree(current.pid, { identity: current.processIdentity }); return { status: result.status === "terminated" ? "stopped" : result.status };
}

export async function runControlServer({ agentDir, host, port, root, signal }) {
  requireLoopback(host);
  await ensureAgentDirectory(agentDir);
  const commands = createCommandRecoveryJournal({ directory: join(agentDir, "command-recovery", "control") });
  const token = randomBytes(32).toString("base64url");
  const store = createTaskStore({ agentDir }); const events = createTaskEventStore({ agentDir }); const logs = createTaskLogStore({ agentDir }); const receipts = createTaskReceiptStore({ agentDir }); const publicRoot = join(root, "control", "public");
  const deliveries = createWebhookDeliveryStore({ agentDir });
  const orchestration = createOrchService({ agentDir });
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
        let payload; try { payload = JSON.parse(bytes); } catch { return json(response, 400, { error: "WEBHOOK_PAYLOAD_INVALID" }); }
         const event = request.headers["x-github-event"];
         if (task.github && (event !== task.github.event || (task.github.repository && payload.repository?.full_name !== task.github.repository))) return json(response, 202, { accepted: false });
         const deliveryId = task.github ? request.headers["x-github-delivery"] : request.headers["idempotency-key"];
         const kind = task.github ? "github" : "generic";
         if (typeof deliveryId !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(deliveryId)) return json(response, 400, { error: task.github ? "WEBHOOK_DELIVERY_INVALID" : "IDEMPOTENCY_KEY_REQUIRED" });
           const delivery = await deliveries.accept({ deliveryId, kind, taskId: task.id });
            if (!delivery.accepted) return json(response, 202, { accepted: false, dispatch: delivery.intent ?? null, reason: delivery.duplicate ? "duplicate" : delivery.reason, taskId: task.id });
           try { await startDetachedRunner({ agentDir, root }); } catch {} return json(response, 202, { accepted: true, dispatch: delivery.intent, taskId: task.id });
       }
       if (!authorized(request, token)) return json(response, 401, { error: "UNAUTHORIZED" });
       if (request.method === "GET" && url.pathname === "/v1/health") return json(response, 200, { schemaVersion: 1, status: "ok" });
       if (request.method === "GET" && url.pathname === "/v1/orchestration/status") return json(response, 200, await orchestration.status());
       if (request.method === "GET" && url.pathname === "/v1/orchestration/next") return json(response, 200, { item: await orchestration.next() });
       if (request.method === "POST" && url.pathname === "/v1/orchestration/inbox") { let input; try { input = JSON.parse(await body(request)); } catch { return json(response, 400, { error: "ORCH_PAYLOAD_INVALID" }); } return json(response, 202, await orchestration.admit(input)); }
       if (request.method === "POST" && url.pathname === "/v1/orchestration/pop") return json(response, 200, { item: await orchestration.pop() });
       const orchChild = /^\/v1\/orchestration\/children\/([A-Za-z0-9._:-]{1,200})\/(complete|fail|cancel)$/.exec(url.pathname);
       if (request.method === "POST" && orchChild) { const operation = orchChild[2] === "complete" ? orchestration.completeChild : orchChild[2] === "fail" ? orchestration.failChild : orchestration.cancelChild; return json(response, 200, await operation(orchChild[1])); }
       if (request.method === "GET" && url.pathname === "/v1/tasks") return json(response, 200, { tasks: (await store.load()).tasks.map(taskDto) });
       if (request.method === "GET" && url.pathname === "/v1/dispatch-pending") return json(response, 200, { dispatchPending: await deliveries.listPending() });
      const detail = /^\/v1\/tasks\/([a-z0-9_-]{12})$/.exec(url.pathname);
      if (request.method === "GET" && detail) { const task = (await store.load()).tasks.find(({ id }) => id === detail[1]); return task ? json(response, 200, { task: taskDetailDto(task) }) : json(response, 404, { error: "NOT_FOUND" }); }
      const diagnosis = /^\/v1\/tasks\/([a-z0-9_-]{12})\/diagnosis$/.exec(url.pathname);
      if (request.method === "GET" && diagnosis) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const snapshot = await store.load(); const task = snapshot.tasks.find(({ id }) => id === diagnosis[1]); if (!task) return json(response, 404, { error: "NOT_FOUND" });
          const eventsPage = task.activeRunId ? await events.readPage({ taskId: task.id, runId: task.activeRunId, cursor: 0, limit: 4096 }) : { events: [] };
          const latestHeartbeatAt = eventsPage.events.filter(({ type }) => type === "run.heartbeat").at(-1)?.at ?? null;
          const latestLogAt = task.activeRunId ? await logs.latestAt({ taskId: task.id, runId: task.activeRunId }) : null;
          const alive = task.pid && task.processIdentity ? await processMatches(task.pid, task.processIdentity) : false;
          const currentState = await store.load(); const current = currentState.tasks.find(({ id }) => id === task.id);
          if (currentState.revision === snapshot.revision && current?.updatedAt === task.updatedAt) return json(response, 200, diagnoseTask({ task: current, latestHeartbeatAt, latestLogAt, processAlive: alive }));
        }
        return json(response, 409, { error: "STATE_CHANGED_DURING_DIAGNOSIS" });
      }
      if (request.method === "GET" && url.pathname === "/v1/agents") {
        const active = (await store.load()).tasks.filter((task) => task.status === "running" && task.pid);
        const observedAt = new Date().toISOString();
        return json(response, 200, { agents: await Promise.all(active.map(async (task) => agentDto(task, await processMatches(task.pid, task.processIdentity), observedAt))) });
      }
      const stream = /^\/v1\/tasks\/([a-z0-9_-]{12})\/runs\/([0-9a-f-]{36})\/(events|logs)$/.exec(url.pathname);
      if (request.method === "GET" && stream) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stream[2])) return json(response, 404, { error: "NOT_FOUND" });
        const task = (await store.load()).tasks.find(({ id }) => id === stream[1]); if (!task) return json(response, 404, { error: "NOT_FOUND" });
        const runId = stream[2].toLowerCase();
        const artifactExists = stream[3] === "events"
          ? await events.exists({ taskId: task.id, runId })
          : await logs.exists({ taskId: task.id, runId });
        if (!artifactExists && task.activeRunId !== runId) return json(response, 404, { error: "NOT_FOUND" });
        const query = (name, fallback) => url.searchParams.has(name) ? Number(url.searchParams.get(name)) : fallback;
        const cursor = query("cursor", 0), limit = query("limit", 256); if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 256) return json(response, 400, { error: "QUERY_INVALID" });
        const value = stream[3] === "events" ? { ...(await events.readPage({ taskId: task.id, runId, cursor, limit })), taskId: task.id, runId, schemaVersion: 1 } : { ...(await logs.read({ taskId: task.id, runId, cursor, limit })), taskId: task.id, runId, schemaVersion: 1 };
        if (Buffer.byteLength(JSON.stringify(value)) > MAX_OBSERVATION_RESPONSE) return json(response, 413, { error: "OBSERVATION_RESPONSE_TOO_LARGE" });
        return json(response, 200, value);
      }
      const receipt = /^\/v1\/tasks\/([a-z0-9_-]{12})\/runs\/([0-9a-f-]{36})\/receipt$/.exec(url.pathname);
      if (request.method === "GET" && receipt) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt[2])) return json(response, 404, { error: "NOT_FOUND" });
        const task = (await store.load()).tasks.find(({ id }) => id === receipt[1]); if (!task) return json(response, 404, { error: "NOT_FOUND" });
        const value = await receipts.read({ taskId: task.id, runId: receipt[2].toLowerCase() });
        return value ? json(response, 200, { receipt: value }) : json(response, 404, { error: "NOT_FOUND" });
      }
      if (request.method === "POST" && url.pathname === "/v1/tasks") {
        let input; try { input = JSON.parse((await body(request)).toString("utf8")); } catch { fail("REQUEST_PAYLOAD_INVALID"); }
        if (typeof input.prompt !== "string" || !input.prompt.trim() || typeof input.cwd !== "string") return json(response, 400, { error: "TASK_INVALID" });
        const commandId = idempotencyKey(request);
        if (!commandId && request.headers["idempotency-key"] !== undefined) return json(response, 400, { error: "IDEMPOTENCY_KEY_INVALID" });
        if (!commandId) {
          const task = await store.create({ cwd: input.cwd, initialStatus: input.approved === false ? "blocked" : "queued", prompt: input.prompt, trigger: "manual", worktree: input.worktree !== false });
          if (task.status === "queued") await startDetachedRunner({ agentDir, root }); return json(response, 201, { task: taskDto(task) });
        }
        const result = await runControlCommandMutation({ commandId, effectGeneration: 1, journal: commands, operationId: "control.tasks.create", request: { input, method: request.method, path: url.pathname }, effect: async () => {
          const task = await store.create({ cwd: input.cwd, initialStatus: input.approved === false ? "blocked" : "queued", prompt: input.prompt, trigger: "manual", worktree: input.worktree !== false });
          if (task.status === "queued") await startDetachedRunner({ agentDir, root });
          return { body: { task: taskDto(task) }, status: 201 };
        } });
        return json(response, result.status, result.body);
      }
      const approve = /^\/v1\/tasks\/([a-z0-9_-]{12})\/approve$/.exec(url.pathname);
      if (request.method === "POST" && approve) {
        const result = await recoverableMutation({ commands, operationId: "control.tasks.approve", request, requestValue: { taskId: approve[1] }, effect: async () => {
          await store.update(async (value) => { if (await readRunnerStoppingState(agentDir)) fail("RUNNER_STOPPING"); const task = value.tasks.find(({ id }) => id === approve[1]); if (!task || task.status !== "blocked" || task.trigger !== "manual") fail("TASK_NOT_APPROVABLE"); task.status = "queued"; task.updatedAt = new Date().toISOString(); return value; });
          await startDetachedRunner({ agentDir, root }); return { body: { approved: true }, status: 202 };
        } });
        return json(response, result.status, result.body);
      }
      const cancel = /^\/v1\/tasks\/([a-z0-9_-]{12})\/cancel$/.exec(url.pathname);
      if (request.method === "POST" && cancel) {
        const result = await recoverableMutation({ commands, operationId: "control.tasks.cancel", request, requestValue: { taskId: cancel[1] }, effect: async () => {
          const snapshot = await store.load(); const task = snapshot.tasks.find(({ id }) => id === cancel[1]); if (!task) fail("TASK_NOT_FOUND");
          const cancelled = await cancelTask(store, task.id);
          return { body: { cancelled: cancelled.status === "cancelled", outcome: cancelled.status === "cancelled" ? "cancelled" : "terminal-won", task: taskDto(cancelled) }, status: 200 };
        } });
        return json(response, result.status, result.body);
      }
      if (request.method === "POST" && url.pathname === "/v1/tasks/stop-all") {
        const result = await recoverableMutation({ commands, operationId: "control.tasks.stop-all", request, requestValue: {}, effect: async () => {
          const stopped = await stopRunner(agentDir);
          if (stopped.status !== "stopped") return { body: { error: "TASK_PROCESS_STILL_ALIVE" }, status: 500 };
          return { body: { status: "terminated", stopped: stopped.stopped ?? 0 }, status: 200 };
        } });
        return json(response, result.status, result.body);
      }
      return json(response, 404, { error: "NOT_FOUND" });
    } catch (error) { const failure = httpError(error); return json(response, failure.status, { error: failure.code }); }
  });
  const ownership = await acquireControlOwnership(agentDir);
  let selectedPort;
  try {
    const previous = await state(agentDir);
    if (previous?.processIdentity && await processMatches(previous.pid, previous.processIdentity)) fail("CONTROL_ALREADY_RUNNING");
    await commands.recover();
    await new Promise((done, reject) => { server.once("error", reject); server.listen(port, host, done); });
    const address = server.address(); selectedPort = typeof address === "object" && address ? address.port : port;
    await atomicReplace({ agentDir, containsSecret: true, path: statePaths(agentDir).control, bytes: canonicalJson({ host, ownerId: ownership.ownerId, pid: process.pid, port: selectedPort, processIdentity: await processIdentity(process.pid), runtimeKey: process.env.COCO_RUNTIME_KEY ?? null, runtimeRoot: process.env.COCO_RUNTIME_ROOT ?? null, schemaVersion: 1, startedAt: new Date().toISOString(), token }) });
  } catch (error) {
    if (server.listening) await new Promise((done) => server.close(done));
    throw error;
  } finally { await ownership.release(); }
  const recovery = new AbortController();
  const recoveryLoop = recoverPendingDispatches({ agentDir, root, signal: recovery.signal });
  const close = () => { recovery.abort(); server.close(); server.closeIdleConnections?.(); server.closeAllConnections?.(); }; process.once("SIGINT", close); process.once("SIGTERM", close); signal?.addEventListener("abort", close, { once: true });
  const closed = new Promise((done) => server.once("close", done)); if (signal?.aborted) close();
  await closed; recovery.abort(); await recoveryLoop;
  process.removeListener("SIGINT", close); process.removeListener("SIGTERM", close); signal?.removeEventListener("abort", close);
  const current = await state(agentDir); if (current?.ownerId === ownership.ownerId) await rm(statePaths(agentDir).control, { force: true });
}

export async function controlCommand(argv, { agentDir, root }) {
  const [action, ...args] = argv;
  if (action === "status") { process.stdout.write(`${JSON.stringify(await controlStatus(agentDir))}\n`); return { exitCode: 0, kind: "native" }; }
  if (action === "stop") { process.stdout.write(`${JSON.stringify(await stopControl(agentDir))}\n`); return { exitCode: 0, kind: "native" }; }
  if (action === "token") { const value = await state(agentDir); if (!value?.processIdentity || !await processMatches(value.pid, value.processIdentity)) fail("CONTROL_NOT_RUNNING"); process.stdout.write(`${value.token}\n`); return { exitCode: 0, kind: "native" }; }
  if (action === "start") {
    const hostIndex = args.indexOf("--host"); const portIndex = args.indexOf("--port"); const host = hostIndex === -1 ? "127.0.0.1" : args[hostIndex + 1]; const port = portIndex === -1 ? 3210 : Number(args[portIndex + 1]);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) fail("CONTROL_PORT_INVALID");
    const value = await startDetachedControl({ agentDir, host, port, root }); process.stdout.write(`${JSON.stringify(value)}\n`); return { exitCode: 0, kind: "native" };
  }
  fail("CONTROL_USAGE");
}
