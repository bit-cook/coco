import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COCO_MODEL_PANEL_ACTIONS, COCO_MODEL_PANEL_ADAPTER_CONTRACT_VERSION, createModelPanelConformanceHost } from "../resources/coco-model-panel-adapter-contract.mjs";

function subject() {
  const calls = []; const runtime = { marker: "runtime" }; const fallback = { cycle: async (request) => calls.push({ owner: "fallback", request }), open: async (request) => calls.push({ owner: "fallback", request }) }; const host = createModelPanelConformanceHost({ fallback, runtime });
  const adapter = { id: "coco.model-panel.v1", cycle: async (request, value) => calls.push({ owner: "adapter", request, runtime: value }), open: async (request, value) => calls.push({ owner: "adapter", request, runtime: value }) };
  return { adapter, calls, host, runtime };
}

test("registration atomically owns model command and all model app actions", async () => {
  const { adapter, calls, host, runtime } = subject(); host.registerBuiltinModelPanel(adapter);
  await host.invokeCommand("  provider/model  "); for (const action of COCO_MODEL_PANEL_ACTIONS) await host.invokeAction(action);
  assert.deepEqual(calls.map(({ owner }) => owner), Array(4).fill("adapter")); assert.ok(calls.every((entry) => entry.runtime === runtime));
  assert.deepEqual(calls.map(({ request }) => ({ direction: request.direction, query: request.query, trigger: request.trigger })), [
    { direction: undefined, query: "provider/model", trigger: "command" }, { direction: undefined, query: undefined, trigger: "select-shortcut" }, { direction: "forward", query: undefined, trigger: "cycle-forward" }, { direction: "backward", query: undefined, trigger: "cycle-backward" },
  ]);
});

test("duplicate registration fails and reload restores every fallback atomically", async () => {
  const { adapter, calls, host } = subject(); host.registerBuiltinModelPanel(adapter); assert.throws(() => host.registerBuiltinModelPanel(adapter), /MODEL_PANEL_ADAPTER_CONFLICT/); host.reload(); await host.invokeCommand(); await host.invokeAction("app.model.cycleForward"); assert.deepEqual(calls.map(({ owner }) => owner), ["fallback", "fallback"]);
});

test("reload aborts active adapter invocation", async () => {
  const { host } = subject(); let signal; let release;
  host.registerBuiltinModelPanel({ id: "deferred", cycle: async () => {}, open: (request) => { signal = request.signal; return new Promise((resolve) => { release = resolve; }); } });
  const running = host.invokeCommand(); await new Promise((resolve) => setImmediate(resolve)); assert.equal(signal.aborted, false); host.reload(); assert.equal(signal.aborted, true); release(); await running;
});

test("adapter conformance contract has no Pi internal or registration side effect", async () => {
  assert.equal(COCO_MODEL_PANEL_ADAPTER_CONTRACT_VERSION, 1); const source = await readFile(new URL("../resources/coco-model-panel-adapter-contract.mjs", import.meta.url), "utf8"); for (const forbidden of ["@earendil-works", "pi-coding-agent", "pi-tui", "registerCommand", "registerShortcut"]) assert.equal(source.includes(forbidden), false);
});
