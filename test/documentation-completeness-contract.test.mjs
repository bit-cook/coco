import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { generateDocumentationManifest, generateFromNpmPack } from "../scripts/generate-documentation-completeness.mjs";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

async function fixture({ brokenCurrent = false, missingLocale = false, navigationMismatch = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "coco-documentation-fixture-"));
  await Promise.all([mkdir(join(directory, "docs")), mkdir(join(directory, "examples")), mkdir(join(directory, "documentation/en/docs"), { recursive: true }), mkdir(join(directory, "documentation/zh-CN/docs"), { recursive: true })]);
  await writeFile(join(directory, "package.json"), '{"name":"fixture","version":"1.0.0"}\n');
  for (const path of ["README.md", "CHANGELOG.md", "DESIGN.md"]) await writeFile(join(directory, path), `# ${path}\n`);
  await writeFile(join(directory, "docs/index.md"), "# Upstream\n[old](missing-upstream.md)\n");
  await writeFile(join(directory, "documentation/en/README.md"), "# README.md\n");
  await writeFile(join(directory, "documentation/zh-CN/README.md"), "# 自述\n");
  for (const path of ["CHANGELOG.md", "DESIGN.md"]) for (const locale of ["en", "zh-CN"]) await writeFile(join(directory, `documentation/${locale}/${path}`), `# ${path}\n`);
  for (const locale of ["en", "zh-CN"]) {
    await writeFile(join(directory, `documentation/${locale}/docs/index.md`), locale === "en" ? "# Upstream\n[old](missing-upstream.md)\n" : "# 上游\n[旧](missing-upstream.md)\n");
    if (!(missingLocale && locale === "zh-CN")) await writeFile(join(directory, `documentation/${locale}/docs/manual.md`), `# Manual\n${brokenCurrent ? "[broken](absent.md)" : "[index](index.md)"}\n[fixed source](https://github.com/example/project/blob/0123456789abcdef0123456789abcdef01234567/README.md)\n`);
    const routes = navigationMismatch && locale === "zh-CN" ? ["index.md"] : ["index.md", "manual.md"];
    await writeFile(join(directory, `documentation/${locale}/docs.json`), `${JSON.stringify({ navigation: [{ items: routes.map((path) => ({ path })) }] })}\n`);
  }
  return directory;
}

test("manifest is deterministic and detects changed hashes, missing locales, navigation drift, and current-product broken links", async () => {
  const directory = await fixture();
  try {
    const first = await generateDocumentationManifest({ root: directory, packedRoot: directory });
    const second = await generateDocumentationManifest({ root: directory, packedRoot: directory });
    assert.deepEqual(first, second);
    assert.equal(first.complete, true);
    assert.equal(first.status, "complete");
    assert.ok(first.links.historical_inherited > 0, "inherited unresolved links are explicitly classified");
    assert.equal(first.links.external_fixed_commit, 2, "fixed-commit source links are classified separately");
    const oldHash = first.inventory.find(({ path }) => path === "README.md").source.sha256;
    await writeFile(join(directory, "README.md"), "# changed\n");
    const changed = await generateDocumentationManifest({ root: directory, packedRoot: directory });
    assert.notEqual(changed.inventory.find(({ path }) => path === "README.md").source.sha256, oldHash);
  } finally { await rm(directory, { force: true, recursive: true }); }
  for (const options of [{ missingLocale: true }, { navigationMismatch: true }, { brokenCurrent: true }]) {
    const invalid = await fixture(options);
    try {
      const manifest = await generateDocumentationManifest({ root: invalid, packedRoot: invalid });
      assert.equal(manifest.complete, false);
      assert.equal(manifest.status, "incomplete", "stale or failed evidence cannot claim complete");
    }
    finally { await rm(invalid, { force: true, recursive: true }); }
  }
});

test("unknown pages and shortcut or autolink targets fail closed", async () => {
  const directory = await fixture();
  try {
    await writeFile(join(directory, "docs/new-current.md"), "# New\n[shortcut]\n[shortcut]: missing-shortcut.md\n<missing-autolink.md>\n");
    await writeFile(join(directory, "documentation/en/docs/new-current.md"), "# New\n[shortcut]\n[shortcut]: missing-shortcut.md\n<missing-autolink.md>\n");
    const manifest = await generateDocumentationManifest({ root: directory, packedRoot: directory });
    assert.equal(manifest.complete, false);
    assert.equal(manifest.inventory.find(({ path }) => path === "docs/new-current.md").category, "unclassified");
    assert.ok(manifest.links.unclassified.some(({ target }) => target === "missing-shortcut.md"));
    assert.ok(manifest.links.unclassified.some(({ target }) => target === "missing-autolink.md"));
  } finally { await rm(directory, { force: true, recursive: true }); }
});

test("stale manifest text cannot claim complete", async () => {
  const manifest = JSON.parse(await readFile(join(root, "documentation/completeness-manifest.json"), "utf8"));
  assert.equal(manifest.schema, "coco-documentation-completeness-v2");
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.complete, true);
  assert.deepEqual(manifest.links.unclassified, []);
  await exec(process.execPath, [join(root, "scripts/generate-documentation-completeness.mjs"), "--check"], { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
});

test("real npm pack has complete documentation relative-link closure", { timeout: 120_000 }, async () => {
  const manifest = await generateFromNpmPack(root);
  assert.equal(manifest.complete, true);
  assert.deepEqual(manifest.links.unclassified, []);
  assert.ok(manifest.links.checked > 0);
  assert.ok(manifest.links.resolved > 0);
});
