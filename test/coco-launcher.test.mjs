import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateRuntimeIntegrityManifest } from "../scripts/runtime-integrity.mjs";

const launcher = join(new URL("..", import.meta.url).pathname, "scripts", "coco-launcher.mjs");

function run(cwd, environment, executable = launcher, nodeArguments = []) {
  return new Promise((finish) => {
    const child = spawn(process.execPath, [...nodeArguments, executable, "--version"], {
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
  const packageRoot = join(fixture, "coco");
  try {
    await cp(join(new URL("..", import.meta.url).pathname), packageRoot, {
      filter: (path) => !path.includes("/.git/") && !path.includes("/.coco-tools/") && !path.includes("/test/") && !path.includes("/agent/"),
      recursive: true,
    });
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    await mkdir(join(fixture, "project", ".coco", "extensions"), { recursive: true, mode: 0o700 });
    await writeFile(join(fixture, "project", ".coco", "extensions", "probe.mjs"), "export {}\n", { mode: 0o600 });
    const result = await run(join(fixture, "project"), {
      ...process.env,
      COCO_CODING_AGENT_DIR: join(fixture, "agent"),
    }, join(packageRoot, "scripts", "coco-launcher.mjs"));
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stderr, "coco: PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN\n");
    assert.doesNotMatch(result.stderr, /ReferenceError|PROJECT_RESOURCE_PREFLIGHT_FAILED/);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a forged process integrity nonce, when launcher source is inspected, then it has no nonce bypass", async () => {
  const [bootstrapSource, launcherSource] = await Promise.all([
    readFile(join(new URL("..", import.meta.url).pathname, "scripts", "coco-bootstrap.cjs"), "utf8"),
    readFile(launcher, "utf8"),
  ]);
  assert.doesNotMatch(bootstrapSource, /_cocoIntegrityNonce|COCO_INTEGRITY_NONCE/);
  assert.doesNotMatch(launcherSource, /_cocoIntegrityNonce|COCO_INTEGRITY_NONCE/);
  assert.match(launcherSource, /verifyRuntimeIntegrity \?\?=/);
  assert.equal((launcherSource.match(/await verifyIntegrity\(/g) ?? []).length, 2);
});

test("Given a symlink-preserving launcher path, when canonical root differs, then the bound verifier reaches stable preflight attribution", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-launcher-canonical-"));
  const packageRoot = join(fixture, "coco");
  const linkedRoot = join(fixture, "linked-coco");
  try {
    await cp(join(new URL("..", import.meta.url).pathname), packageRoot, {
      filter: (path) => !path.includes("/.git/") && !path.includes("/.coco-tools/") && !path.includes("/test/") && !path.includes("/agent/"),
      recursive: true,
    });
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    await symlink(packageRoot, linkedRoot, "dir");
    await mkdir(join(fixture, "project", ".coco", "extensions"), { recursive: true });
    await writeFile(join(fixture, "project", ".coco", "extensions", "probe.mjs"), "export {};\n");
    const result = await run(join(fixture, "project"), {
      ...process.env,
      COCO_CODING_AGENT_DIR: join(fixture, "agent"),
    }, join(linkedRoot, "scripts", "coco-launcher.mjs"), ["--preserve-symlinks-main", "--preserve-symlinks"]);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stderr, "coco: PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN\n");
    assert.doesNotMatch(result.stderr, /ReferenceError|verifyRuntimeIntegrity is not defined|PROJECT_RESOURCE_PREFLIGHT_FAILED/);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
