import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, posix, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { inflateRawSync } from "node:zlib";

const exec = promisify(execFile);
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_CUMULATIVE_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_MEMBERS = 25_000;
const MAX_ARCHIVE_LIST_BYTES = 32 * 1024 * 1024;
const MAX_NESTED_ARCHIVE_DEPTH = 3;
const MAX_NESTED_ARCHIVES = 100;
const ignoredDirectories = new Set([".coco-tools", "node_modules"]);
const tarExtensions = new Set([".tgz", ".gz"]);
const zipExtensions = new Set([".zip", ".vsix"]);
const testOnlyKey = ["sk", "test", "only", "invalid", "key"].join("-");
const detectors = [
  { id: "bearer-literal", expression: /\bAuthorization\s{0,256}:\s{0,256}Bearer\s{1,256}(?!\$\{|\{env:|YOUR_|bearer-test-only-invalid-key\b)[A-Za-z0-9._~+/=-]{12,8192}\b/gi },
  { id: "npm-token", expression: /(?<![A-Za-z0-9_])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9_])/g },
  { id: "common-key-prefix", expression: /(?<![A-Za-z0-9_-])(?:sk|rk)_(?:live|prod)_[A-Za-z0-9_-]{8,8192}|(?<![A-Za-z0-9_-])(?:sk|pk)-[A-Za-z0-9_-]{12,8192}\b|(?<![A-Za-z0-9_-])(?:AKIA|ASIA)[A-Z0-9]{12,8192}\b|(?<![A-Za-z0-9_-])(?:ghp|gho|ghu|ghs|glpat)-[A-Za-z0-9_-]{12,8192}\b|(?<![A-Za-z0-9_-])github_pat_[A-Za-z0-9_-]{12,8192}\b|(?<![A-Za-z0-9_-])xox[baprs]-[A-Za-z0-9-]{12,8192}\b/g },
  { id: "credential-assignment", expression: /(?:^|[\n,;])\s{0,256}["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|token|credential)["']?\s{0,256}(?:=|:)\s{0,256}(["'])(?!\$\{|\{env:|YOUR_|test-only-invalid-key(?:["'\s,;]|$))([A-Za-z0-9._~+/=-]{12,8192})\1/gim },
];

function count(expression, text) {
  expression.lastIndex = 0;
  return Array.from(text.matchAll(expression)).filter((match) => {
    if (match[0].includes(testOnlyKey) || /^npm_(?:x{36}|0{36})$/i.test(match[0]) || /(?:AKIA|ASIA)[A-Z0-9]*EXAMPLE\b/.test(match[0])) return false;
    const literal = match[2] ?? /["']([^"']+)["']\s*$/.exec(match[0])?.[1];
    if (!literal) return true;
    const lower = literal.toLowerCase();
    let decoded = ""; try { decoded = Buffer.from(literal, "base64").toString("utf8").toLowerCase(); } catch {}
    return !(/^[A-Z][A-Z0-9_]+$/.test(literal) || ["access_token", "auth_token", "refresh_token", "token_type"].includes(lower) || /(?:^|[-_])(test|example|explicit|placeholder)(?:[-_]|$)/.test(lower) || /^(?:your-|my|i-am-|deadbeef|npm_your_)|sekrit/.test(lower) || decoded.startsWith("not my real "));
  }).length;
}

export function scanText(text) {
  const findings = detectors.flatMap(({ id, expression }) => {
    const matches = count(expression, text);
    return matches === 0 ? [] : [{ detector: id, count: matches }];
  });
  const privateKeys = countPrivateKeyBlocks(text); if (privateKeys > 0) findings.push({ detector: "private-key-block", count: privateKeys });
  return findings;
}

function countPrivateKeyBlocks(text) {
  const begin = /-----BEGIN ((?:[A-Z0-9 ]+ )?PRIVATE KEY)-----/g; let count = 0, match;
  while ((match = begin.exec(text)) !== null) { const end = `-----END ${match[1]}-----`, at = text.indexOf(end, begin.lastIndex); if (at >= 0 && at - begin.lastIndex <= 65_536) { const body = text.slice(begin.lastIndex, at).replace(/\\(?:n|r)|\\\[rs\]n|[^A-Za-z0-9]/g, ""); if (!/^X+$/i.test(body)) count += 1; begin.lastIndex = at + end.length; } }
  return count;
}

function scanBytes(buffer) {
  const findings = new Map(), chunkSize = MAX_TEXT_BYTES, overlap = 4096;
  for (let start = 0; start < buffer.length; start += chunkSize) {
    const from = Math.max(0, start - overlap), end = Math.min(buffer.length, start + chunkSize + overlap);
    let text = buffer.subarray(from, end).toString("latin1").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "\n");
    for (const finding of scanText(text)) findings.set(finding.detector, Math.max(findings.get(finding.detector) ?? 0, finding.count));
  }
  if (buffer.length > chunkSize && !findings.has("credential-assignment") && hasLongCredentialAssignment(buffer)) findings.set("credential-assignment", 1);
  return [...findings].map(([detector, count]) => ({ detector, count }));
}

function hasLongCredentialAssignment(buffer) {
  // This deliberately has no upper bound or closing-quote requirement. The
  // bounded normal detector handles ordinary assignments; these boundary
  // windows prevent a huge unterminated value from escaping chunk detection.
  const expression = /(?:^|[\n,;])\s{0,256}["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|token|credential)["']?\s{0,256}(?:=|:)\s{0,256}(["'])(?!\$\{|\{env:|YOUR_|test-only-invalid-key(?:["'\s,;]|$))[A-Za-z0-9._~+/=-]{12,}$/i;
  for (let start = 0; start < buffer.length; start += MAX_TEXT_BYTES) {
    const text = buffer.subarray(start, Math.min(buffer.length, start + MAX_TEXT_BYTES + 4096)).toString("latin1").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "\n");
    if (expression.test(text)) return true;
  }
  return false;
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function fileMetadata(info) {
  return {
    ctimeNs: info.ctimeNs,
    dev: info.dev,
    gid: info.gid,
    ino: info.ino,
    mode: info.mode,
    mtimeNs: info.mtimeNs,
    size: info.size,
    uid: info.uid,
  };
}

function sameMetadata(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

async function readRegularFile(path, maximum = MAX_ARCHIVE_BYTES) {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(maximum)) throw new Error("SCAN_SOURCE_INVALID");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameMetadata(fileMetadata(before), fileMetadata(opened))) throw new Error("SCAN_SOURCE_RACE");
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true }), current = await lstat(path, { bigint: true });
    const metadata = fileMetadata(opened);
    if (!sameMetadata(metadata, fileMetadata(after)) || !sameMetadata(metadata, fileMetadata(current)) || BigInt(bytes.length) !== opened.size) throw new Error("SCAN_SOURCE_RACE");
    return bytes;
  } finally { await handle.close(); }
}

function safeMemberPath(member) {
  const components = member.split("/");
  if (member.endsWith("/")) components.pop();
  return components.length > 0 && components.every((part) => part !== "" && part !== "." && part !== "..")
    && !member.includes("\\") && !member.startsWith("/") && !/^[A-Za-z]:/.test(member);
}

function canonicalTarMember(member) {
  if (member === "./") return "";
  const canonical = member.startsWith("./") ? member.slice(2) : member;
  return canonical.startsWith("./") || !safeMemberPath(canonical) ? null : canonical;
}

function memberSetValid(members) {
  const normalized = members.map((member) => ({ directory: member.endsWith("/"), member, path: member.endsWith("/") ? member.slice(0, -1) : member }));
  if (normalized.some(({ member }) => !safeMemberPath(member))) return false;
  normalized.sort((left, right) => left.path.localeCompare(right.path));
  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index], previous = normalized[index - 1];
    if (previous && (previous.path === current.path || (!previous.directory && current.path.startsWith(`${previous.path}/`)))) return false;
  }
  return true;
}

async function snapshotArchive(archive) {
  const directory = await mkdtemp(join(process.env.COCO_SCANNER_TMPDIR ?? tmpdir(), "coco-archive-snapshot-"));
  const path = join(directory, "archive");
  let source, target;
  try {
    const before = await lstat(archive);
    if (!before.isFile() || before.isSymbolicLink()) throw new Error("ARCHIVE_SOURCE_INVALID");
    source = await open(archive, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await source.stat();
    if (!opened.isFile() || !sameFile(before, opened)) throw new Error("ARCHIVE_SOURCE_RACE");
    target = await open(path, "wx", 0o600);
    let total = 0;
    const buffer = Buffer.alloc(64 * 1024);
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_ARCHIVE_BYTES) throw new Error("ARCHIVE_TOO_LARGE");
      let offset = 0;
      while (offset < bytesRead) {
        const { bytesWritten } = await target.write(buffer, offset, bytesRead - offset);
        if (bytesWritten <= 0) throw new Error("ARCHIVE_SNAPSHOT_FAILED");
        offset += bytesWritten;
      }
    }
    const after = await source.stat(), current = await lstat(archive);
    if (!sameFile(opened, after) || !sameFile(opened, current) || total !== opened.size) throw new Error("ARCHIVE_SOURCE_RACE");
    await target.sync();
    return { cleanup: () => rm(directory, { force: true, recursive: true }), path };
  } catch (error) { await rm(directory, { force: true, recursive: true }); throw error; }
  finally { await source?.close(); await target?.close(); }
}

async function listArchive(archive) {
  if ((await lstat(archive)).size > MAX_ARCHIVE_BYTES) return null;
  const [names, details] = await Promise.all([
    exec("tar", ["-tzf", archive], { maxBuffer: MAX_ARCHIVE_LIST_BYTES, timeout: 30_000 }),
    exec("tar", ["--numeric-owner", "-tvzf", archive], { maxBuffer: MAX_ARCHIVE_LIST_BYTES, timeout: 30_000 }),
  ]);
  const rawMembers = names.stdout.split("\n").filter(Boolean), members = rawMembers.map(canonicalTarMember);
  const detailLines = details.stdout.split("\n").filter(Boolean), types = detailLines.map((line) => line[0]);
  const sizes = detailLines.map((line) => Number(/^\S+\s+\S+\s+(\d+)\s+/.exec(line)?.[1] ?? 0));
  const totalBytes = sizes.reduce((total, size) => total + size, 0);
  const roots = members.filter((member) => member === "").length;
  if (members.length > MAX_ARCHIVE_MEMBERS || totalBytes > MAX_ARCHIVE_BYTES || members.length !== types.length || members.some((member, index) => member === null || (member === "" && (rawMembers[index] !== "./" || types[index] !== "d"))) || roots > 1 || !memberSetValid(members.filter(Boolean)) || types.some((type) => !["-", "d", "l"].includes(type))) {
    return null;
  }
  const regular = new Set(members.filter((_, index) => types[index] === "-"));
  for (let index = 0; index < members.length; index += 1) {
    if (types[index] !== "l") continue;
    const marker = `${rawMembers[index]} -> `, markerAt = detailLines[index].indexOf(marker), target = markerAt < 0 ? null : detailLines[index].slice(markerAt + marker.length);
    if (!target || target.startsWith("/") || target.includes("\\") || /^[A-Za-z]:/.test(target)) return null;
    const resolved = posix.normalize(posix.join(posix.dirname(members[index]), target));
    if (resolved === ".." || resolved.startsWith("../") || !regular.has(resolved)) return null;
  }
  return { members: members.filter((member, index) => types[index] === "-"), uncompressedBytes: members.reduce((total, member, index) => total + (types[index] === "-" && !archiveKind(member) ? sizes[index] : 0), 0) };
}

function reserveArchiveBudget(context, compressedBytes, uncompressedBytes) {
  context.compressedBytes += compressedBytes;
  context.uncompressedBytes += uncompressedBytes;
  if (context.compressedBytes > MAX_CUMULATIVE_ARCHIVE_BYTES || context.uncompressedBytes > MAX_CUMULATIVE_ARCHIVE_BYTES) throw new Error("ARCHIVE_BUDGET_EXCEEDED");
}

function archiveKind(path) {
  const extension = extname(path).toLowerCase();
  if (tarExtensions.has(extension)) return "tar";
  if (zipExtensions.has(extension)) return "zip";
  return undefined;
}

async function scanNestedArchive(content, member, reportPath, context, depth) {
  const nestedPath = `${reportPath}::${member}`;
  if (depth + 1 > MAX_NESTED_ARCHIVE_DEPTH || ++context.nestedArchives > MAX_NESTED_ARCHIVES) return [{ path: nestedPath, detector: "archive-unsafe", count: 1 }];
  const directory = await mkdtemp(join(process.env.COCO_SCANNER_TMPDIR ?? tmpdir(), "coco-nested-archive-"));
  const path = join(directory, basename(member));
  try {
    await writeFile(path, content, { flag: "wx", mode: 0o600 });
    return await scanFile(path, context, nestedPath, depth + 1);
  } catch {
    return [{ path: nestedPath, detector: "archive-unsafe", count: 1 }];
  } finally { await rm(directory, { force: true, recursive: true }); }
}

async function scanArchive(archive, context, reportPath, depth) {
  let snapshot;
  let members;
  try {
    snapshot = await snapshotArchive(archive);
    reserveArchiveBudget(context, (await lstat(snapshot.path)).size, 0);
    const listing = await listArchive(snapshot.path);
    if (listing !== null) {
      members = listing.members;
      reserveArchiveBudget(context, 0, listing.uncompressedBytes);
    } else members = null;
  } catch {
    if (snapshot) await snapshot.cleanup();
    return [{ path: reportPath, detector: "archive-unsafe", count: 1 }];
  }
  if (members === null) { await snapshot.cleanup(); return [{ path: reportPath, detector: "archive-unsafe", count: 1 }]; }
  let extracted;
  try {
    extracted = await mkdtemp(join(process.env.COCO_SCANNER_TMPDIR ?? tmpdir(), "coco-publication-scan-"));
    await exec("tar", ["-xzf", snapshot.path, "--no-same-owner", "--no-same-permissions", "-C", extracted], { timeout: 120_000 });
    const findings = [];
    const regularMembers = [];
    for (const member of members) {
      const path = resolve(extracted, member);
      if (!path.startsWith(`${extracted}/`) || !(await lstat(path)).isFile()) return [{ path: reportPath, detector: "archive-unsafe", count: 1 }];
      if (archiveKind(member)) findings.push(...await scanNestedArchive(await readRegularFile(path), member, reportPath, context, depth));
      else regularMembers.push({ member, path });
    }
    for (let start = 0; start < regularMembers.length; start += 32) {
      const batch = await Promise.all(regularMembers.slice(start, start + 32).map(async ({ member, path }) => ({ content: await readRegularFile(path), member })));
      for (const { content, member } of batch) for (const finding of scanBytes(content)) findings.push({ ...finding, path: `${reportPath}::${member}` });
    }
    return findings;
  } finally {
    if (extracted) await rm(extracted, { force: true, recursive: true });
    await snapshot.cleanup();
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipMembers(bytes) {
  const minimumEocd = 22;
  const candidates = [];
  for (let offset = bytes.length - minimumEocd; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (offset >= 0 && bytes.readUInt32LE(offset) === 0x06054b50 && offset + minimumEocd <= bytes.length && offset + minimumEocd + bytes.readUInt16LE(offset + 20) === bytes.length) candidates.push(offset);
  }
  if (candidates.length !== 1) return null;
  const [eocd] = candidates;
  if (bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0) return null;
  const diskCount = bytes.readUInt16LE(eocd + 8), count = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12), centralOffset = bytes.readUInt32LE(eocd + 16);
  if (diskCount !== count || count > MAX_ARCHIVE_MEMBERS || count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff || centralOffset + centralSize !== eocd) return null;
  const members = [];
  let offset = centralOffset, total = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) return null;
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24), nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32), externalAttributes = bytes.readUInt32LE(offset + 38), localOffset = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if ((flags & ~0x0800) !== 0 || ![0, 8].includes(method) || [compressedSize, size, localOffset].includes(0xffffffff) || next > bytes.length) return null;
    let name;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength)); } catch { return null; }
    if (!safeMemberPath(name)) return null;
    const unixType = (externalAttributes >>> 16) & 0o170000, directory = name.endsWith("/");
    if ((!directory && unixType !== 0 && unixType !== 0o100000) || (directory && unixType !== 0 && unixType !== 0o040000)) return null;
    total += size;
    if (size > MAX_ARCHIVE_BYTES || total > MAX_ARCHIVE_BYTES || compressedSize > MAX_ARCHIVE_BYTES) return null;
    members.push({ compressedSize, crc, directory, flags, localOffset, method, name, size }); offset = next;
  }
  if (offset !== centralOffset + centralSize || !memberSetValid(members.map(({ name }) => name))) return null;
  const ranges = [];
  for (const member of members) { const range = zipMemberRange(bytes, member, centralOffset); if (!range || ranges.some(({ localOffset }) => localOffset === member.localOffset)) return null; ranges.push(range); }
  ranges.sort((left, right) => left.start - right.start);
  if (ranges.length > 0 && (ranges[0].start !== 0 || ranges.some((range, index) => index > 0 && range.start !== ranges[index - 1].end) || ranges.at(-1).end !== centralOffset)) return null;
  if (ranges.length === 0 && centralOffset !== 0) return null;
  return members;
}

