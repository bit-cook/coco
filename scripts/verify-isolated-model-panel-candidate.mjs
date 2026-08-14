import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { planModelPanelRollout } from "./model-panel-rollout.mjs";
import { detectPiModelPanelCapabilities } from "./pi-model-panel-capabilities.mjs";
import { verifyRemoteSelectiveForkArtifact } from "./verify-remote-selective-fork-artifact.mjs";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

export async function verifyIsolatedModelPanelCandidate({ evidencePath = join(root, "resources", "selective-fork-promotion-evidence.v1.json") } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "coco-model-panel-candidate-"));
  try {
    const artifact = join(directory, "candidate.tgz");
    const remoteReceipt = await verifyRemoteSelectiveForkArtifact({ artifactPath: artifact, evidencePath });
    if (remoteReceipt.status !== "approved") return { ...remoteReceipt, scope: "isolated" };
    await writeFile(join(directory, "package.json"), `${JSON.stringify({ name: "coco-model-panel-candidate", private: true, version: "0.0.0" })}\n`);
    await execute("npm", ["install", artifact, "--ignore-scripts", "--no-audit", "--no-fund", "--offline", "--package-lock=false"], { cwd: directory, encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 120_000 });
    const packageRoot = join(directory, "node_modules", "@earendil-works", "pi-coding-agent");
    const capabilities = await detectPiModelPanelCapabilities({ artifactState: "candidate-before-patch", packageRoot });
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    const rollout = planModelPanelRollout({ capabilities, enabled: true, evidence, extension: "resources/coco-model-panel.mjs", remoteReceipt, scope: "isolated" });
    return { capabilities: { present: capabilities.capabilities.filter(({ status }) => status === "present").length, required: capabilities.capabilities.length, status: capabilities.status }, promotionAuthorized: false, remote: remoteReceipt, rollout, schemaVersion: 1, scope: "isolated", status: rollout.owner === "coco.model-panel.v1" ? "approved" : "rejected" };
  } catch (error) {
    return { code: typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "MODEL_PANEL_ISOLATED_VERIFICATION_FAILED", promotionAuthorized: false, scope: "isolated", status: "rejected" };
  } finally { await rm(directory, { force: true, recursive: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyIsolatedModelPanelCandidate();
  console.log(JSON.stringify(result));
  process.exit(result.status === "approved" ? 0 : 1);
}
