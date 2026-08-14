import { verifyIsolatedModelPanelCandidate } from "./verify-isolated-model-panel-candidate.mjs";

export async function modelPanelCanary({ verify = verifyIsolatedModelPanelCandidate } = {}) {
  let receipt;
  try { receipt = await verify(); } catch { receipt = { code: "MODEL_PANEL_CANARY_FAILED", promotionAuthorized: false, scope: "isolated", status: "rejected" }; }
  const approved = receipt?.status === "approved" && receipt?.scope === "isolated" && receipt?.promotionAuthorized === false && receipt?.rollout?.owner === "coco.model-panel.v1" && receipt?.rollout?.scope === "isolated" && receipt?.pty?.reload === "passed" && receipt?.pty?.panelOpens >= 2;
  return Object.freeze({ ...receipt, exitCode: approved ? 0 : 1, productionRegistration: "blocked", status: approved ? "approved" : "rejected" });
}

export function formatModelPanelCanary(receipt) {
  if (receipt.status !== "approved") return `coco model-panel-canary: rejected (${receipt.code ?? "MODEL_PANEL_CANARY_REJECTED"}; production blocked)\n`;
  return `coco model-panel-canary: approved (isolated; ${receipt.capabilities.present}/${receipt.capabilities.required} capabilities; reload ${receipt.pty.reload}; production blocked)\n`;
}
