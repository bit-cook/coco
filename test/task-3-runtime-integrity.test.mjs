import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

test("Given the coco package root, when runtime identity is resolved, then it pins coco paths and the exact bundled pi", async () => {
  const runtime = await resolveCocoRuntime({ root });
  assert.equal(runtime.identity.appName, "coco");
  assert.equal(runtime.identity.configDir, ".coco");
  assert.equal(runtime.identity.agentEnv, "COCO_CODING_AGENT_DIR");
  assert.equal(runtime.identity.sessionEnv, "COCO_CODING_AGENT_SESSION_DIR");
  assert.equal(runtime.identity.version, "0.1.1");
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
