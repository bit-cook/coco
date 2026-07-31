import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { runEgressAllowlist } from "./run-egress-allowlist.mjs";
import { runWithTimeout } from "./run-with-timeout.mjs";
import { validateAuthorizationTable } from "./verify-baseline-authorization.mjs";
import { verifyPartialManifest } from "./verify-final-verifier-manifest.mjs";
import { verifyBaseline } from "./verify-protected-baseline.mjs";

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_1_QA_USAGE");
  return { evidence: resolve(argv[3]) };
}

function caseResult(name, expected, actual) {
  return { actual, expected, name, status: expected === actual ? "passed" : "failed" };
}

async function main() {
  const { evidence } = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-1-"));
  const cases = [];
  try {
    const baselinePath = join(root, "scripts/protected-baseline.json");
    const baseline = await verifyBaseline({ baselinePath });
    cases.push(caseResult("baseline-happy", "approved", baseline.status));
    const auth = await validateAuthorizationTable(join(root, "resources/baseline-authorization.v1.json"));
    cases.push(caseResult("authorization-happy", "approved", auth.status));
    const manifest = await verifyPartialManifest(join(root, "scripts/final-verifier-manifest.partial.v1.json"));
    cases.push(caseResult("partial-manifest-happy", "approved", manifest.status));
    const scope = await import("./final-scope-redaction.mjs");
    const scopeResult = await scope.verifyScope({ baselinePath, evidencePath: join(root, "scripts/final-verifier-manifest.partial.v1.json"), root });
    cases.push(caseResult("scope-verifier-happy", "none", scopeResult.scopeViolations.length === 0 ? "none" : "violations"));
    const timeout = await runWithTimeout({ command: [process.execPath, "-e", "setTimeout(()=>{}, 2000)"], timeout: 100, stdout: join(fixture, "timeout.out") });
    cases.push(caseResult("timeout-failure", "timeout", timeout.status));
    const egress = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", "process.exit(0)"], denyAll: true, evidence: join(fixture, "egress.jsonl") });
    cases.push(caseResult("egress-happy", "completed", egress.status));
    const tampered = join(fixture, "protected-baseline.json");
    await writeFile(tampered, Buffer.concat([await readFile(baselinePath), Buffer.from(" ")]));
    await writeFile(`${tampered}.sha256`, "0".repeat(64) + "  protected-baseline.json\n");
    const rejection = await verifyBaseline({ baselinePath: tampered });
    cases.push(caseResult("protected-change-failure", "rejected", rejection.status));
    const missing = await verifyBaseline({ baselinePath: join(fixture, "missing-baseline.json") });
    cases.push(caseResult("protected-delete-failure", "rejected", missing.status));
    const added = join(fixture, "added-baseline.json");
    await writeFile(added, "SENTINEL_TASK_1_NOT_A_SECRET\n");
    const addRejection = await verifyBaseline({ baselinePath: added });
    cases.push(caseResult("protected-add-and-sentinel-failure", "rejected", addRejection.status));
    const stale = await verifyPartialManifest(join(fixture, "missing-manifest.json"));
    cases.push(caseResult("stale-evidence-failure", "rejected", stale.status));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    const partialManifestPath = join(root, "scripts/final-verifier-manifest.partial.v1.json");
    const artifacts = { baselineSha256: sha256(await readFile(baselinePath)), cleanup: "fixture-removed-after-write", partialManifest: partialManifestPath, partialManifestSha256: sha256(await readFile(partialManifestPath)) };
    await writeFile(evidence, canonicalJson({ artifacts, cases, planSha256: "03966a1e794e6f766d381d429ac6a5a4197e349b0a9e80c7a34d60cbdfc7c9d6", schemaVersion: 1, status, task: 1 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
}

void main();