function zipMemberRange(bytes, member, centralOffset) {
  const offset = member.localOffset;
  if (offset + 30 > centralOffset || bytes.readUInt32LE(offset) !== 0x04034b50) return null;
  const flags = bytes.readUInt16LE(offset + 6), method = bytes.readUInt16LE(offset + 8), crc = bytes.readUInt32LE(offset + 14), compressedSize = bytes.readUInt32LE(offset + 18), size = bytes.readUInt32LE(offset + 22);
  const nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28), dataStart = offset + 30 + nameLength + extraLength, end = dataStart + member.compressedSize;
  if (flags !== member.flags || method !== member.method || crc !== member.crc || compressedSize !== member.compressedSize || size !== member.size || end > centralOffset) return null;
  let name; try { name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 30, offset + 30 + nameLength)); } catch { return null; }
  return name === member.name ? { end, localOffset: offset, start: offset } : null;
}

function zipMemberContent(bytes, member) {
  const offset = member.localOffset;
  if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) return null;
  const flags = bytes.readUInt16LE(offset + 6), method = bytes.readUInt16LE(offset + 8), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28), start = offset + 30 + nameLength + extraLength, end = start + member.compressedSize;
  if (flags !== member.flags || method !== member.method || end > bytes.length) return null;
  let name; try { name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 30, offset + 30 + nameLength)); } catch { return null; }
  if (name !== member.name) return null;
  try { const content = method === 0 ? Buffer.from(bytes.subarray(start, end)) : inflateRawSync(bytes.subarray(start, end), { maxOutputLength: member.size }); return content.length === member.size && crc32(content) === member.crc ? content : null; } catch { return null; }
}

