import { createHash } from "node:crypto";
import { chmod, lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, readCanonicalJson } from "./canonical-json.mjs";

const ENTRY_FIELDS = ["attempt", "name", "role", "runId", "sha256", "size", "sourceCommit", "tag", "version"];
const RECEIPT_FIELDS = ["assets", "attempt", "checks", "draftId", "manifestSha256", "runId", "schemaVersion", "sourceCommit", "status", "tag", "version"];
const HEX = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function binding(options) {
  const result = {
    attempt: String(options.attempt ?? ""),
    runId: String(options.runId ?? ""),
    sourceCommit: String(options.sourceCommit ?? "").toLowerCase(),
    tag: String(options.tag ?? ""),
    version: String(options.version ?? ""),
  };
  if (!POSITIVE_INTEGER.test(result.attempt) || !POSITIVE_INTEGER.test(result.runId)
    || !COMMIT.test(result.sourceCommit) || result.tag !== `v${result.version}` || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(result.version)) fail("RELEASE_BINDING_INVALID");
  return result;
}

function draftId(value) {
  const result = String(value ?? "");
  if (!POSITIVE_INTEGER.test(result)) fail("RELEASE_DRAFT_MISMATCH");
  return result;
}

export function releaseOwnershipMarker(options) {
  const expected = binding(options);
  return `<!-- coco-release-owner run=${expected.runId} attempt=${expected.attempt} commit=${expected.sourceCommit} -->`;
}

export function parseReleaseOwnershipMarker(value) {
  const match = /^<!-- coco-release-owner run=([1-9][0-9]*) attempt=([1-9][0-9]*) commit=([a-f0-9]{40}) -->$/.exec(String(value ?? ""));
  return match ? { attempt: match[2], runId: match[1], sourceCommit: match[3] } : null;
}

export function planDraftRecovery({ release, ...options }) {
  try {
    const expected = binding(options);
    if (release === null || release === undefined) return { action: "create", status: "approved" };
    if (release?.tag_name !== expected.tag) fail("RELEASE_TAG_MISMATCH");
    if (release?.draft !== true) fail("RELEASE_ALREADY_PUBLISHED");
    const id = draftId(release.id), owner = parseReleaseOwnershipMarker(release.body);
    if (!owner || owner.runId !== expected.runId || owner.sourceCommit !== expected.sourceCommit) fail("RELEASE_OWNERSHIP_MISMATCH");
    if (BigInt(owner.attempt) > BigInt(expected.attempt)) fail("RELEASE_ATTEMPT_STALE");
    return { action: owner.attempt === expected.attempt ? "reuse" : "takeover", draftId: id, previousAttempt: owner.attempt, status: "approved" };
  } catch (error) {
    return reject(error);
  }
}

export function verifyDraftOwnership({ release, ...options }) {
  try {
    const expected = binding(options), expectedDraftId = draftId(options.draftId);
    if (String(release?.id ?? "") !== expectedDraftId) fail("RELEASE_DRAFT_MISMATCH");
    if (release?.tag_name !== expected.tag) fail("RELEASE_TAG_MISMATCH");
    if (release?.draft !== true) fail("RELEASE_DRAFT_NOT_PRIVATE");
    if (release?.body !== releaseOwnershipMarker(expected)) fail("RELEASE_OWNERSHIP_MISMATCH");
    return { draftId: expectedDraftId, status: "approved" };
  } catch (error) {
    return reject(error);
  }
}

export function expectedReleaseAssets(version) {
  return [
    ["install.sh", "installer"],
    ["uninstall.sh", "uninstaller"],
    [`coco-${version}.tgz`, "npm-package"],
    [`coco-${version}.tgz.sha256`, "npm-package-checksum"],
    [`coco-${version}-offline-linux-x64.zip`, "offline-bundle"],
    [`coco-${version}-offline-linux-x64.zip.sha256`, "offline-bundle-checksum"],
    [`coco-agent-${version}.vsix`, "vscode-extension"],
    [`coco-agent-${version}.vsix.sha256`, "vscode-extension-checksum"],
    ["SHA256SUMS", "checksum-manifest"],
  ].map(([name, role]) => ({ name, role }));
}

