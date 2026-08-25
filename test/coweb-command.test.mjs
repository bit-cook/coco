import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("coweb command is registered as a native dispatch route with usage", async () => {
  const dispatcher = await readFile(join(root, "scripts", "coco-dispatcher.mjs"), "utf8");
  assert.match(dispatcher, /NATIVE_COMMANDS = new Set\(\[[^\]]*"coweb"/);
  assert.match(dispatcher, /coco coweb \[--port <port>\] \[--hostname/);
  assert.match(dispatcher, /argv\[0\] === "coweb"/);
  assert.match(dispatcher, /import\("\.\/coweb\.mjs"\)/);
});

test("coweb argument parsing and environment wiring stay hermetic", async () => {
  const { parseCowebArgs, envFor, webUiRoot } = await import(join(root, "scripts", "coweb.mjs"));
  const parsed = parseCowebArgs(["--port", "8080", "--password", "s3cret", "--allow-host", "web.example"]);
  assert.deepEqual(parsed.options.allowHosts, ["web.example"]);
  assert.deepEqual(parsed.options, { allowHosts: [], port: "8080", password: "s3cret", update: false });
  assert.equal(parseCowebArgs(["--port"]).error, "COWEB_FLAG_VALUE_MISSING");
  assert.equal(parseCowebArgs(["nonsense"]).error, "COWEB_UNKNOWN_ARGUMENT");
  const env = envFor({ port: "8080", hostname: "0.0.0.0" }, "/agents/coco");
  assert.equal(env.PI_CODING_AGENT_DIR, "/agents/coco");
  assert.equal(env.PORT, "8080");
  assert.equal(env.PI_WEB_HOSTNAME, "0.0.0.0");
  assert.equal(env.PI_WEB_NO_OPEN, "1");
  assert.ok(!("PI_WEB_PASSWORD" in env));
  const trusted = envFor({ allowHosts: ["a.example", "b.example"] }, "/agents/coco");
  assert.equal(trusted.PI_WEB_ALLOWED_HOSTS, "a.example,b.example");
  assert.equal(webUiRoot("/agents/coco"), join("/agents/coco", "webui"));
});
