import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifySelectiveForkEvidence } from "./verify-selective-fork-evidence.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const evidenceFile = resolve(root, "resources", "selective-fork-promotion-evidence.v1.json");
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;

const rejected = (code) => ({ code, status: "rejected" });

function expectedUrls(evidence) {
  try {
    const repository = new URL(evidence.candidate.repository);
    if (repository.protocol !== "https:" || repository.hostname !== "github.com" || repository.search || repository.hash || repository.pathname.split("/").filter(Boolean).length !== 2) throw new Error("invalid");
    const base = `${repository.origin}${repository.pathname.replace(/\/$/, "")}`;
    const tag = evidence.candidate.sourceTag;
    const artifactName = basename(new URL(evidence.candidate.package.artifact).pathname);
    const release = `${base}/releases/tag/${tag}`;
    const artifact = `${base}/releases/download/${tag}/${artifactName}`;
    if (evidence.candidate.package.remoteRelease !== release || evidence.candidate.package.artifact !== artifact) throw new Error("invalid");
    return { artifact, release };
  } catch {
    return null;
  }
}

function trustedResponseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && (url.hostname === "github.com" || url.hostname.endsWith(".githubusercontent.com"));
  } catch {
    return false;
  }
}

async function readBounded(response, expectedBytes) {
  if (!response.body || typeof response.body.getReader !== "function") throw new Error("body");
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("chunk");
      length += value.length;
      if (length > expectedBytes || length > MAX_ARTIFACT_BYTES) { const error = new Error("size"); error.code = "SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH"; throw error; }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

export async function verifyRemoteSelectiveForkArtifact({ artifactPath, evidencePath = evidenceFile, fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
  const local = await verifySelectiveForkEvidence({ evidencePath });
  if (local.status !== "approved") return local;
  let evidence;
  try { evidence = JSON.parse(await readFile(evidencePath, "utf8")); } catch { return rejected("SELECTIVE_FORK_EVIDENCE_INVALID"); }
  const urls = expectedUrls(evidence);
  const expected = evidence.candidate.package;
  if (!urls || !Number.isInteger(expected.bytes) || expected.bytes <= 0 || expected.bytes > MAX_ARTIFACT_BYTES || typeof fetchImpl !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) return rejected("SELECTIVE_FORK_REMOTE_REQUEST_INVALID");
  if (artifactPath !== undefined && (typeof artifactPath !== "string" || !isAbsolute(artifactPath))) return rejected("SELECTIVE_FORK_ARTIFACT_OUTPUT_INVALID");
  try {
    const response = await fetchImpl(urls.artifact, { headers: { accept: "application/octet-stream", "user-agent": "coco-selective-fork-verifier" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return rejected("SELECTIVE_FORK_REMOTE_DOWNLOAD_FAILED");
    if (!trustedResponseUrl(response.url)) return rejected("SELECTIVE_FORK_REMOTE_REDIRECT_INVALID");
    const contentLength = response.headers?.get?.("content-length");
    if (contentLength !== null && contentLength !== undefined && Number(contentLength) !== expected.bytes) return rejected("SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH");
    const bytes = await readBounded(response, expected.bytes);
    if (bytes.length !== expected.bytes || bytes.length > MAX_ARTIFACT_BYTES) return rejected("SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    if (sha256 !== expected.sha256 || integrity !== expected.integrity) return rejected("SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH");
    if (artifactPath !== undefined) {
      try { await writeFile(artifactPath, bytes, { flag: "wx", mode: 0o600 }); } catch { return rejected("SELECTIVE_FORK_ARTIFACT_OUTPUT_FAILED"); }
    }
    return { artifact: urls.artifact, bytes: bytes.length, integrity, sha256, sourceCommit: evidence.candidate.sourceCommit, sourceTag: evidence.candidate.sourceTag, status: "approved", promotionAuthorized: false };
  } catch (error) {
    return rejected(error?.code === "SELECTIVE_FORK_REMOTE_ARTIFACT_INTEGRITY_MISMATCH" ? error.code : "SELECTIVE_FORK_REMOTE_DOWNLOAD_FAILED");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const artifactPath = args.length === 0 ? undefined : args.length === 2 && args[0] === "--output" ? resolve(args[1]) : null;
  const result = artifactPath === null ? rejected("SELECTIVE_FORK_REMOTE_USAGE") : await verifyRemoteSelectiveForkArtifact({ artifactPath });
  console.log(JSON.stringify(result));
  process.exit(result.status === "approved" ? 0 : 1);
}
