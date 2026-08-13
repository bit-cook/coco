export const COCO_MODEL_PANEL_CONTRACT_VERSION = 1;

function identity(model) { return `${model.provider}\0${model.id}`; }

export function projectModelPanel({ currentModel, hasConfiguredAuth, models } = {}) {
  if (!Array.isArray(models) || typeof hasConfiguredAuth !== "function") throw new Error("MODEL_PANEL_INPUT_INVALID");
  const current = currentModel === undefined ? null : identity(currentModel);
  return models.map((model, index) => {
    if (model === null || typeof model !== "object" || typeof model.provider !== "string" || typeof model.id !== "string") throw new Error("MODEL_PANEL_INPUT_INVALID");
    return { current: identity(model) === current, index, model, ref: Object.freeze({ id: model.id, provider: model.provider }), status: hasConfiguredAuth(model.provider) ? "ready" : "login-required" };
  }).sort((left, right) => Number(right.current) - Number(left.current) || left.model.provider.localeCompare(right.model.provider) || left.index - right.index).map(({ index: _index, ...row }) => Object.freeze(row));
}

export function resolveModelPanelSelection(row) {
  if (row === null || typeof row !== "object" || !new Set(["ready", "login-required"]).has(row.status) || row.model === null || typeof row.model !== "object" || row.ref?.provider !== row.model.provider || row.ref?.id !== row.model.id) throw new Error("MODEL_PANEL_SELECTION_INVALID");
  return row.status === "ready" ? Object.freeze({ action: "select", model: row.model }) : Object.freeze({ action: "login", provider: row.model.provider });
}
