import { translate } from "./coco-language.mjs";
import { projectModelPanel } from "./coco-model-panel-contract.mjs";

export const COCO_MODEL_PANEL_MESSAGE_KEYS = Object.freeze({ authenticationHint: "modelPanel.authenticationHint", loginRequired: "modelPanel.status.loginRequired", modelName: "modelPanel.modelName", noMatches: "modelPanel.noMatches", title: "modelPanel.title" });

export function modelPanelMessageKeyFromLoginRequired(loginRequired) {
  if (typeof loginRequired !== "boolean") throw new Error("MODEL_PANEL_LOGIN_REQUIRED_INVALID");
  return loginRequired ? COCO_MODEL_PANEL_MESSAGE_KEYS.loginRequired : null;
}

export function renderModelPanel(input, { t = translate } = {}) {
  if (typeof t !== "function") throw new Error("MODEL_PANEL_RENDERER_INVALID");
  const rows = projectModelPanel(input); const loginRequiredKey = modelPanelMessageKeyFromLoginRequired(true); const loginRequired = t(loginRequiredKey);
  return Object.freeze({
    authenticationHint: t(COCO_MODEL_PANEL_MESSAGE_KEYS.authenticationHint, { marker: loginRequired }),
    noMatches: t(COCO_MODEL_PANEL_MESSAGE_KEYS.noMatches),
    rows: Object.freeze(rows.map((row) => { const name = typeof row.model.name === "string" && row.model.name.length > 0 ? row.model.name : row.model.id; return Object.freeze({ contract: row, current: row.current, detail: t(COCO_MODEL_PANEL_MESSAGE_KEYS.modelName, { name }), id: row.model.id, provider: row.model.provider, ref: row.ref, status: row.status, statusText: row.status === "login-required" ? loginRequired : null }); })),
    title: t(COCO_MODEL_PANEL_MESSAGE_KEYS.title),
  });
}
