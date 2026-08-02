import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const cocoRoot = new URL("..", import.meta.url).pathname;
const installers = [join(cocoRoot, "install.sh")];
const publicBaseUrls = {
  achai: "https://www.achai.cc/v1",
  agnes: "https://apihub.agnes-ai.com/v1",
  idepub: "https://ai.ide.pub/v1",
  stepfun: "https://api.stepfun.com/step_plan/v1",
};
const agnesAssetUrl = "https://github.com/aithernexus/coco/releases/download/installer-v0.1.1.1/agnes.key";
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
  await writeFile(`${tarball}.sha256`, `${digest}  coco-0.1.3.tgz\n`);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-installer-"));
  const server = join(root, "server");
  const install = join(root, "install");
  const agent = join(install, "agent");
  const bin = join(root, "bin");
  const tarball = join(server, "coco-0.1.3.tgz");
  const agnesAsset = join(server, "agnes.key");
  const packageRoot = join(root, "package");
  await mkdir(join(packageRoot, "bin"), { recursive: true });
  await mkdir(join(packageRoot, "node_modules"), { recursive: true });
  await mkdir(join(packageRoot, "resources"), { recursive: true });
  await mkdir(bin);
  await mkdir(server);
  await writeFile(join(packageRoot, "bin", "coco"), "#!/usr/bin/env bash\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\n");
  await writeFile(join(packageRoot, "resources", "provider-registry.v1.json"), JSON.stringify({ providers: Object.fromEntries(Object.entries(publicBaseUrls).map(([provider, baseUrl]) => [provider, { api: "openai-completions", authHeader: true, baseUrl, compat: {} }])), schemaVersion: 1 }));
  await chmod(join(packageRoot, "bin", "coco"), 0o755);
  await exec("tar", ["-czf", tarball, "package"], { cwd: root });
  await writeChecksum(tarball);
  await writeFile(agnesAsset, `${syntheticAgnesKey}\n`);
  const downloader = "#!/usr/bin/env bash\nset -euo pipefail\nfor ((i = 1; i <= $#; i += 1)); do\n  if [ \"${!i}\" = \"-o\" ] || [ \"${!i}\" = \"-O\" ]; then\n    next=$((i + 1))\n    target=\"${!next}\"\n    url=\"${!#}\"\n    printf '%s\\n' \"$url\" >> \"$COCO_TEST_DOWNLOAD_LOG\"\n    case \"$url\" in\n      *agnes.key) [ \"${COCO_TEST_FAIL_AGNES_DOWNLOAD:-0}\" != 1 ] && cp \"$COCO_TEST_AGNES_ASSET\" \"$target\" ;;\n      *.sha256) cp \"$COCO_TEST_SIDECAR\" \"$target\" ;;\n      *) cp \"$COCO_TEST_TARBALL\" \"$target\" ;;\n    esac\n    exit 0\n  fi\ndone\nexit 1\n";
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
      COCO_INSTALL_TEST_MODE: "1",
      COCO_TEST_AGNES_ASSET: agnesAsset,
      COCO_TEST_DOWNLOAD_LOG: join(root, "downloads.log"),
      COCO_TEST_SIDECAR: join(server, "coco-0.1.3.tgz.sha256"),
      COCO_TEST_TARBALL: tarball,
      HOME: root,
      PATH: `${bin}:${process.env.PATH}`,
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
    assert.match(source, /https:\/\/github\.com\/aithernexus\/coco\/releases\/download\/v\$\{COCO_VERSION\}/);
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
      assert.deepEqual(Object.keys(models.providers).sort(), ["achai", "agnes", "idepub", "stepfun"]);
      assert.deepEqual(Object.fromEntries(Object.entries(models.providers).map(([provider, model]) => [provider, model.baseUrl])), publicBaseUrls);
      assert.deepEqual(models.providers.idepub.models.map(({ id }) => id), ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
      assert.deepEqual(models.providers.stepfun.models.map(({ id }) => id), ["step-3.7-flash", "step-3.5-flash-2603", "step-3.5-flash"]);
      assert.equal(JSON.stringify(models).includes("apiKey"), false);
      assert.equal(auth.agnes.type, "api_key");
      assert.equal(Buffer.byteLength(await readFile(join(setup.server, "agnes.key"))), 52);
      assert.equal(auth.agnes.key, syntheticAgnesKey);
      assert.equal(Buffer.byteLength(auth.agnes.key), 51);
      assert.equal((await readFile(setup.environment.COCO_TEST_DOWNLOAD_LOG, "utf8")).includes(agnesAssetUrl), true);
      assert.deepEqual(JSON.parse(await readFile(join(setup.agent, "settings.json"), "utf8")), { defaultModel: "agnes-2.5-flash", defaultProvider: "agnes", defaultThinkingLevel: "max" });
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
      await writeFile(join(setup.server, "coco-0.1.3.tgz.sha256"), `${"0".repeat(64)}  coco-0.1.3.tgz\n`);
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
