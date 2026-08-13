import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import cocoModelPanel, { CocoModelPicker, createCocoModelPanelAdapter } from "../resources/coco-model-panel.mjs";

const model = (provider, id) => ({ id, name: id, provider });
const theme = { bold: (text) => text, fg: (_color, text) => text };
const keybindings = { matches: (data, action) => data === action };
const view = (rows) => ({ panel: { authenticationHint: "Authenticate", noMatches: "No matches", rows, title: "Models" }, query: undefined, refresh: { status: "ready", text: null }, scope: { action: "scope", all: "all", current: "all", label: "Scope:", scoped: "scoped" }, status: "ready" });
const row = (provider, id, statusText = null) => ({ current: false, detail: `Model Name: ${id}`, id, provider, ref: { id, provider }, status: statusText ? "login-required" : "ready", statusText });

test("public-TUI picker filters, wraps, confirms stable refs, and bounds every line", () => {
  const selected = []; let renders = 0; const picker = new CocoModelPicker({ initialView: view([row("alpha", "one"), row("zeta", "two", "login-required")]), keybindings, onCancel: () => selected.push(null), onConfirm: (ref) => selected.push(ref), requestRender: () => { renders++; }, theme });
  picker.focused = true; assert.equal(picker.input.focused, true); picker.handleInput("tui.select.up"); picker.handleInput("tui.select.confirm"); assert.deepEqual(selected, [{ id: "two", provider: "zeta" }]); assert.ok(picker.render(20).every((line) => visibleWidth(line) <= 20)); assert.ok(renders > 0);
  const filtering = new CocoModelPicker({ initialView: view([row("alpha", "one"), row("zeta", "two")]), keybindings, onCancel: () => {}, onConfirm: () => {}, requestRender: () => {}, theme }); filtering.handleInput("zeta"); assert.match(filtering.render(40).join("\n"), /two \[zeta\]/); assert.doesNotMatch(filtering.render(40).join("\n"), /one \[alpha\]/);
  const prefilled = new CocoModelPicker({ initialView: { ...view([row("alpha", "one"), row("zeta", "two")]), query: "zeta" }, keybindings, onCancel: () => {}, onConfirm: () => {}, requestRender: () => {}, theme }); assert.equal(prefilled.input.getValue(), "zeta"); assert.match(prefilled.render(40).join("\n"), /two \[zeta\]/);
});

function runtimeFixture({ authenticated, models }) {
  const calls = [];
  return { calls, runtime: { activateModel: async (entry) => { calls.push(["activate", entry.provider, entry.id]); }, custom: async () => { calls.push(["custom"]); return null; }, cycleModel: async (direction) => { calls.push(["cycle", direction]); }, getAvailableModels: () => models.filter((entry) => authenticated.has(entry.provider)), getCurrentModel: () => models[0], getModel: ({ provider, id }) => models.find((entry) => entry.provider === provider && entry.id === id), getModelError: () => undefined, getModels: () => models, getScopedModels: () => models.map((entry) => ({ model: entry })), hasConfiguredAuth: (provider) => authenticated.has(provider), loginProvider: async (provider) => { calls.push(["login", provider]); }, persistDefaultModel: (ref) => { calls.push(["persist", ref.provider, ref.id]); }, refreshModels: async () => ({ aborted: false, errors: new Map() }) } };
}

test("adapter registers once and preserves ready, locked, and cycle transactions", async () => {
  let registered; cocoModelPanel({ registerBuiltinModelPanel: (adapter) => { registered = adapter; } }); assert.equal(registered.id, "coco.model-panel.v1");
  const alpha = model("alpha", "one"), zeta = model("zeta", "two"); const fixture = runtimeFixture({ authenticated: new Set(["alpha"]), models: [alpha, zeta] }); const adapter = createCocoModelPanelAdapter();
  await adapter.open({ query: "alpha/one", signal: new AbortController().signal, trigger: "command" }, fixture.runtime); assert.deepEqual(fixture.calls, [["persist", "alpha", "one"], ["activate", "alpha", "one"]]);
  fixture.calls.length = 0; await adapter.open({ query: "zeta/two", signal: new AbortController().signal, trigger: "command" }, fixture.runtime); assert.deepEqual(fixture.calls, [["login", "zeta"]]);
  fixture.calls.length = 0; await adapter.cycle({ direction: "backward", signal: new AbortController().signal, trigger: "cycle-backward" }, fixture.runtime); assert.deepEqual(fixture.calls, [["cycle", "backward"]]);
});

test("model panel extension imports only the public TUI package root", async () => {
  const source = await readFile(new URL("../resources/coco-model-panel.mjs", import.meta.url), "utf8"); assert.match(source, /from "@earendil-works\/pi-tui"/); for (const forbidden of ["pi-coding-agent/dist", "node_modules/", "modes/interactive", "core/extensions"]) assert.equal(source.includes(forbidden), false);
});
