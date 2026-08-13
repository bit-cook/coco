import { renderModelPanelRefresh, renderModelPanelScope } from "./coco-model-panel-renderer.mjs";

export const COCO_MODEL_PANEL_PRESENTER_VERSION = 1;

export function presentModelPanelState(state, { t } = {}) {
  if (state === null || typeof state !== "object" || !new Set(["idle", "refreshing", "ready", "acting", "closed"]).has(state.status)) throw new Error("MODEL_PANEL_STATE_INVALID");
  let refreshText = null;
  if (state.refresh?.status === "running") refreshText = renderModelPanelRefresh({ status: "running" }, { t });
  else if (state.refresh?.status === "aborted" && state.refresh.reason === "timeout") refreshText = renderModelPanelRefresh({ status: "timeout" }, { t });
  else if (state.refresh?.status === "succeeded" && state.refresh.errors?.length === 0) refreshText = renderModelPanelRefresh({ status: "success" }, { t });
  else if (state.refresh?.status === "succeeded" && state.refresh.errors?.length === 1) refreshText = typeof state.refresh.errors[0].provider === "string" ? renderModelPanelRefresh({ provider: state.refresh.errors[0].provider, status: "provider-error" }, { t }) : renderModelPanelRefresh({ status: "error" }, { t });
  else if (state.refresh?.status === "succeeded" && state.refresh.errors?.length > 1) refreshText = renderModelPanelRefresh({ count: state.refresh.errors.length, status: "multiple-errors" }, { t });
  return Object.freeze({ panel: state.panel, query: state.query, refresh: Object.freeze({ status: state.refresh?.status ?? "idle", text: refreshText }), scope: state.scope === null ? null : renderModelPanelScope(state.scope, { t }), status: state.status });
}
