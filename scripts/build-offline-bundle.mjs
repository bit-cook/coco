import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const NODE_VERSION = "22.23.2";
const platformMap = { darwin: "darwin", linux: "linux" };
const architectureMap = { arm64: "arm64", x64: "x64" };

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function execute(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => execFile(command, args, { maxBuffer: 32 * 1024 * 1024, ...options }, (error, stdout) => error ? reject(error) : resolvePromise(stdout)));
}
async function download(url, output) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || response.body === null) fail("OFFLINE_BUNDLE_DOWNLOAD_FAILED");
  await pipeline(response.body, createWriteStream(output, { flags: "wx", mode: 0o600 }));
}
async function regularFiles(directory, prefix = "") {
  const output = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), relative = prefix === "" ? name : `${prefix}/${name}`;
    const info = await stat(path);
    if (info.isDirectory()) output.push(...await regularFiles(path, relative));
    else if (info.isFile()) output.push({ mode: info.mode & 0o111 ? 0o755 : 0o644, path, relative });
    else fail("OFFLINE_BUNDLE_UNSAFE_ENTRY");
  }
  return output;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) === 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function u16(value) { const result = Buffer.alloc(2); result.writeUInt16LE(value); return result; }
function u32(value) { const result = Buffer.alloc(4); result.writeUInt32LE(value >>> 0); return result; }
export async function writeZip(directory, output, bundleRoot = "") {
  const files = await regularFiles(directory);
  const chunks = [], central = [];
  let offset = 0;
  for (const file of files) {
    const bytes = await readFile(file.path), name = Buffer.from(bundleRoot ? `${bundleRoot}/${file.relative}` : file.relative), crc = crc32(bytes);
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(0x21), u32(crc), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), name]);
    chunks.push(local, bytes);
    central.push(Buffer.concat([u32(0x02014b50), u16((3 << 8) | 20), u16(20), u16(0x800), u16(0), u16(0), u16(0x21), u32(crc), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(file.mode << 16), u32(offset), name]));
    offset += local.length + bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(offset), u16(0)]);
  await writeFile(output, Buffer.concat([...chunks, centralBytes, end]), { flag: "wx", mode: 0o644 });
}

export async function buildOfflineBundle({ nodeArchive, outputDirectory = join(root, "release") } = {}) {
  const platform = platformMap[process.platform], architecture = architectureMap[process.arch];
  if (!platform || !architecture) fail("OFFLINE_BUNDLE_PLATFORM_UNSUPPORTED");
  const target = `${platform}-${architecture}`;
  const workspace = await mkdtemp(join(tmpdir(), "coco-offline-bundle-"));
  const bundleRoot = `coco-${version}-offline-${target}`;
  const bundle = join(workspace, bundleRoot);
  try {
    await mkdir(bundle, { recursive: true });
    await mkdir(outputDirectory, { recursive: true });
    await execute(process.execPath, [join(root, "node_modules/npm/bin/npm-cli.js"), "pack", "--pack-destination", workspace], { cwd: root });
    const packageSource = join(workspace, `coco-${version}.tgz`);
    await copyFile(packageSource, join(bundle, "coco-package.tgz"));

    const nodeFilename = `node-v${NODE_VERSION}-${target}.tar.gz`;
    const nodePath = join(workspace, nodeFilename);
    let expectedNodeHash;
    if (nodeArchive) {
      await copyFile(resolve(nodeArchive), nodePath);
      expectedNodeHash = process.env.COCO_NODE_ARCHIVE_SHA256;
      if (!/^[a-f0-9]{64}$/.test(expectedNodeHash ?? "")) fail("OFFLINE_BUNDLE_NODE_SHA256_REQUIRED");
    } else {
      const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
      const checksumsPath = join(workspace, "SHASUMS256.txt");
      await download(`${base}/SHASUMS256.txt`, checksumsPath);
      const checksums = await readFile(checksumsPath, "utf8");
      expectedNodeHash = checksums.split("\n").map((line) => line.trim().split(/\s+/)).find(([, name]) => name === nodeFilename)?.[0];
      if (!/^[a-f0-9]{64}$/.test(expectedNodeHash ?? "")) fail("OFFLINE_BUNDLE_NODE_CHECKSUM_MISSING");
      await download(`${base}/${nodeFilename}`, nodePath);
    }
    if (sha256(await readFile(nodePath)) !== expectedNodeHash) fail("OFFLINE_BUNDLE_NODE_CHECKSUM_MISMATCH");

    const nodeExtract = join(workspace, "node-extract");
    await mkdir(nodeExtract);
    await execute("tar", ["-xzf", nodePath, "-C", nodeExtract, "--strip-components=1"]);
    const normalizedNode = join(bundle, "node-runtime.tar.gz");
    await execute("tar", ["-czf", normalizedNode, "-C", nodeExtract, "."]);

    await copyFile(join(root, "offline-install.sh"), join(bundle, "offline-install.sh"));
    await chmod(join(bundle, "offline-install.sh"), 0o755);
    await copyFile(join(root, "uninstall.sh"), join(bundle, "uninstall.sh"));
    await chmod(join(bundle, "uninstall.sh"), 0o755);
    await writeFile(join(bundle, "platform.txt"), `${target}\n`);
    await writeFile(join(bundle, "README.txt"), `CoCo ${version} offline bundle for ${target}\n\n1. Extract this ZIP.\n2. Optionally set COCO_INTRANET_BASE_URL and COCO_INTRANET_MODEL_ID.\n3. Run: bash offline-install.sh\n\nSee the bundled CoCo manuals after installation.\n`);
    const checksummed = ["coco-package.tgz", "node-runtime.tar.gz", "offline-install.sh", "uninstall.sh", "platform.txt", "README.txt"];
    const lines = [];
    for (const name of checksummed) lines.push(`${sha256(await readFile(join(bundle, name)))}  ${name}`);
    await writeFile(join(bundle, "SHA256SUMS"), `${lines.join("\n")}\n`);

    const zipPath = join(outputDirectory, `${bundleRoot}.zip`);
    await rm(zipPath, { force: true });
    await writeZip(bundle, zipPath, bundleRoot);
    const zipHash = sha256(await readFile(zipPath));
    await writeFile(`${zipPath}.sha256`, `${zipHash}  ${basename(zipPath)}\n`, { mode: 0o644 });
    return { nodeVersion: NODE_VERSION, path: zipPath, platform: target, sha256: zipHash, version };
  } finally { await rm(workspace, { force: true, recursive: true }); }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await buildOfflineBundle({ nodeArchive: process.env.COCO_NODE_ARCHIVE, outputDirectory: process.argv[2] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