function semanticRole(name) {
  if (name === "install.sh") return "installer";
  if (name === "uninstall.sh") return "uninstaller";
  if (name === "SHA256SUMS") return "checksum-manifest";
  if (/^coco-agent-.*\.vsix\.sha256$/.test(name)) return "vscode-extension-checksum";
  if (/^coco-agent-.*\.vsix$/.test(name)) return "vscode-extension";
  if (/^coco-.*-offline-.*\.zip\.sha256$/.test(name)) return "offline-bundle-checksum";
  if (/^coco-.*-offline-.*\.zip$/.test(name)) return "offline-bundle";
  if (/^coco-.*\.tgz\.sha256$/.test(name)) return "npm-package-checksum";
  if (/^coco-.*\.tgz$/.test(name)) return "npm-package";
  return null;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function reject(error) {
  return { code: typeof error?.code === "string" && error.code.startsWith("RELEASE_") ? error.code : "RELEASE_CONTRACT_UNAVAILABLE", status: "rejected" };
}

function validateManifest(manifest, expected) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)
    || Object.keys(manifest).sort().join(",") !== "assets,schemaVersion" || manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length !== 9) fail("RELEASE_MANIFEST_INVALID");
  const names = new Set(), roles = new Set();
  for (const entry of manifest.assets) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== ENTRY_FIELDS.join(",")
      || typeof entry.name !== "string" || typeof entry.role !== "string" || !Number.isSafeInteger(entry.size) || entry.size < 0 || !HEX.test(entry.sha256)) fail("RELEASE_MANIFEST_INVALID");
    if (entry.version !== expected.version) fail("RELEASE_VERSION_MISMATCH");
    if (entry.tag !== expected.tag) fail("RELEASE_TAG_MISMATCH");
    if (entry.sourceCommit !== expected.sourceCommit) fail("RELEASE_COMMIT_MISMATCH");
    if (entry.runId !== expected.runId) fail("RELEASE_RUN_MISMATCH");
    if (entry.attempt !== expected.attempt) fail("RELEASE_ATTEMPT_STALE");
    if (names.has(entry.name)) fail("RELEASE_ASSET_DUPLICATE");
    if (roles.has(entry.role) || semanticRole(entry.name) !== entry.role) fail("RELEASE_ASSET_SEMANTIC_DUPLICATE");
    names.add(entry.name); roles.add(entry.role);
  }
  const inventory = expectedReleaseAssets(expected.version);
  for (const item of inventory) {
    const entry = manifest.assets.find((candidate) => candidate.name === item.name);
    if (!entry) fail("RELEASE_ASSET_MISSING");
    if (entry.role !== item.role) fail("RELEASE_ASSET_SEMANTIC_DUPLICATE");
  }
  return manifest.assets;
}

async function regularBytes(path) {
  const info = await lstat(path).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) fail("RELEASE_LOCAL_ASSET_INVALID");
  return readFile(path);
}

export async function createReleaseArtifactManifest({ directory, ...options }) {
  try {
    const expected = binding(options);
    const names = (await readdir(directory)).sort();
    const inventory = expectedReleaseAssets(expected.version);
    const wanted = inventory.map((item) => item.name).sort();
    if (names.some((name, index) => name !== wanted[index]) || names.length !== wanted.length) fail(names.some((name) => !wanted.includes(name)) ? "RELEASE_ASSET_EXTRA" : "RELEASE_ASSET_MISSING");
    const assets = await Promise.all(inventory.map(async ({ name, role }) => {
      const bytes = await regularBytes(join(directory, name));
      return { ...expected, name, role, sha256: digest(bytes), size: bytes.length };
    }));
    return { manifest: { assets, schemaVersion: 1 }, status: "approved" };
  } catch (error) {
    return reject(error);
  }
}

