import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { scanTarget, scanText } from "../scripts/publication-secret-scanner.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;
const fakeKey = ["sk", "live", "000000000000"].join("-");
const testOnlyKey = ["sk", "test", "only", "invalid", "key"].join("-");
const testOnlyBearer = ["bearer", "test", "only", "invalid", "key"].join("-");
const fakeBearer = ["bearer", "live", "000000000000"].join("-");
const credentialAssignment = (value) => ["token = '", value, "'"].join("");
const publicFixturePaths = [
  "README.md",
  "docs/live.md",
  "documentation/live.md",
  "examples/live.mjs",
  "CHANGELOG.md",
  "dist/live.mjs",
  "scripts/live.mjs",
  "test/live.test.mjs",
];

test("Given credential-shaped text, when scanned, then live literals are found while documented placeholders and task- are ignored", () => {
  const text = [
    "const taskName = 'task-build';",
    "token = '${TOKEN}';",
    "secret: {env:DEPLOY_SECRET}",
    "apiKey = 'YOUR_API_KEY';",
    `api_key = '${testOnlyKey}';`,
    ["api_key = '", fakeKey, "';"].join(""),
    `Authorization: Bearer ${testOnlyBearer}`,
    `Authorization: Bearer ${fakeBearer}`,
    ["-----BEGIN", "PRIVATE", "KEY-----"].join(" "),
    "schema: { apiKey: string }",
  ].join("\n");

  const findings = scanText(text);

  assert.deepEqual(findings.map((finding) => finding.detector).sort(), ["bearer-literal", "common-key-prefix", "credential-assignment", "private-key-block"]);
});

test("Given recognized placeholders and schema declarations, when scanned, then they pass without path-based exceptions", () => {
  const text = [
    "api_key = '${TOKEN}'",
    "api_key = '{env:DEPLOY_SECRET}'",
    "api_key = 'YOUR_API_KEY'",
    `api_key = '${testOnlyKey}'`,
    "type Config = { apiKey: string };",
    "const taskName = 'task-build';",
  ].join("\n");

  assert.deepEqual(scanText(text), []);
});

test("Given public source paths containing a credential-shaped fixture, when scanned, then every path blocks", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-source-"));
  try {
    await Promise.all(publicFixturePaths.map(async (path) => {
      const parent = join(fixture, path, "..");
      await mkdir(parent, { recursive: true });
      await writeFile(join(fixture, path), `${credentialAssignment(fakeKey)}\n`);
    }));

    const findings = await scanTarget(fixture);

    assert.equal(findings.filter((finding) => finding.detector === "credential-assignment").length, publicFixturePaths.length);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a tarball containing a fixture credential, when the CLI scans it, then it blocks the archive without leaking the fixture", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-secret-"));
  const archive = join(fixture, "fixture.tgz");
  const member = join(fixture, "member.txt");
  try {
    await writeFile(member, `${credentialAssignment(fakeKey)}\n`);
    await exec("tar", ["-czf", archive, "member.txt"], { cwd: fixture });

    assert.equal((await scanTarget(archive)).some((finding) => finding.detector === "credential-assignment"), true);

    await assert.rejects(
      exec(process.execPath, ["scripts/publication-secret-scanner.mjs", archive], { cwd: root, encoding: "utf8" }),
      (error) => {
        assert.match(error.stdout, /fixture\.tgz::member\.txt\tcredential-assignment\t1/);
        assert.equal(`${error.stdout}${error.stderr}`.includes(fakeKey), false);
        return true;
      },
    );
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a tarball with a symlink member, when the CLI scans it, then it rejects the unsafe archive without extraction", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-archive-"));
  const archive = join(fixture, "unsafe.tgz");
  try {
    await writeFile(join(fixture, "member.txt"), "safe\n");
    await symlink("member.txt", join(fixture, "link.txt"));
    await exec("tar", ["-czf", archive, "member.txt", "link.txt"], { cwd: fixture });

    await assert.rejects(
      exec(process.execPath, ["scripts/publication-secret-scanner.mjs", archive], { cwd: root, encoding: "utf8" }),
      (error) => {
        assert.match(error.stdout, /unsafe\.tgz\tarchive-unsafe\t1/);
        assert.equal(`${error.stdout}${error.stderr}`.includes("member.txt"), false);
        return true;
      },
    );
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a malformed archive, when scanned, then it blocks as unsafe without exposing contents", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-malformed-"));
  const archive = join(fixture, "malformed.tgz");
  try {
    await writeFile(archive, "not an archive\n");

    const findings = await scanTarget(archive);

    assert.deepEqual(findings.map(({ detector, count }) => ({ detector, count })), [{ detector: "archive-unsafe", count: 1 }]);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a tarball credential in a dependency directory, when scanned, then it is excluded while project members remain scanned", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-dependency-"));
  const archive = join(fixture, "dependency.tgz");
  try {
    await mkdir(join(fixture, "node_modules", "package"), { recursive: true });
    await writeFile(join(fixture, "node_modules", "package", "fixture.txt"), `${credentialAssignment(fakeKey)}\n`);
    await writeFile(join(fixture, "project.txt"), "safe\n");
    await exec("tar", ["-czf", archive, "node_modules", "project.txt"], { cwd: fixture });

    assert.deepEqual(await scanTarget(archive), []);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
