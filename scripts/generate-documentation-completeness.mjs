import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const LOCALES = ["en", "zh-CN"];
const MANIFEST = "documentation/completeness-manifest.json";
const CURRENT_PRODUCT = new Set([
  "README.md",
  "docs/backup-and-restore.md",
  "docs/coco-cli.md",
  "docs/coco-security.md",
  "docs/development-review-plan.md",
  "docs/external-agent-research.md",
  "docs/manual.md",
  "docs/task-events.md",
  "docs/tasks.md",
]);
const HISTORICAL = new Set([
  "CHANGELOG.md",
  "DESIGN.md",
  "docs/capability-matrix.md",
  "docs/development-migration-journal.md",
  "docs/index.md",
  "docs/model-panel-adapter-rfc.md",
  "docs/model-panel-contract.md",
  "docs/patch-inventory.md",
  "docs/product-manifest-rfc.md",
  "docs/provider-readiness.md",
  "docs/strategy-roadmap-2026.md",
  "docs/upstream-dashboard.md",
  "examples/extensions/subagent/README.md",
]);
const BYTE_MIRRORS = new Set([
  "docs/compaction.md", "docs/containerization.md", "docs/custom-provider.md", "docs/development.md", "docs/environment-variables.md", "docs/extensions.md", "docs/json.md", "docs/keybindings.md", "docs/llama-cpp.md", "docs/models.md", "docs/packages.md", "docs/prompt-templates.md", "docs/providers.md", "docs/quickstart.md", "docs/rpc.md", "docs/sdk.md", "docs/security.md", "docs/session-format.md", "docs/sessions.md", "docs/settings.md", "docs/shell-aliases.md", "docs/skills.md", "docs/terminal-setup.md", "docs/termux.md", "docs/themes.md", "docs/tmux.md", "docs/tui.md", "docs/usage.md", "docs/windows.md", "examples/README.md", "examples/extensions/README.md", "examples/extensions/doom-overlay/README.md", "examples/extensions/plan-mode/README.md", "examples/sdk/README.md",
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const lines = (bytes) => bytes.length === 0 ? 0 : bytes.toString("utf8").split("\n").length - (bytes.at(-1) === 10 ? 1 : 0);

async function filesBelow(root, directory) {
  const base = join(root, directory);
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(relative(base, path).split("\\").join("/"));
    }
  }
  try { await visit(base); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return result.sort();
}

async function record(root, path) {
  const bytes = await readFile(join(root, path));
  return { path, bytes: bytes.length, lines: lines(bytes), sha256: sha256(bytes) };
}

async function optionalRecord(root, path) {
  try { return await record(root, path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function routes(value) {
  return (value.navigation ?? []).flatMap((group) => (group.items ?? []).map((item) => item.path));
}

function classifyPage(path, source, localeRecords) {
  if (HISTORICAL.has(path)) return "historical-inherited";
  if (CURRENT_PRODUCT.has(path)) return "current-product-translated";
  if (BYTE_MIRRORS.has(path) && source && localeRecords.en?.sha256 === source.sha256) return "byte-mirror";
  return "unclassified";
}

function markdownLinks(text) {
  const links = [];
  const references = new Map();
  const referenceUses = [];
  let fence = null;
  for (const rawLine of text.split("\n")) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(rawLine)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const line = rawLine.replace(/`[^`]*`/g, "");
    const definition = /^\s*\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/.exec(line);
    if (definition) references.set(definition[1].trim().toLowerCase(), definition[2] ?? definition[3]);
    for (const match of line.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^)]*["'])?\s*\)/g)) links.push(match[1] ?? match[2]);
    for (const match of line.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) referenceUses.push((match[2] || match[1]).trim().toLowerCase());
    for (const match of line.matchAll(/!?\[([^\]]+)\](?![[(])/g)) {
      if (definition && match.index === line.indexOf("[")) continue;
      referenceUses.push(match[1].trim().toLowerCase());
    }
    for (const match of line.matchAll(/<([^<>\s]+)>/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|tel:)/i.test(target) || /^(?:\.{0,2}\/|[^:]+\.(?:md|html?|png|jpe?g|gif|svg)(?:[#?].*)?$)/i.test(target)) links.push(target);
    }
    for (const match of line.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) links.push(match[1]);
  }
  for (const key of referenceUses) if (references.has(key)) links.push(references.get(key));
  return links;
}

function relativeTarget(from, rawTarget) {
  const withoutFragment = rawTarget.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return null;
  let decoded;
  try { decoded = decodeURIComponent(withoutFragment); } catch { return { invalid: true }; }
  if (decoded.startsWith("/") || decoded.includes("\\")) return { invalid: true };
  const target = posix.normalize(posix.join(posix.dirname(from), decoded));
  if (target === ".." || target.startsWith("../")) return { invalid: true };
  return { target };
}

function targetExists(target, packedFiles) {
  return [target, `${target}.md`, posix.join(target, "README.md"), posix.join(target, "index.md")].some((candidate) => packedFiles.has(candidate));
}

export async function inspectPackedDocumentation({ packedRoot, pages, packedFiles }) {
  packedFiles ??= new Set(await filesBelow(packedRoot, "."));
  const results = { checked: 0, resolved: 0, external_fixed_commit: 0, external_other: 0, historical_inherited: 0, unclassified: [] };
  for (const page of pages) {
    const packedPath = `documentation/${page.locale}/${page.path}`;
    if (!packedFiles.has(packedPath)) {
      results.unclassified.push({ from: packedPath, target: packedPath, reason: "page-missing-from-package" });
      continue;
    }
    const text = await readFile(join(packedRoot, packedPath), "utf8");
    for (const target of markdownLinks(text)) {
      if (/^(?:https?:|mailto:|tel:)/i.test(target)) {
        if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:blob|tree)\/[a-f0-9]{40}(?:\/|$)/i.test(target)) results.external_fixed_commit += 1;
        else results.external_other += 1;
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) { results.unclassified.push({ from: packedPath, target, reason: "unsupported-link-scheme" }); continue; }
      const resolved = relativeTarget(packedPath, target);
      if (resolved === null) continue;
      results.checked += 1;
      if (!resolved.invalid && targetExists(resolved.target, packedFiles)) results.resolved += 1;
      else if (page.category === "historical-inherited" || page.category === "byte-mirror") results.historical_inherited += 1;
      else results.unclassified.push({ from: packedPath, target, reason: "unresolved-relative-link" });
    }
  }
  return results;
}

export async function generateDocumentationManifest({ root, packedRoot, packedFiles }) {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const sourcePaths = ["README.md", "CHANGELOG.md", "DESIGN.md"]
    .concat((await filesBelow(root, "docs")).filter((path) => path.endsWith(".md")).map((path) => `docs/${path}`))
    .concat((await filesBelow(root, "examples")).filter((path) => path.endsWith("README.md")).map((path) => `examples/${path}`))
    .sort();
  const localePaths = Object.fromEntries(await Promise.all(LOCALES.map(async (locale) => [locale, (await filesBelow(root, `documentation/${locale}`)).filter((path) => path.endsWith(".md"))])));
  const logicalPaths = [...new Set([...sourcePaths, ...localePaths.en, ...localePaths["zh-CN"]])].sort();
  const inventory = [];
  for (const path of logicalPaths) {
    const source = sourcePaths.includes(path) ? await record(root, path) : null;
    const localeRecords = Object.fromEntries(await Promise.all(LOCALES.map(async (locale) => [locale, await optionalRecord(root, `documentation/${locale}/${path}`)])));
    const category = classifyPage(path, source, localeRecords);
    inventory.push({
      path,
      category,
      source: source ? { bytes: source.bytes, lines: source.lines, sha256: source.sha256 } : null,
      locales: Object.fromEntries(LOCALES.map((locale) => [locale, localeRecords[locale] ? { bytes: localeRecords[locale].bytes, lines: localeRecords[locale].lines, sha256: localeRecords[locale].sha256 } : null])),
    });
  }
  const navigation = {};
  for (const locale of LOCALES) {
    const path = `documentation/${locale}/docs.json`;
    const value = JSON.parse(await readFile(join(root, path), "utf8"));
    const localeRoutes = routes(value);
    navigation[locale] = { ...await record(root, path), routes: localeRoutes, missing: localeRoutes.filter((route) => !localePaths[locale].includes(`docs/${route}`)) };
    delete navigation[locale].path;
  }
  const routeParity = JSON.stringify(navigation.en.routes) === JSON.stringify(navigation["zh-CN"].routes);
  const pairedCurrentProduct = inventory.filter(({ category }) => category !== "historical-inherited").every(({ locales }) => LOCALES.every((locale) => locales[locale]));
  const pages = inventory.flatMap(({ path, category, locales }) => LOCALES.filter((locale) => locales[locale]).map((locale) => ({ locale, path, category })));
  const links = packedRoot ? await inspectPackedDocumentation({ packedRoot, pages, packedFiles }) : { checked: 0, resolved: 0, external_fixed_commit: 0, external_other: 0, historical_inherited: 0, unclassified: [{ reason: "npm-pack-not-inspected" }] };
  const counts = Object.fromEntries(["current-product-translated", "byte-mirror", "historical-inherited", "unclassified"].map((category) => [category, inventory.filter((page) => page.category === category).length]));
  const complete = counts.unclassified === 0 && pairedCurrentProduct && routeParity && LOCALES.every((locale) => navigation[locale].missing.length === 0) && links.unclassified.length === 0;
  return {
    schema: "coco-documentation-completeness-v2",
    product_version: packageJson.version,
    status: complete ? "complete" : "incomplete",
    complete,
    generation: { deterministic: true, source: "scripts/generate-documentation-completeness.mjs", packed_artifact: "npm pack" },
    counts: { logical_pages: inventory.length, categories: counts, locale_markdown: Object.fromEntries(LOCALES.map((locale) => [locale, localePaths[locale].length])) },
    inventory,
    navigation: { route_parity: routeParity, locales: navigation },
    links,
  };
}

async function withNpmPackage(root, operation) {
  const temporary = await mkdtemp(join(tmpdir(), "coco-documentation-pack-"));
  try {
    const npmCli = join(root, "node_modules/npm/bin/npm-cli.js");
    const { stdout } = await exec(process.execPath, [npmCli, "pack", "--json", "--ignore-scripts", "--pack-destination", temporary], { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
    const [{ filename }] = JSON.parse(stdout);
    const tarball = join(temporary, filename);
    const { stdout: members } = await exec("tar", ["-tzf", tarball], { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
    const packedFiles = new Set(members.split("\n").filter((path) => path.startsWith("package/") && !path.endsWith("/")).map((path) => path.slice("package/".length)));
    await exec("tar", ["-xzf", tarball, "-C", temporary, "package/documentation"], { timeout: 60_000 });
    return await operation(join(temporary, "package"), packedFiles);
  } finally { await rm(temporary, { force: true, recursive: true }); }
}

export async function generateFromNpmPack(root) {
  return await withNpmPackage(root, async (packedRoot, packedFiles) => await generateDocumentationManifest({ root, packedRoot, packedFiles }));
}

function serialized(manifest) { return `${JSON.stringify(manifest, null, 2)}\n`; }

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const mode = process.argv[2];
  assert.ok(mode === "--write" || mode === "--check", "usage: generate-documentation-completeness.mjs --write|--check");
  const generated = await generateFromNpmPack(root);
  assert.equal(generated.complete, true, `documentation is incomplete: ${JSON.stringify(generated.links.unclassified)}`);
  const output = serialized(generated);
  if (mode === "--write") await writeFile(join(root, MANIFEST), output);
  else assert.equal(await readFile(join(root, MANIFEST), "utf8"), output, "documentation completeness manifest is stale; run with --write");
  process.stdout.write(`${generated.status}: ${generated.counts.logical_pages} pages, ${generated.links.checked} packed relative links, ${generated.links.unclassified.length} unclassified\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