async function scanZipArchive(archive, context, reportPath, depth) {
  let snapshot;
  try {
    snapshot = await snapshotArchive(archive);
    const bytes = await readFile(snapshot.path);
    reserveArchiveBudget(context, bytes.length, 0);
    const members = zipMembers(bytes);
    if (members === null) return [{ path: reportPath, detector: "archive-unsafe", count: 1 }];
    reserveArchiveBudget(context, 0, members.reduce((total, member) => total + (!member.directory && !archiveKind(member.name) ? member.size : 0), 0));
    const findings = [];
    for (const member of members) {
      const content = zipMemberContent(bytes, member);
      if (content === null) return [{ path: reportPath, detector: "archive-unsafe", count: 1 }];
      if (member.directory && (member.size !== 0 || member.compressedSize !== 0)) return [{ path: reportPath, detector: "archive-unsafe", count: 1 }];
      if (member.directory) continue;
      if (archiveKind(member.name)) findings.push(...await scanNestedArchive(content, member.name, reportPath, context, depth));
      else for (const finding of scanBytes(content)) findings.push({ ...finding, path: `${reportPath}::${member.name}` });
    }
    return findings;
  } catch { return [{ path: reportPath, detector: "archive-unsafe", count: 1 }]; }
  finally { if (snapshot) await snapshot.cleanup(); }
}

