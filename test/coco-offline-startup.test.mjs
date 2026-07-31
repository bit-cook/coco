import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

async function run(command, args, environment) {
  return await new Promise((finish) => {
    const child = spawn(command, args, { env: environment, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("close", (code) => finish({ code, stderr, stdout }));
  });
}

async function bootstrapFixture() {
  const directory = await mkdtemp(join(tmpdir(), "coco-offline-bootstrap-"));
  const scripts = join(directory, "scripts");
  const resources = join(directory, "resources");
  await Promise.all([mkdir(scripts), mkdir(resources), mkdir(join(directory, "bin")), mkdir(join(directory, "dist")), mkdir(join(directory, "docs")), mkdir(join(directory, "examples")), mkdir(join(directory, "node_modules"))]);
  await writeFile(join(directory, "CHANGELOG.md"), "\n");
  await writeFile(join(directory, "README.md"), "\n");
  await writeFile(join(directory, "package.json"), "{}\n");
  await writeFile(join(scripts, "coco-bootstrap.cjs"), await readFile(join(root, "scripts", "coco-bootstrap.cjs"), "utf8"));
  await writeFile(join(scripts, "coco-launcher.mjs"), 'process.stdout.write(`${process.env.PI_OFFLINE ?? "unset"}\\n`);\n');
  const { createHash } = await import("node:crypto");
  const manifestPaths = ["CHANGELOG.md", "README.md", "package.json", "scripts/coco-launcher.mjs"];
  const entries = await Promise.all(manifestPaths.map(async (path) => ({ path, sha256: createHash("sha256").update(await readFile(join(directory, path))).digest("hex") })));
  const manifest = { assetMapSha256: "0".repeat(64), entries };
  const bytes = `${JSON.stringify(manifest)}\n`;
  await writeFile(join(resources, "runtime-integrity-manifest.v1.json"), bytes);
  await writeFile(join(resources, "runtime-integrity-manifest.v1.json.sha256"), `${createHash("sha256").update(bytes).digest("hex")}  runtime-integrity-manifest.v1.json\n`);
  await chmod(join(scripts, "coco-bootstrap.cjs"), 0o644);
  return directory;
}

async function installedStartupFixture() {
  const directory = await mkdtemp(join(tmpdir(), "coco-offline-startup-"));
  const home = join(directory, "home");
  const path = join(directory, "path");
  const preload = join(directory, "hostile-fetch.cjs");
  await Promise.all([mkdir(home), mkdir(path)]);
  await writeFile(preload, 'globalThis.fetch = () => { throw new Error("NETWORK_ATTEMPT"); };\n');
  return { directory, home, path, preload };
}

for (const explicitValue of ["0", "false"]) {
  test(`Given PI_OFFLINE=${explicitValue}, when Coco enters its trusted bootstrap, then it preserves the user's startup-network opt-in`, async () => {
    const fixture = await bootstrapFixture();
    try {
      const result = await run(process.execPath, [join(fixture, "scripts", "coco-bootstrap.cjs")], { ...process.env, COCO_CODING_AGENT_DIR: join(fixture, "agent"), PI_OFFLINE: explicitValue });
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout, `${explicitValue}\n`);
    } finally {
      await rm(fixture, { force: true, recursive: true });
    }
  });
}

test("Given PI_OFFLINE is unset, when Coco enters its trusted bootstrap, then it enables the upstream offline contract before the launcher imports", async () => {
  const fixture = await bootstrapFixture();
  try {
    const environment = { ...process.env, COCO_CODING_AGENT_DIR: join(fixture, "agent") };
    delete environment.PI_OFFLINE;
    const result = await run(process.execPath, [join(fixture, "scripts", "coco-bootstrap.cjs")], environment);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "1\n");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a bare installed Coco PTY with missing fd and rg, when startup begins without PI_OFFLINE, then it neither downloads tools nor invokes fetch", async () => {
  const fixture = await installedStartupFixture();
  try {
    const environment = {
      ...process.env,
      COCO_CODING_AGENT_DIR: join(fixture.home, ".coco", "agent"),
      HOME: fixture.home,
      NODE_OPTIONS: `--require=${fixture.preload}`,
      PATH: fixture.path,
      TERM: "xterm-256color",
    };
    delete environment.PI_OFFLINE;
    const result = await run("/usr/bin/timeout", ["15", "/usr/bin/script", "-qfec", `${process.execPath} ${join(root, "bin", "coco")}`, "/dev/null"], environment);
    assert.match(`${result.stdout}${result.stderr}`, /Offline mode enabled, skipping download/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Downloading|installed to|NETWORK_ATTEMPT/);
    await assert.rejects(stat(join(fixture.home, ".coco", "agent", "bin", "fd")));
    await assert.rejects(stat(join(fixture.home, ".coco", "agent", "bin", "rg")));
  } finally {
    await rm(fixture.directory, { force: true, recursive: true });
  }
});
