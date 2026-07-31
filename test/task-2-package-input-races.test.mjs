import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { snapshotPackageInputs } from "../scripts/package-inputs.mjs";

const names = ["dist", "docs", "examples"];

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), `coco-task-2-input-race-${process.pid}-`));
  const globalRoot = join(directory, "global");
  const root = join(directory, "coco");
  await mkdir(globalRoot);
  await mkdir(root);
  for (const name of names) {
    await mkdir(join(globalRoot, name));
    await writeFile(join(globalRoot, name, "asset.txt"), `${name}\n`);
    await symlink(join(globalRoot, name), join(root, name));
  }
  await writeFile(join(globalRoot, "CHANGELOG.md"), "changes\n");
  await symlink(join(globalRoot, "CHANGELOG.md"), join(root, "CHANGELOG.md"));
  return { directory, globalRoot, root };
}

async function assertLinked(root) {
  for (const name of [...names, "CHANGELOG.md"]) assert.equal((await lstat(join(root, name))).isSymbolicLink(), true);
}

test("Given an absent selector, when package inputs are snapshotted, then it remains absent while valid selectors materialize", async () => {
  const input = await fixture();
  try {
    await rm(join(input.root, "docs"));
    const result = await snapshotPackageInputs(input);
    assert.equal(result.status, "approved");
    await assert.rejects(lstat(join(input.root, "docs")), { code: "ENOENT" });
    assert.equal((await lstat(join(input.root, "dist"))).isSymbolicLink(), false);
  } finally {
    await rm(input.directory, { force: true, recursive: true });
  }
});

test("Given an invalid source tree or selector, when package inputs are snapshotted, then all destinations remain linked", async () => {
  const cases = [
    async (input) => execFileSync("mkfifo", [join(input.globalRoot, "dist", "fifo")]),
    async (input) => execFileSync("python3", ["-c", "import socket,sys; value=socket.socket(socket.AF_UNIX); value.bind(sys.argv[1]); value.close()", join(input.globalRoot, "dist", "socket")]),
    async (input) => { await symlink("asset.txt", join(input.globalRoot, "dist", "internal-link")); },
    async (input) => { await chmod(join(input.globalRoot, "dist", "asset.txt"), 0o000); },
    async (input) => { await rm(join(input.root, "dist")); await writeFile(join(input.root, "dist"), "not-a-link"); },
    async (input) => { await rm(join(input.root, "dist")); await symlink(join(input.globalRoot, "docs"), join(input.root, "dist")); },
    async (input) => { await rm(join(input.root, "dist")); await symlink("missing", join(input.root, "dist")); },
    async (input) => { await rm(join(input.root, "dist")); await symlink("/outside", join(input.root, "dist")); },
  ];
  for (const mutate of cases) {
    const input = await fixture();
    try {
      await mutate(input);
      const result = await snapshotPackageInputs(input);
      assert.equal(result.code, "PACKAGE_INPUT_INVALID");
      for (const name of ["docs", "examples", "CHANGELOG.md"]) assert.equal((await lstat(join(input.root, name))).isSymbolicLink(), true);
    } finally {
      await rm(input.directory, { force: true, recursive: true });
    }
  }
});

test("Given a selector changes at every checkpoint, when package inputs are snapshotted, then it rejects without partial replacement", async () => {
  for (const name of [...names, "CHANGELOG.md"]) {
    for (const phase of ["after-source-open", "after-manifest", "after-copy"]) {
      const input = await fixture();
      try {
        const result = await snapshotPackageInputs({
          ...input,
          onCheckpoint: async (checkpoint) => {
            if (checkpoint === `${phase}:${name}`) {
              await rm(join(input.root, name));
              await symlink(join(input.globalRoot, "docs"), join(input.root, name));
            }
          },
        });
        assert.equal(result.code, "PACKAGE_INPUT_RACE", `${name} ${phase}: ${JSON.stringify(result)}`);
        await assertLinked(input.root);
      } finally {
        await rm(input.directory, { force: true, recursive: true });
      }
    }
  }
});

test("Given an exact selector is replaced with an identical raw target, when its checkpoint callback resolves, then the retained snapshot rejects it", async () => {
  const input = await fixture();
  try {
    const result = await snapshotPackageInputs({
      ...input,
      onCheckpoint: async (checkpoint) => {
        if (checkpoint === "after-source-open:docs") {
          await rm(join(input.root, "docs"));
          await symlink(join(input.globalRoot, "docs"), join(input.root, "docs"));
        }
      },
    });
    assert.equal(result.code, "PACKAGE_INPUT_RACE", JSON.stringify(result));
    await assertLinked(input.root);
  } finally {
    await rm(input.directory, { force: true, recursive: true });
  }
});

test("Given source bytes change after a copy checkpoint, when package inputs are snapshotted, then it rejects and retains destinations", async () => {
  const input = await fixture();
  try {
    const result = await snapshotPackageInputs({
      ...input,
      onCheckpoint: async (checkpoint) => {
        if (checkpoint === "after-copy:examples") await writeFile(join(input.globalRoot, "examples", "asset.txt"), "changed\n");
      },
    });
    assert.equal(result.code, "PACKAGE_INPUT_RACE");
    await assertLinked(input.root);
    assert.equal(await readFile(join(input.globalRoot, "examples", "asset.txt"), "utf8"), "changed\n");
  } finally {
    await rm(input.directory, { force: true, recursive: true });
  }
});

test("Given a source tree changes after its manifest, when package inputs are snapshotted, then it rejects and cleans artifacts", async () => {
  const input = await fixture();
  try {
    const result = await snapshotPackageInputs({
      ...input,
      onCheckpoint: async (checkpoint) => {
        if (checkpoint === "after-manifest:dist") {
          await rm(join(input.globalRoot, "dist", "asset.txt"));
          await symlink("/outside", join(input.globalRoot, "dist", "asset.txt"));
        }
      },
    });
    assert.equal(result.code, "PACKAGE_INPUT_RACE");
    await assertLinked(input.root);
    assert.deepEqual((await readdir(input.root)).filter((name) => name.startsWith(".package-inputs-")), []);
  } finally {
    await rm(input.directory, { force: true, recursive: true });
  }
});
