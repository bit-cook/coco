import { projectModelPanel, resolveModelPanelSelection } from "./coco-model-panel-contract.mjs";
import { renderModelPanel } from "./coco-model-panel-renderer.mjs";
import { findExactModelReferenceMatch } from "./coco-model-reference-resolver.mjs";

export const COCO_MODEL_PANEL_CONTROLLER_VERSION = 1;
const directions = new Set(["forward", "backward"]);
const cancelled = (error) => error?.name === "AbortError" || error?.code === "ABORT_ERR";

export function createModelPanelController({ refreshTimeoutMs = 15_000, render = renderModelPanel, runtime } = {}) {
  const methods = ["readModelPanelSnapshot", "refreshModelPanel", "hasConfiguredAuth", "loginProvider", "persistDefaultModel", "activateModel", "cycleModel"];
  if (runtime === null || typeof runtime !== "object" || methods.some((name) => typeof runtime[name] !== "function") || typeof render !== "function" || !Number.isSafeInteger(refreshTimeoutMs) || refreshTimeoutMs < 1) throw new Error("MODEL_PANEL_CONTROLLER_INVALID");
  let state = Object.freeze({ panel: null, query: undefined, refresh: Object.freeze({ errors: Object.freeze([]), status: "idle" }), status: "idle" });
  let closed = false, opened = false, snapshot = null;
  const active = new Set();
  const listeners = new Set();
  function publish(next) { if (closed && next.status !== "closed") return; state = Object.freeze(next); for (const listener of listeners) { try { listener(state); } catch {} } }
  function assertOpen() { if (closed) throw new Error("MODEL_PANEL_CONTROLLER_CLOSED"); }
  function panel(value) { snapshot = value; return render({ currentModel: value.currentModel, hasConfiguredAuth: runtime.hasConfiguredAuth, models: value.models }); }
  function controller(signal) { const value = new AbortController(); const abort = () => value.abort(); if (signal) signal.addEventListener("abort", abort, { once: true }); return { abort, controller: value, signal }; }
  async function act(model, signal) {
    const rows = projectModelPanel({ currentModel: snapshot.currentModel, hasConfiguredAuth: runtime.hasConfiguredAuth, models: snapshot.models });
    const row = rows.find(({ ref }) => ref.provider === model.provider && ref.id === model.id); if (!row) throw new Error("MODEL_PANEL_SELECTION_STALE");
    const resolved = resolveModelPanelSelection(row);
    if (resolved.action === "login") { await runtime.loginProvider(resolved.provider, { signal }); return { kind: "login", provider: resolved.provider }; }
    await runtime.persistDefaultModel(row.ref, { signal }); signal.throwIfAborted(); await runtime.activateModel(model, { signal }); return { kind: "activated", ref: row.ref };
  }
  return Object.freeze({
    close() { if (closed) return; closed = true; for (const operation of active) operation.controller.abort(); active.clear(); publish({ ...state, status: "closed" }); listeners.clear(); },
    async cycle(direction, { signal } = {}) { assertOpen(); if (!directions.has(direction)) throw new Error("MODEL_PANEL_DIRECTION_INVALID"); const operation = controller(signal); active.add(operation); try { return await runtime.cycleModel(direction, { signal: operation.controller.signal }); } catch (error) { if (cancelled(error)) return { kind: "cancelled" }; throw error; } finally { active.delete(operation); operation.signal?.removeEventListener("abort", operation.abort); } },
    getState() { return state; },
    async open({ query, signal } = {}) {
      assertOpen(); if (opened) throw new Error("MODEL_PANEL_ALREADY_OPEN"); opened = true; const normalized = typeof query === "string" && query.trim() !== "" ? query.trim() : undefined; snapshot = runtime.readModelPanelSnapshot(); const cached = panel(snapshot); publish({ panel: cached, query: normalized, refresh: { errors: Object.freeze([]), status: "running" }, status: "refreshing" });
      if (normalized && snapshot.scope === "scoped") { const exact = findExactModelReferenceMatch(normalized, snapshot.exactCandidates); if (exact) return act(exact, signal ?? new AbortController().signal); }
      const operation = controller(signal); active.add(operation); const timeout = setTimeout(() => operation.controller.abort(), refreshTimeoutMs);
      if (!normalized) {
        void runtime.refreshModelPanel({ signal: operation.controller.signal }).then((refreshed) => { if (operation.controller.signal.aborted || closed) return; const view = panel(refreshed); publish({ panel: view, query: undefined, refresh: { errors: Object.freeze([...(refreshed.errors ?? [])]), status: "succeeded" }, status: "ready" }); }).catch((error) => { if (!cancelled(error) && !closed) publish({ ...state, refresh: { errors: Object.freeze([]), status: "failed" }, status: "ready" }); }).finally(() => { clearTimeout(timeout); active.delete(operation); operation.signal?.removeEventListener("abort", operation.abort); });
        return { kind: "panel" };
      }
      try { const refreshed = await runtime.refreshModelPanel({ signal: operation.controller.signal }); if (operation.controller.signal.aborted || closed) return { kind: "cancelled" }; const view = panel(refreshed); publish({ panel: view, query: normalized, refresh: { errors: Object.freeze([...(refreshed.errors ?? [])]), status: "succeeded" }, status: "ready" }); if (normalized && refreshed.scope === "all") { const exact = findExactModelReferenceMatch(normalized, refreshed.exactCandidates); if (exact) return act(exact, operation.controller.signal); } return { kind: "panel" }; }
      catch (error) { if (!cancelled(error)) throw error; if (!closed) publish({ ...state, refresh: { errors: Object.freeze([]), status: "aborted" }, status: "ready" }); return { kind: "panel" }; }
      finally { clearTimeout(timeout); active.delete(operation); operation.signal?.removeEventListener("abort", operation.abort); }
    },
    async select(ref, { signal } = {}) { assertOpen(); const model = snapshot?.models.find((entry) => entry.provider === ref?.provider && entry.id === ref?.id); if (!model) throw new Error("MODEL_PANEL_SELECTION_STALE"); const operation = controller(signal); active.add(operation); publish({ ...state, status: "acting" }); try { return await act(model, operation.controller.signal); } catch (error) { if (cancelled(error)) return { kind: "cancelled" }; throw error; } finally { active.delete(operation); if (!closed) publish({ ...state, status: "ready" }); operation.signal?.removeEventListener("abort", operation.abort); } },
    subscribe(listener) { if (typeof listener !== "function") throw new Error("MODEL_PANEL_LISTENER_INVALID"); listeners.add(listener); listener(state); return () => listeners.delete(listener); },
  });
}
