import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { packageNpmCli } from "./package-npm-cli.mjs";
import { verifyTarballClosure } from "../scripts/verify-package-closure.mjs";

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
    const closure = await verifyTarballClosure({ root, tarball: join(output, filename) });
    assert.equal(closure.status, "approved");
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
    assert.equal(paths.includes("package/resources/provider-correlation-candidate.v1.json"), true);
    assert.equal(paths.some((path) => path.includes("/logs/")), false);
    assert.equal(paths.some((path) => path.includes("qa-task-")), false);
    assert.equal(paths.some((path) => path.includes(".omo")), false);

    const extracted = join(output, "extracted");
    await mkdir(extracted);
    await exec("tar", ["-xzf", join(output, filename), "-C", extracted]);
    const packagedRoot = join(extracted, "package");
    const candidateEvidence = JSON.parse(await readFile(join(packagedRoot, "resources", "provider-correlation-candidate.v1.json"), "utf8"));
    const candidateManifest = JSON.parse(await readFile(join(packagedRoot, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"), "utf8"));
    assert.equal(candidateManifest.cocoCandidate.sourceCommit, candidateEvidence.candidate.sourceCommit);
    assert.equal(candidateManifest.cocoCandidate.sourceTag, candidateEvidence.candidate.sourceTag);
    const runtimeManifest = JSON.parse(await readFile(join(packagedRoot, "resources", "runtime-integrity-manifest.v1.json"), "utf8"));
    assert.equal(runtimeManifest.entries.some((entry) => entry.path === "resources/provider-correlation-candidate.v1.json"), true);
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

test("Given a tarball with a directory outside npm's source inventory, when closure is verified, then it is rejected", async () => {
  const output = await mkdtemp(join(tmpdir(), "coco-release-extra-directory-"));
  try {
    const npmCli = await packageNpmCli(root);
    const { stdout } = await exec(process.execPath, [npmCli, "pack", "--json", "--pack-destination", output], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    const [{ filename }] = JSON.parse(stdout);
    const extracted = join(output, "source");
    await mkdir(extracted);
    await exec("tar", ["-xzf", join(output, filename), "-C", extracted]);
    await mkdir(join(extracted, "package", "not-in-npm-inventory"));
    const malicious = join(output, "malicious.tgz");
    await exec("tar", ["-czf", malicious, "package"], { cwd: extracted });
    assert.equal((await verifyTarballClosure({ root, tarball: malicious })).code, "PACKAGE_TARBALL_INVENTORY_MISMATCH");
  } finally { await rm(output, { force: true, recursive: true }); }
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
    const pack = workflow.indexOf("node node_modules/npm/bin/npm-cli.js pack --json --pack-destination release");
    assert.notEqual(createDirectory, -1);
    assert.notEqual(pack, -1);
    assert.ok(createDirectory < pack);
  }
});

test("Given an offline bundle build, when its package input is selected, then it consumes an explicit verified public tarball without repacking", async () => {
  const source = await readFile(join(root, "scripts", "build-offline-bundle.mjs"), "utf8");
  assert.doesNotMatch(source, /npm-cli\.js|["']pack["']|--pack-destination/);
  assert.match(source, /packageArchive: process\.env\.COCO_PACKAGE_ARCHIVE/);
  assert.match(source, /packageSha256: process\.env\.COCO_PACKAGE_SHA256/);
  assert.match(source, /snapshotPackageArchive\(\{ destination: join\(bundle, "coco-package\.tgz"\), packageArchive, packageSha256 \}\)/);
});

test("Given release workflows, when GitHub Actions and execution controls are configured, then pins are current, CI is cancellable, and jobs are bounded", async () => {
  const [ciWorkflow, releaseWorkflow, pagesWorkflow, promotionWorkflow] = await Promise.all([
    readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"),
    readFile(join(root, ".github", "workflows", "release.yml"), "utf8"),
    readFile(join(root, ".github", "workflows", "pages.yml"), "utf8"),
    readFile(join(root, ".github", "workflows", "selective-fork-promotion.yml"), "utf8"),
  ]);

  assert.match(ciWorkflow, /concurrency:\n  group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true/);
  assert.match(ciWorkflow, /verify-pr:[\s\S]*?if: github\.event_name == 'pull_request'[\s\S]*?runs-on: ubuntu-24\.04[\s\S]*?printf 'TMPDIR=%s\\n' "\$RUNNER_TEMP" >> "\$GITHUB_ENV"[\s\S]*?printf 'COCO_SCANNER_TMPDIR=%s\\n' "\$RUNNER_TEMP" >> "\$GITHUB_ENV"/);
  assert.match(ciWorkflow, /verify-main:[\s\S]*?if: github\.event_name != 'pull_request'[\s\S]*?runs-on: ubuntu-24\.04[\s\S]*?printf 'TMPDIR=%s\\n' "\$RUNNER_TEMP" >> "\$GITHUB_ENV"[\s\S]*?printf 'COCO_SCANNER_TMPDIR=%s\\n' "\$RUNNER_TEMP" >> "\$GITHUB_ENV"/);
  assert.match(ciWorkflow, /npm run typecheck:model-panel/);
  assert.equal((ciWorkflow.match(/runs-on: \[self-hosted, Linux, X64, coco-ci\]/g) ?? []).length, 0);
  assert.equal((ciWorkflow.match(/runs-on: ubuntu-24\.04/g) ?? []).length, 2);
  assert.doesNotMatch(ciWorkflow, /needs: verify/);
  assert.match(ciWorkflow, /verify-main:[\s\S]*?timeout-minutes: 45/);
  assert.match(ciWorkflow, /verify-main:[\s\S]*?actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38[\s\S]*?node-version: 22\.19\.0/);
  assert.match(ciWorkflow, /verify-main:[\s\S]*?npm run test:core/);
  assert.match(ciWorkflow, /verify-main-integrity:[\s\S]*?runs-on: \[self-hosted, Linux, X64, coco-upstream\][\s\S]*?npm ci --ignore-scripts --no-audit --no-fund[\s\S]*?npm run build[\s\S]*?npm run test:integrity/);
  assert.equal((ciWorkflow.match(/npm run test:integrity/g) ?? []).length, 1);
  assert.match(ciWorkflow, /verify-pr:[\s\S]*?timeout-minutes: 45/);
  assert.match(pagesWorkflow, /timeout-minutes: 20/);
  assert.match(releaseWorkflow, /timeout-minutes: 75/);
  assert.match(ciWorkflow, /verify-main-integrity:[\s\S]*?timeout-minutes: 30/);
  for (const workflow of [ciWorkflow, releaseWorkflow, pagesWorkflow, promotionWorkflow]) assert.match(workflow, /actions\/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09/);
  for (const workflow of [ciWorkflow, releaseWorkflow]) assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
  assert.match(ciWorkflow, /actions\/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4/);
  assert.match(pagesWorkflow, /actions\/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d/);
  assert.match(pagesWorkflow, /runs-on: ubuntu-24\.04/);
  assert.match(pagesWorkflow, /actions\/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b/);
  assert.match(pagesWorkflow, /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128/);
  assert.doesNotMatch(promotionWorkflow, /actions\/setup-node/);
  assert.match(promotionWorkflow, /actions\/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4/);
  assert.match(promotionWorkflow, /verify-isolated-model-panel-candidate\.mjs/);
  assert.match(promotionWorkflow, /verify-model-panel-rollback\.mjs/);
  assert.match(promotionWorkflow, /runs-on: \[self-hosted, Linux, X64, coco-promotion\]/);
});

test("Given a private draft, when read-only validation runs, then online, offline, and VSIX lifecycle checks precede publication", async () => {
  const workflow = await readFile(join(root, ".github", "workflows", "release.yml"), "utf8");
  const upload = workflow.slice(workflow.indexOf("  draft-upload-minimal-write:"), workflow.indexOf("  draft-verify-readonly:"));
  const verify = workflow.slice(workflow.indexOf("  draft-verify-readonly:"), workflow.indexOf("  finalize-draft-minimal-write:"));
  assert.match(verify, /permissions:\n\s+actions: read\n\s+contents: read/);
  assert.match(upload, /releases\/assets\/\$asset_id/);
  assert.match(verify, /name: \$\{\{ needs\.draft-upload-minimal-write\.outputs\.remote-artifact-name \}\}/);
  assert.doesNotMatch(verify, /GH_TOKEN:\s|github\.token|gh api/);
  assert.match(verify, /sha256sum --check SHA256SUMS/);
  assert.match(verify, /bash "\$remote\/install\.sh"/);
  assert.match(verify, /bash "\$offline_installer"/);
  assert.match(verify, /unzip -q "\$remote\/coco-agent-\$version\.vsix" -d "\$vsix"/);
  assert.match(verify, /test ! -e "\$vsix"/);
  assert.match(verify, /release-artifact-contract\.mjs receipt/);
  assert.ok(workflow.indexOf("release-artifact-contract.mjs receipt") < workflow.indexOf("- name: Finalize the verified private draft"));
});

test("Given the release workflow, then four permission-isolated stages pass one immutable artifact to draft-first publication", async () => {
  const workflow = await readFile(join(root, ".github", "workflows", "release.yml"), "utf8");
  for (const job of ["build-readonly", "draft-upload-minimal-write", "draft-verify-readonly", "finalize-draft-minimal-write"]) assert.match(workflow, new RegExp(`^  ${job}:`, "m"));
  const build = workflow.slice(workflow.indexOf("  build-readonly:"), workflow.indexOf("  draft-upload-minimal-write:"));
  const upload = workflow.slice(workflow.indexOf("  draft-upload-minimal-write:"), workflow.indexOf("  draft-verify-readonly:"));
  const publish = workflow.slice(workflow.indexOf("  finalize-draft-minimal-write:"));
  assert.match(build, /permissions:\n\s+contents: read/);
  assert.match(build, /persist-credentials: false/);
  assert.equal((build.match(/actions\/upload-artifact@/g) ?? []).length, 1);
  assert.match(build, /outputs:\n\s+artifact-name: \$\{\{ steps\.artifact\.outputs\.name \}\}/);
  assert.match(build, /name: \$\{\{ steps\.artifact\.outputs\.name \}\}/);
  assert.match(workflow, /release-artifact-contract\.mjs generate --directory release/);
  assert.match(workflow, /release-artifact-contract\.mjs verify-local --directory release/);
  assert.match(workflow, /release-artifact-contract\.mjs verify-remote/);
  assert.equal((workflow.match(/env -u GH_TOKEN -u GITHUB_TOKEN/g) ?? []).length, 4);
  assert.match(workflow, /concurrency:\n  group: release-\$\{\{ github\.ref_name \}\}\n  cancel-in-progress: false/);
  assert.match(upload, /contents: write/);
  assert.match(upload, /releases\/tags\/\$GITHUB_REF_NAME/);
  assert.match(upload, /\(\.assets\|length\)==9/);
  assert.match(upload, /printf '%s\\n' install\.sh uninstall\.sh/);
  assert.match(upload, /cmp -s "\$RUNNER_TEMP\/expected-assets" "\$RUNNER_TEMP\/manifest-assets"/);
  assert.match(upload, /find staged\/release -maxdepth 1 -type f/);
  assert.match(upload, /sha256sum "staged\/release\/\$name"/);
  assert.ok(upload.indexOf("sha256sum \"staged/release/$name\"") < upload.indexOf("--method POST"));
  assert.match(upload, /-F draft=true/);
  assert.doesNotMatch(workflow, /If-Match:/);
  assert.match(upload, /\.draft==true/);
  assert.match(upload, /previous_attempt.*-le.*GITHUB_RUN_ATTEMPT/);
  assert.match(upload, /\.upload_url \| sub\("\\\\\{\.\*\$"; ""\)/);
  assert.match(upload, /--data-binary @"staged\/release\/\$name" "\$upload_url\?name=\$encoded"/);
  assert.doesNotMatch(workflow, /--clobber/);
  assert.match(publish, /contents: write/);
  assert.match(publish, /\.draft==true/);
  assert.match(publish, /\.attempt==\$attempt and \.draftId==\$draft/);
  assert.match(publish, /\(\.assets\|length\)==9/);
  assert.match(publish, /\{draft:true,prerelease:false,make_latest:"false",tag_name:\$tag,target_commitish:\$commit,name:\$name,body:\$body\}/);
  assert.match(publish, /--request PATCH --data "\$payload"/);
  assert.match(publish, /final-release\.json/);
  assert.match(publish, /\.draft==true and \.prerelease==false and \(\.assets\|length\)==9/);
  for (const writeJob of [upload, publish]) {
    assert.doesNotMatch(writeJob, /actions\/checkout|actions\/setup-node|npm (?:ci|run)|node scripts\/|bash .*staged|bash .*remote/);
  }
});

test("Given failed-job or full reruns, downstream jobs consume producer outputs and recover only same-run immutable draft assets", async () => {
  const workflow = await readFile(join(root, ".github", "workflows", "release.yml"), "utf8");
  const upload = workflow.slice(workflow.indexOf("  draft-upload-minimal-write:"), workflow.indexOf("  draft-verify-readonly:"));
  const verify = workflow.slice(workflow.indexOf("  draft-verify-readonly:"), workflow.indexOf("  finalize-draft-minimal-write:"));
  const publish = workflow.slice(workflow.indexOf("  finalize-draft-minimal-write:"));
  assert.match(upload, /name: \$\{\{ needs\.build-readonly\.outputs\.artifact-name \}\}/);
  assert.match(verify, /name: \$\{\{ needs\.build-readonly\.outputs\.artifact-name \}\}/);
  assert.match(publish, /name: \$\{\{ needs\.build-readonly\.outputs\.artifact-name \}\}/);
  assert.match(verify, /receipt-artifact-name: \$\{\{ steps\.receipt-artifact\.outputs\.name \}\}/);
  assert.match(publish, /name: \$\{\{ needs\.draft-verify-readonly\.outputs\.receipt-artifact-name \}\}/);
  assert.match(upload, /\.assets \|= map\(\.attempt=\$attempt\)/);
  assert.match(upload, /test "\$artifact_attempt" -le "\$GITHUB_RUN_ATTEMPT"/);
  assert.match(upload, /capture\("\^<!-- coco-release-owner run=/);
  assert.match(upload, /test "\$\(jq -r '\.run'/);
  assert.match(upload, /test "\$\(jq -r '\.commit'/);
  assert.match(upload, /\.tag_name==\$tag and \.draft==true/);
  assert.doesNotMatch(upload, /If-Match:/);
  assert.match(upload, /\.assets\[\] \| \[\.id, \.name, \.state, \.size, \.digest\]/);
  assert.match(upload, /if ! grep -Fxq "\$name"[\s\S]*--data-binary @"staged\/release\/\$name"/);
  assert.match(upload, /\(\.assets\|length\)==9/);
  assert.match(publish, /receipt_attempt=.*'\.attempt'/);
  assert.match(publish, /previous_attempt=.*'\.attempt'/);
  assert.match(publish, /test "\$previous_attempt" -le "\$GITHUB_RUN_ATTEMPT"/);
  assert.doesNotMatch(publish, /If-Match:/);
  assert.ok(publish.indexOf(".body==$owner") < publish.indexOf("--request PATCH"));
  assert.match(publish, /test "\$receipt_attempt" -le "\$GITHUB_RUN_ATTEMPT"/);
  assert.match(publish, /receipt-manifest\.json/);
  assert.match(publish, /\.attempt=\$attempt \| \.manifestSha256=\$manifest/);
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

test("Given the v0.7.1 release contract, when public release surfaces are inspected, then every version and package artifact is consistent", async () => {
  const version = "0.7.1";
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
  assert.match(releaseWorkflow, /releases\/assets\/\$asset_id/);
  assert.match(releaseWorkflow, /sha256sum install\.sh uninstall\.sh coco-\*\.tgz coco-\*\.tgz\.sha256 coco-\*-offline-\*\.zip coco-\*-offline-\*\.zip\.sha256 coco-agent-\*\.vsix coco-agent-\*\.vsix\.sha256 > SHA256SUMS/);
  assert.match(releaseWorkflow, /npm run build:offline/);
  assert.match(releaseWorkflow, /COCO_PACKAGE_ARCHIVE: \$\{\{ steps\.package\.outputs\.archive \}\}/);
  assert.match(releaseWorkflow, /COCO_PACKAGE_SHA256: \$\{\{ steps\.package\.outputs\.sha256 \}\}/);
  assert.match(releaseWorkflow, /SHA256SUMS/);
});
