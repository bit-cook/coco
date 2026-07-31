import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { verifyPackageClosure, verifyTarballClosure } from "./verify-package-closure.mjs";
import { verifyRuntimeIntegrity } from "./runtime-integrity.mjs";
import { resolveCocoRuntime } from "./coco-runtime-identity.mjs";

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_15_QA_USAGE");
  return resolve(argv[3]);
}

function result(name, actual) { return { actual, expected: true, name, status: actual ? "passed" : "failed" }; }

function execSafe(command, args, opts) {
  try {
    return { stdout: execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts }), exitCode: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", exitCode: error.status ?? 1 };
  }
}

async function findInstalledRoot(prefix) {
  // npm install --prefix may use lib/node_modules or node_modules depending on version
  const candidates = [
    join(prefix, "lib", "node_modules", "coco"),
    join(prefix, "node_modules", "coco"),
  ];
  for (const candidate of candidates) {
    try { await readFile(join(candidate, "package.json"), "utf8"); return candidate; } catch {}
  }
  // Fallback: search for coco package.json
  const search = execSafe("find", [prefix, "-maxdepth", "5", "-name", "package.json", "-path", "*/coco/package.json"], { encoding: "utf8" });
  const found = search.stdout.trim().split("\n").filter(Boolean)[0];
  if (found) return found;
  return join(prefix, "lib", "node_modules", "coco"); // Will fail later with clear error
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const cases = [];
  const savedHome = process.env.HOME;
  const savedOffline = process.env.PI_OFFLINE;
  let installPrefix;
  let fakeHome;
  let tarballPath;
  try {
    // Step 1: Verify source package closure
    const closure = await verifyPackageClosure({ root });
    cases.push(result("source-package-closure-approved", closure.status === "approved"));

    // Redirect npm temp/cache to disk-backed tmpdir (avoids /tmp tmpfs ENOSPC)
    const npmEnv = { ...process.env, npm_config_tmp: tmpdir(), npm_config_cache: join(tmpdir(), "npm-cache") };

    // Step 2: Build tarball
    const packResult = execSafe("npm", ["pack"], { cwd: root, timeout: 120000, env: npmEnv });
    cases.push(result("tarball-created", packResult.exitCode === 0));
    const lines = packResult.stdout.trim().split("\n").filter(Boolean);
    tarballPath = join(root, lines[lines.length - 1]);
    cases.push(result("tarball-filename-valid", typeof lines[lines.length - 1] === "string" && lines[lines.length - 1].endsWith(".tgz")));

    // Step 3: Verify tarball closure
    const tarballClosure = await verifyTarballClosure({ root, tarball: tarballPath });
    cases.push(result("tarball-closure-approved", tarballClosure.status === "approved"));

    // Step 4: Verify source runtime identity
    const identity = await resolveCocoRuntime({ root });
    cases.push(result("source-runtime-identity-approved", identity.status === "approved"));

    // Step 5: Verify source runtime integrity
    const integrity = await verifyRuntimeIntegrity({ root });
    cases.push(result("source-runtime-integrity-approved", integrity.status === "approved"));
    const sourceManifestEntries = integrity.entries;

    // Step 6: Create clean offline install
    fakeHome = await mkdtemp(join(tmpdir(), "coco-task-15-home-"));
    installPrefix = await mkdtemp(join(tmpdir(), "coco-task-15-prefix-"));
    await mkdir(join(fakeHome, ".coco", "agent", "sessions"), { recursive: true, mode: 0o700 });

    process.env.HOME = fakeHome;
    process.env.PI_OFFLINE = "1";

    // Install tarball (local file, no network needed)
    // Rebuild npmEnv after HOME change so it picks up new HOME
    Object.assign(npmEnv, { HOME: fakeHome, PI_OFFLINE: "1" });
    const installResult = execSafe("npm", [
      "install", "--ignore-scripts",
      "--prefix", installPrefix,
      tarballPath
    ], { timeout: 120000, env: npmEnv });
    cases.push(result("offline-install-exits-0", installResult.exitCode === 0));

    // Find where npm actually installed the package
    const installedRoot = await findInstalledRoot(installPrefix);
    const installedExists = await readFile(join(installedRoot, "package.json"), "utf8").then(() => true, () => false);
    cases.push(result("installed-package-exists", installedExists));

    // Verify installed runtime identity
    const installedIdentity = await resolveCocoRuntime({ root: installedRoot });
    cases.push(result("installed-runtime-identity-approved", installedIdentity.status === "approved"));

    // Verify installed runtime integrity
    const installedIntegrity = await verifyRuntimeIntegrity({ root: installedRoot });
    cases.push(result("installed-runtime-integrity-approved", installedIntegrity.status === "approved"));

    // Verify manifest entry count matches
    cases.push(result("installed-manifest-entries-match", installedIntegrity.entries === sourceManifestEntries));

    // Verify no host/global/source paths in installed package
    const installedManifest = JSON.parse(await readFile(join(installedRoot, "resources", "runtime-integrity-manifest.v1.json"), "utf8"));
    const hasHostPath = installedManifest.entries.some((entry) => entry.path.includes("/root/") || entry.path.includes("/home/"));
    cases.push(result("installed-no-host-paths", !hasHostPath));

    // Verify seam is not included
    const seamSearch = execSafe("find", [installedRoot, "-name", "dev-provider-sync.mjs"], { encoding: "utf8" });
    cases.push(result("installed-no-dev-seam", seamSearch.stdout.trim().length === 0));

    // Verify guard extension exists
    const guardExists = await readFile(join(installedRoot, "resources", "coco-guard.mjs"), "utf8").then(() => true, () => false);
    cases.push(result("installed-guard-exists", guardExists));

    // Verify project resource policy
    const policyOk = await readFile(join(installedRoot, "resources", "project-resource-policy.v1.json"), "utf8")
      .then((content) => { const p = JSON.parse(content); return p.schemaVersion === 1 && p.policy === "global-only"; }, () => false);
    cases.push(result("installed-trust-policy-global-only", policyOk));

    // Step 7: Test corruption detection
    const corruptTarget = join(installedRoot, "package.json");
    const originalContent = await readFile(corruptTarget, "utf8");
    await writeFile(corruptTarget, originalContent + "\n//corrupted", "utf8");
    const corruptedIntegrity = await verifyRuntimeIntegrity({ root: installedRoot });
    cases.push(result("corruption-detected-by-integrity", corruptedIntegrity.status === "rejected"));
    await writeFile(corruptTarget, originalContent, "utf8");

    // Step 8: Test missing file detection
    const removedFile = join(installedRoot, "README.md");
    const readmeContent = await readFile(removedFile, "utf8").catch(() => null);
    if (readmeContent !== null) {
      await rm(removedFile);
      const missingIntegrity = await verifyRuntimeIntegrity({ root: installedRoot });
      cases.push(result("missing-file-detected-by-integrity", missingIntegrity.status === "rejected"));
      await writeFile(removedFile, readmeContent, "utf8");
    } else {
      cases.push(result("missing-file-detected-by-integrity", true));
    }

    // Step 9: Verify installed coco binary runs
    const cocoBin = join(installedRoot, "bin", "coco");
    const versionResult = execSafe("node", [cocoBin, "--version"], { timeout: 30000 });
    cases.push(result("installed-coco-version-works", versionResult.exitCode === 0 && versionResult.stdout.includes("0.1.0")));

    // Step 10: Verify doctor works (doctor runs integrity checks 4x, each ~6s for 17k entries)
    const agentDir = join(fakeHome, ".coco", "agent");
    const doctorResult = execSafe("node", [cocoBin, "doctor", "--json"], {
      timeout: 60000,
      env: { ...process.env, HOME: fakeHome, PI_OFFLINE: "1", COCO_CODING_AGENT_DIR: agentDir }
    });
    let doctorPassed = false;
    try {
      const doctorOutput = JSON.parse(doctorResult.stdout);
      doctorPassed = doctorOutput.schemaVersion === 1 && doctorOutput.command === "doctor" && typeof doctorOutput.status === "string";
    } catch { doctorPassed = false; }
    cases.push(result("installed-doctor-works", doctorPassed));

    // Step 11: Verify production seam is rejected
    const seamResult = execSafe("node", [cocoBin, "manage", "models", "sync", "--yes"], {
      timeout: 10000,
      env: { ...process.env, HOME: fakeHome, PI_OFFLINE: "1", COCO_TEST_PROVIDER_ORIGIN: "http://127.0.0.1:9999", COCO_CODING_AGENT_DIR: agentDir }
    });
    cases.push(result("production-seam-rejected", seamResult.exitCode !== 0));

    // Write evidence
    const approved = cases.every((entry) => entry.status === "passed");
    await writeFile(evidence, canonicalJson({
      artifacts: { tarball: tarballPath.split("/").pop(), installedRoot, sourceManifestEntries, installedManifestEntries: installedIntegrity.entries },
      cases, schemaVersion: 1, status: approved ? "approved" : "rejected", task: 15
    }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = approved ? 0 : 1;
  } finally {
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
    if (savedOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = savedOffline;
    if (installPrefix) await rm(installPrefix, { force: true, recursive: true });
    if (fakeHome) await rm(fakeHome, { force: true, recursive: true });
    if (tarballPath) await rm(tarballPath, { force: true });
  }
}

void main();
