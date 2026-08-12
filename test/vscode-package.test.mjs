import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildVscodeExtension } from "../scripts/build-vscode-extension.mjs";

function zipMembers(bytes) {
  const names = [];
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = bytes.readUInt16LE(offset + 28); const extraLength = bytes.readUInt16LE(offset + 30); const commentLength = bytes.readUInt16LE(offset + 32);
    names.push(bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 45 + nameLength + extraLength + commentLength;
  }
  return names;
}
test("VS Code release asset contains the native extension manifest and implementation", async () => {
  const output = await mkdtemp(join(tmpdir(), "coco-vsix-test-"));
  try {
    const result = await buildVscodeExtension({ outputDirectory: output });
    assert.equal(result.version, "0.4.0");
    const members = zipMembers(await readFile(result.path));
    for (const path of ["[Content_Types].xml", "extension.vsixmanifest", "extension/package.json", "extension/extension.js", "extension/README.md"]) assert.equal(members.includes(path), true);
    assert.equal(JSON.parse(await readFile(join(new URL("..", import.meta.url).pathname, "vscode", "package.json"))).version, "0.4.0");
  } finally { await rm(output, { recursive: true, force: true }); }
});
