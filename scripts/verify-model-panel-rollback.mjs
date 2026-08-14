import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { planModelPanelRollout } from "./model-panel-rollout.mjs";
import { detectPiModelPanelCapabilities } from "./pi-model-panel-capabilities.mjs";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const required = ["builtin-model-selector-ownership", "visible-model-projection", "configured-auth-observation", "provider-login", "default-model-persistence", "model-activation"];

export async function verifyModelPanelRollback({ run = execute } = {}) {
  const evidence = JSON.parse(await readFile(join(root, "resources", "selective-fork-promotion-evidence.v1.json"), "utf8"));
  const packageEvidence = evidence.candidate.package;
  const remoteReceipt = { artifact: packageEvidence.artifact, bytes: packageEvidence.bytes, integrity: packageEvidence.integrity, promotionAuthorized: false, sha256: packageEvidence.sha256, sourceCommit: evidence.candidate.sourceCommit, sourceTag: evidence.candidate.sourceTag, status: "approved" };
  const capabilities = { artifact: { package: packageEvidence.name, state: "candidate-before-patch", version: packageEvidence.version }, capabilities: required.map((id) => ({ id, status: "present" })), contract: { id: "coco.model-panel-runtime-adapter", version: 1 }, schemaVersion: 1, status: "present" };
  const officialCapabilities = await detectPiModelPanelCapabilities({ artifactState: "candidate-before-patch", packageRoot: join(root, "node_modules", "@earendil-works", "pi-coding-agent") });
  const failures = {
    officialCapabilities: planModelPanelRollout({ capabilities: officialCapabilities, enabled: true, evidence, extension: "resources/coco-model-panel.mjs", remoteReceipt, scope: "isolated" }).reason,
    productionScope: planModelPanelRollout({ capabilities, enabled: true, evidence, extension: "resources/coco-model-panel.mjs", remoteReceipt, scope: "production" }).reason,
    tamperedReceipt: planModelPanelRollout({ capabilities, enabled: true, evidence, extension: "resources/coco-model-panel.mjs", remoteReceipt: { ...remoteReceipt, sha256: "0".repeat(64) }, scope: "isolated" }).reason,
  };
  const expected = { officialCapabilities: "MODEL_PANEL_CAPABILITIES_INVALID", productionScope: "MODEL_PANEL_PRODUCTION_PROMOTION_BLOCKED", tamperedReceipt: "MODEL_PANEL_REMOTE_RECEIPT_INVALID" };
  const agentDir = await mkdtemp(join(tmpdir(), "coco-rollback-agent-"));
  try {
    const result = await run(process.execPath, [join(root, "bin", "coco"), "--version"], { env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir }, timeout: 30_000 });
    const version = result.stdout.trim();
    const approved = JSON.stringify(failures) === JSON.stringify(expected) && version === "0.5.3";
    return { failures, officialRuntime: { status: version === "0.5.3" ? "passed" : "failed", version }, owner: "fallback", productionRegistration: "blocked", schemaVersion: 1, status: approved ? "approved" : "rejected" };
  } catch {
    return { code: "MODEL_PANEL_ROLLBACK_RUNTIME_FAILED", owner: "fallback", productionRegistration: "blocked", schemaVersion: 1, status: "rejected" };
  } finally { await rm(agentDir, { force: true, recursive: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyModelPanelRollback();
  console.log(JSON.stringify(result));
  process.exit(result.status === "approved" ? 0 : 1);
}
