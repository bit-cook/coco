import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

test("Given the public package contract, when Coco is packed, then only release-safe files are included", async () => {
  const output = await mkdtemp(join(tmpdir(), "coco-release-package-"));
  try {
    const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const { stdout } = await exec("npm", ["pack", "--json", "--pack-destination", output], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
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
