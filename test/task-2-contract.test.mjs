import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bootstrapLocalNpm, bootstrapNpm, bootstrapWindowsAbi } from "../scripts/bootstrap-npm.mjs";
import { generateAssetMap } from "../scripts/generate-asset-map.mjs";
import { snapshotPackageInputs } from "../scripts/package-inputs.mjs";
import { verifyPackageClosure, verifyTarballClosure } from "../scripts/verify-package-closure.mjs";

test("Given valid linked package inputs, when snapshotted, then destinations become real identical files", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-package-inputs-"));
  try {
    const source = join(fixture, "global");
    const root = join(fixture, "coco");
    await writeFile(join(fixture, "placeholder"), "");
    await (await import("node:fs/promises")).mkdir(source);
    await (await import("node:fs/promises")).mkdir(root);
    for (const name of ["dist", "docs", "examples"]) {
      await (await import("node:fs/promises")).mkdir(join(source, name));
      await writeFile(join(source, name, "asset.txt"), `${name}\n`);
      await symlink(join(source, name), join(root, name));
    }
    await writeFile(join(source, "CHANGELOG.md"), "changes\n");
    await symlink(join(source, "CHANGELOG.md"), join(root, "CHANGELOG.md"));
    const result = await snapshotPackageInputs({ globalRoot: source, root });
    assert.equal(result.status, "approved");
    for (const name of ["dist", "docs", "examples", "CHANGELOG.md"]) {
      assert.equal((await lstat(join(root, name))).isSymbolicLink(), false);
    }
    assert.equal(await readFile(join(root, "dist", "asset.txt"), "utf8"), "dist\n");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a malformed package input link, when snapshotted, then it fails without replacing it", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-package-invalid-"));
  try {
    const source = join(fixture, "global");
    const root = join(fixture, "coco");
    await (await import("node:fs/promises")).mkdir(source);
    await (await import("node:fs/promises")).mkdir(root);
    await writeFile(join(root, "dist"), "not a link\n");
    const result = await snapshotPackageInputs({ globalRoot: source, root });
    assert.equal(result.code, "PACKAGE_INPUT_INVALID");
    assert.equal(await readFile(join(root, "dist"), "utf8"), "not a link\n");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a noncanonical ABI artifact, when bootstrapped, then it is rejected with the stable code", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-abi-"));
  try {
    const source = join(fixture, "abi.json");
    await writeFile(source, "{}\n");
    const result = await bootstrapWindowsAbi({ destination: join(fixture, "installed.json"), source });
    assert.equal(result.code, "WINDOWS_ABI_BOOTSTRAP_INVALID");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a selector replaced during a snapshot, when materialization reaches its race barrier, then it preserves every selector", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-package-race-"));
  try {
    const globalRoot = join(fixture, "global");
    const root = join(fixture, "coco");
    await mkdir(globalRoot);
    await mkdir(root);
    for (const name of ["dist", "docs", "examples"]) {
      await mkdir(join(globalRoot, name));
      await writeFile(join(globalRoot, name, "asset.txt"), `${name}\n`);
      await symlink(join(globalRoot, name), join(root, name));
    }
    await writeFile(join(globalRoot, "CHANGELOG.md"), "changes\n");
    await symlink(join(globalRoot, "CHANGELOG.md"), join(root, "CHANGELOG.md"));
    const result = await snapshotPackageInputs({
      globalRoot,
      root,
      onCheckpoint: async (checkpoint) => {
        if (checkpoint === "after-manifest:dist") {
          await rm(join(root, "dist"));
          await symlink(join(globalRoot, "docs"), join(root, "dist"));
        }
      },
    });
    assert.equal(result.code, "PACKAGE_INPUT_RACE");
    assert.equal((await lstat(join(root, "docs"))).isSymbolicLink(), true);
    assert.equal((await lstat(join(root, "examples"))).isSymbolicLink(), true);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given staging is tampered with while the source is changed and restored, when snapshotting reaches its copy barrier, then it rejects without replacing destinations", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-package-staging-race-"));
  try {
    const globalRoot = join(fixture, "global");
    const root = join(fixture, "coco");
    await mkdir(globalRoot);
    await mkdir(root);
    for (const name of ["dist", "docs", "examples"]) {
      await mkdir(join(globalRoot, name));
      await writeFile(join(globalRoot, name, "asset.txt"), `${name}\n`);
      await symlink(join(globalRoot, name), join(root, name));
    }
    await writeFile(join(globalRoot, "CHANGELOG.md"), "changes\n");
    await symlink(join(globalRoot, "CHANGELOG.md"), join(root, "CHANGELOG.md"));
    const result = await snapshotPackageInputs({
      globalRoot,
      root,
      onCheckpoint: async (checkpoint) => {
        if (checkpoint !== "after-copy:examples") return;
        const stageName = (await (await import("node:fs/promises")).readdir(root)).find((name) => name.startsWith(".package-inputs-"));
        assert.ok(stageName);
        await writeFile(join(root, stageName, "examples", "asset.txt"), "tampered\n");
        await writeFile(join(globalRoot, "examples", "asset.txt"), "changed\n");
        await writeFile(join(globalRoot, "examples", "asset.txt"), "examples\n");
      },
    });
    assert.equal(result.code, "PACKAGE_INPUT_RACE");
    for (const name of ["dist", "docs", "examples", "CHANGELOG.md"]) {
      assert.equal((await lstat(join(root, name))).isSymbolicLink(), true);
    }
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a source tree containing an internal symlink, when snapshotted, then it rejects without mutation", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-package-tree-invalid-"));
  try {
    const globalRoot = join(fixture, "global");
    const root = join(fixture, "coco");
    await mkdir(globalRoot);
    await mkdir(root);
    for (const name of ["dist", "docs", "examples"]) {
      await mkdir(join(globalRoot, name));
      await writeFile(join(globalRoot, name, "asset.txt"), `${name}\n`);
      await symlink(join(globalRoot, name), join(root, name));
    }
    await symlink("asset.txt", join(globalRoot, "dist", "internal-link"));
    await writeFile(join(globalRoot, "CHANGELOG.md"), "changes\n");
    await symlink(join(globalRoot, "CHANGELOG.md"), join(root, "CHANGELOG.md"));
    const result = await snapshotPackageInputs({ globalRoot, root });
    assert.equal(result.code, "PACKAGE_INPUT_INVALID");
    assert.equal((await lstat(join(root, "dist"))).isSymbolicLink(), true);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given preexisting lock bytes, when bootstrap begins, then it reports conflict and preserves the lock", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-bootstrap-lock-"));
  try {
    const lock = join(fixture, "package-lock.json");
    await writeFile(lock, "preserve-me\n");
    const result = await bootstrapNpm({ root: fixture });
    assert.equal(result.code, "BOOTSTRAP_LOCK_CONFLICT");
    assert.equal(await readFile(lock, "utf8"), "preserve-me\n");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given an unresolved upstream resolver path, when the asset map is generated, then it fails with the stable resolver code", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-asset-map-invalid-"));
  try {
    await assert.rejects(
      generateAssetMap({ output: join(fixture, "asset-map.json"), root: fixture }),
      { message: "ASSET_RESOLVER_UNRESOLVED" },
    );
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given an installed core at 0.82.0, when its package closure is verified, then it rejects with the pinned-core code", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-core-version-"));
  try {
    await writeFile(join(fixture, "package.json"), JSON.stringify({ bundledDependencies: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "@modelcontextprotocol/sdk"], dependencies: { "@earendil-works/pi-coding-agent": "0.82.1", "@earendil-works/pi-tui": "0.82.1", "@modelcontextprotocol/sdk": "1.30.0" }, devDependencies: { npm: "11.18.0" }, packageManager: "npm@11.18.0" }));
    await writeFile(join(fixture, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies: { "@earendil-works/pi-coding-agent": "0.82.1", "@earendil-works/pi-tui": "0.82.1", "@modelcontextprotocol/sdk": "1.30.0" }, devDependencies: { npm: "11.18.0" } } } }));
    await mkdir(join(fixture, "node_modules", "@earendil-works", "pi-coding-agent"), { recursive: true });
    await writeFile(join(fixture, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"), JSON.stringify({ version: "0.82.0" }));
    assert.equal((await verifyPackageClosure({ root: fixture })).code, "PACKAGE_CORE_VERSION_MISMATCH");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a tarball without bundled pi, when its physical closure is verified, then it rejects", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-tarball-closure-"));
  try {
    const tarball = join(fixture, "empty.tgz");
    await writeFile(join(fixture, "package.json"), "{}\n");
    (await import("node:child_process")).execFileSync("tar", ["-czf", tarball, "-C", fixture, "package.json"]);
    assert.equal((await verifyTarballClosure({ root: fixture, tarball })).code, "PACKAGE_TARBALL_CLOSURE_INVALID");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