export async function verifyLocalReleaseArtifacts({ directory, manifest, ...options }) {
  try {
    const expected = binding(options), entries = validateManifest(manifest, expected);
    const names = (await readdir(directory)).sort(), wanted = entries.map((entry) => entry.name).sort();
    if (names.length !== wanted.length || names.some((name, index) => name !== wanted[index])) fail(names.some((name) => !wanted.includes(name)) ? "RELEASE_ASSET_EXTRA" : "RELEASE_ASSET_MISSING");
    for (const entry of entries) {
      const bytes = await regularBytes(join(directory, entry.name));
      if (bytes.length !== entry.size) fail("RELEASE_ASSET_SIZE_MISMATCH");
      if (digest(bytes) !== entry.sha256) fail("RELEASE_ASSET_DIGEST_MISMATCH");
    }
    return { assets: entries.length, status: "approved" };
  } catch (error) {
    return reject(error);
  }
}

export function verifyRemoteReleaseArtifacts({ commit, manifest, release, ...options }) {
  try {
    const expected = binding(options), entries = validateManifest(manifest, expected);
    if (String(release?.id ?? "") !== draftId(options.draftId)) fail("RELEASE_DRAFT_MISMATCH");
    const recovery = planDraftRecovery({ release, ...expected });
    if (recovery.status !== "approved") fail(recovery.code);
    if (String(commit?.sha ?? "").toLowerCase() !== expected.sourceCommit) fail("RELEASE_COMMIT_MISMATCH");
    if (!Array.isArray(release?.assets)) fail("RELEASE_REMOTE_INVALID");
    const names = new Set(), roles = new Set();
    for (const asset of release.assets) {
      if (typeof asset?.name !== "string") fail("RELEASE_REMOTE_INVALID");
      if (names.has(asset.name)) fail("RELEASE_ASSET_DUPLICATE");
      names.add(asset.name);
      const role = semanticRole(asset.name);
      if (role && roles.has(role)) fail("RELEASE_ASSET_SEMANTIC_DUPLICATE");
      if (role) roles.add(role);
    }
    if (release.assets.some((asset) => !entries.some((entry) => entry.name === asset.name))) fail("RELEASE_ASSET_EXTRA");
    for (const entry of entries) {
      const asset = release.assets.find((candidate) => candidate.name === entry.name);
      if (!asset) fail("RELEASE_ASSET_MISSING");
      if (asset.size !== entry.size) fail("RELEASE_ASSET_SIZE_MISMATCH");
      if (asset.digest !== `sha256:${entry.sha256}`) fail("RELEASE_ASSET_DIGEST_MISMATCH");
    }
    return { assets: entries.length, status: "approved" };
  } catch (error) {
    return reject(error);
  }
}

export function planRemoteAssetRecovery({ manifest, release, ...options }) {
  try {
    const expected = binding(options), entries = validateManifest(manifest, expected);
    if (!Array.isArray(release?.assets)) fail("RELEASE_REMOTE_INVALID");
    const names = new Set(), missing = [];
    for (const asset of release.assets) {
      if (typeof asset?.name !== "string") fail("RELEASE_REMOTE_INVALID");
      if (names.has(asset.name)) fail("RELEASE_ASSET_DUPLICATE");
      names.add(asset.name);
      const entry = entries.find((candidate) => candidate.name === asset.name);
      if (!entry) fail("RELEASE_ASSET_EXTRA");
      if (asset.size !== entry.size) fail("RELEASE_ASSET_SIZE_MISMATCH");
      if (asset.digest !== `sha256:${entry.sha256}`) fail("RELEASE_ASSET_DIGEST_MISMATCH");
    }
    for (const entry of entries) if (!names.has(entry.name)) missing.push(entry.name);
    return { missing, reused: entries.length - missing.length, status: "approved" };
  } catch (error) {
    return reject(error);
  }
}

