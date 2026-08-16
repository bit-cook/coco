import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile, symlink } from "node:fs/promises";
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

function storedZip(name, content) {
  const nameBytes = Buffer.from(name);
  const contentBytes = Buffer.from(content);
  const table = Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0; });
  let checksum = 0xffffffff; for (const byte of contentBytes) checksum = table[(checksum ^ byte) & 0xff] ^ (checksum >>> 8); checksum = (checksum ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(contentBytes.length, 18); local.writeUInt32LE(contentBytes.length, 22); local.writeUInt16LE(nameBytes.length, 26); nameBytes.copy(local, 30);
  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(contentBytes.length, 20); central.writeUInt32LE(contentBytes.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE((0o100644 << 16) >>> 0, 38); nameBytes.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length + contentBytes.length, 16);
  return Buffer.concat([local, contentBytes, central, eocd]);
}
function prefixedZip(name, content, prefix) {
  const zip = storedZip(name, content), nameLength = Buffer.byteLength(name), centralOffset = zip.readUInt32LE(zip.length - 6);
  const output = Buffer.concat([Buffer.from(prefix), zip]);
  output.writeUInt32LE(prefix.length, prefix.length + centralOffset + 42);
  output.writeUInt32LE(prefix.length + centralOffset, output.length - 6);
  return output;
}
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
    "private-material",
    ["-----END", "PRIVATE", "KEY-----"].join(" "),
    "schema: { apiKey: string }",
  ].join("\n");

  const findings = scanText(text);

  assert.deepEqual(findings.map((finding) => finding.detector).sort(), ["bearer-literal", "common-key-prefix", "credential-assignment", "private-key-block"]);
});

