import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { resolveCocoRuntime } from "../scripts/coco-runtime-identity.mjs";
import { generateRuntimeIntegrityManifest, verifyRuntimeIntegrity } from "../scripts/runtime-integrity.mjs";

const root = new URL("..", import.meta.url).pathname;

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "coco-task-3-"));
  await cp(root, join(directory, "coco"), { filter: (path) => !path.includes("/.coco-tools/") && !path.includes("/test/") && !path.endsWith(".tgz"), recursive: true });
  return join(directory, "coco");
}

async function runBootstrap(packageRoot, args, environment) {
  return await new Promise((finish) => { const child = spawn(process.execPath, [join(packageRoot, "scripts", "coco-bootstrap.cjs"), ...args], { env: environment, stdio: "pipe" }); let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; }); child.once("close", (code) => finish({ code, stderr, stdout })); });
}

test("Given the coco package root, when runtime identity is resolved, then it pins coco paths and the exact bundled pi", async () => {
  const runtime = await resolveCocoRuntime({ root });
  assert.equal(runtime.identity.appName, "coco");
  assert.equal(runtime.identity.configDir, ".coco");
  assert.equal(runtime.identity.agentEnv, "COCO_CODING_AGENT_DIR");
  assert.equal(runtime.identity.sessionEnv, "COCO_CODING_AGENT_SESSION_DIR");
  assert.equal(runtime.identity.version, "0.1.3");
  assert.equal(runtime.piVersion, "0.82.1");
  assert.equal(runtime.root, resolve(root));
});

