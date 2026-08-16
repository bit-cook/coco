import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

test("Given the runtime manifest, when startup closure is selected, then it strictly covers every entry", async () => {
  const manifest = JSON.parse(await readFile(join(root, "resources", "runtime-integrity-manifest.v1.json"), "utf8"));
  const startupClosure = manifest.startupClosure ?? manifest.entries.map((entry) => entry.path);
  const dependencyEntries = startupClosure.filter((path) => path.startsWith("node_modules/"));

  assert.deepEqual([...startupClosure].sort(), manifest.entries.map((entry) => entry.path).sort());
  assert.equal(new Set(startupClosure).size, manifest.entries.length);
  assert.ok(dependencyEntries.some((path) => path.startsWith("node_modules/@earendil-works/pi-tui/dist/")));
  assert.ok(dependencyEntries.some((path) => path.startsWith("node_modules/@modelcontextprotocol/sdk/dist/")));
});
