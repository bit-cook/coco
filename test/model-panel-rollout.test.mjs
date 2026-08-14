import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { planModelPanelRollout } from "../scripts/model-panel-rollout.mjs";

const evidence = JSON.parse(await readFile(new URL("../resources/selective-fork-promotion-evidence.v1.json", import.meta.url), "utf8"));
const required = ["builtin-model-selector-ownership", "visible-model-projection", "configured-auth-observation", "provider-login", "default-model-persistence", "model-activation"];
const remoteReceipt = { artifact: evidence.candidate.package.artifact, bytes: evidence.candidate.package.bytes, integrity: evidence.candidate.package.integrity, promotionAuthorized: false, sha256: evidence.candidate.package.sha256, sourceCommit: evidence.candidate.sourceCommit, sourceTag: evidence.candidate.sourceTag, status: "approved" };
const capabilities = { artifact: { package: evidence.candidate.package.name, state: "candidate-before-patch", version: evidence.candidate.package.version }, capabilities: required.map((id) => ({ id, status: "present" })), contract: { id: "coco.model-panel-runtime-adapter", version: 1 }, schemaVersion: 1, status: "present" };
const input = { capabilities, enabled: true, evidence, extension: "/isolated/coco-model-panel.mjs", remoteReceipt, scope: "isolated" };

test("model panel rollout remains fallback by default and throughout production", () => {
  assert.deepEqual(planModelPanelRollout(), { extension: null, owner: "fallback", reason: "MODEL_PANEL_ROLLOUT_DISABLED", scope: "fallback" });
  assert.deepEqual(planModelPanelRollout({ ...input, scope: "production" }), { extension: null, owner: "fallback", reason: "MODEL_PANEL_PRODUCTION_PROMOTION_BLOCKED", scope: "fallback" });
});

test("isolated rollout requires exact remote and capability receipts", () => {
  assert.deepEqual(planModelPanelRollout(input), { extension: input.extension, owner: "coco.model-panel.v1", reason: null, scope: "isolated" });
  for (const [reason, mutate] of [
    ["MODEL_PANEL_EVIDENCE_INVALID", (value) => { value.evidence.promotionAuthorized = true; }],
    ["MODEL_PANEL_REMOTE_RECEIPT_INVALID", (value) => { value.remoteReceipt.sha256 = "0".repeat(64); }],
    ["MODEL_PANEL_CAPABILITIES_INVALID", (value) => { value.capabilities.capabilities.pop(); }],
    ["MODEL_PANEL_CAPABILITIES_INVALID", (value) => { value.capabilities.artifact.version = "0.82.2"; }],
  ]) {
    const invalid = structuredClone(input); mutate(invalid);
    assert.equal(planModelPanelRollout(invalid).reason, reason);
  }
});

test("rollout planner has no environment, argument, filesystem, or extension loading side effects", async () => {
  const source = await readFile(new URL("../scripts/model-panel-rollout.mjs", import.meta.url), "utf8");
  for (const forbidden of ["process.env", "process.argv", "node:fs", "import(", "registerBuiltinModelPanel"]) assert.equal(source.includes(forbidden), false);
  assert.equal(Object.isFrozen(planModelPanelRollout(input)), true);
});
