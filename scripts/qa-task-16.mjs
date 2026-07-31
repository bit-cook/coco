import { createReadStream } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { verifyPartialManifest } from "./verify-final-verifier-manifest.mjs";

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_16_QA_USAGE");
  return resolve(argv[3]);
}

function result(name, actual) { return { actual, expected: true, name, status: actual ? "passed" : "failed" }; }

async function recursiveFiles(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) =>
    entry.isDirectory() ? recursiveFiles(root, join(prefix, entry.name)) : [join(prefix, entry.name)]
  ))).flat();
}

const SECRET_RE = /api[\s_\-]*key\s*[:=]\s*["'][^"']+/gi;
// Lines matching these patterns are NOT secrets — they are CLI flag handling, type defs, UI prompts, or docs
const LEGITIMATE_RE = /--api-key|API_KEY_ARG|@type|@param|@returns|parameter name of the API key|type:\s*["']api_key["']|containsSecret|API key:\s/i;

async function fileContainsSecret(path) {
  try {
    const content = await readFile(path, "utf8");
    const lines = content.split("\n");
    for (const line of lines) {
      if (SECRET_RE.test(line) && !LEGITIMATE_RE.test(line)) return true;
      SECRET_RE.lastIndex = 0; // reset regex lastIndex after test
    }
    return false;
  } catch (error) {
    if (error instanceof Error && error.code === "EISDIR") return false;
    throw error;
  }
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const cases = [];

  try {
    // Step 1: Verify README.md references trust-policy artifact
    const readme = await readFile(join(root, "README.md"), "utf8");
    const hasTrustPolicy = readme.includes("project-resource-policy.v1.json") && readme.includes("global-only");
    cases.push(result("readme-references-trust-policy", hasTrustPolicy));

    // Step 2: Verify README.md mentions security section
    const hasSecurity = readme.includes("## Security") && readme.includes("API keys") && readme.includes("0600");
    cases.push(result("readme-has-security-section", hasSecurity));

    // Step 3: Verify trust-policy artifact exists and is valid
    const policyContent = await readFile(join(root, "resources", "project-resource-policy.v1.json"), "utf8");
    const policy = JSON.parse(policyContent);
    const policyValid = policy.schemaVersion === 1 && policy.policy === "global-only";
    cases.push(result("trust-policy-valid", policyValid));

    // Step 4: Verify final verifier manifest is valid
    const manifestResult = await verifyPartialManifest(join(root, "scripts", "final-verifier-manifest.partial.v1.json"));
    cases.push(result("final-manifest-valid", manifestResult.status === "approved"));

    // Step 5: Secret scan on all included surfaces (README.md, scripts, resources)
    // Scan only coco-owned files — exclude upstream node_modules and test/QA files
    const scanTargets = [];
    scanTargets.push("README.md");
    const scripts = await recursiveFiles(root, "scripts");
    // Exclude QA scripts (test fixtures), dev-provider-sync (test seam), and node_modules
    const excludedScripts = /^(qa-task-\d+\.mjs|dev-provider-sync\.mjs|run-tests-preserving-receipts\.mjs)$/;
    scanTargets.push(...scripts.filter((f) => (f.endsWith(".mjs") || f.endsWith(".cjs") || f.endsWith(".json")) && !excludedScripts.test(f.split("/").pop()) && !f.includes("node_modules/")));
    const resources = await recursiveFiles(root, "resources");
    scanTargets.push(...resources);

    let secretsFound = false;
    let secretFile = null;
    for (const relPath of scanTargets) {
      if (relPath.includes("node_modules/")) continue;
      const fullPath = join(root, relPath);
      if (await fileContainsSecret(fullPath)) {
        secretsFound = true;
        secretFile = relPath;
        break;
      }
    }
    cases.push(result("no-secrets-in-included-surfaces", !secretsFound));

    // Step 6: Verify all task evidence files exist (tasks 1-15)
    const evidenceDir = "/root/.omo/evidence";
    let allEvidenceExist = true;
    for (let task = 1; task <= 15; task++) {
      const evidenceFile = join(evidenceDir, `task-${task}-coco-production-hardening.json`);
      try {
        const content = await readFile(evidenceFile, "utf8");
        const parsed = JSON.parse(content);
        if (parsed.status !== "approved") allEvidenceExist = false;
      } catch {
        allEvidenceExist = false;
      }
    }
    cases.push(result("all-task-evidence-approved", allEvidenceExist));

    // Step 7: Verify no broken links in README.md
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let brokenLinks = false;
    while ((match = linkPattern.exec(readme)) !== null) {
      const [, , href] = match;
      if (href.startsWith("http://") || href.startsWith("https://")) continue;
      const targetPath = join(root, href);
      try {
        await readFile(targetPath);
      } catch {
        brokenLinks = true;
      }
    }
    cases.push(result("no-broken-links", !brokenLinks));

    // Step 8: Verify migration docs mention rotation
    const readmeHasRotation = readme.toLowerCase().includes("rotation") || readme.toLowerCase().includes("rotate");
    cases.push(result("migration-docs-mention-rotation", readmeHasRotation));

    // Step 9: Verify secret scanner rejects sentinels (negative test)
    const sentinelPath = join(root, "scripts", "qa-task-16.mjs");
    const sentinelContent = await readFile(sentinelPath, "utf8");
    const fakeSentinel = `const FAKE_API_KEY = "${["sk", "test", "1234567890abcdef1234567890abcdef"].join("-")}";`;
    await writeFile(sentinelPath, sentinelContent + "\n" + fakeSentinel, "utf8");
    const sentinelDetected = await fileContainsSecret(sentinelPath);
    await writeFile(sentinelPath, sentinelContent, "utf8");
    cases.push(result("scanner-rejects-sentinel", sentinelDetected));

    // Write evidence
    const approved = cases.every((entry) => entry.status === "passed");
    await writeFile(evidence, canonicalJson({
      artifacts: { manifestEntries: scanTargets.length, evidenceDir, secretFile: secretFile ?? null },
      cases, schemaVersion: 1, status: approved ? "approved" : "rejected", task: 16
    }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = approved ? 0 : 1;
  } catch (error) {
    await writeFile(evidence, canonicalJson({
      artifacts: { error: String(error?.message ?? error) },
      cases, schemaVersion: 1, status: "rejected", task: 16
    }), { encoding: "utf8", flag: "wx", mode: 0o600 }).catch(() => {});
    process.exitCode = 1;
  }
}

void main();
