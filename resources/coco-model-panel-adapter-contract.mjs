export const COCO_MODEL_PANEL_ADAPTER_CONTRACT_VERSION = 1;
export const COCO_MODEL_PANEL_ACTIONS = Object.freeze(["app.model.select", "app.model.cycleForward", "app.model.cycleBackward"]);

function validateAdapter(adapter) {
  if (adapter === null || typeof adapter !== "object" || typeof adapter.id !== "string" || adapter.id.length === 0 || typeof adapter.open !== "function" || typeof adapter.cycle !== "function") throw new Error("MODEL_PANEL_ADAPTER_INVALID");
}

export function createModelPanelConformanceHost({ fallback, runtime } = {}) {
  if (fallback === null || typeof fallback !== "object" || typeof fallback.open !== "function" || typeof fallback.cycle !== "function" || runtime === null || typeof runtime !== "object") throw new Error("MODEL_PANEL_HOST_INVALID");
  let adapter = null; const active = new Set();
  function registerBuiltinModelPanel(next) { validateAdapter(next); if (adapter !== null) throw new Error("MODEL_PANEL_ADAPTER_CONFLICT"); adapter = next; }
  async function invoke(kind, request) { const controller = new AbortController(); active.add(controller); try { const target = adapter ?? fallback; return await target[kind]({ ...request, signal: controller.signal }, runtime); } finally { active.delete(controller); } }
  return Object.freeze({
    invokeAction(action) {
      if (!COCO_MODEL_PANEL_ACTIONS.includes(action)) throw new Error("MODEL_PANEL_ACTION_INVALID");
      if (action === "app.model.select") return invoke("open", { query: undefined, trigger: "select-shortcut" });
      return invoke("cycle", { direction: action.endsWith("Forward") ? "forward" : "backward", trigger: action.endsWith("Forward") ? "cycle-forward" : "cycle-backward" });
    },
    invokeCommand(query) { return invoke("open", { query: typeof query === "string" && query.trim() !== "" ? query.trim() : undefined, trigger: "command" }); },
    registerBuiltinModelPanel,
    reload() { for (const controller of active) controller.abort(); active.clear(); adapter = null; },
  });
}
