import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { localNpmCli } from "../scripts/bootstrap-npm.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

test("Given the public package contract, when Coco is packed, then only release-safe files are included", async () => {
  const output = await mkdtemp(join(tmpdir(), "coco-release-package-"));
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const { version } = packageJson;
    const { stdout } = await exec(process.execPath, [localNpmCli(root), "pack", "--json", "--pack-destination", output], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    const [{ filename }] = JSON.parse(stdout);
    const { stdout: members } = await exec("tar", ["-tzf", join(output, filename)], { maxBuffer: 64 * 1024 * 1024 });
    const paths = members.split("\n").filter(Boolean);

    assert.equal(paths.includes("package/LICENSE"), true);
    assert.equal(paths.includes("package/NOTICE"), true);
    assert.equal(paths.includes("package/install.sh"), true);
    assert.equal(paths.includes("package/uninstall.sh"), true);
    assert.equal(paths.includes("package/documentation/en/README.md"), true);
    assert.equal(paths.includes("package/scripts/protected-baseline.json"), true);
    assert.equal(paths.includes("package/scripts/protected-baseline.json.sha256"), true);
    assert.equal(paths.some((path) => path.includes("/logs/")), false);
    assert.equal(paths.some((path) => path.includes("qa-task-")), false);
    assert.equal(paths.some((path) => path.includes(".omo")), false);

    const extracted = join(output, "extracted");
    await mkdir(extracted);
    await exec("tar", ["-xzf", join(output, filename), "-C", extracted]);
    const packagedRoot = join(extracted, "package");
    await exec(process.execPath, ["--input-type=module", "--eval", 'import * as providerSync from "./scripts/provider-sync.mjs"; if ("syncProviderModelsFromSourceFixture" in providerSync) process.exit(1);'], {
      cwd: packagedRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    const { stdout: candidateVersion } = await exec(process.execPath, [join(extracted, "package", "bin", "coco"), "--version"], {
      env: { ...process.env, COCO_CODING_AGENT_DIR: join(output, "agent") },
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(candidateVersion.trim(), version);

    const { stdout: checksum } = await exec("sha256sum", [filename], { cwd: output });
    const sidecar = `${filename}.sha256`;
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(checksum, new RegExp(`^[a-f0-9]{64}  ${escapedFilename}\\n$`));
    await writeFile(join(output, sidecar), checksum);
    await exec("sha256sum", ["--check", sidecar], { cwd: output });
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("Given release workflows, when package sidecars are generated, then GNU checksums name only the tarball", async () => {
  for (const workflowName of ["ci.yml", "release.yml"]) {
    const workflow = await readFile(join(root, ".github", "workflows", workflowName), "utf8");
    assert.match(workflow, /working-directory: release\n\s+run: sha256sum coco-\*\.tgz > coco-\$\(node -p "require\('\.\.\/package\.json'\)\.version"\)\.tgz\.sha256/);
  }
});

test("Given release workflows, when runtime tests execute, then the patched runtime build precedes them", async () => {
  for (const workflowName of ["ci.yml", "release.yml"]) {
    const workflow = await readFile(join(root, ".github", "workflows", workflowName), "utf8");
    const build = workflow.indexOf("- run: npm run build");
    const test = workflow.indexOf("- run: npm test");
    assert.notEqual(build, -1);
    assert.notEqual(test, -1);
    assert.ok(build < test);
  }
});

test("Given the v0.1.1 release contract, when public release surfaces are inspected, then every version and package artifact is consistent", async () => {
  const version = "0.1.1";
  const [packageJson, packageLock, installer, readme, englishReadme, chineseReadme, ciWorkflow, releaseWorkflow] = await Promise.all([
    readFile(join(root, "package.json"), "utf8"),
    readFile(join(root, "package-lock.json"), "utf8"),
    readFile(join(root, "install.sh"), "utf8"),
    readFile(join(root, "README.md"), "utf8"),
    readFile(join(root, "documentation", "en", "README.md"), "utf8"),
    readFile(join(root, "documentation", "zh-CN", "README.md"), "utf8"),
    readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"),
    readFile(join(root, ".github", "workflows", "release.yml"), "utf8"),
  ]);

  assert.equal(JSON.parse(packageJson).version, version);
  assert.equal(JSON.parse(packageLock).version, version);
  assert.match(installer, new RegExp(`COCO_VERSION="\\$\\{COCO_VERSION:-${version}\\}"`));
  for (const document of [readme, englishReadme, chineseReadme]) {
    assert.match(document, new RegExp(`releases/download/v${version}/install\\.sh`));
    assert.match(document, new RegExp(`COCO_VERSION=${version} bash install\\.sh`));
  }
  assert.match(packageJson, /tarball:'coco-'\+require\('\.\/package\.json'\)\.version\+'\.tgz'/);
  assert.match(ciWorkflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  for (const workflow of [ciWorkflow, releaseWorkflow]) {
    assert.match(workflow, /coco-\$\(node -p "require\('\.\.\/package\.json'\)\.version"\)\.tgz\.sha256/);
  }
});
