import { translate } from "./coco-language.mjs";
import { projectModelPanel } from "./coco-model-panel-contract.mjs";

export const COCO_MODEL_PANEL_MESSAGE_KEYS = Object.freeze({ authenticationHint: "modelPanel.authenticationHint", loginRequired: "modelPanel.status.loginRequired", modelName: "modelPanel.modelName", noMatches: "modelPanel.noMatches", refreshError: "modelPanel.refresh.error", refreshMultipleErrors: "modelPanel.refresh.multipleErrors", refreshProviderError: "modelPanel.refresh.providerError", refreshRunning: "modelPanel.refresh.running", refreshSuccess: "modelPanel.refresh.success", refreshTimeout: "modelPanel.refresh.timeout", scopeAction: "modelPanel.scope.action", scopeAll: "modelPanel.scope.all", scopeLabel: "modelPanel.scope.label", scopeScoped: "modelPanel.scope.scoped", title: "modelPanel.title" });

export function modelPanelMessageKeyFromLoginRequired(loginRequired) {
  if (typeof loginRequired !== "boolean") throw new Error("MODEL_PANEL_LOGIN_REQUIRED_INVALID");
  return loginRequired ? COCO_MODEL_PANEL_MESSAGE_KEYS.loginRequired : null;
}

export function renderModelPanelRefresh({ count, provider, status } = {}, { t = translate } = {}) {
  if (typeof t !== "function") throw new Error("MODEL_PANEL_RENDERER_INVALID");
  if (status === "running") return t(COCO_MODEL_PANEL_MESSAGE_KEYS.refreshRunning);
  if (status === "success") return t(COCO_MODEL_PANEL_MESSAGE_KEYS.refreshSuccess);
  if (status === "timeout") return t(COCO_MODEL_PANEL_MESSAGE_KEYS.refreshTimeout);
  if (status === "error") return t(COCO_MODEL_PANEL_MESSAGE_KEYS.refreshError);
  if (status === "provider-error" && typeof provider === "string" && provider.length > 0) return t(COCO_MODEL_PANEL_MESSAGE_KEYS.refreshProviderError, { provider });
  if (status === "multiple-errors" && Number.isSafeInteger(count) && count > 1) return t(COCO_MODEL_PANEL_MESSAGE_KEYS.refreshMultipleErrors, { count });
  throw new Error("MODEL_PANEL_REFRESH_INVALID");
}

export function renderModelPanelScope(scope, { t = translate } = {}) {
  if (!new Set(["all", "scoped"]).has(scope) || typeof t !== "function") throw new Error("MODEL_PANEL_SCOPE_INVALID");
  return Object.freeze({ action: t(COCO_MODEL_PANEL_MESSAGE_KEYS.scopeAction), all: t(COCO_MODEL_PANEL_MESSAGE_KEYS.scopeAll), current: scope, label: t(COCO_MODEL_PANEL_MESSAGE_KEYS.scopeLabel), scoped: t(COCO_MODEL_PANEL_MESSAGE_KEYS.scopeScoped) });
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