async function scanFile(path, context = { compressedBytes: 0, nestedArchives: 0, uncompressedBytes: 0 }, reportPath = path, depth = 0) {
  const kind = archiveKind(path);
  if (kind === "tar") return await scanArchive(path, context, reportPath, depth);
  if (kind === "zip") return await scanZipArchive(path, context, reportPath, depth);
  const content = await readRegularFile(path);
  return scanBytes(content).map((finding) => ({ ...finding, path: reportPath }));
}

async function filesIn(root, current = root, physicalRoot = undefined) {
  const rootPath = physicalRoot ?? await realpath(root);
  const before = await lstat(current), physical = await realpath(current);
  if (!before.isDirectory() || before.isSymbolicLink() || (physical !== rootPath && !physical.startsWith(`${rootPath}/`))) throw new Error("SCAN_DIRECTORY_INVALID");
  const entries = await readdir(current, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(current, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error("SCAN_DIRECTORY_INVALID");
    if (entry.isDirectory() !== info.isDirectory() || entry.isFile() !== info.isFile()) throw new Error("SCAN_DIRECTORY_RACE");
    if (info.isDirectory() && !ignoredDirectories.has(entry.name)) paths.push(...await filesIn(root, path, rootPath));
    if (info.isFile()) paths.push(path);
  }
  const after = await lstat(current);
  if (!sameFile(before, after) || await realpath(current) !== physical) throw new Error("SCAN_DIRECTORY_RACE");
  return paths;
}

async function copySnapshotFile(sourcePath, targetPath) {
  const before = await lstat(sourcePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("SCAN_SOURCE_INVALID");
  const source = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let target;
  try {
    const opened = await source.stat({ bigint: true });
    if (!opened.isFile() || !sameMetadata(fileMetadata(before), fileMetadata(opened))) throw new Error("SCAN_SOURCE_RACE");
    if (targetPath !== undefined) target = await open(targetPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
    let total = 0;
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      let offset = 0;
      while (offset < bytesRead) {
        const { bytesWritten } = target === undefined ? { bytesWritten: bytesRead - offset } : await target.write(buffer, offset, bytesRead - offset);
        if (bytesWritten <= 0) throw new Error("SCAN_SNAPSHOT_FAILED");
        offset += bytesWritten;
      }
      total += bytesRead;
    }
    const after = await source.stat({ bigint: true }), current = await lstat(sourcePath, { bigint: true });
    const metadata = fileMetadata(opened);
    if (!sameMetadata(metadata, fileMetadata(after)) || !sameMetadata(metadata, fileMetadata(current)) || BigInt(total) !== opened.size) throw new Error("SCAN_SOURCE_RACE");
    await target?.sync();
    return { digest: hash.digest("hex"), metadata };
  } finally {
    await source.close();
    await target?.close();
  }
}

async function captureDirectory(root, snapshotRoot, current = root, physicalRoot = undefined) {
  const rootPath = physicalRoot ?? await realpath(root);
  const before = await lstat(current, { bigint: true }), physical = await realpath(current);
  if (!before.isDirectory() || before.isSymbolicLink() || (physical !== rootPath && !physical.startsWith(`${rootPath}/`))) throw new Error("SCAN_DIRECTORY_INVALID");
  const records = [{ metadata: fileMetadata(before), path: relative(root, current), type: "directory" }];
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const sourcePath = resolve(current, entry.name), path = relative(root, sourcePath);
    const info = await lstat(sourcePath, { bigint: true });
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error("SCAN_DIRECTORY_INVALID");
    if (entry.isDirectory() !== info.isDirectory() || entry.isFile() !== info.isFile()) throw new Error("SCAN_DIRECTORY_RACE");
    if (info.isDirectory() && !ignoredDirectories.has(entry.name)) records.push(...await captureDirectory(root, snapshotRoot, sourcePath, rootPath));
    if (info.isFile()) {
      if (snapshotRoot !== undefined) await mkdir(resolve(snapshotRoot, path, ".."), { recursive: true, mode: 0o700 });
      records.push({ ...await copySnapshotFile(sourcePath, snapshotRoot === undefined ? undefined : resolve(snapshotRoot, path)), path, type: "file" });
    }
  }
  const after = await lstat(current, { bigint: true });
  if (!sameMetadata(fileMetadata(before), fileMetadata(after)) || await realpath(current) !== physical) throw new Error("SCAN_DIRECTORY_RACE");
  return records;
}

function sameInventory(left, right) {
  return left.length === right.length && left.every((record, index) => {
    const other = right[index];
    return other !== undefined && record.path === other.path && record.type === other.type
      && record.digest === other.digest && sameMetadata(record.metadata, other.metadata);
  });
}

async function snapshotDirectory(root, hooks) {
  const directory = await mkdtemp(join(process.env.COCO_SCANNER_TMPDIR ?? tmpdir(), "coco-directory-snapshot-"));
  try {
    const enumerated = (await filesIn(root)).map((path) => relative(root, path)).sort();
    await hooks.afterDirectoryInventory?.();
    const inventory = await captureDirectory(root, directory);
    const captured = inventory.filter(({ type }) => type === "file").map(({ path }) => path).sort();
    if (enumerated.length !== captured.length || enumerated.some((path, index) => path !== captured[index])) throw new Error("SCAN_DIRECTORY_RACE");
    return { cleanup: () => rm(directory, { force: true, recursive: true }), directory, inventory };
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
}

export async function scanTarget(target, hooks = {}) {
  const absolute = resolve(target);
  const info = await lstat(absolute);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error("SCAN_SOURCE_INVALID");
  if (info.isDirectory()) {
    const snapshot = await snapshotDirectory(absolute, hooks);
    try {
      const findings = [];
      for (const { path, type } of snapshot.inventory) {
        if (type !== "file") continue;
        const snapshotPath = resolve(snapshot.directory, path), originalPath = resolve(absolute, path);
        try {
          for (const finding of await scanFile(snapshotPath)) findings.push({ ...finding, path: finding.path.replace(snapshotPath, originalPath) });
        } catch {
          findings.push({ path: originalPath, detector: "scan-error", count: 1 });
        }
      }
      await hooks.beforeDirectoryRevalidation?.();
      const current = await captureDirectory(absolute);
      if (!sameInventory(snapshot.inventory, current)) throw new Error("SCAN_DIRECTORY_RACE");
      return findings.map((finding) => ({ ...finding, path: relative(process.cwd(), finding.path) || basename(finding.path) }));
    } finally {
      await snapshot.cleanup();
    }
  }
  const files = [absolute];
  const findings = [];
  for (const file of files) {
    try {
      findings.push(...await scanFile(file));
    } catch {
      findings.push({ path: file, detector: "scan-error", count: 1 });
    }
  }
  return findings.map((finding) => ({ ...finding, path: relative(process.cwd(), finding.path) || basename(finding.path) }));
}

function format(finding) {
  return `${finding.path}\t${finding.detector}\t${finding.count}`;
}

async function main() {
  const targets = process.argv.slice(2);
  const requested = targets.length === 0 ? [process.cwd()] : targets;
  const findings = [];
  for (const target of requested) {
    try {
      findings.push(...await scanTarget(target));
    } catch {
      findings.push({ path: target, detector: "scan-error", count: 1 });
    }
  }
  if (findings.length === 0) {
    for (const target of requested) process.stdout.write(`${target}\tclean\t0\n`);
    return;
  }
  for (const finding of findings) process.stdout.write(`${format(finding)}\n`);
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();
