import { execFile } from "node:child_process";
import { lstat, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_MEMBERS = 25_000;
const ignoredDirectories = new Set([".coco-tools", "node_modules"]);
const archiveExtensions = new Set([".tgz", ".gz"]);
const testOnlyKey = ["sk", "test", "only", "invalid", "key"].join("-");
const detectors = [
  { id: "private-key-block", expression: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g },
  { id: "bearer-literal", expression: /\bAuthorization\s*:\s*Bearer\s+(?!\$\{|\{env:|YOUR_|bearer-test-only-invalid-key\b)[A-Za-z0-9._~+/=-]{12,}\b/gi },
  { id: "common-key-prefix", expression: /(?<![A-Za-z0-9_-])(?:sk|rk)_(?:live|prod)_[A-Za-z0-9_-]{8,}|(?<![A-Za-z0-9_-])(?:sk|pk)-[A-Za-z0-9_-]{12,}\b|(?<![A-Za-z0-9_-])(?:AKIA|ASIA)[A-Z0-9]{12,}\b|(?<![A-Za-z0-9_-])(?:ghp|gho|ghu|ghs|glpat)-[A-Za-z0-9_-]{12,}\b|(?<![A-Za-z0-9_-])github_pat_[A-Za-z0-9_-]{12,}\b|(?<![A-Za-z0-9_-])xox[baprs]-[A-Za-z0-9-]{12,}\b/g },
  { id: "credential-assignment", expression: /(?:^|[\n,;])\s*["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|token|credential)["']?\s*(?:=|:)\s*(["'])(?!\$\{|\{env:|YOUR_|test-only-invalid-key(?:["'\s,;]|$))[A-Za-z0-9._~+/=-]{12,}\1/gim },
];

function count(expression, text) {
  expression.lastIndex = 0;
  return Array.from(text.matchAll(expression)).filter((match) => !match[0].includes(testOnlyKey)).length;
}

export function scanText(text) {
  return detectors.flatMap(({ id, expression }) => {
    const matches = count(expression, text);
    return matches === 0 ? [] : [{ detector: id, count: matches }];
  });
}

function isText(buffer) {
  return !buffer.includes(0) && buffer.length <= MAX_TEXT_BYTES;
}

function safeMemberPath(member) {
  return member !== "" && !member.includes("\\") && !member.startsWith("/") && !/^[A-Za-z]:/.test(member) && !member.split("/").includes("..");
}

function isIgnoredPath(path) {
  return path.split("/").some((part) => ignoredDirectories.has(part));
}

async function listArchive(archive) {
  if ((await lstat(archive)).size > MAX_ARCHIVE_BYTES) return null;
  const [names, details] = await Promise.all([
    exec("tar", ["-tzf", archive], { maxBuffer: MAX_TEXT_BYTES }),
    exec("tar", ["--numeric-owner", "-tvzf", archive], { maxBuffer: MAX_TEXT_BYTES }),
  ]);
  const members = names.stdout.split("\n").filter(Boolean);
  const types = details.stdout.split("\n").filter(Boolean).map((line) => line[0]);
  const uncompressedBytes = details.stdout.split("\n").filter(Boolean).reduce((total, line) => total + Number(/^\S+\s+\S+\s+(\d+)\s+/.exec(line)?.[1] ?? 0), 0);
  if (members.length > MAX_ARCHIVE_MEMBERS || uncompressedBytes > MAX_ARCHIVE_BYTES || members.length !== types.length || members.some((member) => !safeMemberPath(member)) || types.some((type) => type !== "-" && type !== "d")) {
    return null;
  }
  return members.filter((member, index) => types[index] === "-");
}

async function scanArchive(archive) {
  let members;
  try {
    members = await listArchive(archive);
  } catch {
    return [{ path: archive, detector: "archive-unsafe", count: 1 }];
  }
  if (members === null) return [{ path: archive, detector: "archive-unsafe", count: 1 }];
  const extracted = await mkdtemp(join(tmpdir(), "coco-publication-scan-"));
  try {
    await exec("tar", ["-xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", extracted]);
    const findings = [];
    for (const member of members) {
      if (isIgnoredPath(member)) continue;
      const path = resolve(extracted, member);
      if (!path.startsWith(`${extracted}/`) || !(await lstat(path)).isFile()) return [{ path: archive, detector: "archive-unsafe", count: 1 }];
      const content = await readFile(path);
      if (!isText(content)) continue;
      for (const finding of scanText(content.toString("utf8"))) findings.push({ ...finding, path: `${archive}::${member}` });
    }
    return findings;
  } finally {
    await rm(extracted, { force: true, recursive: true });
  }
}

async function scanFile(path) {
  if (!(await lstat(path)).isFile()) return [{ path, detector: "scan-error", count: 1 }];
  if (archiveExtensions.has(extname(path))) return await scanArchive(path);
  const content = await readFile(path);
  if (!isText(content)) return [];
  return scanText(content.toString("utf8")).map((finding) => ({ ...finding, path }));
}

async function filesIn(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) paths.push(...await filesIn(root, path));
    if (!entry.isDirectory()) paths.push(path);
  }
  return paths;
}

export async function scanTarget(target) {
  const absolute = resolve(target);
  const info = await lstat(absolute);
  const files = info.isDirectory() ? await filesIn(absolute) : [absolute];
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
