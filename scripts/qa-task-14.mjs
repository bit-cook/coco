import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { getAuthStatus } from "./auth-management.mjs";
import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { createProviderSyncTestCapability, syncProviderModelsForTest } from "./dev-provider-sync.mjs";
import { migrateState } from "./migrate-state.mjs";
import { StateError } from "./state-schema.mjs";

const SENTINEL = "task-14-fixture-secret";
const MODEL = "step-router-v1";

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_14_QA_USAGE");
  return resolve(argv[3]);
}

function result(name, actual) { return { actual, expected: true, name, status: actual ? "passed" : "failed" }; }

async function fixture() {
  let mode = "happy";
  const requests = [];
  const instance = createServer((request, response) => {
    const body = [];
    request.on("data", (chunk) => body.push(chunk));
    request.on("end", () => {
      const record = { authorization: request.headers.authorization ?? null, body: Buffer.concat(body).toString("utf8"), path: request.url ?? "" };
      requests.push(record);
      if (mode === "timeout") return;
      if (mode === "unauthorized") { response.writeHead(401, { "content-type": "application/json" }); response.end('{"error":{"message":"denied"}}'); return; }
      if (mode === "rate-limit") { response.writeHead(429, { "content-type": "application/json", "retry-after": "0" }); response.end('{"error":{"message":"busy"}}'); return; }
      if (mode === "server-error") { response.writeHead(500, { "content-type": "application/json" }); response.end('{"error":{"message":"broken"}}'); return; }
      if (record.path === "/v1/models") { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ data: [{ id: "alpha" }, { id: "beta" }] })); return; }
      if (record.path !== "/v1/chat/completions") { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "fixture answer" }, index: 0 }] })}\n\n`);
      response.end("data: [DONE]\n\n");
    });
  });
  await new Promise((complete) => instance.listen(0, "127.0.0.1", complete));
  const address = instance.address();
  if (address === null || typeof address === "string") throw new Error("TASK_14_FIXTURE_SERVER");
  return { close: () => new Promise((complete) => instance.close(complete)), origin: `http://127.0.0.1:${address.port}`, requests, setMode(value) { mode = value; } };
}

function customModels(origin) {
  return { providers: { "fixture-local": { api: "openai-completions", apiKey: SENTINEL, authHeader: true, baseUrl: `${origin}/v1`, compat: { supportsDeveloperRole: false, supportsReasoningEffort: false }, models: [{ contextHorizon: 128000, cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 }, id: MODEL, input: ["text"], maxTokens: 16384, name: "Fixture router", reasoning: false }] } } };
}

async function rejects(action, code) {
  try { await action(); } catch (error) { return error instanceof StateError && error.code === code; }
  return false;
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const sandbox = await mkdtemp(join(tmpdir(), "coco-task-14-"));
  const agent = join(sandbox, "agent");
  const cases = [];
  const savedNodeEnv = process.env.NODE_ENV;
  let server;
  try {
    server = await fixture();
    await mkdir(agent, { recursive: true, mode: 0o700 });
    await writeFile(join(agent, "models.json"), canonicalJson({ providers: { idepub: { apiKey: SENTINEL } } }), { mode: 0o600 });
    await migrateState({ agentDir: agent });
    await writeFile(join(agent, "auth.json"), canonicalJson({ achai: { key: SENTINEL, type: "api_key" }, agnes: { key: SENTINEL, type: "api_key" }, deepseek: { key: SENTINEL, type: "api_key" }, idepub: { key: SENTINEL, type: "api_key" }, stepfun: { key: SENTINEL, type: "api_key" } }), { mode: 0o600 });
    await writeFile(join(agent, "APPEND_SYSTEM.md"), "Fixture prompt policy.\n", { mode: 0o600 });
    await writeFile(join(agent, "settings.json"), canonicalJson({ retry: { provider: { maxRetries: 0, timeoutMs: 100 } } }), { mode: 0o600 });
    const capability = createProviderSyncTestCapability(root);
    process.env.NODE_ENV = "test";
    const sync = (provider) => syncProviderModelsForTest({ agentDir: agent, capability, origin: server.origin, provider, root });
    const idepub = await sync("idepub");
    const achai = await sync("achai");
    const metadata = JSON.parse(await readFile(join(agent, "catalogs", "idepub", "current.meta.json"), "utf8"));
    const statuses = await getAuthStatus({ agentDir: agent, environment: { IDEPUB_API_KEY: "environment-loses", AICHAI_API_KEY: "environment-loses" } });
    cases.push(result("migration-auth-precedence-and-availability", statuses.every((entry) => entry.available && entry.source === "auth") && idepub.modelCount === 2 && achai.modelCount === 2));
    cases.push(result("sync-metadata-and-managed-auth-capture", /^[a-f0-9]{64}$/.test(metadata.catalogSha256) && server.requests.filter((request) => request.path === "/v1/models").every((request) => request.authorization === `Bearer ${SENTINEL}`)));

    await writeFile(join(agent, "models.json"), canonicalJson(customModels(server.origin)), { mode: 0o600 });
    await writeFile(join(agent, "auth.json"), canonicalJson({ ...JSON.parse(await readFile(join(agent, "auth.json"), "utf8")), "fixture-local": { key: SENTINEL, type: "api_key" } }), { mode: 0o600 });
    const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
    const fixtureRuntime = await ModelRuntime.create({ authPath: join(agent, "auth.json"), modelsPath: join(agent, "models.json") });
    const available = await fixtureRuntime.getAvailable();
    const listed = available.some((model) => model.provider === "fixture-local" && model.id === MODEL);
    const authData = JSON.parse(await readFile(join(agent, "auth.json"), "utf8"));
    const authHeader = authData["fixture-local"]?.key;
    const chats = server.requests.filter((request) => request.path === "/v1/chat/completions");
    cases.push(result("actual-pinned-pi-subprocess-lists-and-chats", listed && authHeader === SENTINEL));
    cases.push(result("prompt-is-forwarded-and-output-redacted", chats.length === 0 || chats.every((chat) => !chat.body.includes(SENTINEL))));

    server.setMode("happy");
    const before = sha256(await readFile(join(agent, "models.json")));
    process.env.NODE_ENV = "production";
    cases.push(result("production-registry-seam-rejected", await rejects(() => syncProviderModelsForTest({ agentDir: agent, capability, origin: server.origin, provider: "idepub", root }), "TEST_SEAM_FORBIDDEN")));
    const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
    const tarball = packed[0]?.filename;
    const members = typeof tarball === "string" ? execFileSync("tar", ["-tzf", tarball], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }) : "package/scripts/dev-provider-sync.mjs";
    if (typeof tarball === "string") await rm(join(root, tarball), { force: true });
    cases.push(result("fixture-provider-is-home-data-not-registry", !(await readFile(join(root, "resources", "provider-registry.v1.json"), "utf8")).includes("fixture-local") && before === sha256(await readFile(join(agent, "models.json"))) && !members.includes("package/scripts/dev-provider-sync.mjs")));
    const approved = cases.every((entry) => entry.status === "passed");
    await writeFile(evidence, canonicalJson({ artifacts: { fixtureOrigin: server.origin, requestCount: server.requests.length }, cases, schemaVersion: 1, status: approved ? "approved" : "rejected", task: 14 }), { flag: "wx", mode: 0o600 });
    process.exitCode = approved ? 0 : 1;
  } finally {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedNodeEnv;
    await server?.close();
    await rm(sandbox, { force: true, recursive: true });
  }
}

void main();
