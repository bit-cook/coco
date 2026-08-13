import { fuzzyFilter, Input, truncateToWidth } from "@earendil-works/pi-tui";
import { createModelPanelController } from "./coco-model-panel-controller.mjs";
import { presentModelPanelState } from "./coco-model-panel-presenter.mjs";

const sameRef = (left, right) => left?.provider === right?.provider && left?.id === right?.id;

export class CocoModelPicker {
  constructor({ initialView, keybindings, onCancel, onConfirm, requestRender, theme }) {
    this.input = new Input(); this.input.setValue(initialView.query ?? ""); this.keybindings = keybindings; this.onCancel = onCancel; this.onConfirm = onConfirm; this.requestRender = requestRender; this.theme = theme; this.view = initialView; this.filteredRows = []; this.selectedIndex = 0; this._focused = false; this.closed = false; this.applyFilter();
  }
  get focused() { return this._focused; }
  set focused(value) { this._focused = value; this.input.focused = value; }
  applyFilter() { const rows = this.view.panel?.rows ?? []; const query = this.input.getValue(); const selected = this.filteredRows[this.selectedIndex]?.ref; this.filteredRows = query ? fuzzyFilter([...rows], query, (row) => `${row.provider}/${row.id} ${row.detail}`) : [...rows]; const preserved = this.filteredRows.findIndex((row) => sameRef(row.ref, selected)); this.selectedIndex = preserved >= 0 ? preserved : Math.min(this.selectedIndex, Math.max(0, this.filteredRows.length - 1)); }
  setView(view) { if (this.closed) return; this.view = view; this.applyFilter(); this.requestRender(); }
  handleInput(data) {
    if (this.closed) return;
    if (this.keybindings.matches(data, "tui.select.cancel")) { this.closed = true; this.onCancel(); return; }
    if (this.keybindings.matches(data, "tui.select.up")) { if (this.filteredRows.length) this.selectedIndex = this.selectedIndex === 0 ? this.filteredRows.length - 1 : this.selectedIndex - 1; this.requestRender(); return; }
    if (this.keybindings.matches(data, "tui.select.down")) { if (this.filteredRows.length) this.selectedIndex = (this.selectedIndex + 1) % this.filteredRows.length; this.requestRender(); return; }
    if (this.keybindings.matches(data, "tui.select.confirm")) { const row = this.filteredRows[this.selectedIndex]; if (row) { this.closed = true; this.onConfirm(row.ref); } return; }
    this.input.handleInput(data); this.applyFilter(); this.requestRender();
  }
  render(width) {
    const lines = [this.theme.bold(this.theme.fg("accent", this.view.panel?.title ?? "")), this.view.panel?.authenticationHint ?? "", this.view.scope ? `${this.view.scope.label} ${this.view.scope.current === "all" ? this.view.scope.all : this.view.scope.scoped}` : "", "", ...this.input.render(Math.max(1, width))];
    const visible = this.filteredRows.slice(Math.max(0, this.selectedIndex - 5), Math.max(0, this.selectedIndex - 5) + 10);
    for (const row of visible) { const selected = sameRef(row.ref, this.filteredRows[this.selectedIndex]?.ref); lines.push(`${selected ? "> " : "  "}${row.id} [${row.provider}]${row.current ? " *" : ""}${row.statusText ? ` ${row.statusText}` : ""}`); }
    if (this.filteredRows.length === 0) lines.push(this.view.panel?.noMatches ?? "");
    const row = this.filteredRows[this.selectedIndex]; if (row) lines.push("", row.detail);
    if (this.view.refresh.text) lines.push(this.view.refresh.text);
    return lines.map((line) => truncateToWidth(line, Math.max(1, width), ""));
  }
  invalidate() { this.requestRender(); }
  dispose() { this.closed = true; }
}

function snapshot(runtime) {
  const scoped = runtime.getScopedModels(); const scope = scoped.length > 0 ? "scoped" : "all"; const models = scope === "scoped" ? scoped.map(({ model }) => runtime.getModel({ provider: model.provider, id: model.id }) ?? model) : [...runtime.getModels()];
  return Object.freeze({ currentModel: runtime.getCurrentModel(), exactCandidates: Object.freeze([...models]), models: Object.freeze([...models]), scope });
}

export function createCocoModelPanelRuntime(runtime) {
  return Object.freeze({ activateModel: (model, options) => runtime.activateModel(model, options), cycleModel: (direction, options) => runtime.cycleModel(direction, options), hasConfiguredAuth: (provider) => runtime.hasConfiguredAuth(provider), loginProvider: (provider, options) => runtime.loginProvider(provider, options), persistDefaultModel: (ref, options) => runtime.persistDefaultModel(ref, options), readModelPanelSnapshot: () => snapshot(runtime), async refreshModelPanel({ signal }) { const result = await runtime.refreshModels({ signal }); signal.throwIfAborted(); return Object.freeze({ ...snapshot(runtime), errors: Object.freeze([...result.errors].map(([provider]) => Object.freeze({ provider }))) }); } });
}

export function createCocoModelPanelAdapter() {
  return Object.freeze({ id: "coco.model-panel.v1", async cycle(request, runtime) { const controller = createModelPanelController({ runtime: createCocoModelPanelRuntime(runtime) }); try { await controller.cycle(request.direction, { signal: request.signal }); } finally { controller.close(); } }, async open(request, runtime) { const controller = createModelPanelController({ runtime: createCocoModelPanelRuntime(runtime) }); try { const opening = await controller.open({ query: request.query, signal: request.signal }); if (opening.kind !== "panel" || request.signal.aborted) return; const selected = await runtime.custom((tui, theme, keybindings, done) => { const picker = new CocoModelPicker({ initialView: presentModelPanelState(controller.getState()), keybindings, onCancel: () => done(null), onConfirm: done, requestRender: () => tui.requestRender(), theme }); const unsubscribe = controller.subscribe((state) => picker.setView(presentModelPanelState(state))); const abort = () => done(null); request.signal.addEventListener("abort", abort, { once: true }); const dispose = picker.dispose.bind(picker); picker.dispose = () => { dispose(); unsubscribe(); request.signal.removeEventListener("abort", abort); }; return picker; }); request.signal.throwIfAborted(); if (selected) await controller.select(selected, { signal: request.signal }); } finally { controller.close(); } } });
}

export default function cocoModelPanel(pi) { pi.registerBuiltinModelPanel(createCocoModelPanelAdapter()); }