test("Given PEM parsing source and a complete private key block, when scanned, then only the complete block is rejected", () => {
  assert.deepEqual(scanText(`value.startsWith('-----BEGIN PRIVATE KEY-----')`), []);
  const block = [["-----BEGIN", "PRIVATE", "KEY-----"].join(" "), "private-material", ["-----END", "PRIVATE", "KEY-----"].join(" ")].join("\n");
  assert.deepEqual(scanText(block), [{ detector: "private-key-block", count: 1 }]);
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

test("Given dependency documentation and generated schema placeholders, when scanned, then only real literals block", () => {
  const placeholders = [`apiKey: 'GEMINI_API_KEY'`, `apiKey: 'your-api-key'`, `apiKey: 'sk-explicit'`, `apiKey: 'test-api-key'`, `accessToken: "access_token"`, `AccessKeyId: "AKIAIOSFODNN7EXAMPLE"`].join("\n");
  assert.deepEqual(scanText(placeholders), []);
  assert.equal(scanText(`apiKey: '${fakeKey}'`).some(({ detector }) => detector === "credential-assignment"), true);
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

for (const extension of ["zip", "vsix"]) test(`Given a ${extension} containing a fixture credential, when scanned, then it blocks the archive member`, async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-zip-"));
  const archive = join(fixture, `fixture.${extension}`);
  try {
    await writeFile(archive, storedZip("extension/member.txt", `${credentialAssignment(fakeKey)}\n`));
    const findings = await scanTarget(archive);
    assert.equal(findings.some(({ detector, path }) => detector === "credential-assignment" && path.endsWith(`fixture.${extension}::extension/member.txt`)), true);
    assert.equal(JSON.stringify(findings).includes(fakeKey), false);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a zip path traversal member, when scanned, then it rejects the archive as unsafe", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-zip-unsafe-"));
  const archive = join(fixture, "unsafe.zip");
  try {
    await writeFile(archive, storedZip("../member.txt", "safe\n"));
    assert.deepEqual((await scanTarget(archive)).map(({ detector }) => detector), ["archive-unsafe"]);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a zip with corrupted member bytes or a forged trailing EOCD, when scanned, then it rejects the archive", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-zip-corrupt-"));
  try {
    const original = storedZip("member.txt", "safe-content-1234\n");
    const corrupted = Buffer.from(original); corrupted[30 + Buffer.byteLength("member.txt")] ^= 1;
    const forged = Buffer.concat([original, original.subarray(original.length - 22)]);
    for (const [name, bytes] of [["corrupt.zip", corrupted], ["forged.zip", forged]]) {
      const archive = join(fixture, name); await writeFile(archive, bytes);
      assert.deepEqual((await scanTarget(archive)).map(({ detector }) => detector), ["archive-unsafe"]);
    }
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given unscannable ordinary files or ZIP payload gaps, when scanned, then it fails closed", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-fail-closed-"));
  try {
    const nul = join(fixture, "nul.txt"), large = join(fixture, "large.txt"), prefixed = join(fixture, "prefixed.zip");
    await writeFile(nul, Buffer.concat([Buffer.from(`${credentialAssignment(fakeKey)}\n`), Buffer.from([0])]));
    await writeFile(large, `${credentialAssignment(fakeKey)}\n${"x".repeat(4 * 1024 * 1024)}`);
    await writeFile(prefixed, prefixedZip("member.txt", "safe\n", Buffer.from(`${credentialAssignment(fakeKey)}\n`)));
    assert.equal((await scanTarget(nul)).some(({ detector }) => detector === "credential-assignment"), true);
    assert.equal((await scanTarget(large)).some(({ detector }) => detector === "credential-assignment"), true);
    assert.deepEqual((await scanTarget(prefixed)).map(({ detector }) => detector), ["archive-unsafe"]);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a credential assignment crossing the 4MiB boundary with a long token, when scanned, then it fails closed", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-long-credential-"));
  try {
    const path = join(fixture, "long.txt");
    await writeFile(path, `token = '${"x".repeat(4 * 1024 * 1024 + 8192)}'\n`);
    assert.equal((await scanTarget(path)).some(({ detector }) => detector === "credential-assignment"), true);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a directory containing a symlink or a directory swapped during enumeration, when scanned, then it fails closed", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-tree-race-"));
  try {
    await mkdir(join(fixture, "real"));
    await writeFile(join(fixture, "real", "safe.txt"), "safe\n");
    await symlink(join(fixture, "real"), join(fixture, "link"));
    await assert.rejects(scanTarget(fixture));
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a safe replacement restored after directory snapshot scanning, when revalidated, then it fails closed", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-tree-restore-race-"));
  const holding = await mkdtemp(join(tmpdir(), "coco-publication-tree-restore-holding-"));
  const source = join(fixture, "source.txt"), hidden = join(holding, "source.original");
  try {
    let inventoried = false, revalidated = false;
    await writeFile(source, `${credentialAssignment(fakeKey)}\n`);
    await assert.rejects(scanTarget(fixture, {
      async afterDirectoryInventory() {
        inventoried = true;
        await rename(source, hidden);
        await writeFile(source, "safe\n");
      },
      async beforeDirectoryRevalidation() {
        revalidated = true;
        await rm(source);
        await rename(hidden, source);
      },
    }), /SCAN_DIRECTORY_RACE/);
    assert.equal(inventoried, true);
    assert.equal(revalidated, true);
  } finally {
    await rm(fixture, { force: true, recursive: true });
    await rm(holding, { force: true, recursive: true });
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

test("Given a tarball credential in a bundled dependency, when scanned, then it blocks the published member", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-dependency-"));
  const archive = join(fixture, "dependency.tgz");
  try {
    await mkdir(join(fixture, "node_modules", "package"), { recursive: true });
    await writeFile(join(fixture, "node_modules", "package", "fixture.txt"), `${credentialAssignment(fakeKey)}\n`);
    await writeFile(join(fixture, "project.txt"), "safe\n");
    await exec("tar", ["-czf", archive, "node_modules", "project.txt"], { cwd: fixture });

    assert.equal((await scanTarget(archive)).some(({ detector, path }) => detector === "credential-assignment" && path.endsWith("dependency.tgz::node_modules/package/fixture.txt")), true);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given safe nested publication archives, when scanned, then all nested members are scanned with their full path", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-nested-safe-"));
  try {
    const innerZip = storedZip("node_modules/package/fixture.txt", `${credentialAssignment(fakeKey)}\n`);
    await writeFile(join(fixture, "inner.zip"), innerZip);
    await exec("tar", ["-czf", join(fixture, "middle.tgz"), "inner.zip"], { cwd: fixture });
    await writeFile(join(fixture, "outer.vsix"), storedZip("archives/middle.tgz", await readFile(join(fixture, "middle.tgz"))));

    const findings = await scanTarget(join(fixture, "outer.vsix"));
    assert.equal(findings.some(({ detector, path }) => detector === "credential-assignment" && path.endsWith("outer.vsix::archives/middle.tgz::inner.zip::node_modules/package/fixture.txt")), true);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given malicious nested archives, when scanned, then corruption and nesting limits fail closed", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-publication-nested-unsafe-"));
  try {
    await writeFile(join(fixture, "corrupt.zip"), storedZip("nested.tgz", "not an archive\n"));
    assert.deepEqual((await scanTarget(join(fixture, "corrupt.zip"))).map(({ detector, path }) => ({ detector, suffix: path.endsWith("corrupt.zip::nested.tgz") })), [{ detector: "archive-unsafe", suffix: true }]);

    let deep = storedZip("safe.txt", "safe\n");
    for (let level = 4; level >= 1; level -= 1) deep = storedZip(`level-${level}.zip`, deep);
    await writeFile(join(fixture, "deep.zip"), deep);
    assert.equal((await scanTarget(join(fixture, "deep.zip"))).some(({ detector, path }) => detector === "archive-unsafe" && path.includes("level-4.zip")), true);

    await mkdir(join(fixture, "many"));
    for (let index = 0; index < 101; index += 1) await writeFile(join(fixture, "many", `${index}.zip`), storedZip("safe.txt", "safe\n"));
    await exec("tar", ["-czf", join(fixture, "many.tgz"), "many"], { cwd: fixture });
    const manyFindings = await scanTarget(join(fixture, "many.tgz"));
    assert.equal(manyFindings.some(({ detector, path }) => detector === "archive-unsafe" && path.includes("many.tgz::many/")), true);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});
