import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { executeWindowsAbi } from "../scripts/execute-windows-abi.mjs";
import { generateAssetMap, verifyAssetMap } from "../scripts/generate-asset-map.mjs";
import { assertNpmPinParity, packageNpmCli } from "./package-npm-cli.mjs";

const root = new URL("..", import.meta.url).pathname;
const exec = promisify(execFile);

async function pack(destination) {
  const npmCli = await packageNpmCli(root);
  return new Promise((resolvePack, rejectPack) => {
    let stderr = "";
    let stdout = "";
    const child = spawn(process.execPath, [npmCli, "pack", "--json", "--pack-destination", destination], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPack);
    child.once("close", (code) => {
      if (code !== 0) return rejectPack(new Error(`npm pack exited ${code}; captured stderr bytes: ${Buffer.byteLength(stderr)}`));
      try { resolvePack(join(destination, JSON.parse(stdout)[0].filename)); } catch { rejectPack(new Error("npm pack returned invalid JSON")); }
    });
  });
}

async function tarMembers(tarball) {
  const { stdout } = await exec("tar", ["-tzf", tarball], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim().split("\n").filter(Boolean).map((path) => path.replace(/^package\//, "")).sort();
}

test("Given the intended package tree, when its asset map is generated and verified, then every canonical member is proven and accepted", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-2-map-"));
  try {
    const map = await generateAssetMap({ output: join(fixture, "assets.json"), root });
    const actual = map.entries.map(({ class: classification, path }) => ({ classification, path }));
    assert.equal(map.schemaVersion, 2);
    assert.deepEqual(map.entries, [...map.entries].sort((left, right) => left.path.localeCompare(right.path)));
    assert.equal(map.entries.find((entry) => entry.path === "package.json")?.class, "runtime-asset");
    assert.equal(map.entries.find((entry) => entry.path === "README.md")?.class, "runtime-asset");
    assert.equal(map.entries.find((entry) => entry.path === "scripts/execute-windows-abi.mjs")?.proof.source, "static-import");
    assert.ok(map.entries.every((entry) => entry.proof.source === "static-and-runtime-resolver" || entry.proof.source === "static-import"));
    assert.deepEqual(verifyAssetMap({ actual, map }), { status: "approved" });
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given npm ci installed dependencies, when the package npm CLI is resolved and executed, then it is the pinned node_modules CLI without a bootstrap-tool component", async () => {
  const npmCli = await packageNpmCli(root);
  assert.equal(npmCli, join(root, "node_modules", "npm", "bin", "npm-cli.js"));
  assert.equal(npmCli.split("/").includes(".coco-tools"), false);
  const { stdout } = await exec(process.execPath, [npmCli, "--version"]);
  assert.equal(stdout.trim(), "11.18.0");
});

test("Given an npm range or a mismatched lock pin, when package npm parity is validated, then it rejects", () => {
  const valid = {
    installed: { version: "11.18.0" },
    lock: { packages: { "": { devDependencies: { npm: "11.18.0" } }, "node_modules/npm": { version: "11.18.0" } } },
    package: { devDependencies: { npm: "11.18.0" }, packageManager: "npm@11.18.0" },
  };
  assert.throws(() => assertNpmPinParity({ ...valid.package, devDependencies: { npm: "^11.18.0" } }, valid.lock, valid.installed));
  assert.throws(() => assertNpmPinParity(valid.package, { packages: { ...valid.lock.packages, "node_modules/npm": { version: "11.18.1" } } }, valid.installed));
});

test("Given Task-2 runtime producers, when npm packs the project, then tar members exactly equal the canonical asset map without local tools", async () => {
  const generatedDirectory = await mkdtemp(join(tmpdir(), "coco-task-2-pack-map-"));
  const generatedMap = join(generatedDirectory, "assets.json");
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    assert.ok(packageJson.files.includes("scripts"), "scripts selector must ship all runtime producers and helpers");
    await generateAssetMap({ output: generatedMap, root });
    const tarball = await pack(generatedDirectory);
    assert.ok(tarball.startsWith(`${generatedDirectory}/`));
    const map = JSON.parse(await readFile(generatedMap, "utf8"));
    const members = (await tarMembers(tarball)).filter((path) => !path.startsWith("node_modules/"));
    assert.deepEqual(members, map.entries.map((entry) => entry.path).sort());
    assert.ok(members.includes("scripts/package-input-helper.py"));
    assert.ok(members.includes("scripts/npm-bootstrap-runtime.mjs"));
    assert.equal(members.some((path) => path.startsWith(".coco-tools/") || path.includes("__pycache__") || /\.(pyc|pyo)$/.test(path) || path.startsWith("../") || path.startsWith("/")), false);
  } finally {
    await rm(generatedDirectory, { force: true, recursive: true });
  }
});

test("Given an actual tar member set with an escaped, missing, extra, or mismatched member, when verified, then it rejects stably", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-2-tar-"));
  try {
    const map = await generateAssetMap({ output: join(fixture, "assets.json"), root });
    const actual = map.entries.map(({ class: classification, path }) => ({ classification, path }));
    assert.equal(verifyAssetMap({ actual: [...actual, { classification: "runtime-asset", path: "../escape" }], map }).code, "ASSET_MAP_RESOLUTION_ESCAPE");
    assert.equal(verifyAssetMap({ actual: actual.slice(1), map }).code, "ASSET_MAP_MISSING");
    assert.equal(verifyAssetMap({ actual: [...actual, { classification: "runtime-asset", path: "surplus.txt" }], map }).code, "ASSET_MAP_EXTRA");
    const mismatchIndex = actual.findIndex(({ classification }) => classification !== "documentation");
    const mismatched = actual.map((entry, index) => index === mismatchIndex ? { ...entry, classification: "documentation" } : entry);
    assert.notEqual(mismatchIndex, -1);
    assert.equal(verifyAssetMap({ actual: mismatched, map }).code, "ASSET_MAP_CLASS_MISMATCH");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given the canonical ABI fixture, when the adapter executes it, then every versioned call transition is serialized as adapter evidence", async () => {
  const source = join(root, "resources", "windows-native-adapter-abi.v1.json");
  const result = await executeWindowsAbi({ source });
  assert.equal(result.evidenceKind, "adapter");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.transitions[0].id, "openProcessCwd");
  assert.equal(result.transitions.at(-1).id, "closeFsRoot");
  assert.equal(result.identityEncoding, "volume-u64behex16-fileid128-nativebyteshex32");
});

test("Given a canonical-looking ABI with a reordered call, when the adapter executes it, then it rejects with the stable artifact code", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-2-abi-"));
  try {
    const source = join(root, "resources", "windows-native-adapter-abi.v1.json");
    const abi = JSON.parse(await readFile(source, "utf8"));
    [abi.calls[0], abi.calls[1]] = [abi.calls[1], abi.calls[0]];
    const altered = join(fixture, "altered.json");
    await writeFile(altered, canonicalJson(abi));
    await assert.rejects(executeWindowsAbi({ source: altered }), { message: "WINDOWS_ABI_BOOTSTRAP_INVALID" });
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given the canonical ABI fixture with an altered result, when the adapter executes it, then it rejects with the stable artifact code", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-2-abi-result-"));
  try {
    const source = join(root, "resources", "windows-native-adapter-abi.v1.json");
    const abi = JSON.parse(await readFile(source, "utf8"));
    abi.calls[0].expect = "STATUS_ACCESS_DENIED";
    const altered = join(fixture, "altered.json");
    await writeFile(altered, canonicalJson(abi));
    await assert.rejects(executeWindowsAbi({ source: altered }), { message: "WINDOWS_ABI_BOOTSTRAP_INVALID" });
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
