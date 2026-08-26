import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("coweb command is registered as a native dispatch route with usage", async () => {
  const dispatcher = await readFile(join(root, "scripts", "coco-dispatcher.mjs"), "utf8");
  const launcher = await readFile(join(root, "scripts", "coweb.mjs"), "utf8");
  assert.match(dispatcher, /NATIVE_COMMANDS = new Set\(\[[^\]]*"coweb"/);
  assert.match(dispatcher, /coco coweb \[--port <port>\] \[--hostname/);
  assert.match(dispatcher, /argv\[0\] === "coweb"/);
  assert.match(dispatcher, /import\("\.\/coweb\.mjs"\)/);
  assert.match(launcher, /return \{ exitCode: 0, kind: "native" \}/);
  assert.match(launcher, /detached: true/);
});

test("coweb argument parsing and environment wiring stay hermetic", async () => {
  const { brandText, parseCowebArgs, envFor, webUiRoot } = await import(join(root, "scripts", "coweb.mjs"));
  const parsed = parseCowebArgs(["--port", "8080", "--password", "s3cret"]);
  assert.deepEqual(parsed.options, { allowHosts: [], port: "8080", password: "s3cret", update: false });
  const trustedParsed = parseCowebArgs(["--allow-host", "web.example", "--public-host", "web.example"]);
  assert.deepEqual(trustedParsed.options.allowHosts, ["web.example"]);
  assert.equal(trustedParsed.options.publicHost, "web.example");
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
  assert.equal(brandText("Pi Web interface for the pi coding agent"), "Co Web interface for CoCo Agent");
});

test("coweb replaces the installed web frontend title, manifest, and icons with Co Web branding", async () => {
  const { applyCowebBrand } = await import(join(root, "scripts", "coweb.mjs"));
  const temp = await mkdtemp(join(tmpdir(), "coweb-brand-"));
  const packageRoot = join(temp, "node_modules", "@lyhue1991", "pi-web");
  try {
    await mkdir(join(packageRoot, ".next", "server", "app"), { recursive: true });
    await mkdir(join(packageRoot, "public", "icons"), { recursive: true });
    await writeFile(join(packageRoot, ".next", "server", "app", "index.html"), "<title>Pi Web</title><meta name=\"description\" content=\"Pi Web interface for the pi coding agent\">");
    await writeFile(join(packageRoot, ".next", "server", "app", "manifest.webmanifest.body"), '{"name":"Pi Web","short_name":"Pi Web"}');
    await applyCowebBrand(temp);
    const page = await readFile(join(packageRoot, ".next", "server", "app", "index.html"), "utf8");
    const manifest = await readFile(join(packageRoot, ".next", "server", "app", "manifest.webmanifest.body"), "utf8");
    assert.match(page, /Co Web interface for CoCo Agent/);
    assert.match(manifest, /"name":"Co Web"/);
    assert.ok((await readFile(join(packageRoot, "public", "icons", "icon-192.png"))).byteLength > 100);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