test("Given a generated manifest, when a governed pi module is changed, then verification rejects before import", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const module = join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "config.js");
    await writeFile(module, `${await readFile(module, "utf8")}\n`);
    assert.equal((await verifyRuntimeIntegrity({ root: packageRoot })).code, "RUNTIME_INTEGRITY_MISMATCH");
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a generated manifest, when an unexpected runtime file appears, then verification rejects it", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    await writeFile(join(packageRoot, "dist", "unexpected.js"), "export {};\n");
    assert.equal((await verifyRuntimeIntegrity({ root: packageRoot })).code, "RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a generated manifest, when its guard or sidecar is changed, then verification rejects it", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const guard = join(packageRoot, "resources", "coco-guard.mjs");
    await writeFile(guard, "export const cocoGuardPlaceholder = 'changed';\n");
    assert.equal((await verifyRuntimeIntegrity({ root: packageRoot })).code, "RUNTIME_INTEGRITY_MISMATCH");
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    await writeFile(join(packageRoot, "resources", "runtime-integrity-manifest.v1.json.sha256"), "0".repeat(64));
    assert.equal((await verifyRuntimeIntegrity({ root: packageRoot })).code, "RUNTIME_INTEGRITY_SIDECAR_INVALID");
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a generated manifest, when a runtime symlink is introduced, then verification rejects it", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    await symlink("../README.md", join(packageRoot, "dist", "runtime-link"));
    assert.equal((await verifyRuntimeIntegrity({ root: packageRoot })).code, "RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a mutated Pi import target, when the launcher rejects integrity, then the target never evaluates", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const sentinel = join(packageRoot, "pi-evaluated");
    await writeFile(join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"), `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(sentinel)}, "evaluated");\n`);
    const result = await new Promise((finish) => {
      const child = spawn(process.execPath, [join(packageRoot, "scripts", "coco-bootstrap.cjs")], { stdio: "ignore" });
      child.once("close", (code) => finish(code));
    });
    assert.notEqual(result, 0);
    await assert.rejects(readFile(sentinel));
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given mutated guard and mapped resource modules, when the real anchor rejects, then neither evaluates", async () => {
  for (const target of ["resources/coco-guard.mjs", "resources/coco-runtime-resource.mjs"]) {
    const packageRoot = await fixture();
    try {
      await generateRuntimeIntegrityManifest({ root: packageRoot });
      const sentinel = join(packageRoot, `${target.split("/").at(-1)}.evaluated`);
      await writeFile(join(packageRoot, target), `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(sentinel)}, "evaluated");\n`);
      const code = await new Promise((finish) => {
        const child = spawn(process.execPath, [join(packageRoot, "scripts", "coco-bootstrap.cjs")], { stdio: "ignore" });
        child.once("close", finish);
      });
      assert.notEqual(code, 0, target);
      await assert.rejects(readFile(sentinel));
    } finally {
      await rm(join(packageRoot, ".."), { force: true, recursive: true });
    }
  }
});

test("Given mutated launcher and helper sentinels, when the real anchor rejects, then neither module evaluates", async () => {
  for (const target of ["scripts/coco-launcher.mjs", "scripts/coco-runtime-identity.mjs", "scripts/runtime-integrity.mjs"]) {
    const packageRoot = await fixture();
    try {
      await generateRuntimeIntegrityManifest({ root: packageRoot });
      const sentinel = join(packageRoot, `${target.split("/").at(-1)}.evaluated`);
      await writeFile(join(packageRoot, target), `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(sentinel)}, "evaluated");\n`);
      const code = await new Promise((finish) => {
        const child = spawn(process.execPath, [join(packageRoot, "scripts", "coco-bootstrap.cjs")], { stdio: "ignore" });
        child.once("close", finish);
      });
      assert.notEqual(code, 0, target);
      await assert.rejects(readFile(sentinel));
    } finally {
      await rm(join(packageRoot, ".."), { force: true, recursive: true });
    }
  }
});

test("Given mutation at final entry revalidation, when integrity verifies, then it rejects before accepting the runtime", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const target = "resources/coco-guard.mjs";
    const result = await verifyRuntimeIntegrity({
      root: packageRoot,
      beforeEntry: async (path) => { if (path === target) await writeFile(join(packageRoot, path), "export const changed = true;\n"); },
    });
    assert.equal(result.code, "RUNTIME_INTEGRITY_MISMATCH");
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given an unexpected mapped resource, when integrity verifies, then it rejects the unmanifested entry", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    await writeFile(join(packageRoot, "resources", "unexpected.json"), "{}\n");
    assert.equal((await verifyRuntimeIntegrity({ root: packageRoot })).code, "RUNTIME_INTEGRITY_UNEXPECTED_ENTRY");
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a malformed manifest path set, when integrity verifies, then traversal and duplicate entries reject", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const manifest = join(packageRoot, "resources", "runtime-integrity-manifest.v1.json");
    const sidecar = `${manifest}.sha256`;
    const value = JSON.parse(await readFile(manifest, "utf8"));
    value.entries[0].path = "../escape";
    await writeFile(manifest, `${JSON.stringify(value)}\n`);
    assert.equal((await verifyRuntimeIntegrity({ root: packageRoot })).code, "RUNTIME_INTEGRITY_SIDECAR_INVALID");
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const duplicate = JSON.parse(await readFile(manifest, "utf8"));
    duplicate.entries.push(duplicate.entries[0]);
    await writeFile(manifest, `${JSON.stringify(duplicate)}\n`);
    await writeFile(sidecar, `${(await import("node:crypto")).createHash("sha256").update(await readFile(manifest)).digest("hex")}  runtime-integrity-manifest.v1.json\n`);
    assert.equal((await verifyRuntimeIntegrity({ root: packageRoot })).code, "RUNTIME_INTEGRITY_MANIFEST_INVALID");
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a cached snapshot, when a governed file changes without metadata changes, then async verification rejects", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const cachePath = join(packageRoot, "..", "runtime-cache.json");
    const manifestHash = (await readFile(join(packageRoot, "resources", "runtime-integrity-manifest.v1.json.sha256"), "utf8")).split(" ", 1)[0];
    const governed = join(packageRoot, "package.json");
    const original = await readFile(governed, "utf8");
    const metadata = await stat(governed);
    const manifest = JSON.parse(await readFile(join(packageRoot, "resources", "runtime-integrity-manifest.v1.json"), "utf8"));
    const entries = {};
    for (const item of manifest.entries) if (!item.path.startsWith("node_modules/")) { const info = await stat(join(packageRoot, item.path)); entries[item.path] = { size: info.size, mtimeMs: info.mtimeMs, mode: info.mode & 0o111 ? 0o755 : 0o644 }; }
    await writeFile(cachePath, JSON.stringify({ manifestHash, entries }));
    await writeFile(governed, `${original[0] === "x" ? "y" : "x"}${original.slice(1)}`);
    await utimes(governed, metadata.atimeMs / 1000, metadata.mtimeMs / 1000);
    const result = await verifyRuntimeIntegrity({ root: packageRoot, cachePath });
    assert.equal(result.code, "RUNTIME_INTEGRITY_MISMATCH");
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a malformed cache snapshot, when governed files are unchanged, then async verification performs full fallback", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const cachePath = join(packageRoot, "..", "runtime-cache.json");
    const manifestHash = (await readFile(join(packageRoot, "resources", "runtime-integrity-manifest.v1.json.sha256"), "utf8")).split(" ", 1)[0];
    const manifest = JSON.parse(await readFile(join(packageRoot, "resources", "runtime-integrity-manifest.v1.json"), "utf8"));
    const entries = {};
    for (const item of manifest.entries) if (!item.path.startsWith("node_modules/")) { const info = await stat(join(packageRoot, item.path)); entries[item.path] = { size: info.size, mtimeMs: info.mtimeMs, mode: info.mode & 0o111 ? 0o755 : 0o644 }; }
    entries["package.json"] = null;
    await writeFile(cachePath, JSON.stringify({ manifestHash, entries }));
    const result = await verifyRuntimeIntegrity({ root: packageRoot, cachePath });
    assert.equal(result.status, "approved");
    assert.equal(result.fast, undefined);
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given direct CJS bootstrap runs, when fast and full verification complete, then each emits a machine-readable integrity mode", async () => {
  const packageRoot = await fixture();
  try {
    await writeFile(join(packageRoot, "scripts", "coco-launcher.mjs"), 'process.stdout.write(JSON.stringify({ integrityMode: process.env.COCO_INTEGRITY_MODE ?? null }) + "\\n");\n');
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const environment = { ...process.env, COCO_CODING_AGENT_DIR: join(packageRoot, "agent") };
    const warm = await runBootstrap(packageRoot, ["--version"], environment);
    assert.equal(warm.code, 0, warm.stderr);
    const fast = await runBootstrap(packageRoot, [], environment);
    assert.equal(fast.code, 0, fast.stderr);
    assert.deepEqual(JSON.parse(fast.stdout), { integrityMode: "fast" });
    const full = await runBootstrap(packageRoot, [], { ...environment, COCO_INTEGRITY_FULL: "1" });
    assert.equal(full.code, 0, full.stderr);
    assert.deepEqual(JSON.parse(full.stdout), { integrityMode: "full" });
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a warm CJS integrity cache, when dependencies are unchanged, then bootstrap reads no dependency content", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const agentDir = join(packageRoot, "agent");
    const probe = join(packageRoot, "dependency-read-probe.cjs");
    await writeFile(probe, `const fs = require("node:fs");
const promises = require("node:fs/promises");
const root = ${JSON.stringify(packageRoot)};
const rejectsDependencyRead = (path) => typeof path === "string" && path.startsWith(root + "/node_modules/");
const readFileSync = fs.readFileSync;
const readFile = promises.readFile;
fs.readFileSync = (path, ...arguments_) => {
  if (rejectsDependencyRead(path)) throw new Error("DEPENDENCY_CONTENT_READ");
  return readFileSync(path, ...arguments_);
};
promises.readFile = async (path, ...arguments_) => {
  if (rejectsDependencyRead(path)) throw new Error("DEPENDENCY_CONTENT_READ");
  return readFile(path, ...arguments_);
};
`);
    await rm(agentDir, { force: true, recursive: true });
    const environment = { ...process.env, COCO_CODING_AGENT_DIR: agentDir };
    const initial = await runBootstrap(packageRoot, ["--version"], environment);
    assert.equal(initial.code, 0, initial.stderr);
    const manifest = JSON.parse(await readFile(join(packageRoot, "resources", "runtime-integrity-manifest.v1.json"), "utf8"));
    const cache = JSON.parse(await readFile(join(agentDir, ".runtime-integrity-cache.json"), "utf8"));
    assert.equal(cache.schemaVersion, 1);
    assert.equal((await stat(join(agentDir, ".runtime-integrity-cache.json"))).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(cache.entries).sort(), manifest.entries.map((entry) => entry.path).sort());
    for (const snapshot of Object.values(cache.entries)) assert.deepEqual(Object.keys(snapshot).sort(), ["ctimeMs", "dev", "ino", "mode", "mtimeMs", "size"]);
    const warm = await runBootstrap(packageRoot, ["--version"], { ...environment, NODE_OPTIONS: `--require=${probe}` });
    assert.equal(warm.code, 0, warm.stderr);
    const full = await runBootstrap(packageRoot, ["--version"], { ...environment, COCO_INTEGRITY_FULL: "1", NODE_OPTIONS: `--require=${probe}` });
    assert.notEqual(full.code, 0, full.stderr);
    assert.match(full.stderr, /DEPENDENCY_CONTENT_READ/);
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a warm CJS integrity cache, when a dependency changes, then bootstrap rejects before startup", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const environment = { ...process.env, COCO_CODING_AGENT_DIR: join(packageRoot, "agent") };
    const initial = await runBootstrap(packageRoot, ["--version"], environment);
    assert.equal(initial.code, 0, initial.stderr);
    const dependency = join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "config.js");
    const source = await readFile(dependency, "utf8");
    const metadata = await stat(dependency);
    await writeFile(dependency, `${source.slice(0, -1)}${source.endsWith("\n") ? "x" : "\n"}`);
    await utimes(dependency, metadata.atime, metadata.mtime);
    const changed = await stat(dependency);
    assert.equal(changed.size, metadata.size);
    assert.notEqual(changed.ctimeMs, metadata.ctimeMs);
    const cachePath = join(packageRoot, "agent", ".runtime-integrity-cache.json");
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    cache.entries["node_modules/@earendil-works/pi-coding-agent/dist/config.js"].mtimeMs = changed.mtimeMs;
    await writeFile(cachePath, JSON.stringify(cache));
    const warm = await runBootstrap(packageRoot, ["--version"], environment);
    assert.notEqual(warm.code, 0, warm.stderr);
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given a warm CJS integrity cache, when a dependency inode changes with preserved content metadata, then bootstrap falls back to full verification", async () => {
  const packageRoot = await fixture();
  try {
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const agentDir = join(packageRoot, "agent");
    const environment = { ...process.env, COCO_CODING_AGENT_DIR: agentDir };
    const initial = await runBootstrap(packageRoot, ["--version"], environment);
    assert.equal(initial.code, 0, initial.stderr);
    const dependency = join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "config.js");
    const source = await readFile(dependency);
    const metadata = await stat(dependency);
    await rename(dependency, `${dependency}.original`);
    await writeFile(dependency, source);
    await rm(`${dependency}.original`);
    await utimes(dependency, metadata.atime, metadata.mtime);
    const replacement = await stat(dependency);
    assert.equal(replacement.size, metadata.size);
    assert.notEqual(replacement.ino, metadata.ino);
    const cachePath = join(agentDir, ".runtime-integrity-cache.json");
    const initialCache = JSON.parse(await readFile(cachePath, "utf8"));
    const snapshot = initialCache.entries["node_modules/@earendil-works/pi-coding-agent/dist/config.js"];
    snapshot.mtimeMs = replacement.mtimeMs;
    snapshot.ctimeMs = replacement.ctimeMs;
    await writeFile(cachePath, JSON.stringify(initialCache));
    const full = await runBootstrap(packageRoot, ["--version"], environment);
    assert.equal(full.code, 0, full.stderr);
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    assert.equal(cache.entries["node_modules/@earendil-works/pi-coding-agent/dist/config.js"].ino, replacement.ino);
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});

