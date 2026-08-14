const REQUIRED_CAPABILITIES = Object.freeze([
  "builtin-model-selector-ownership",
  "configured-auth-observation",
  "default-model-persistence",
  "model-activation",
  "provider-login",
  "visible-model-projection",
]);

const fallback = (reason) => Object.freeze({ extension: null, owner: "fallback", reason, scope: "fallback" });

export function planModelPanelRollout({ capabilities, enabled = false, evidence, extension, remoteReceipt, scope = "production" } = {}) {
  if (enabled !== true) return fallback("MODEL_PANEL_ROLLOUT_DISABLED");
  if (scope !== "isolated") return fallback("MODEL_PANEL_PRODUCTION_PROMOTION_BLOCKED");
  if (typeof extension !== "string" || extension.length === 0) return fallback("MODEL_PANEL_EXTENSION_INVALID");
  const candidate = evidence?.candidate; const packageEvidence = candidate?.package;
  if (evidence?.schemaVersion !== 1 || evidence?.status !== "candidate-evidence-only" || evidence?.promotionAuthorized !== false || evidence?.authorization?.isolated !== true || evidence?.authorization?.production !== false || evidence?.authorization?.scope !== "isolated" || evidence?.authorization?.source !== "scheduled-and-manual-evidence-gates" || evidence?.gates?.productionRegistration !== "blocked" || evidence?.gates?.fallbackIntegration !== "isolated-loader-pty-verified-not-production") return fallback("MODEL_PANEL_EVIDENCE_INVALID");
  if (remoteReceipt?.status !== "approved" || remoteReceipt?.promotionAuthorized !== false || remoteReceipt.artifact !== packageEvidence?.artifact || remoteReceipt.bytes !== packageEvidence?.bytes || remoteReceipt.sha256 !== packageEvidence?.sha256 || remoteReceipt.integrity !== packageEvidence?.integrity || remoteReceipt.sourceCommit !== candidate?.sourceCommit || remoteReceipt.sourceTag !== candidate?.sourceTag) return fallback("MODEL_PANEL_REMOTE_RECEIPT_INVALID");
  const ids = capabilities?.capabilities?.filter(({ status }) => status === "present").map(({ id }) => id).sort();
  if (capabilities?.schemaVersion !== 1 || capabilities?.status !== "present" || capabilities?.contract?.id !== "coco.model-panel-runtime-adapter" || capabilities?.contract?.version !== 1 || capabilities?.artifact?.state !== "candidate-before-patch" || capabilities?.artifact?.package !== packageEvidence?.name || capabilities?.artifact?.version !== packageEvidence?.version || JSON.stringify(ids) !== JSON.stringify(REQUIRED_CAPABILITIES)) return fallback("MODEL_PANEL_CAPABILITIES_INVALID");
  return Object.freeze({ extension, owner: "coco.model-panel.v1", reason: null, scope: "isolated" });
}
