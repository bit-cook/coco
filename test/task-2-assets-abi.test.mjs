import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { localNpmCli } from "../scripts/bootstrap-npm.mjs";
import { canonicalJson } from "../scripts/canonical-json.mjs";
import { executeWindowsAbi } from "../scripts/execute-windows-abi.mjs";
import { generateAssetMap, verifyAssetMap } from "../scripts/generate-asset-map.mjs";

const root = new URL("..", import.meta.url).pathname;
const exec = promisify(execFile);

async function pack() {
  await new Promise((resolvePack, rejectPack) => {
    const child = spawn(process.execPath, [localNpmCli(root), "pack", "--json"], { cwd: root, env: { ...process.env, TMPDIR: "/root/.cache/coco-tmp" }, stdio: "ignore" });
    child.once("error", rejectPack);
    child.once("close", (code) => code === 0 ? resolvePack() : rejectPack(new Error(`npm pack exited ${code}`)));
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

test("Given Task-2 runtime producers, when npm packs the project, then tar members exactly equal the canonical asset map without local tools", async () => {
  const generatedDirectory = await mkdtemp(join(tmpdir(), "coco-task-2-pack-map-"));
  const generatedMap = join(generatedDirectory, "assets.json");
  const tarball = join(root, "coco-0.1.1.tgz");
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    assert.ok(packageJson.files.includes("scripts"), "scripts selector must ship all runtime producers and helpers");
    await generateAssetMap({ output: generatedMap, root });
    await pack();
    const map = JSON.parse(await readFile(generatedMap, "utf8"));
    const members = (await tarMembers(tarball)).filter((path) => !path.startsWith("node_modules/"));
    assert.deepEqual(members, map.entries.map((entry) => entry.path).sort());
    assert.ok(members.includes("scripts/package-input-helper.py"));
    assert.ok(members.includes("scripts/npm-bootstrap-runtime.mjs"));
    assert.equal(members.some((path) => path.startsWith(".coco-tools/") || path.includes("__pycache__") || /\.(pyc|pyo)$/.test(path) || path.startsWith("../") || path.startsWith("/")), false);
  } finally {
    await rm(tarball, { force: true });
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
    assert.equal(verifyAssetMap({ actual: [{ ...actual[0], classification: "documentation" }, ...actual.slice(1)], map }).code, "ASSET_MAP_CLASS_MISMATCH");
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
