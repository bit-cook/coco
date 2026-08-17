import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { configureIntranetModel } from "../scripts/configure-intranet-model.mjs";

const exec = promisify(execFile);
const installerSource = new URL("../offline-install.sh", import.meta.url);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bundleMembers = ["coco-package.tgz", "node-runtime.tar.gz", "offline-install.sh", "uninstall.sh", "platform.txt", "README.txt"];

function tarArchive(entries) {
  const blocks = [];
  for (const { body = "", name, type = "0", link = "" } of entries) {
    const content = Buffer.from(body), header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8"); header.write("0000644\0", 100, 8, "ascii"); header.write("0000000\0", 108, 8, "ascii"); header.write("0000000\0", 116, 8, "ascii");
    header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii"); header.write("00000000000\0", 136, 12, "ascii"); header.fill(0x20, 148, 156); header.write(type, 156, 1, "ascii"); header.write(link, 157, 100, "utf8"); header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii");
    const checksum = [...header].reduce((total, byte) => total + byte, 0); header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    blocks.push(header); if (content.length > 0) blocks.push(content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

async function offlineBundle(root, packageArchive, checksumLines, nodeArchive = tarArchive([{ body: "node\n", name: "bin/node" }])) {
  const files = {
    "README.txt": Buffer.from("fixture\n"),
    "coco-package.tgz": packageArchive,
    "node-runtime.tar.gz": nodeArchive,
    "offline-install.sh": await readFile(installerSource),
    "platform.txt": Buffer.from("linux-x64\n"),
    "uninstall.sh": Buffer.from("#!/bin/sh\n"),
  };
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(root, name), bytes);
  const lines = checksumLines ?? bundleMembers.map((name) => `${sha256(files[name])}  ${name}`);
  await writeFile(join(root, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

async function runOfflineInstaller(bundle) {
  const home = join(bundle, "home"); await mkdir(home);
  return await exec("bash", [join(bundle, "offline-install.sh")], { env: { ...process.env, COCO_BIN_DIR: join(home, "bin"), COCO_INSTALL_DIR: join(home, "install"), HOME: home }, timeout: 30_000 });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-offline-model-"));
  await writeFile(join(root, "models.json"), '{"providers":{"existing":{"api":"openai-completions"}}}\n', { mode: 0o600 });
  await writeFile(join(root, "settings.json"), '{}\n', { mode: 0o600 });
  await writeFile(join(root, "auth.json"), '{}\n', { mode: 0o600 });
  return root;
}

test("intranet model configuration preserves existing providers and defaults to an environment credential", async () => {
  const agentDir = await fixture();
  try {
    const result = configureIntranetModel({ agentDir, environment: {
      COCO_INTRANET_BASE_URL: "http://10.0.0.8:8000/v1/",
      COCO_INTRANET_CONTEXT_WINDOW: "65536",
      COCO_INTRANET_MAX_TOKENS: "8192",
      COCO_INTRANET_MODEL_ID: "corp-model",
      COCO_INTRANET_MODEL_NAME: "Corp Model",
      COCO_INTRANET_PROVIDER: "corp-ai",
    } });
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    const settings = JSON.parse(await readFile(join(agentDir, "settings.json"), "utf8"));
    assert.equal(models.providers.existing.api, "openai-completions");
    assert.equal(models.providers["corp-ai"].baseUrl, "http://10.0.0.8:8000/v1");
    assert.equal(models.providers["corp-ai"].apiKey, "$INTRANET_AI_API_KEY");
    assert.equal(models.providers["corp-ai"].models[0].contextWindow, 65536);
    assert.equal(models.providers["corp-ai"].models[0].maxTokens, 8192);
    assert.equal(settings.defaultProvider, "corp-ai");
    assert.equal(settings.defaultModel, "corp-model");
    assert.equal(result.auth, "environment:INTRANET_AI_API_KEY");
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("intranet model configuration stores an explicit stdin key without exposing it in models", async () => {
  const agentDir = await fixture();
  try {
    configureIntranetModel({ agentDir, environment: {
      COCO_INTRANET_BASE_URL: "https://llm.intranet/v1",
      COCO_INTRANET_MODEL_ID: "private-model",
    }, key: "fixture-secret" });
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    const auth = JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8"));
    assert.equal("apiKey" in models.providers.intranet, false);
    assert.deepEqual(auth.intranet, { key: "fixture-secret", type: "api_key" });
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("intranet model configuration rejects conflicts and invalid routing without mutating state", async () => {
  const agentDir = await fixture();
  try {
    const before = await readFile(join(agentDir, "models.json"), "utf8");
    assert.throws(() => configureIntranetModel({ agentDir, environment: {
      COCO_INTRANET_BASE_URL: "file:///tmp/model",
      COCO_INTRANET_MODEL_ID: "model",
    } }), { message: "INTRANET_BASE_URL_INVALID" });
    assert.equal(await readFile(join(agentDir, "models.json"), "utf8"), before);
    assert.throws(() => configureIntranetModel({ agentDir, environment: {
      COCO_INTRANET_BASE_URL: "http://localhost:8000/v1",
      COCO_INTRANET_MODEL_ID: "model",
      COCO_INTRANET_PROVIDER: "existing",
    } }), { message: "INTRANET_PROVIDER_CONFLICT" });
    assert.equal(await readFile(join(agentDir, "models.json"), "utf8"), before);
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("offline installer source has no downloader and forces offline startup", async () => {
  const source = await readFile(new URL("../offline-install.sh", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bcurl\b|\bwget\b|https?:\/\//);
  assert.match(source, /export PI_OFFLINE=1/);
  assert.match(source, /export COCO_CODING_AGENT_DIR/);
  assert.match(source, /SHA256SUMS/);
  assert.match(source, /node-runtime\.tar\.gz/);
  assert.match(source, /configure-intranet-model\.mjs/);
});

test("offline installer requires the exact canonical SHA256SUMS inventory", async () => {
  const cases = [
    ["empty", []],
    ["missing", bundleMembers.slice(0, -1).map((name) => `${"0".repeat(64)}  ${name}`)],
    ["duplicate", [...bundleMembers, "README.txt"].map((name) => `${"0".repeat(64)}  ${name}`)],
    ["extra", [...bundleMembers, "extra.txt"].map((name) => `${"0".repeat(64)}  ${name}`)],
    ["absolute", bundleMembers.map((name, index) => `${"0".repeat(64)}  ${index === 0 ? "/coco-package.tgz" : name}`)],
    ["traversal", bundleMembers.map((name, index) => `${"0".repeat(64)}  ${index === 0 ? "../coco-package.tgz" : name}`)],
  ];
  for (const [label, lines] of cases) {
    const root = await mkdtemp(join(tmpdir(), `coco-offline-checksums-${label}-`));
    try {
      await offlineBundle(root, tarArchive([{ body: "safe\n", name: "package/file" }]), lines);
      await assert.rejects(runOfflineInstaller(root), (error) => /SHA256SUMS/.test(error.stderr));
    } finally { await rm(root, { force: true, recursive: true }); }
  }
});

test("offline installer rejects unsafe tar structure before extraction", async () => {
  const cases = [
    ["absolute", [{ body: "x", name: "/tmp/coco-rel-004-absolute" }]],
    ["traversal", [{ body: "x", name: "../coco-rel-004-traversal" }]],
    ["duplicate", [{ body: "a", name: "package/file" }, { body: "b", name: "package/file" }]],
    ["prefix", [{ body: "a", name: "package/file" }, { body: "b", name: "package/file/child" }]],
    ["symlink", [{ name: "package/link", type: "2", link: "target" }]],
    ["hardlink", [{ name: "package/link", type: "1", link: "target" }]],
    ["special", [{ name: "package/fifo", type: "6" }]],
  ];
  for (const [label, entries] of cases) {
    const root = await mkdtemp(join(tmpdir(), `coco-offline-tar-${label}-`));
    try {
      await offlineBundle(root, tarArchive(entries));
      await assert.rejects(runOfflineInstaller(root), (error) => new RegExp(`package archive .*(unsafe|duplicate|prefix|link|special)`).test(error.stderr));
    } finally { await rm(root, { force: true, recursive: true }); }
  }
});

test("offline installer accepts only safe direct internal Node runtime symlinks", async () => {
  const safe = await mkdtemp(join(tmpdir(), "coco-offline-node-safe-"));
  try {
    const node = tarArchive([
      { body: "node\n", name: "bin/node" },
      { body: "npm\n", name: "lib/node_modules/npm/bin/npm-cli.js" },
      { name: "bin/npm", type: "2", link: "../lib/node_modules/npm/bin/npm-cli.js" },
    ]);
    await offlineBundle(safe, tarArchive([{ body: "safe\n", name: "package/file" }]), undefined, node);
    await assert.rejects(runOfflineInstaller(safe), (error) => !/node-runtime archive/.test(error.stderr));
  } finally { await rm(safe, { force: true, recursive: true }); }

  for (const [label, link, extra = []] of [
    ["absolute", "/outside"],
    ["escape", "../../outside"],
    ["dangling", "../missing"],
    ["chain", "npm-link", [{ name: "bin/npm-link", type: "2", link: "../lib/node_modules/npm/bin/npm-cli.js" }]],
  ]) {
    const root = await mkdtemp(join(tmpdir(), `coco-offline-node-${label}-`));
    try {
      const node = tarArchive([{ body: "node\n", name: "bin/node" }, { body: "npm\n", name: "lib/node_modules/npm/bin/npm-cli.js" }, ...extra, { name: "bin/npm", type: "2", link }]);
      await offlineBundle(root, tarArchive([{ body: "safe\n", name: "package/file" }]), undefined, node);
      await assert.rejects(runOfflineInstaller(root), (error) => /node-runtime archive .*(link|unsafe)/.test(error.stderr));
    } finally { await rm(root, { force: true, recursive: true }); }
  }
});

test("offline installer source enforces compressed, member, cumulative, and member-count archive budgets", async () => {
  const source = await readFile(installerSource, "utf8");
  for (const limit of ["536870912", "50000", "268435456", "1073741824"]) assert.match(source, new RegExp(limit));
});
