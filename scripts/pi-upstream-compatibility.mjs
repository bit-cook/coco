import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

import { applyCocoIdentityPatch } from "./apply-coco-identity-patch.mjs";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const exactVersion = /^\d+\.\d+\.\d+$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const npmCli = join(root, "node_modules", "npm", "bin", "npm-cli.js");

export function compatibilityReceipt({ baselineVersion, candidateIntegrity, candidateVersion, checks, patcherSha256 }) {
  const failure = ["integrity", "versionPolicy", "anchors", "syntax", "offlineSmoke"].find((name) => !["passed", "unsupported", "skipped"].includes(checks[name]));
  const compatible = checks.integrity === "passed" && checks.versionPolicy === "unsupported" && checks.anchors === "passed" && checks.syntax === "passed" && checks.offlineSmoke === "passed";
  return { baselineVersion, candidateIntegrity, candidateVersion, checks, compatibility: compatible ? "candidate" : "incompatible", firstFailure: failure === undefined ? null : { check: failure, code: checks[failure] }, patcherSha256, promotionAuthorized: false, schemaVersion: 1 };
}

export function parseRegistryMetadata(value) {
  const integrity = value?.integrity ?? value?.["dist.integrity"]; const tarball = value?.tarball ?? value?.["dist.tarball"];
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-") || typeof tarball !== "string" || !tarball.startsWith("https://registry.npmjs.org/")) fail("UPSTREAM_METADATA_INVALID");
  return { integrity, tarball };
}

async function command(file, args, options = {}) { return execute(file, args, { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 120_000, ...options }); }

export async function probeUpstreamCompatibility({ candidateVersion, projectRoot = root } = {}) {
  if (!exactVersion.test(candidateVersion ?? "")) fail("UPSTREAM_CANDIDATE_INVALID");
  const baseline = JSON.parse(await readFile(join(projectRoot, "resources", "upstream-baseline.v1.json"), "utf8"));
  const patcher = await readFile(join(projectRoot, "scripts", "apply-coco-identity-patch.mjs"));
  const fixture = await mkdtemp(join(tmpdir(), "coco-upstream-probe-"));
  const checks = { anchors: "skipped", integrity: "pending", offlineSmoke: "skipped", syntax: "skipped", versionPolicy: candidateVersion === baseline.package.version ? "passed" : "unsupported" };
  let integrity = null;
  try {
    const metadata = parseRegistryMetadata(JSON.parse((await command(process.execPath, [npmCli, "view", `@earendil-works/pi-coding-agent@${candidateVersion}`, "dist.integrity", "dist.tarball", "--json"], { cwd: projectRoot })).stdout));
    integrity = metadata.integrity;
    await writeFile(join(fixture, "package.json"), `${JSON.stringify({ dependencies: { "@earendil-works/pi-coding-agent": candidateVersion }, private: true })}\n`);
    await command(process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=true"], { cwd: fixture });
    const lock = JSON.parse(await readFile(join(fixture, "package-lock.json"), "utf8"));
    checks.integrity = lock.packages?.["node_modules/@earendil-works/pi-coding-agent"]?.integrity === integrity ? "passed" : "UPSTREAM_INTEGRITY_MISMATCH";
    if (checks.integrity !== "passed") return compatibilityReceipt({ baselineVersion: baseline.package.version, candidateIntegrity: integrity, candidateVersion, checks, patcherSha256: sha256(patcher) });
    await Promise.all([cp(join(projectRoot, "resources"), join(fixture, "resources"), { recursive: true }), cp(join(projectRoot, "dist"), join(fixture, "dist"), { recursive: true })]);
    try { await applyCocoIdentityPatch({ root: fixture, supportedVersion: candidateVersion }); checks.anchors = "passed"; } catch (error) { checks.anchors = typeof error?.message === "string" && /^COCO_PATCH_[A-Z_]+$/.test(error.message) ? error.message : "UPSTREAM_PATCH_FAILED"; }
    if (checks.anchors === "passed") {
      const targets = ["dist/cli/args.js", "dist/cli/list-models.js", "dist/core/model-runtime.js", "dist/modes/interactive/interactive-mode.js"];
      try { for (const target of targets) await command(process.execPath, ["--check", join(fixture, "node_modules", "@earendil-works", "pi-coding-agent", target)]); checks.syntax = "passed"; } catch { checks.syntax = "UPSTREAM_SYNTAX_FAILED"; }
      if (checks.syntax === "passed") { try { await command(process.execPath, [join(fixture, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"), "--help"], { env: { ...process.env, HOME: fixture } }); checks.offlineSmoke = "passed"; } catch { checks.offlineSmoke = "UPSTREAM_SMOKE_FAILED"; } }
    }
    return compatibilityReceipt({ baselineVersion: baseline.package.version, candidateIntegrity: integrity, candidateVersion, checks, patcherSha256: sha256(patcher) });
  } finally { await rm(fixture, { force: true, recursive: true }); }
}

function parse(argv) { if (argv.length !== 2 || argv[0] !== "--version" || !exactVersion.test(argv[1])) fail("UPSTREAM_COMPATIBILITY_USAGE"); return argv[1]; }
if (process.argv[1] === fileURLToPath(import.meta.url)) { let version; try { version = parse(process.argv.slice(2)); } catch (error) { console.error(error.code); process.exit(64); } probeUpstreamCompatibility({ candidateVersion: version }).then((receipt) => { console.log(JSON.stringify(receipt)); process.exitCode = receipt.compatibility === "candidate" ? 0 : 3; }).catch((error) => { console.error(error.code ?? error.message); process.exitCode = 2; }); }
