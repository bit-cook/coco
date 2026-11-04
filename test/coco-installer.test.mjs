import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, mkdir, readFile, readlink, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { COCO_VERSION } from "../scripts/coco-runtime-identity.mjs";

const cocoRoot = new URL("..", import.meta.url).pathname;
const installers = [join(cocoRoot, "install.sh")];
const uninstaller = join(cocoRoot, "uninstall.sh");
const publicBaseUrls = {
  agnes: "https://apihub.agnes-ai.com/v1",
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com/openai/v1",
  idepub: "https://api.ide.pub/v1",
  stepfun: "https://api.stepfun.com/step_plan/v1",
  "stepfun-cn": "https://api.stepfun.com/v1",
};
const agnesAssetUrl = "https://github.com/bit-cook/coco/releases/download/installer-v0.1.1.1/agnes.key";
const agnesAssetDigest = "4d78028a0a60a7d752e6e57cbcb3113e9de99ab81bde608a0b9610a83cd42f6e";
const syntheticAgnesKey = "a".repeat(51);
const groqAssetUrl = "https://github.com/bit-cook/coco/releases/download/installer-v1.0.0/groq.key";
const groqAssetDigest = "f0c38aeca0d88069f89a7cb1f06eea0fd40fddb794a0154d0116830feefedfc0";
const syntheticGroqKey = "g".repeat(55);

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
  const groqAsset = join(server, "groq.key");
  const packageRoot = join(root, "package");
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  await mkdir(join(packageRoot, "node_modules"), { recursive: true });
  await mkdir(join(packageRoot, "resources"), { recursive: true });
  await mkdir(bin);
  await symlink(process.execPath, join(bin, "node"));
  await mkdir(server);
  await writeFile(join(packageRoot, "bin", "coco"), "#!/usr/bin/env bash\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\n");
  await writeFile(join(packageRoot, "resources", "provider-registry.v1.json"), JSON.stringify({ providers: Object.fromEntries(Object.entries(publicBaseUrls).map(([provider, baseUrl]) => [provider, { api: "openai-completions", authHeader: true, baseUrl, compat: provider === "deepseek" ? { supportsDeveloperRole: false, supportsReasoningEffort: true } : {} }])), schemaVersion: 1 }));
  await writeFile(join(packageRoot, "resources", "provider-model-seeds.v1.json"), await readFile(join(cocoRoot, "resources", "provider-model-seeds.v1.json")));
  await writeFile(join(packageRoot, "resources", "append-system-v1.md"), "CoCo managed prompt.\n");
  await chmod(join(packageRoot, "bin", "coco"), 0o755);
  await exec("tar", ["-czf", tarball, "package"], { cwd: root });
  await writeChecksum(tarball);
  await writeFile(agnesAsset, `${syntheticAgnesKey}\n`);
  await writeFile(groqAsset, `${syntheticGroqKey}\n`);
  const downloader = "#!/usr/bin/env bash\nset -euo pipefail\nfor ((i = 1; i <= $#; i += 1)); do\n  if [ \"${!i}\" = \"-o\" ] || [ \"${!i}\" = \"-O\" ]; then\n    next=$((i + 1))\n    target=\"${!next}\"\n    url=\"${!#}\"\n    printf '%s\\n' \"$url\" >> \"$COCO_TEST_DOWNLOAD_LOG\"\n    case \"$url\" in\n      *agnes.key) [ \"${COCO_TEST_FAIL_AGNES_DOWNLOAD:-0}\" != 1 ] && cp \"$COCO_TEST_AGNES_ASSET\" \"$target\" ;;\n      *groq.key) [ \"${COCO_TEST_FAIL_GROQ_DOWNLOAD:-0}\" != 1 ] && cp \"$COCO_TEST_GROQ_ASSET\" \"$target\" ;;\n      *.sha256*) cp \"$COCO_TEST_SIDECAR\" \"$target\" ;;\n      *) cp \"$COCO_TEST_TARBALL\" \"$target\" ;;\n    esac\n    exit 0\n  fi\ndone\nexit 1\n";
  await writeFile(join(bin, "curl"), downloader);
  await chmod(join(bin, "curl"), 0o755);
  await writeFile(join(bin, "wget"), downloader);
  await chmod(join(bin, "wget"), 0o755);
  await writeFile(join(bin, "sha256sum"), `#!/usr/bin/env bash\nset -euo pipefail\nif [[ "$1" == */agnes.key ]]; then\n  if [ "\${COCO_TEST_BAD_AGNES_DIGEST:-0}" = 1 ]; then printf '%s  %s\\n' "${"0".repeat(64)}" "$1"; else printf '%s  %s\\n' "${agnesAssetDigest}" "$1"; fi\nelif [[ "$1" == */groq.key ]]; then\n  if [ "\${COCO_TEST_BAD_GROQ_DIGEST:-0}" = 1 ]; then printf '%s  %s\\n' "${"0".repeat(64)}" "$1"; else printf '%s  %s\\n' "${groqAssetDigest}" "$1"; fi\nelse\n  /usr/bin/sha256sum "$@"\nfi\n`);
  await chmod(join(bin, "sha256sum"), 0o755);
  return {
    agent,
    bin,
    environment: {
      ...process.env,
        COCO_CACHE_DIR: join(root, "cache"),
        COCO_AGENT_DIR: agent,
        COCO_BIN_DIR: bin,
        COCO_CODING_AGENT_DIR: agent,
        COCO_INSTALL_DIR: install,
      COCO_SYSTEM_BIN: join(root, "system-bin", "coco"),
      COCO_INSTALL_TEST_MODE: "1",
      COCO_TEST_AGNES_ASSET: agnesAsset,
      COCO_TEST_GROQ_ASSET: groqAsset,
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
    assert.equal(source.includes(groqAssetUrl), true);
    assert.equal(source.includes(groqAssetDigest), true);
    assert.equal(source.includes("opencode"), false);
    assert.match(source, /exec "\$COCO_BIN_DIR\/coco" web "\\\$@"/);
    assert.match(source, /cat > "\$COCO_BIN_DIR\/web"/);
    assert.match(source, /cat > "\$COCO_BIN_DIR\/coweb"/);
    assert.doesNotMatch(source, /pi-web/);
  });

  test(`Given a clean home, when ${installer} installs from a verified release artifact, then it writes public models metadata and pinned Agnes auth`, async () => {
    const setup = await fixture();
    try {
      assert.equal(await runInstaller(installer, { ...setup.environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
      await stat(join(setup.install, "node_modules"));
      const models = JSON.parse(await readFile(join(setup.agent, "models.json"), "utf8"));
      const auth = JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8"));
      assert.deepEqual(Object.keys(models.providers).sort(), ["agnes", "deepseek", "groq", "idepub", "stepfun", "stepfun-cn"]);
      assert.deepEqual(Object.fromEntries(Object.entries(models.providers).map(([provider, model]) => [provider, model.baseUrl])), publicBaseUrls);
      assert.deepEqual(models.providers.groq.models.map(({ id }) => id), ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/gpt-oss-safeguard-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]);
      assert.deepEqual(models.providers.deepseek.models, [
        { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: true, input: ["text"], cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" }, thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" } },
        { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", reasoning: true, input: ["text"], cost: { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" }, thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" } },
        { id: "deepseek-flash", name: "DeepSeek Flash", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 },
      ]);
      assert.deepEqual(models.providers.deepseek.compat, { supportsDeveloperRole: false, supportsReasoningEffort: true });
      assert.deepEqual(models.providers.idepub.models.map(({ id }) => id), ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
      assert.deepEqual(models.providers.stepfun.models.map(({ id }) => id), ["step-5-preview", "step-3.7-flash", "step-3.5-flash-2603", "step-3.5-flash"]);
      assert.deepEqual(models.providers["stepfun-cn"].models.map(({ id }) => id), ["step-5-preview", "step-3.7-flash", "step-3.5-flash-2603", "step-3.5-flash"]);
      assert.equal(JSON.stringify(models).includes("apiKey"), false);
      assert.equal(auth.agnes.type, "api_key");
      assert.equal(Buffer.byteLength(await readFile(join(setup.server, "agnes.key"))), 52);
      assert.equal(auth.agnes.key, syntheticAgnesKey);
      assert.equal(Buffer.byteLength(auth.agnes.key), 51);
      assert.equal((await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG, "utf8")).includes(agnesAssetUrl), true);
      assert.equal(auth.groq.type, "api_key");
      assert.equal(Buffer.byteLength(await readFile(join(setup.server, "groq.key"))), 56);
      assert.equal(auth.groq.key, syntheticGroqKey);
      assert.equal(Buffer.byteLength(auth.groq.key), 55);
      assert.equal((await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG, "utf8")).includes(groqAssetUrl), true);
      assert.deepEqual(JSON.parse(await readFile(join(setup.agent, "settings.json"), "utf8")), { defaultModel: "qwen/qwen3.8-27b", defaultProvider: "groq", defaultThinkingLevel: "max", theme: "coco-orange-light/coco-orange" });
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
      assert.deepEqual(JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8")), { agnes: { type: "api_key", key: explicitKey }, groq: { type: "api_key", key: syntheticGroqKey } });
      const downloads = await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG, "utf8");
      assert.equal(downloads.includes(agnesAssetUrl), false);
      assert.equal(downloads.includes(groqAssetUrl), true);
    } finally {
      await rm(setup.root, { force: true, recursive: true });
    }
  });

  test(`Given an explicit Groq key, when ${installer} installs, then Groq is immediately authenticated without a Groq key download`, async () => {
    const setup = await fixture();
    try {
      assert.equal(await runInstaller(installer, { ...setup.environment, GROQ_API_KEY: "test-groq-key", COCO_INSTALL_TEST_MODE: "0" }), 0);
      const auth = JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8"));
      assert.deepEqual(auth.groq, { type: "api_key", key: "test-groq-key" });
      assert.equal((await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG, "utf8")).includes(groqAssetUrl), false);
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

  test(`Given a legacy OpenCode secret, when ${installer} installs, then CoCo no longer imports it`, async () => {
    const setup = await fixture();
    const secret = join(setup.root, ".config", "opencode", "secrets", "achai-api-key");
    try {
      await mkdir(join(secret, ".."), { recursive: true });
      await writeFile(secret, "test-opencode-achai-key\n", { mode: 0o600 });
      assert.equal(await runInstaller(installer, { ...setup.environment, COCO_INSTALL_TEST_MODE: "0" }), 0);
      const auth = JSON.parse(await readFile(join(setup.agent, "auth.json"), "utf8"));
      assert.equal(auth.achai, undefined);
      assert.equal(auth.groq.key, syntheticGroqKey);
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

  for (const failureMode of ["COCO_TEST_FAIL_AGNES_DOWNLOAD", "COCO_TEST_BAD_AGNES_DIGEST", "COCO_TEST_FAIL_GROQ_DOWNLOAD", "COCO_TEST_BAD_GROQ_DIGEST"]) {
    test(`Given a fresh auth store and ${failureMode}, when ${installer} fails to retrieve a verified embedded provider key, then it rolls back the installation`, async () => {
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
      // 空缓存目录：强制走下载路径（缓存命中会合法复用已验证的旧包，绕过损坏源）
      assert.notEqual(await runInstaller(installer, { ...setup.environment, COCO_CACHE_DIR: join(setup.root, "cache-empty") }), 0);
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
      assert.notEqual(await runInstaller(installer, { ...setup.environment, COCO_CACHE_DIR: join(setup.root, "cache-empty") }), 0);
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
      assert.notEqual(await runInstaller(installer, { ...setup.environment, COCO_CACHE_DIR: join(setup.root, "cache-empty") }), 0);
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

test("Given a binary directory outside PATH, when the installer runs, then it links coco into a writable PATH directory so the current shell can launch it", async () => {
  // 一键脚本（curl | bash）里安装器是当前 shell 的子进程，改不了父 shell 的环境，
  // rc 块只对之后启动的新 shell 生效。安装器必须把 shim 链到一个"当前 PATH 已包含
  // 且可写"的目录——PATH 查找即时生效，装完当前终端输入 coco 即可启动，零手动操作。
  const setup = await fixture();
  const userBin = join(setup.root, "userbin");
  const pathBin = join(setup.root, "pathbin");
  try {
    await mkdir(userBin);
    await mkdir(pathBin);
    const environment = {
      ...setup.environment,
      COCO_BIN_DIR: userBin,
      PATH: `${pathBin}:${setup.environment.PATH}`,
      COCO_INSTALL_TEST_MODE: "0",
    };
    assert.equal(await runInstaller(installers[0], environment), 0);
    const link = join(pathBin, "coco");
    assert.equal((await lstat(link)).isSymbolicLink(), true, "coco must be a symlink in the PATH directory");
    assert.equal(await readlink(link), join(userBin, "coco"));
    await access(link, constants.X_OK);
    await lstat(join(userBin, "coco"));
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});

test("Given a foreign coco in a PATH directory, when the installer runs, then it preserves it and links into the next writable directory", async () => {
  const setup = await fixture();
  const userBin = join(setup.root, "userbin");
  const pathBin = join(setup.root, "pathbin");
  try {
    await mkdir(userBin);
    await mkdir(pathBin);
    const foreign = join(pathBin, "coco");
    await writeFile(foreign, "#!/usr/bin/env bash\necho foreign\n");
    await chmod(foreign, 0o755);
    const environment = {
      ...setup.environment,
      COCO_BIN_DIR: userBin,
      PATH: `${pathBin}:${setup.environment.PATH}`,
      COCO_INSTALL_TEST_MODE: "0",
    };
    assert.equal(await runInstaller(installers[0], environment), 0);
    assert.equal(await readFile(foreign, "utf8"), "#!/usr/bin/env bash\necho foreign\n");
    assert.equal(await readlink(join(setup.bin, "coco")), join(userBin, "coco"));
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});

test("Given a coco auto-linked outside its bin dir, when CoCo is uninstalled, then the link is removed and uninstallation succeeds", async () => {
  const setup = await fixture();
  const userBin = join(setup.root, "userbin");
  const pathBin = join(setup.root, "pathbin");
  try {
    await mkdir(userBin);
    await mkdir(pathBin);
    const environment = {
      ...setup.environment,
      COCO_BIN_DIR: userBin,
      PATH: `${pathBin}:${setup.environment.PATH}`,
      COCO_INSTALL_TEST_MODE: "0",
    };
    assert.equal(await runInstaller(installers[0], environment), 0);
    await lstat(join(pathBin, "coco"));
    assert.equal(await runInstaller(uninstaller, environment), 0);
    await assert.rejects(lstat(join(pathBin, "coco")));
    await assert.rejects(lstat(join(userBin, "coco")));
    await assert.rejects(lstat(setup.install));
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});

test("Given a one-key install with the default bin dir, when CoCo is uninstalled without environment overrides, then the auto-link and the launcher are both removed", async () => {
  // 真实一键流程：安装器用非 root 默认 ~/.local/bin，用户卸载时不带任何环境变量
  // （历史 bug：卸载端扫描曾依赖 COCO_BIN_DIR，默认空 -> 扫描被跳过，/usr/local/bin
  //  里的自动链接成悬挂链接残留）。
  const setup = await fixture();
  const pathBin = join(setup.root, "pathbin");
  const userBin = join(setup.root, ".local", "bin");
  try {
    await mkdir(pathBin);
    const installEnv = { ...setup.environment, COCO_BIN_DIR: userBin, PATH: `${pathBin}:${setup.environment.PATH}`, COCO_INSTALL_TEST_MODE: "0" };
    assert.equal(await runInstaller(installers[0], installEnv), 0);
    assert.equal(await readlink(join(pathBin, "coco")), join(userBin, "coco"));
    const { COCO_BIN_DIR: _omitted, ...baseEnv } = setup.environment;
    // 卸载沿用安装时的 PATH（真实一键流程：同一 shell 环境），仅去掉 COCO_BIN_DIR
    const uninstallEnv = { ...baseEnv, PATH: `${pathBin}:${setup.environment.PATH}` };
    assert.equal(await runInstaller(uninstaller, uninstallEnv), 0);
    await assert.rejects(lstat(join(pathBin, "coco")));
    await assert.rejects(lstat(join(userBin, "coco")));
    await assert.rejects(lstat(setup.install));
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});

test("Given rc files carrying the installer PATH block, when CoCo is uninstalled, then the block is removed", async () => {
  // install.sh 在非 root 安装时往 rc 写 "# >>> coco >>>" 幂等 PATH 块；卸载必须
  // 同步摘除，否则 rc 里残留指向已不存在目录的 export（v1.0.0 缺口，新机实测发现）。
  // 注：CI/root 下安装器本身跳过 rc 分支（id -u = 0），故这里直接验证删除逻辑。
  const setup = await fixture();
  try {
    await mkdir(join(setup.install, "bin"), { recursive: true });
    await mkdir(join(setup.install, "resources"), { recursive: true });
    await mkdir(join(setup.install, "node_modules"), { recursive: true });
    await writeFile(join(setup.install, "bin", "coco"), "#!/usr/bin/env bash\n");
    await writeFile(join(setup.install, "resources", "provider-registry.v1.json"), "{}\n");
    await writeFile(join(setup.install, ".coco-install-owner"), "coco-install-v1\n");
    await chmod(join(setup.install, "bin", "coco"), 0o755);
    const block = '\n# >>> coco >>>\nexport PATH="/opt/coco/bin:$PATH"\n# <<< coco <<<\n';
    for (const rc of [".bashrc", ".profile", ".zshrc"]) {
      await writeFile(join(setup.root, rc), `# pre-existing\nexport FOO=1${block}`);
    }
    assert.equal(await runInstaller(uninstaller, setup.environment), 0);
    for (const rc of [".bashrc", ".profile", ".zshrc"]) {
      const text = await readFile(join(setup.root, rc), "utf8");
      assert.doesNotMatch(text, /# >>> coco >>>/, `${rc} 应摘除起始标记`);
      assert.doesNotMatch(text, /# <<< coco <<</, `${rc} 应摘除结束标记`);
      assert.doesNotMatch(text, /coco/, `${rc} 不应再提及 coco`);
      assert.match(text, /export FOO=1/, `${rc} 的原有内容应保留`);
    }
    await assert.rejects(lstat(setup.install));
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

test("Given the release version surfaces, when they are compared, then package.json, product manifest, generated identity, installer default, and bootstrapper default all agree", async () => {
  // 历史 bug（v0.8.1）：package.json 与安装器默认值升到 0.8.1，但
  // product-manifest.v1.json 留在 0.8.0——测试按 0.8.0 写 sidecar 文件名、
  // 安装器按 0.8.1 校验，整个安装器测试套件 20/26 红，且无守卫发现。
  const pkg = JSON.parse(await readFile(join(cocoRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(cocoRoot, "resources", "product-manifest.v1.json"), "utf8"));
  const installerSource = await readFile(installers[0], "utf8");
  const bootstrapperSource = await readFile(join(cocoRoot, "site", "install.sh"), "utf8");
  const installerDefault = /^COCO_VERSION="\$\{COCO_VERSION:-([0-9]+\.[0-9]+\.[0-9]+)\}"/m.exec(installerSource);
  const bootstrapperDefault = /^DEFAULT_VERSION="([0-9]+\.[0-9]+\.[0-9]+)"/m.exec(bootstrapperSource);
  assert.ok(installerDefault, "installer must declare a default COCO_VERSION");
  assert.ok(bootstrapperDefault, "bootstrapper must declare a DEFAULT_VERSION");
  assert.equal(pkg.version, manifest.product.version);
  assert.equal(COCO_VERSION, pkg.version);
  assert.equal(installerDefault[1], pkg.version);
  assert.equal(bootstrapperDefault[1], pkg.version);
});

test("Given a release archive whose bin/coco lost its executable bit, when the installer runs, then it restores the bit and installs", async () => {
  // 历史 bug：v0.8.1 发布包把 package/bin/coco 打成 644（发布管线丢模式），
  // --no-same-permissions 解包后 validate_candidate 的 -x 检查必败。
  // 安装器必须不信任归档模式，解包后强制补可执行位。
  const setup = await fixture();
  try {
    await chmod(join(setup.root, "package", "bin", "coco"), 0o644);
    await exec("tar", ["-czf", setup.environment.COCO_TEST_TARBALL, "package"], { cwd: setup.root });
    await writeChecksum(setup.environment.COCO_TEST_TARBALL);
    assert.equal(await runInstaller(installers[0], { ...setup.environment, COCO_CACHE_DIR: join(setup.root, "cache-empty") }), 0);
    await stat(join(setup.install, "bin", "coco"));
    await access(join(setup.install, "bin", "coco"), constants.X_OK);
  } finally {
    await rm(setup.root, { force: true, recursive: true });
  }
});

test("Given the public bootstrapper, when parsed by POSIX sh, then it contains no bash-only syntax", async () => {
  // 历史 bug：引导器曾用 bash 数组（GH_PROXIES=(...) / urls+=(...)），
  // AgentBoot 以 sh 执行安装脚本，第一个数组赋值处即 Syntax error。
  // Ubuntu 的 sh 即 dash，是 POSIX 兼容性的有效裁判。
  const bootstrapper = join(cocoRoot, "site", "install.sh");
  await exec("sh", ["-n", bootstrapper]);
  const source = await readFile(bootstrapper, "utf8");
  assert.equal(/^\s*[A-Za-z_][A-Za-z0-9_]*=\(/m.test(source), false, "bootstrapper must not use bash arrays");
  assert.equal(/\$\{[A-Za-z_][A-Za-z0-9_]*\[@\]\}/.test(source), false, "bootstrapper must not expand bash arrays");
});
