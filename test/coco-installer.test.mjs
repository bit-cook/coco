import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, mkdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { COCO_VERSION } from "../scripts/coco-runtime-identity.mjs";

const cocoRoot = new URL("..", import.meta.url).pathname;
const installers = [join(cocoRoot, "install.sh")];
const uninstaller = join(cocoRoot, "uninstall.sh");
const publicBaseUrls = {
  achai: "https://www.achai.cc/v1",
  agnes: "https://apihub.agnes-ai.com/v1",
  deepseek: "https://api.deepseek.com",
  idepub: "https://api.ide.pub/v1",
  stepfun: "https://api.stepfun.com/step_plan/v1",
};
const agnesAssetUrl = "https://github.com/bit-cook/coco/releases/download/installer-v0.1.1.1/agnes.key";
const agnesAssetDigest = "4d78028a0a60a7d752e6e57cbcb3113e9de99ab81bde608a0b9610a83cd42f6e";
const syntheticAgnesKey = "a".repeat(51);

async function exec(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    execFile(command, args, options, (error) => error === null ? resolve() : reject(error));
  });
}

async function runInstaller(script, environment) {
  return await new Promise((resolve) => {
    const child = spawn("bash", [script], { env: environment, stdio: "ignore" });
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function runInstallerBounded(script, environment, timeoutMs = 2_000) {
  return await new Promise((resolve) => {
    const child = spawn("bash", [script], { env: environment, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, timedOut: true });
    }, timeoutMs);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, timedOut: false });
    });
  });
}

async function writeChecksum(tarball) {
  const digest = createHash("sha256").update(await readFile(tarball)).digest("hex");
  await writeFile(`${tarball}.sha256`, `${digest}  coco-${COCO_VERSION}.tgz\n`);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-installer-"));
  const server = join(root, "server");
  const install = join(root, "install");
  const agent = join(install, "agent");
  const bin = join(root, "bin");
  const tarball = join(server, `coco-${COCO_VERSION}.tgz`);
  const agnesAsset = join(server, "agnes.key");
  const packageRoot = join(root, "package");
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  await mkdir(join(packageRoot, "node_modules"), { recursive: true });
  await mkdir(join(packageRoot, "resources"), { recursive: true });
  await mkdir(bin);
  await mkdir(server);
  await writeFile(join(packageRoot, "bin", "coco"), "#!/usr/bin/env bash\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\n");
  await writeFile(join(packageRoot, "resources", "provider-registry.v1.json"), JSON.stringify({ providers: Object.fromEntries(Object.entries(publicBaseUrls).map(([provider, baseUrl]) => [provider, { api: "openai-completions", authHeader: true, baseUrl, compat: provider === "deepseek" ? { supportsDeveloperRole: false, supportsReasoningEffort: true } : {} }])), schemaVersion: 1 }));
  await writeFile(join(packageRoot, "resources", "append-system-v1.md"), "CoCo managed prompt.\n");
  await chmod(join(packageRoot, "bin", "coco"), 0o755);
  await exec("tar", ["-czf", tarball, "package"], { cwd: root });
  await writeChecksum(tarball);
  await writeFile(agnesAsset, `${syntheticAgnesKey}\n`);
  const downloader = "#!/usr/bin/env bash\nset -euo pipefail\nfor ((i = 1; i <= $#; i += 1)); do\n  if [ \"${!i}\" = \"-o\" ] || [ \"${!i}\" = \"-O\" ]; then\n    next=$((i + 1))\n    target=\"${!next}\"\n    url=\"${!#}\"\n    printf '%s\\n' \"$url\" >> \"$COCO_TEST_DOWNLOAD_LOG\"\n    case \"$url\" in\n      *agnes.key) [ \"${COCO_TEST_FAIL_AGNES_DOWNLOAD:-0}\" != 1 ] && cp \"$COCO_TEST_AGNES_ASSET\" \"$target\" ;;\n      *.sha256*) cp \"$COCO_TEST_SIDECAR\" \"$target\" ;;\n      *) cp \"$COCO_TEST_TARBALL\" \"$target\" ;;\n    esac\n    exit 0\n  fi\ndone\nexit 1\n";
  await writeFile(join(bin, "curl"), downloader);
  await chmod(join(bin, "curl"), 0o755);
  await writeFile(join(bin, "wget"), downloader);
  await chmod(join(bin, "wget"), 0o755);
  await writeFile(join(bin, "sha256sum"), `#!/usr/bin/env bash\nset -euo pipefail\nif [[ \"$1\" == */agnes.key ]]; then\n  if [ \"\${COCO_TEST_BAD_AGNES_DIGEST:-0}\" = 1 ]; then printf '%s  %s\\n' \"${"0".repeat(64)}\" \"$1\"; else printf '%s  %s\\n' \"${agnesAssetDigest}\" \"$1\"; fi\nelse\n  /usr/bin/sha256sum \"$@\"\nfi\n`);
  await chmod(join(bin, "sha256sum"), 0o755);
  return {
    agent,
    bin,
    environment: {
      ...process.env,
        COCO_AGENT_DIR: agent,
        COCO_BIN_DIR: bin,
        COCO_CODING_AGENT_DIR: agent,
        COCO_INSTALL_DIR: install,
      COCO_SYSTEM_BIN: join(root, "system-bin", "coco"),
      COCO_INSTALL_TEST_MODE: "1",
      COCO_TEST_AGNES_ASSET: agnesAsset,
      COCO_TEST_DOWNLOAD_LOG: join(root, "downloads.log"),
      COCO_TEST_SIDECAR: join(server, `coco-${COCO_VERSION}.tgz.sha256`),
      COCO_TEST_TARBALL: tarball,
      HOME: root,
      PATH: `${bin}:/usr/bin:/bin`,
    },
    install,
    root,
    server,
  };
}