export async function writePrivateReleaseReceipt({ manifest, path, ...options }) {
  try {
    const expected = binding(options), expectedDraftId = draftId(options.draftId);
    validateManifest(manifest, expected);
    const checks = options.checks ?? { offline: "approved", online: "approved", vsix: "approved" };
    if (checks === null || typeof checks !== "object" || Array.isArray(checks) || Object.keys(checks).sort().join(",") !== "offline,online,vsix" || Object.values(checks).some((value) => value !== "approved")) fail("RELEASE_RECEIPT_INVALID");
    const receipt = { ...expected, assets: 9, checks, draftId: expectedDraftId, manifestSha256: digest(Buffer.from(canonicalJson(manifest))), schemaVersion: 1, status: "approved" };
    await writeFile(path, canonicalJson(receipt), { flag: "wx", mode: 0o600 });
    await chmod(path, 0o600);
    return { receipt, status: "approved" };
  } catch (error) {
    return reject(error);
  }
}

export function verifyPrivateReleaseReceipt({ manifest, receipt, ...options }) {
  try {
    const expected = binding(options), expectedDraftId = draftId(options.draftId);
    validateManifest(manifest, expected);
    if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt) || Object.keys(receipt).sort().join(",") !== RECEIPT_FIELDS.join(",")
      || receipt.schemaVersion !== 1 || receipt.status !== "approved" || receipt.assets !== 9) fail("RELEASE_RECEIPT_INVALID");
    for (const field of ["attempt", "runId", "sourceCommit", "tag", "version"]) if (receipt[field] !== expected[field]) fail(field === "attempt" ? "RELEASE_ATTEMPT_STALE" : field === "runId" ? "RELEASE_RUN_MISMATCH" : "RELEASE_RECEIPT_INVALID");
    if (receipt.draftId !== expectedDraftId) fail("RELEASE_DRAFT_MISMATCH");
    if (receipt.manifestSha256 !== digest(Buffer.from(canonicalJson(manifest)))) fail("RELEASE_RECEIPT_MANIFEST_MISMATCH");
    if (receipt.checks === null || typeof receipt.checks !== "object" || Array.isArray(receipt.checks) || Object.keys(receipt.checks).sort().join(",") !== "offline,online,vsix" || Object.values(receipt.checks).some((value) => value !== "approved")) fail("RELEASE_RECEIPT_INVALID");
    return { draftId: expectedDraftId, status: "approved" };
  } catch (error) {
    return reject(error);
  }
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) fail("RELEASE_ARGUMENT_INVALID");
  return process.argv[index + 1];
}

async function main() {
  const command = process.argv[2];
  const options = { attempt: argument("attempt"), runId: argument("run-id"), sourceCommit: argument("source-commit"), tag: argument("tag"), version: argument("version") };
  let result;
  if (command === "generate") {
    result = await createReleaseArtifactManifest({ directory: argument("directory"), ...options });
    if (result.status === "approved") await writeFile(argument("output"), canonicalJson(result.manifest), { flag: "wx", mode: 0o600 });
  } else {
    const { parsed: manifest } = await readCanonicalJson(argument("manifest"), "RELEASE_MANIFEST_INVALID");
    if (command === "verify-local") result = await verifyLocalReleaseArtifacts({ directory: argument("directory"), manifest, ...options });
    else if (command === "verify-remote") {
      const release = JSON.parse(await readFile(argument("release-json"), "utf8"));
      const commit = JSON.parse(await readFile(argument("commit-json"), "utf8"));
      result = verifyRemoteReleaseArtifacts({ commit, manifest, release, draftId: argument("draft-id"), ...options });
    } else if (command === "receipt") {
      result = await writePrivateReleaseReceipt({ manifest, path: argument("output"), draftId: argument("draft-id"), ...options });
    } else if (command === "verify-receipt") {
      const { parsed: receipt } = await readCanonicalJson(argument("receipt"), "RELEASE_RECEIPT_INVALID");
      result = verifyPrivateReleaseReceipt({ manifest, receipt, draftId: argument("draft-id"), ...options });
    } else fail("RELEASE_ARGUMENT_INVALID");
  }
  console.log(canonicalJson(result).trim());
  if (result.status !== "approved") process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((error) => { console.error(error?.code ?? "RELEASE_CONTRACT_UNAVAILABLE"); process.exitCode = 1; });
