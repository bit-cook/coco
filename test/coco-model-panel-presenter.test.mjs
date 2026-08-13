import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { presentModelPanelState } from "../resources/coco-model-panel-presenter.mjs";

const t = (key, values = {}) => `${key}:${JSON.stringify(values)}`;
const state = (refresh, scope = "all") => ({ panel: { rows: [] }, query: undefined, refresh, scope, status: refresh.status === "running" ? "refreshing" : "ready" });

test("presenter combines panel, scope, and every bounded refresh state", () => {
  assert.match(presentModelPanelState(state({ errors: [], reason: null, status: "running" }), { t }).refresh.text, /refresh\.running/);
  assert.match(presentModelPanelState(state({ errors: [], reason: null, status: "succeeded" }), { t }).refresh.text, /refresh\.success/);
  assert.match(presentModelPanelState(state({ errors: [], reason: "timeout", status: "aborted" }), { t }).refresh.text, /refresh\.timeout/);
  assert.match(presentModelPanelState(state({ errors: [{ provider: "agnes" }], reason: null, status: "succeeded" }), { t }).refresh.text, /"provider":"agnes"/);
  assert.match(presentModelPanelState(state({ errors: [{}], reason: null, status: "succeeded" }), { t }).refresh.text, /refresh\.error/);
  assert.match(presentModelPanelState(state({ errors: [{}, {}], reason: null, status: "succeeded" }), { t }).refresh.text, /"count":2/);
  const presented = presentModelPanelState(state({ errors: [], reason: null, status: "succeeded" }, "scoped"), { t }); assert.equal(presented.scope.current, "scoped"); assert.equal(Object.isFrozen(presented), true); assert.equal(Object.isFrozen(presented.refresh), true);
});

test("presenter keeps cancelled and runtime failures bounded without rendering host messages", () => {
  for (const refresh of [{ errors: [], reason: "cancelled", status: "aborted" }, { errors: [], reason: "runtime", status: "failed" }]) { const presented = presentModelPanelState(state(refresh), { t }); assert.equal(presented.refresh.text, null); assert.equal(JSON.stringify(presented).includes("host failure"), false); }
});

test("presenter has no Pi, TUI, registration, or side-effect dependency", async () => {
  const source = await readFile(new URL("../resources/coco-model-panel-presenter.mjs", import.meta.url), "utf8"); for (const forbidden of ["@earendil-works", "pi-tui", "registerCommand", "registerShortcut", "fetch(", "writeFile"]) assert.equal(source.includes(forbidden), false);
});
