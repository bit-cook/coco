import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

function run(cwd, environment) {
  return new Promise((finish) => {
    const child = spawn(process.execPath, [join(root, "scripts", "coco-launcher.mjs"), "--version"], {
      cwd,
      env: environment,
      stdio: "pipe",
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("close", (code) => finish({ code, stderr }));
  });
}

test("Given forbidden project executable resources, when launcher preflight fails, then it reports the stable error code", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-launcher-preflight-"));
  try {
    await mkdir(join(fixture, ".coco", "extensions"), { recursive: true, mode: 0o700 });
    await writeFile(join(fixture, ".coco", "extensions", "probe.mjs"), "export {}\n", { mode: 0o600 });
    const result = await run(fixture, {
      ...process.env,
      COCO_CODING_AGENT_DIR: join(fixture, "agent"),
      COCO_INTEGRITY_VERIFIED: "1",
    });
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stderr, "coco: PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN\n");
    assert.doesNotMatch(result.stderr, /ReferenceError|PROJECT_RESOURCE_PREFLIGHT_FAILED/);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
