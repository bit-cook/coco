import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("coweb command dispatches a detached CoCo-native service", async () => {
  const [dispatcher, launcher] = await Promise.all([
    readFile(join(root, "scripts", "coco-dispatcher.mjs"), "utf8"),
    readFile(join(root, "scripts", "coweb.mjs"), "utf8"),
  ]);
  assert.match(dispatcher, /NATIVE_COMMANDS = new Set\(\[[^\]]*"coweb"/);
  assert.match(dispatcher, /coco coweb \[--port <port>\] \[--password <secret>\]/);
  assert.match(dispatcher, /argv\[0\] === "coweb"/);
  assert.match(launcher, /coweb-native-service\.mjs/);
  assert.match(launcher, /detached: true/);
  assert.match(launcher, /COWEB_READY/);
  assert.match(launcher, /service\.unref\(\)/);
  assert.doesNotMatch(launcher, /@lyhue1991\/pi-web|npm\s+install|execFile/u);
});

test("coweb accepts only validated native service arguments", async () => {
  const { parseCowebArgs } = await import(join(root, "scripts", "coweb.mjs"));
  assert.deepEqual(parseCowebArgs(["--port", "8080", "--password", "s3cret"]).options, { port: "8080", password: "s3cret" });
  assert.deepEqual(parseCowebArgs(["--public-host", "web.example"]).options, { publicHost: "web.example" });
  assert.equal(parseCowebArgs(["--port"]).error, "COWEB_FLAG_VALUE_MISSING");
  assert.equal(parseCowebArgs(["--port", "0"]).error, "COWEB_PORT_INVALID");
  assert.equal(parseCowebArgs(["--hostname", "0.0.0.0"]).error, "COWEB_LOOPBACK_REQUIRED");
  assert.equal(parseCowebArgs(["--update"]).error, "COWEB_NATIVE_UPDATE_UNSUPPORTED");
  assert.equal(parseCowebArgs(["nonsense"]).error, "COWEB_UNKNOWN_ARGUMENT");
});

test("coweb desktop snapshot preserves desktop assets and adds only a narrow mobile override", async () => {
  const [index, snapshot, mobile] = await Promise.all([
    readFile(join(root, "coweb", "desktop", "index.html"), "utf8"),
    readFile(join(root, "coweb", "desktop", "SNAPSHOT.json"), "utf8"),
    readFile(join(root, "coweb", "coweb-mobile.css"), "utf8"),
  ]);
  assert.match(index, /Co Web/);
  assert.match(index, /coweb-mobile\.css/);
  assert.match(snapshot, /"source": "@lyhue1991\/pi-web"/);
  assert.match(snapshot, /"license": "MIT"/);
  assert.match(snapshot, /"integrity": "sha512-/);
  assert.match(snapshot, /"treeSha256": "[a-f0-9]{64}"/);
  assert.match(mobile, /@media \(max-width: 640px\)/);
  assert.match(mobile, /safe-area-inset-bottom/);
  assert.match(mobile, /min-height: 44px/);
});
