import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { packageNpmCli } from "./package-npm-cli.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

test("Given public release metadata, when the Pages launcher runs, then it executes the newest stable exact-tag installer and rejects malformed metadata", async () => {
  const output = await mkdtemp(join(tmpdir(), "coco-pages-launcher-"));
  try {
    const bin = join(output, "bin");
    const result = join(output, "result");
    const metadata = join(output, "releases.json");
    const installer = join(output, "install.sh");
    await mkdir(bin);
    await writeFile(metadata, '[{"tag_name":"v0.2.1","draft":false,"prerelease":false},{"tag_name":"v0.3.0","draft":false,"prerelease":false},{"tag_name":"v9.0.0","draft":true,"prerelease":false}]\n');
    await writeFile(installer, '#!/usr/bin/env bash\nprintf "%s\\n" "$COCO_VERSION" > "$COCO_TEST_RESULT"\n');
    await writeFile(join(bin, "curl"), '#!/usr/bin/env bash\nset -euo pipefail\nfor argument in "$@"; do\n  case "$argument" in\n    http*) url="$argument" ;;\n    -o) output=1 ;;\n    *) if [ "${output:-0}" = 1 ]; then target="$argument"; output=0; fi ;;\n  esac\ndone\ncase "$url" in\n  *api.github.com*) cp "$COCO_TEST_METADATA" "$target" ;;\n  */v0.3.0/install.sh) cp "$COCO_TEST_INSTALLER" "$target" ;;\n  *) exit 1 ;;\nesac\n');
    await Promise.all([chmod(installer, 0o755), chmod(join(bin, "curl"), 0o755)]);
    const environment = { ...process.env, COCO_INSTALL_ROOT_URL: "https://raw.example/coco", COCO_RELEASES_API_URL: "https://api.github.com/fake", COCO_TEST_INSTALLER: installer, COCO_TEST_METADATA: metadata, COCO_TEST_RESULT: result, PATH: `${bin}:${process.env.PATH}`, TMPDIR: output };
    await exec("bash", [join(root, "site", "install.sh")], { env: environment });
    assert.equal((await readFile(result, "utf8")).trim(), "0.3.0");
    await writeFile(metadata, "not-json\n");
    await assert.rejects(exec("bash", [join(root, "site", "install.sh")], { env: environment }));
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("Given the public package contract, when CoCo is packed, then only release-safe files are included", async () => {
  const output = await mkdtemp(join(tmpdir(), "coco-release-package-"));
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const { version } = packageJson;
    const npmCli = await packageNpmCli(root);
    const { stdout } = await exec(process.execPath, [npmCli, "pack", "--json", "--pack-destination", output], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    const [{ filename }] = JSON.parse(stdout);
    const { stdout: members } = await exec("tar", ["-tzf", join(output, filename)], { maxBuffer: 64 * 1024 * 1024 });
    const paths = members.split("\n").filter(Boolean);

    assert.equal(paths.includes("package/LICENSE"), true);
    assert.equal(paths.includes("package/NOTICE"), true);
    assert.equal(paths.includes("package/install.sh"), true);
    assert.equal(paths.includes("package/uninstall.sh"), true);
    assert.equal(paths.includes("package/documentation/en/README.md"), true);
    assert.equal(paths.includes("package/control/public/index.html"), true);
    assert.equal(paths.includes("package/vscode/extension.js"), true);
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
    const test = workflow.indexOf("- run: npm run test:core");
    assert.notEqual(build, -1);
    assert.notEqual(test, -1);
    assert.ok(build < test);
  }
});

test("Given release workflows, when npm packs release assets, then the destination directory exists first", async () => {
  for (const workflowName of ["ci.yml", "release.yml"]) {
    const workflow = await readFile(join(root, ".github", "workflows", workflowName), "utf8");
    const createDirectory = workflow.indexOf("- run: mkdir release");
    const pack = workflow.indexOf("- run: node node_modules/npm/bin/npm-cli.js pack --json --pack-destination release");
    assert.notEqual(createDirectory, -1);
    assert.notEqual(pack, -1);
    assert.ok(createDirectory < pack);
  }
});

test("Given release workflows, when GitHub Actions and execution controls are configured, then pins are current, CI is cancellable, and jobs are bounded", async () => {
  const [ciWorkflow, releaseWorkflow, pagesWorkflow] = await Promise.all([
    readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"),
    readFile(join(root, ".github", "workflows", "release.yml"), "utf8"),
    readFile(join(root, ".github", "workflows", "pages.yml"), "utf8"),
  ]);

  assert.match(ciWorkflow, /concurrency:\n  group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true/);
  assert.match(ciWorkflow, /TMPDIR: \/root\/coco-tmp/);
  assert.match(ciWorkflow, /COCO_SCANNER_TMPDIR: \/root\/coco-tmp/);
  assert.equal((ciWorkflow.match(/runs-on: \[self-hosted, Linux, X64, coco-ci\]/g) ?? []).length, 2);
  assert.equal((ciWorkflow.match(/if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/g) ?? []).length, 2);
  assert.match(ciWorkflow, /  integrity:\n    needs: verify/);
  for (const workflow of [ciWorkflow, pagesWorkflow]) assert.match(workflow, /timeout-minutes: 20/);
  assert.match(releaseWorkflow, /timeout-minutes: 40/);
  for (const workflow of [ciWorkflow, releaseWorkflow, pagesWorkflow]) assert.match(workflow, /actions\/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09/);
  for (const workflow of [ciWorkflow, releaseWorkflow]) assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
  assert.match(ciWorkflow, /actions\/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4/);
  assert.match(pagesWorkflow, /actions\/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d/);
  assert.match(pagesWorkflow, /runs-on: \[self-hosted, Linux, X64, coco-pages\]/);
  assert.match(pagesWorkflow, /actions\/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b/);
  assert.match(pagesWorkflow, /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128/);
});

test("Given a published release, when post-release validation runs, then checksums and an isolated package lifecycle are verified", async () => {
  const workflow = await readFile(join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(workflow, /curl -fsSL --retry 5 --retry-delay 2 "\$base_url\/\$asset" -o "\$release_dir\/\$asset"/);
  assert.match(workflow, /\(cd "\$release_dir" && sha256sum --check SHA256SUMS\)/);
  assert.match(workflow, /COCO_INSTALL_DIR="\$sandbox\/install"/);
  assert.match(workflow, /bash "\$release_dir\/install\.sh"/);
  assert.match(workflow, /test "\$\("\$COCO_BIN_DIR\/coco" --version\)" = "\$version"/);
  assert.match(workflow, /bash "\$release_dir\/uninstall\.sh"/);
  assert.match(workflow, /test ! -e "\$COCO_INSTALL_DIR"/);
});

test("Given release workflows, when tarball closure runs through the shell, then its inline JavaScript contains no command substitution", async () => {
  for (const workflowName of ["ci.yml", "release.yml"]) {
    const workflow = await readFile(join(root, ".github", "workflows", workflowName), "utf8");
    const closureLine = workflow.split("\n").find((line) => line.includes("verifyTarballClosure"));
    assert.notEqual(closureLine, undefined);
    assert.equal(closureLine.includes("`"), false);
    assert.match(closureLine, /tarball:'release\/'\+tarball/);
  }
});

test("Given the v0.5.2 release contract, when public release surfaces are inspected, then every version and package artifact is consistent", async () => {
  const version = "0.5.2";
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
  assert.match(ciWorkflow, /actions\/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4/);
  for (const workflow of [ciWorkflow, releaseWorkflow]) {
    assert.match(workflow, /coco-\$\(node -p "require\('\.\.\/package\.json'\)\.version"\)\.tgz\.sha256/);
  }
  assert.equal(releaseWorkflow.includes("releases/latest/download"), false);
  assert.equal(releaseWorkflow.includes("agnes.key"), false);
  assert.match(releaseWorkflow, /releases\/download\/\$GITHUB_REF_NAME/);
  assert.match(releaseWorkflow, /sha256sum install\.sh uninstall\.sh coco-\*\.tgz coco-\*\.tgz\.sha256 coco-\*-offline-\*\.zip coco-\*-offline-\*\.zip\.sha256 coco-agent-\*\.vsix coco-agent-\*\.vsix\.sha256 > SHA256SUMS/);
  assert.match(releaseWorkflow, /npm run build:offline/);
  assert.match(releaseWorkflow, /release\/SHA256SUMS/);
});
