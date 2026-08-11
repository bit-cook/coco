import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildRepoMap, selectRepoContext } from "../scripts/repo-map.mjs";

test("bounded JS/TS repo map reports deterministic symbols and imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-repo-map-"));
  try {
    await mkdir(join(root, "node_modules")); await writeFile(join(root, "node_modules", "ignored.js"), "export function ignored() {}\n");
    await writeFile(join(root, "index.ts"), 'import { run } from "./runner.js";\nexport const answer = 42;\nexport function main() { return run(answer); }\n');
    await writeFile(join(root, "runner.js"), "export function run(value) { return value; }\n");
    const map = await buildRepoMap({ root });
    assert.deepEqual(map.files.map(({ path }) => path), ["index.ts", "runner.js"]);
    assert.deepEqual(map.files[0].imports, ["./runner.js"]);
    assert.deepEqual(map.files[0].symbols.map(({ kind, name, exported }) => ({ exported, kind, name })), [
      { exported: true, kind: "variable", name: "answer" }, { exported: true, kind: "function", name: "main" },
    ]);
    assert.equal(map.stats.symbols, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("repo map fails closed at file and byte budgets", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-repo-map-limit-"));
  try {
    await writeFile(join(root, "one.js"), "export const one = 1;\n");
    await writeFile(join(root, "two.ts"), "export const two = 2;\n");
    await assert.rejects(buildRepoMap({ root, maxFiles: 1 }), /REPO_MAP_FILE_LIMIT_EXCEEDED/);
    await assert.rejects(buildRepoMap({ root, maxBytes: 1 }), /REPO_MAP_BYTE_LIMIT_EXCEEDED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("repo map rejects source symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-repo-map-link-"));
  try {
    await writeFile(join(root, "real.js"), "export const real = 1;\n");
    await symlink("real.js", join(root, "linked.js"));
    await assert.rejects(buildRepoMap({ root }), /REPO_MAP_SYMLINK_FORBIDDEN/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("repo context selection is deterministic and budgeted", () => {
  const map = { files: [
    { imports: [], path: "z.ts", symbols: [{ kind: "function", line: 1, name: "other" }] },
    { imports: ["./z.ts"], path: "a.ts", symbols: [{ kind: "function", line: 1, name: "target" }, { kind: "variable", line: 2, name: "extra" }] },
  ], schemaVersion: 1 };
  const selected = selectRepoContext(map, { maxFiles: 1, maxSymbols: 1, query: "target" });
  assert.deepEqual(selected.files.map(({ path }) => path), ["a.ts"]);
  assert.deepEqual(selected.files[0].symbols.map(({ name }) => name), ["target"]);
  assert.equal(selected.stats.files, 1); assert.equal(selected.stats.symbols, 1);
});

test("repo context selection rejects malformed maps before ranking", () => {
  assert.throws(() => selectRepoContext({ files: [{ path: "x.js", imports: [null], symbols: [] }], schemaVersion: 1 }), /REPO_CONTEXT_MAP_INVALID/);
  assert.throws(() => selectRepoContext({ files: [{ path: "x.js", imports: [], symbols: [{ name: 1 }] }], schemaVersion: 1 }), /REPO_CONTEXT_MAP_INVALID/);
});
