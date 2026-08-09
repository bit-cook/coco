import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

function run(environment) {
  return new Promise((finish) => {
    const child = spawn(process.execPath, [join(root, "scripts", "coco-bootstrap.cjs"), "--version"], {
      env: environment,
      stdio: "pipe",
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("close", (code) => finish({ code, stderr }));
  });
}

test("Given a successful cold verification, when CoCo writes its warm cache, then it stores only the bounded startup closure", async () => {
  // Given
  const directory = await mkdtemp(join(tmpdir(), "coco-fast-startup-"));
  const agentDir = join(directory, "agent");
  try {
    const environment = { ...process.env, COCO_CODING_AGENT_DIR: agentDir };

    // When
    const cold = await run(environment);
    assert.equal(cold.code, 0, cold.stderr);
    const cache = JSON.parse(await readFile(join(agentDir, ".runtime-integrity-cache.json"), "utf8"));

    // Then
    const dependencyEntries = Object.keys(cache.entries).filter((path) => path.startsWith("node_modules/"));
    assert.ok(Object.keys(cache.entries).length > 0);
    assert.ok(Object.keys(cache.entries).length < 2_000);
    assert.ok(Object.keys(cache.directories).length > 0);
    assert.ok(dependencyEntries.every((path) => path.startsWith("node_modules/@earendil-works/pi-coding-agent/dist/") || path === "node_modules/@earendil-works/pi-coding-agent/package.json"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