async function addLargeArchiveListing(setup) {
  const memberCount = 6_000;
  const memberName = "x".repeat(200);
  const directory = join(setup.root, "package", "large-listing");
  const firstMember = `package/large-listing/${"0000"}-${memberName}`;
  assert.ok(memberCount * (Buffer.byteLength(firstMember) + 1) > 1024 * 1024);
  assert.ok(memberCount < 100_000);
  await mkdir(directory);
  await Promise.all(Array.from({ length: memberCount }, async (_, index) => {
    await writeFile(join(directory, `${index.toString().padStart(4, "0")}-${memberName}`), "");
  }));
  await exec("tar", ["-czf", setup.environment.COCO_TEST_TARBALL, "package"], { cwd: setup.root });
  await writeChecksum(setup.environment.COCO_TEST_TARBALL);
}

for (const installer of installers) {
  test(`Given ${installer}, when its source is inspected, then it contains neither model API-key fields nor credential-bearing auth defaults`, async () => {
    const source = await readFile(installer, "utf8");
    assert.equal(source.includes("apiKey"), false);
    assert.match(source, /https:\/\/github\.com\/bit-cook\/coco\/releases\/download\/v\$\{COCO_VERSION\}/);
    assert.doesNotMatch(source, /\$\{filename\}(?:\.sha256)?\?v=/);
    assert.equal(source.includes(agnesAssetUrl), true);
    assert.equal(source.includes(agnesAssetDigest), true);
  });

  test(`Given a clean home, when ${installer} installs from a verified release artifact, then it writes public models metadata and pinned Agnes auth`, async () => {
    const setup = await fixture();
    try {
      assert.equal(await runInstaller(installer, { ...setup.environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
      await stat(join(setup.install, "node_modules"));
      const models = JSON.parse(await readFile(join(setup.agent, "models.json"), "utf8"));
      const auth = JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8"));
      assert.deepEqual(Object.keys(models.providers).sort(), ["achai", "agnes", "deepseek", "idepub", "stepfun"]);
      assert.deepEqual(Object.fromEntries(Object.entries(models.providers).map(([provider, model]) => [provider, model.baseUrl])), publicBaseUrls);
      assert.deepEqual(models.providers.achai.models.map(({ id }) => id), ["deepseek-v4-flash", "grok-4.20-0309", "grok-4.20-0309-reasoning", "grok-4.20-multi-agent-0309", "grok-4.3", "grok-4.5", "grok-build-0.1", "grok-chat-fast", "mimo-v2.5", "nemotron-3-ultra", "north-mini-code"]);
      assert.deepEqual(models.providers.deepseek.models, [
        { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"], cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" }, thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" } },
        { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", reasoning: true, input: ["text"], cost: { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" }, thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" } },
      ]);
      assert.deepEqual(models.providers.deepseek.compat, { supportsDeveloperRole: false, supportsReasoningEffort: true });
      assert.deepEqual(models.providers.idepub.models.map(({ id }) => id), ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
      assert.deepEqual(models.providers.stepfun.models.map(({ id }) => id), ["step-3.7-flash", "step-3.5-flash-2603", "step-3.5-flash"]);
      assert.equal(JSON.stringify(models).includes("apiKey"), false);
      assert.equal(auth.agnes.type, "api_key");
      assert.equal(Buffer.byteLength(await readFile(join(setup.server, "agnes.key"))), 52);
      assert.equal(auth.agnes.key, syntheticAgnesKey);
      assert.equal(Buffer.byteLength(auth.agnes.key), 51);
      assert.equal((await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG, "utf8")).includes(agnesAssetUrl), true);
      assert.deepEqual(JSON.parse(await readFile(join(setup.agent, "settings.json"), "utf8")), { defaultModel: "agnes-2.5-flash", defaultProvider: "agnes", defaultThinkingLevel: "max" });
      const ownership = JSON.parse(await readFile(join(setup.agent, "ownership.json"), "utf8"));
      assert.equal(ownership.schemaVersion, 1);
      assert.ok(ownership.managedFiles["models.json"].ownedJsonPointers.includes("/providers/agnes/models"));
      assert.match(ownership.managedFiles["APPEND_SYSTEM.md"].sourceSha256, /^[a-f0-9]{64}$/);
      assert.equal((await stat(join(setup.agent, "models.json"))).mode & 0o777, 0o600);
      assert.equal((await stat(join(setup.agent, "auth.json"))).mode & 0o777, 0o600);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an explicit Agnes key, when ${installer} installs, then only that key is stored`, async () => {
    const setup = await fixture();
    try {
      const explicitKey = "test-agnes-key\n";
      assert.equal(await runInstaller(installer, { ...setup.environment, AGNES_API_KEY: explicitKey, COCO_INSTALL_TEST_MODE: "0" }), 0);
      assert.deepEqual(JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8")), { agnes: { type: "api_key", key: explicitKey } });
      assert.equal((await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG, "utf8")).includes(agnesAssetUrl), false);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an explicit Achai key, when ${installer} installs, then Achai is immediately authenticated`, async () => {
    const setup = await fixture();
    try {
      assert.equal(await runInstaller(installer, { ...setup.environment, ACHAI_API_KEY: "test-achai-key", COCO_INSTALL_TEST_MODE: "0" }), 0);
      const auth = JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8"));
      assert.deepEqual(auth.achai, { type: "api_key", key: "test-achai-key" });
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an explicit DeepSeek key, when ${installer} installs, then DeepSeek is immediately authenticated without a DeepSeek download`, async () => {
    const setup = await fixture();
    try {
      assert.equal(await runInstaller(installer, { ...setup.environment, DEEPSEEK_API_KEY: "test-deepseek-key", COCO_INSTALL_TEST_MODE: "0" }), 0);
      const auth = JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8"));
      assert.deepEqual(auth.deepseek, { type: "api_key", key: "test-deepseek-key" });
      const downloads = await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG, "utf8");
      assert.equal(downloads.includes("deepseek"), false);
      assert.equal((await stat(join(setup.agent, "auth.json"))).mode & 0o777, 0o600);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an existing OpenCode Achai secret, when ${installer} installs, then CoCo imports it without user configuration`, async () => {
    const setup = await fixture();
    const secret = join(setup.root, ".config", "opencode", "secrets", "achai-api-key");
    try {
      await mkdir(join(secret, ".."), { recursive: true });
      await writeFile(secret, "test-opencode-achai-key\n", { mode: 0o600 });
      assert.equal(await runInstaller(installer, { ...setup.environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
      const auth = JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8"));
      assert.deepEqual(auth.achai, { type: "api_key", key: "test-opencode-achai-key" });
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given a safe archive whose member listing exceeds Node's default buffer, when ${installer} validates it, then installation succeeds`, async () => {
    const setup = await fixture();
    try {
      await addLargeArchiveListing(setup);
      assert.equal(await runInstaller(installer, setup.environment), 0);
      await stat(join(setup.install, "large-listing"));
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given existing settings, when ${installer} reinstalls, then settings bytes are preserved`, async () => {
    const setup = await fixture();
    const settings = Buffer.from('{"theme":"user-owned","quietStartup":true}\n');
    try {
      assert.equal(await runInstaller(installer, { ...setup.environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
      await writeFile(join(setup.agent, "settings.json"), settings);
      assert.equal(await runInstaller(installer, { ...setup.environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
      assert.deepEqual(await readFile(join(setup.agent, "settings.json")), settings);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given existing models and auth, when ${installer} reinstalls, then their bytes are preserved`, async () => {
    const setup = await fixture();
    const models = Buffer.from('{"providers":{"user-owned":{}}}\n');
    const auth = Buffer.from('{"user-owned":{"type":"api_key","key":"test-only"}}\n');
    try {
      await mkdir(setup.agent, { recursive: true });
      await writeFile(join(setup.agent, "models.json"), models);
      await writeFile(join(setup.agent, "auth.json"), auth);
      assert.equal(await runInstaller(installer, { ...setup.environment, AGNES_API_KEY: "must-not-replace-existing-auth", COCO_INSTALL_TEST_MODE: "0" }), 0);
      assert.deepEqual(await readFile(join(setup.agent, "models.json")), models);
      assert.deepEqual(await readFile(join(setup.agent, "auth.json")), auth);
      assert.equal((await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG).catch(() => "")).includes(agnesAssetUrl), false);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an existing DeepSeek auth record, when ${installer} reinstalls with DEEPSEEK_API_KEY, then auth bytes remain unchanged`, async () => {
    const setup = await fixture();
    const auth = Buffer.from('{"deepseek":{"type":"api_key","key":"user-owned-deepseek-key"}}\n');
    try {
      await mkdir(setup.agent, { recursive: true });
      await writeFile(join(setup.agent, "auth.json"), auth);
      assert.equal(await runInstaller(installer, { ...setup.environment, DEEPSEEK_API_KEY: "must-not-replace-existing-auth", COCO_INSTALL_TEST_MODE: "0" }), 0);
      assert.deepEqual(await readFile(join(setup.agent, "auth.json")), auth);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  for (const failureMode of ["COCO_TEST_FAIL_AGNES_DOWNLOAD", "COCO_TEST_BAD_AGNES_DIGEST"]) {
    test(`Given a fresh auth store and ${failureMode}, when ${installer} fails to retrieve verified Agnes auth, then it rolls back the installation`, async () => {
      const setup = await fixture();
      try {
        assert.equal(await runInstaller(installer, setup.environment), 0);
        await writeFile(join(setup.install, "runtime-before-agnes-failure"), "preserve\n");
        await rm(join(setup.agent, "auth.json"));
        assert.notEqual(await runInstaller(installer, { ...setup.environment, [failureMode]: "1" }), 0);
        assert.equal(await readFile(join(setup.install, "runtime-before-agnes-failure"), "utf8"), "preserve\n");
        await assert.rejects(readFile(join(setup.agent, "auth.json")));
      } finally {
        await rm(setup.root, { force: true, recursive: true });
      }
    });
  }

  test(`Given a mismatched checksum, when ${installer} runs, then it preserves the current installation and configuration`, async () => {
    const setup = await fixture();
    const settings = Buffer.from('{"theme":"preserve-on-failure"}\n');
    try {
      assert.equal(await runInstaller(installer, setup.environment), 0);
      await writeFile(join(setup.agent, "settings.json"), settings);
      await writeFile(join(setup.install, "installed-before-checksum-failure"), "preserve\n");
      await writeFile(join(setup.server, `coco-${COCO_VERSION}.tgz.sha256`), `${"0".repeat(64)}  coco-${COCO_VERSION}.tgz\n`);
      assert.notEqual(await runInstaller(installer, setup.environment), 0);
      assert.equal(await readFile(join(setup.install, "installed-before-checksum-failure"), "utf8"), "preserve\n");
      assert.deepEqual(await readFile(join(setup.agent, "settings.json")), settings);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an archive with a second package root, when ${installer} runs, then it rejects the archive before changing the current installation`, async () => {
    const setup = await fixture();
    try {
      assert.equal(await runInstaller(installer, setup.environment), 0);
      await writeFile(join(setup.install, "runtime-before-unsafe-archive"), "preserve\n");
      await mkdir(join(setup.root, "other-package"));
      await exec("tar", ["-xzf", setup.environment.COCO_TEST_TARBALL, "-C", setup.root]);
      await exec("tar", ["-czf", setup.environment.COCO_TEST_TARBALL, "package", "other-package"], { cwd: setup.root });
      await writeChecksum(setup.environment.COCO_TEST_TARBALL);
      assert.notEqual(await runInstaller(installer, setup.environment), 0);
      assert.equal(await readFile(join(setup.install, "runtime-before-unsafe-archive"), "utf8"), "preserve\n");
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an archive containing a symlink member, when ${installer} runs, then it rejects the archive before changing the current installation`, async () => {
    const setup = await fixture();
    try {
      assert.equal(await runInstaller(installer, setup.environment), 0);
      await writeFile(join(setup.install, "runtime-before-linked-archive"), "preserve\n");
      await symlink("/outside", join(setup.root, "package", "linked-member"));
      await exec("tar", ["-czf", setup.environment.COCO_TEST_TARBALL, "package"], { cwd: setup.root });
      await writeChecksum(setup.environment.COCO_TEST_TARBALL);
      assert.notEqual(await runInstaller(installer, setup.environment), 0);
      assert.equal(await readFile(join(setup.install, "runtime-before-linked-archive"), "utf8"), "preserve\n");
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  for (const failureSeam of ["COCO_INSTALL_TEST_FAIL_AFTER_SWAP", "COCO_INSTALL_TEST_FAIL_AFTER_LINK"]) {
    test(`Given a nested agent directory, when ${installer} fails at ${failureSeam}, then it restores the prior runtime, config, and binary link`, async () => {
      const setup = await fixture();
      const settings = Buffer.from('{"preserve":"nested-agent"}\n');
      try {
        assert.equal(await runInstaller(installer, setup.environment), 0);
        await writeFile(join(setup.install, "runtime-before-injected-failure"), "preserve\n");
        await writeFile(join(setup.agent, "settings.json"), settings);
        const previousLink = await readFile(join(setup.bin, "coco"), "utf8").catch(() => Buffer.alloc(0));
        assert.notEqual(await runInstaller(installer, { ...setup.environment, COCO_INSTALL_TEST_MODE: "1", [failureSeam]: "1" }), 0);
        assert.equal(await readFile(join(setup.install, "runtime-before-injected-failure"), "utf8"), "preserve\n");
        assert.deepEqual(await readFile(join(setup.agent, "settings.json")), settings);
        assert.equal((await lstat(join(setup.bin, "coco"))).isSymbolicLink(), true);
        assert.deepEqual(await readFile(join(setup.bin, "coco"), "utf8").catch(() => Buffer.alloc(0)), previousLink);
      } finally {
        await rm(setup.root, { force: true, recursive: true });
      }
    });
  }

  test(`Given a symlinked models store, when ${installer} runs, then it rejects the unsafe config path without changing its target`, async () => {
    const setup = await fixture();
    const externalModels = join(setup.root, "external-models.json");
    const models = Buffer.from('{"providers":{"external":{}}}\n');
    try {
      await mkdir(setup.agent, { recursive: true });
      await writeFile(externalModels, models);
      await symlink(externalModels, join(setup.agent, "models.json"));
      assert.notEqual(await runInstaller(installer, setup.environment), 0);
      assert.deepEqual(await readFile(externalModels), models);
      assert.equal((await lstat(join(setup.agent, "models.json"))).isSymbolicLink(), true);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given a symlinked settings store, when ${installer} runs, then it rejects the unsafe config path without changing its target`, async () => {
    const setup = await fixture();
    const externalSettings = join(setup.root, "external-settings.json");
    const settings = Buffer.from('{"outside":true}\n');
    try {
      await mkdir(setup.agent, { recursive: true });
      await writeFile(externalSettings, settings);
      await symlink(externalSettings, join(setup.agent, "settings.json"));
      assert.notEqual(await runInstaller(installer, setup.environment), 0);
      assert.deepEqual(await readFile(externalSettings), settings);
      assert.equal((await lstat(join(setup.agent, "settings.json"))).isSymbolicLink(), true);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given a FIFO settings path and an existing install, when ${installer} runs, then it rejects without hanging or changing prior state`, async () => {
    const setup = await fixture();
    const settingsPath = join(setup.agent, "settings.json");
    try {
      assert.equal(await runInstaller(installer, setup.environment), 0);
      const priorModels = await readFile(join(setup.agent, "models.json"));
      const priorAuth = await readFile(join(setup.agent, "auth.json"));
      await writeFile(settingsPath, '{"preserve":true}\n');
      await writeFile(join(setup.install, "runtime-before-settings-fifo"), "preserve\n");
      await rm(settingsPath);
      await exec("mkfifo", [settingsPath]);
      const result = await runInstallerBounded(installer, setup.environment);
      assert.equal(result.timedOut, false);
      assert.notEqual(result.code, 0);
      assert.equal(await readFile(join(setup.install, "runtime-before-settings-fifo"), "utf8"), "preserve\n");
      assert.deepEqual(await readFile(join(setup.agent, "models.json")), priorModels);
      assert.deepEqual(await readFile(join(setup.agent, "auth.json")), priorAuth);
      assert.equal((await lstat(settingsPath)).isFIFO(), true);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given a symlinked agent directory, when ${installer} runs, then it rejects the path without changing the external state`, async () => {
    const setup = await fixture();
    const externalAgent = join(setup.root, "external-agent");
    const settings = Buffer.from('{"outside":true}\n');
    try {
      await mkdir(externalAgent);
      await writeFile(join(externalAgent, "settings.json"), settings);
      await mkdir(setup.install, { recursive: true });
      await symlink(externalAgent, setup.agent);
      assert.notEqual(await runInstaller(installer, setup.environment), 0);
      assert.deepEqual(await readFile(join(externalAgent, "settings.json")), settings);
      assert.equal((await lstat(setup.agent)).isSymbolicLink(), true);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an agent directory equal to the install directory, when ${installer} runs, then it rejects the destructive configuration path`, async () => {
    const setup = await fixture();
    try {
      assert.notEqual(await runInstaller(installer, { ...setup.environment, COCO_AGENT_DIR: setup.install }), 0);
      await assert.rejects(stat(setup.install));
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });
}

test("Given a custom binary directory, when CoCo is uninstalled, then its launcher and runtime are both removed", async () => {
  const setup = await fixture();
  try {
    assert.equal(await runInstaller(installers[0], { ...setup.environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
    await lstat(join(setup.bin, "coco"));
    assert.equal(await runInstaller(uninstaller, setup.environment), 0);
    await assert.rejects(lstat(join(setup.bin, "coco")));
    await assert.rejects(lstat(setup.install));
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});

test("Given a legacy default v0.1.7 install, when CoCo is uninstalled, then its runtime and managed launcher are removed", async () => {
  const setup = await fixture();
  const install = join(setup.root, ".coco");
  const agent = join(install, "agent");
  const environment = { ...setup.environment, COCO_AGENT_DIR: agent, COCO_CODING_AGENT_DIR: agent, COCO_INSTALL_DIR: install };
  try {
    assert.equal(await runInstaller(installers[0], { ...environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
    await unlink(join(install, ".coco-install-owner"));
    assert.equal(await runInstaller(uninstaller, environment), 0);
    await assert.rejects(lstat(join(setup.bin, "coco")));
    await assert.rejects(lstat(install));
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});

test("Given destructive or unrecognized install paths, when CoCo is uninstalled, then they are preserved", async () => {
  const setup = await fixture();
  const unrelated = join(setup.root, "unrelated");
  const agentParent = join(setup.root, "agent-parent");
  const agent = join(agentParent, "agent");
  try {
    await mkdir(unrelated);
    await mkdir(agent, { recursive: true });
    await writeFile(join(unrelated, "keep"), "preserve\n");
    await writeFile(join(unrelated, ".coco-install-owner"), "coco-install-v1\n");
    for (const [install, environment] of [
      [setup.root, setup.environment],
      [unrelated, setup.environment],
      [agentParent, { ...setup.environment, COCO_AGENT_DIR: agent }],
    ]) {
      assert.notEqual(await runInstaller(uninstaller, { ...environment, COCO_INSTALL_DIR: install }), 0);
      assert.equal(await readFile(join(unrelated, "keep"), "utf8"), "preserve\n");
    }
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});

test("Given an unrelated launcher, when CoCo is uninstalled, then the launcher is preserved", async () => {
  const setup = await fixture();
  const launcher = join(setup.bin, "coco");
  try {
    assert.equal(await runInstaller(installers[0], { ...setup.environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
    await unlink(launcher);
    await writeFile(launcher, "#!/usr/bin/env bash\necho unrelated\n");
    await chmod(launcher, 0o755);
    assert.notEqual(await runInstaller(uninstaller, setup.environment), 0);
    assert.equal(await readFile(launcher, "utf8"), "#!/usr/bin/env bash\necho unrelated\n");
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});
