import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import http from "node:http";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const { runNativeCoweb } = await import(join(root, "scripts", "coweb-native-service.mjs"));

function rawRequest(port, path, headers = {}) {
  return new Promise((resolveRequest, reject) => {
    const request = http.request({ host: "127.0.0.1", port, path, headers }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.once("end", () => resolveRequest({ body, status: response.statusCode }));
    });
    request.once("error", reject);
    request.end();
  });
}

async function start({ password = "test-password" } = {}) {
  const agentDir = await mkdtemp(join(tmpdir(), "coweb-native-agent-"));
  const cwd = await mkdtemp(join(tmpdir(), "coweb-native-cwd-"));
  await mkdir(join(agentDir, "sessions"), { recursive: true });
  const { server } = await runNativeCoweb({ port: "0", password }, { agentDir, cwd });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const auth = `Basic ${Buffer.from(`coco:${password}`).toString("base64")}`;
  return {
    agentDir,
    auth,
    base,
    cwd,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await rm(agentDir, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    },
  };
}

test("native coweb serves the frozen desktop client and protects it with coco auth", async () => {
  const app = await start();
  try {
    const denied = await fetch(`${app.base}/`);
    assert.equal(denied.status, 401);
    const page = await fetch(`${app.base}/`, { headers: { authorization: app.auth } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Co Web/);
    const mobile = await fetch(`${app.base}/coweb-mobile.css`, { headers: { authorization: app.auth } });
    assert.match(await mobile.text(), /max-width: 640px/);
  } finally { await app.close(); }
});

test("native coweb exposes model/session/workspace routes without an external runtime", async () => {
  const app = await start();
  try {
    await writeFile(join(app.cwd, "safe.txt"), "safe preview");
    await mkdir(join(app.cwd, "nested"));
    await writeFile(join(app.cwd, "nested", "safe.md"), "nested preview");
    await symlink("safe.txt", join(app.cwd, "linked.txt"));
    const headers = { authorization: app.auth, "content-type": "application/json" };
    const [home, models, sessions, files] = await Promise.all([
      fetch(`${app.base}/api/home`, { headers }),
      fetch(`${app.base}/api/models?cwd=${encodeURIComponent(app.cwd)}`, { headers }),
      fetch(`${app.base}/api/sessions`, { headers }),
      fetch(`${app.base}/api/files/${encodeURIComponent(app.cwd)}?type=list`, { headers }),
    ]);
    assert.equal(home.status, 200);
    assert.equal(models.status, 200);
    assert.deepEqual((await sessions.json()).sessions, []);
    assert.deepEqual((await files.json()).entries.map((entry) => entry.name), ["nested", "safe.txt"]);
    const browserStyleFiles = await fetch(`${app.base}/api/files/${app.cwd.replace(/^\//u, "")}?type=list`, { headers });
    assert.equal(browserStyleFiles.status, 200);
    const browse = await fetch(`${app.base}/api/cwd/browse?path=${encodeURIComponent(app.cwd)}`, { headers });
    assert.equal((await browse.json()).path, app.cwd);
    const validate = await fetch(`${app.base}/api/cwd/validate`, { method: "POST", headers, body: JSON.stringify({ cwd: app.cwd }) });
    assert.equal((await validate.json()).cwd, app.cwd);
    const session = await fetch(`${app.base}/api/agent/new`, { method: "POST", headers, body: JSON.stringify({ cwd: app.cwd, type: "ensure_session", toolNames: ["read", "bash"] }) });
    const created = await session.json();
    assert.equal(session.status, 200);
    assert.equal(created.success, true);
    const state = await fetch(`${app.base}/api/agent/${created.sessionId}`, { headers });
    assert.equal((await state.json()).state.tools.join(","), "read,bash");
    const preview = await fetch(`${app.base}/api/files/${encodeURIComponent(join(app.cwd, "safe.txt"))}?type=read&sessionId=${created.sessionId}`, { headers });
    const metadata = await stat(join(app.cwd, "safe.txt"));
    assert.deepEqual(await preview.json(), { content: "safe preview", language: "text", modified: metadata.mtime.toISOString(), path: join(app.cwd, "safe.txt"), size: 12 });
    const nested = await fetch(`${app.base}/api/files/${encodeURIComponent(join(app.cwd, "nested", "safe.md"))}?type=read&sessionId=${created.sessionId}`, { headers });
    assert.equal((await nested.json()).content, "nested preview");
    await symlink(dirname(app.cwd), join(app.cwd, "escaped"));
    const blocked = await fetch(`${app.base}/api/files/${encodeURIComponent(join(app.cwd, "escaped", "outside.txt"))}?type=read&sessionId=${created.sessionId}`, { headers });
    assert.equal(blocked.status, 400);
    assert.equal((await rawRequest(Number(new URL(app.base).port), "/api/home", { authorization: app.auth, host: "evil.example" })).status, 403);
    await assert.rejects(runNativeCoweb({ port: "0", publicHost: "public.example" }, { agentDir: app.agentDir, cwd: app.cwd }), /COWEB_PUBLIC_PASSWORD_REQUIRED/);
  } finally { await app.close(); }
});

test("native coweb proxy forwards coco auth and the SSE handshake", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coweb-native-proxy-agent-"));
  const cwd = await mkdtemp(join(tmpdir(), "coweb-native-proxy-cwd-"));
  try {
    await mkdir(join(agentDir, "sessions"), { recursive: true });
    const password = "proxy-password";
    const { proxy, server } = await runNativeCoweb({ port: "0", password, publicHost: "public.example" }, { agentDir, cwd, proxyPort: 0 });
    const auth = `Basic ${Buffer.from(`coco:${password}`).toString("base64")}`;
    const proxyPort = proxy.address().port;
    assert.equal((await rawRequest(proxyPort, "/api/home", { authorization: auth, host: "public.example" })).status, 200);
    assert.equal((await rawRequest(proxyPort, "/api/home", { authorization: auth, host: "evil.example" })).status, 403);
    const createdResponse = await new Promise((resolveRequest, reject) => {
      const request = http.request({ host: "127.0.0.1", port: proxyPort, path: "/api/agent/new", method: "POST", headers: { authorization: auth, "content-type": "application/json", host: "public.example" } }, (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.once("end", () => resolveRequest({ status: response.statusCode, body: JSON.parse(body) }));
      });
      request.once("error", reject);
      request.end(JSON.stringify({ cwd, type: "ensure_session", toolNames: ["read"] }));
    });
    assert.equal(createdResponse.status, 200);
    const created = createdResponse.body;
    const controller = new AbortController();
    const events = await new Promise((resolveRequest, reject) => {
      const request = http.request({ host: "127.0.0.1", port: proxyPort, path: `/api/agent/${created.sessionId}/events`, headers: { accept: "text/event-stream", authorization: auth, host: "public.example" } }, (response) => resolveRequest({ request, response }));
      request.once("error", reject);
      request.end();
    });
    events.response.setEncoding("utf8");
    let text = "";
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SSE handshake timeout")), 10_000);
      events.response.on("data", (chunk) => { text += chunk; if (text.includes("connected")) { clearTimeout(timer); resolve(); } });
      events.response.once("error", reject);
    });
    events.request.destroy();
    assert.equal(events.response.statusCode, 200);
    assert.match(text, /"type":"connected"/);
    await new Promise((resolve) => proxy.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  } finally {
    await rm(agentDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});
