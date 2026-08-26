import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCowebServer, DEFAULT_PORT, listProjectFiles, parseCowebArgs, readProjectFile } from "../scripts/coweb.mjs";

async function request(server, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
  return { body: await response.text(), response };
}

test("coweb accepts only the local server options", () => {
  assert.equal(DEFAULT_PORT, 30141);
  assert.deepEqual(parseCowebArgs(["--port", "8080", "--password", "secret"]).options, { port: "8080", password: "secret" });
  assert.equal(parseCowebArgs(["--hostname", "0.0.0.0"]).error, "COWEB_UNKNOWN_ARGUMENT");
  assert.equal(parseCowebArgs(["--port", "0"]).error, "COWEB_PORT_INVALID");
  assert.equal(parseCowebArgs(["--password"]).error, "COWEB_FLAG_VALUE_MISSING");
});

test("coweb remains a native command with bundled static assets", async () => {
  const root = new URL("../", import.meta.url);
  const dispatcher = await readFile(new URL("scripts/coco-dispatcher.mjs", root), "utf8");
  const page = await readFile(new URL("coweb/index.html", root), "utf8");
  assert.match(dispatcher, /NATIVE_COMMANDS = new Set\(\[[^\]]*"coweb"/);
  assert.match(dispatcher, /coco coweb \[--port <port>\] \[--password <secret>\]/);
  assert.match(dispatcher, /import\("\.\/coweb\.mjs"\)/);
  assert.match(page, /Co Web/);
});

test("coweb API has polling endpoints, basic auth, and no host-header requirement", async () => {
  const calls = [];
  const app = {
    create: async () => ({ id: "new", messages: [] }),
    list: async () => [{ id: "saved", path: "/safe/session.jsonl" }],
    models: () => ({ models: [{ id: "model", name: "Model", provider: "coco" }], thinkingLevels: ["low"] }),
    open: async (path) => { calls.push(path); return { id: "saved", messages: [] }; },
    prompt: async () => ({ id: "saved", messages: [] }),
    select: async () => ({ id: "saved", messages: [] }),
    state: () => ({ id: "saved", messages: [] }),
    files: async () => ({ files: [{ name: "README.md", type: "file" }] }),
    file: async (_id, name) => ({ name, text: "preview" }),
  };
  const server = createCowebServer(app, { password: "secret" }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const unauthorized = await request(server, "/api/sessions");
    assert.equal(unauthorized.response.status, 401);
    const headers = { authorization: `Basic ${Buffer.from("pi:secret").toString("base64")}`, host: "public.example" };
    const listed = await request(server, "/api/sessions", { headers });
    assert.equal(listed.response.status, 200);
    assert.match(listed.body, /saved/);
    const opened = await request(server, "/api/sessions", { method: "POST", headers, body: JSON.stringify({ path: "/safe/session.jsonl" }) });
    assert.equal(opened.response.status, 200);
    assert.deepEqual(calls, ["/safe/session.jsonl"]);
    const page = await request(server, "/", { headers });
    assert.equal(page.response.status, 200);
    assert.match(page.body, /Co Web/);
    const files = await request(server, "/api/sessions/saved/files", { headers });
    assert.match(files.body, /README.md/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("coweb project previews reject traversal, links, and oversized files", async () => {
  const root = await mkdtemp(join(tmpdir(), "coweb-files-"));
  try {
    await writeFile(join(root, "safe.txt"), "safe preview");
    await writeFile(join(root, "large.txt"), "x".repeat(256 * 1024 + 1));
    await symlink("safe.txt", join(root, "linked.txt"));
    assert.deepEqual((await listProjectFiles(root)).map((file) => file.name), ["large.txt", "safe.txt"]);
    assert.deepEqual(await readProjectFile(root, "safe.txt"), { name: "safe.txt", text: "safe preview" });
    for (const name of ["../safe.txt", "linked.txt", "large.txt", "missing.txt"]) await assert.rejects(readProjectFile(root, name), /COWEB_PROJECT_FILE_INVALID/);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("coweb assets retain desktop and mobile workspace markers", async () => {
  const root = new URL("../", import.meta.url);
  const [page, script, css] = await Promise.all(["coweb/index.html", "coweb/app.js", "coweb/app.css"].map((path) => readFile(new URL(path, root), "utf8")));
  assert.match(page, /project-panel/);
  assert.match(script, /\/files/);
  assert.match(css, /grid-template-columns:250px minmax\(360px,1fr\) 310px/);
  assert.match(css, /@media\(max-width:699px\)/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("coweb contains no external web package or runtime npm installation", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../scripts/coweb.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@lyhue1991\/pi-web|npm\s+install|execFile/u);
  assert.match(source, /spawn\(process\.execPath, \[fileURLToPath\(import\.meta\.url\), "--serve"/u);
  assert.match(source, /createAgentSessionServices/);
  assert.match(source, /createAgentSessionFromServices/);
  assert.match(source, /SessionManager/);
});