test("Given an invalid warm CJS integrity cache, when content is unchanged, then bootstrap fully verifies and rewrites it", async () => {
  const packageRoot = await fixture();
  try {
    await writeFile(join(packageRoot, "scripts", "coco-launcher.mjs"), 'process.stdout.write(JSON.stringify({ integrityMode: process.env.COCO_INTEGRITY_MODE ?? null }) + "\\n");\n');
    await generateRuntimeIntegrityManifest({ root: packageRoot });
    const agentDir = join(packageRoot, "agent");
    const cachePath = join(agentDir, ".runtime-integrity-cache.json");
    const environment = { ...process.env, COCO_CODING_AGENT_DIR: agentDir };
    const initial = await runBootstrap(packageRoot, [], environment);
    assert.equal(initial.code, 0, initial.stderr);
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    cache.entries.unexpected = { size: 0, mtimeMs: 0, ctimeMs: 0, mode: 0o644, dev: 0, ino: 0 };
    await writeFile(cachePath, JSON.stringify(cache));
    const fallback = await runBootstrap(packageRoot, [], environment);
    assert.equal(fallback.code, 0, fallback.stderr);
    assert.deepEqual(JSON.parse(fallback.stdout), { integrityMode: "full" });
    assert.equal(Object.hasOwn(JSON.parse(await readFile(cachePath, "utf8")).entries, "unexpected"), false);
    const malformed = JSON.parse(await readFile(cachePath, "utf8"));
    delete malformed.entries["package.json"].ctimeMs;
    await writeFile(cachePath, JSON.stringify(malformed));
    const malformedFallback = await runBootstrap(packageRoot, [], environment);
    assert.equal(malformedFallback.code, 0, malformedFallback.stderr);
    assert.deepEqual(JSON.parse(malformedFallback.stdout), { integrityMode: "full" });
  } finally {
    await rm(join(packageRoot, ".."), { force: true, recursive: true });
  }
});
