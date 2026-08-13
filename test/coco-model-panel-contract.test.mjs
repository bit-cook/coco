import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ModelSelectorComponent } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/model-selector.js";
import { initTheme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { COCO_MODEL_PANEL_CONTRACT_VERSION, projectModelPanel, resolveModelPanelSelection } from "../resources/coco-model-panel-contract.mjs";

const model = (provider, id, name = id) => ({ api: "openai-completions", baseUrl: "https://example.invalid", contextWindow: 128000, cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 }, id, input: ["text"], maxTokens: 4096, name, provider, reasoning: false });
initTheme("coco-orange", false);

function selectorFixture({ authenticated, current, models }) {
  const selected = []; const persisted = [];
  const runtime = { getError: () => undefined, getModel: (provider, id) => models.find((entry) => entry.provider === provider && entry.id === id), getVisibleSnapshot: () => models, hasConfiguredAuth: (provider) => authenticated.has(provider), refresh: async () => ({ aborted: false, errors: new Map() }) };
  const selector = new ModelSelectorComponent({ requestRender: () => {} }, current, { setDefaultModelAndProvider: (provider, id) => persisted.push({ id, provider }) }, runtime, [], (entry, loginRequired) => selected.push({ entry, loginRequired }), () => {});
  return { persisted, selected, selector };
}

test("source model-panel projection matches patched selector visibility, order, and semantic status", async () => {
  const models = [model("zeta", "same", "Duplicate"), model("alpha", "model:one", "Duplicate"), model("alpha", "model/two")]; const current = models[2]; const authenticated = new Set(["alpha"]);
  const expected = projectModelPanel({ currentModel: current, hasConfiguredAuth: (provider) => authenticated.has(provider), models });
  const { selector } = selectorFixture({ authenticated, current, models }); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(COCO_MODEL_PANEL_CONTRACT_VERSION, 1);
  assert.deepEqual(expected.map(({ ref, status }) => ({ ref, status })), selector.allModels.map(({ id, loginRequired, provider }) => ({ ref: { id, provider }, status: loginRequired ? "login-required" : "ready" })));
  assert.deepEqual(expected.map(({ current }) => current), [true, false, false]); selector.close();
});

test("source model-panel selection matches patched ready and login-required branches", () => {
  const ready = model("alpha", "ready"); const locked = model("zeta", "locked"); const models = [locked, ready]; const authenticated = new Set(["alpha"]);
  const rows = projectModelPanel({ currentModel: ready, hasConfiguredAuth: (provider) => authenticated.has(provider), models });
  const fixture = selectorFixture({ authenticated, current: ready, models }); fixture.selector.handleSelect(ready);
  assert.deepEqual(fixture.persisted, [{ id: "ready", provider: "alpha" }]); assert.deepEqual(fixture.selected, [{ entry: ready, loginRequired: false }]); assert.deepEqual(resolveModelPanelSelection(rows.find(({ model: entry }) => entry === ready)), { action: "select", model: ready });
  const lockedFixture = selectorFixture({ authenticated, current: ready, models }); lockedFixture.selector.handleSelect(locked);
  assert.deepEqual(lockedFixture.persisted, []); assert.deepEqual(lockedFixture.selected, [{ entry: locked, loginRequired: true }]); assert.deepEqual(resolveModelPanelSelection(rows.find(({ model: entry }) => entry === locked)), { action: "login", provider: "zeta" });
});

test("model-panel contract uses stable provider/id identity and contains no display labels", async () => {
  const first = model("alpha", "same", "Duplicate"); const second = model("zeta", "same", "Duplicate"); const rows = projectModelPanel({ currentModel: second, hasConfiguredAuth: () => true, models: [first, second] });
  assert.deepEqual(rows.map(({ ref }) => ref), [{ id: "same", provider: "zeta" }, { id: "same", provider: "alpha" }]);
  assert.throws(() => resolveModelPanelSelection({ ...rows[0], ref: { id: "wrong", provider: "zeta" } }), /MODEL_PANEL_SELECTION_INVALID/);
  const source = await readFile(new URL("../resources/coco-model-panel-contract.mjs", import.meta.url), "utf8");
  for (const forbidden of ["@earendil-works", "coco-ui-language", "Models", "Login", "登录", "模型"]) assert.equal(source.includes(forbidden), false);
});
