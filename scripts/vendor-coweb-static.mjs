import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, "coweb", "desktop");
const SOURCE = process.env.COWEB_STATIC_SOURCE || join(process.env.HOME || "/root", ".coco", "agent", "webui", "node_modules", "@lyhue1991", "pi-web");
const LOCK = process.env.COWEB_STATIC_LOCK || join(process.env.HOME || "/root", ".coco", "agent", "webui", "package-lock.json");
const SNAPSHOT = {
  source: "@lyhue1991/pi-web",
  sourceRevision: "b0d4532c82dfb252eb2c8a4e7edfb7d25090ce08",
  license: "MIT",
  version: "0.8.17",
  integrity: "sha512-cCJKkXUisUuFuNPx3pjfRYuKrA0575KLoB18oG07EiDwBikLjFXHY+gwph6zFb28ZYM2hLv22TQ07USjp64RkA==",
};

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function required(path) {
  try { return await stat(path); } catch { throw new Error(`COWEB_STATIC_SOURCE_MISSING:${path}`); }
}
async function regularFiles(root, path = root) {
  const info = await stat(path);
  if (info.isFile()) return [relative(root, path).split("\\").join("/")];
  const names = await readdir(path);
  return (await Promise.all(names.sort((left, right) => left.localeCompare(right)).map((name) => regularFiles(root, join(path, name))))).flat();
}
async function treeHash(root) {
  const digest = createHash("sha256");
  for (const path of await regularFiles(root)) {
    digest.update(path);
    digest.update("\0");
    digest.update(await readFile(join(root, path)));
    digest.update("\0");
  }
  return digest.digest("hex");
}
async function pruneTestRouteChunks(target) {
  const apiChunks = join(target, "_next", "static", "chunks", "app", "api");
  const removed = [];
  const visit = async (path) => {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === "test") {
          await rm(join(path, entry.name), { recursive: true, force: true });
          removed.push(relative(target, join(path, entry.name)).split("\\").join("/"));
        } else await visit(join(path, entry.name));
      }
    }
  };
  await visit(apiChunks).catch(() => {});
  return removed;
}
async function verifySource(source) {
  await Promise.all([
    required(join(source, "package.json")),
    required(join(source, "LICENSE")),
    required(join(source, ".next", "server", "app", "index.html")),
    required(join(source, ".next", "server", "app", "index.rsc")),
    required(join(source, ".next", "static")),
    required(join(source, "public")),
    required(LOCK),
  ]);
  const [packageJson, lock] = await Promise.all([
    readFile(join(source, "package.json"), "utf8").then(JSON.parse),
    readFile(LOCK, "utf8").then(JSON.parse),
  ]);
  const locked = lock.packages?.["node_modules/@lyhue1991/pi-web"];
  if (packageJson.name !== SNAPSHOT.source || packageJson.version !== SNAPSHOT.version || packageJson.license !== SNAPSHOT.license || locked?.version !== SNAPSHOT.version || locked?.integrity !== SNAPSHOT.integrity) throw new Error("COWEB_STATIC_SOURCE_UNPINNED");
}
async function writeSnapshot(source, target) {
  const index = join(target, "index.html");
  const original = await readFile(index, "utf8");
  const mobile = '<link rel="stylesheet" href="/coweb-mobile.css">';
  const branded = original.includes(mobile) ? original : original.replace("</head>", `${mobile}</head>`);
  await writeFile(index, branded);
  await cp(join(source, "LICENSE"), join(target, "LICENSE"));
  await writeFile(join(target, "SNAPSHOT.json"), `${JSON.stringify({ ...SNAPSHOT, treeSha256: await treeHash(target) }, null, 2)}\n`);
}

export async function vendorCowebStatic({ source = SOURCE, target = TARGET } = {}) {
  await verifySource(source);
  const staging = `${target}.staging-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true, mode: 0o755 });
  await Promise.all([
    cp(join(source, ".next", "static"), join(staging, "_next", "static"), { recursive: true }),
    cp(join(source, "public"), staging, { recursive: true }),
    cp(join(source, ".next", "server", "app", "index.html"), join(staging, "index.html")),
    cp(join(source, ".next", "server", "app", "index.rsc"), join(staging, "index.rsc")),
    cp(join(source, ".next", "server", "app", "index.segments"), join(staging, "index.segments"), { recursive: true }),
    cp(join(source, ".next", "server", "app", "manifest.webmanifest.body"), join(staging, "manifest.webmanifest")),
    cp(join(source, ".next", "server", "app", "favicon.ico.body"), join(staging, "favicon.ico")),
  ]);
  const pruned = await pruneTestRouteChunks(staging);
  await writeSnapshot(source, staging);
  await rm(target, { recursive: true, force: true });
  await rename(staging, target);
  return { pruned, source, target, treeSha256: JSON.parse(await readFile(join(target, "SNAPSHOT.json"), "utf8")).treeSha256, version: SNAPSHOT.version };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await vendorCowebStatic())}\n`);
}
