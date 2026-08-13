import assert from "node:assert/strict";
import test from "node:test";

import { createModelPanelController } from "../resources/coco-model-panel-controller.mjs";

const model = (provider, id) => ({ id, name: id, provider });
function fixture({ authenticated = new Set(["alpha"]), initial, refreshed = initial } = {}) {
  const calls = []; let releaseRefresh; const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; }); let releasePersist = () => {};
  let persistGate = Promise.resolve(); const runtime = {
    activateModel: async (entry, { signal }) => { signal.throwIfAborted(); calls.push(["activate", entry.provider, entry.id]); }, cycleModel: async (direction) => { calls.push(["cycle", direction]); return direction; }, hasConfiguredAuth: (provider) => authenticated.has(provider),
    loginProvider: async (provider, { signal }) => { signal.throwIfAborted(); calls.push(["login", provider]); }, persistDefaultModel: async (ref) => { calls.push(["persist", ref.provider, ref.id]); await persistGate; },
    readModelPanelSnapshot: () => initial, refreshModelPanel: async ({ signal }) => { calls.push(["refresh"]); await refreshGate; signal.throwIfAborted(); return refreshed; },
  };
  return { calls, controller: createModelPanelController({ refreshTimeoutMs: 10_000, render: (input) => ({ rows: input.models }), runtime }), releaseRefresh, runtime, waitPersist() { persistGate = new Promise((resolve) => { releasePersist = resolve; }); }, releasePersist: () => releasePersist() };
}

test("controller publishes cached panel before refresh and resolves unscoped exact query after refresh", async () => {
  const alpha = model("alpha", "one"); const initial = { currentModel: alpha, exactCandidates: [], models: [alpha], scope: "all" }; const refreshed = { ...initial, exactCandidates: [alpha] }; const value = fixture({ initial, refreshed });
  const states = []; value.controller.subscribe((state) => states.push(state)); const opened = value.controller.open({ query: "alpha/one" }); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(states.at(-1).status, "refreshing"); assert.deepEqual(states.at(-1).panel.rows, [alpha]); assert.deepEqual(value.calls, [["refresh"]]); value.releaseRefresh();
  assert.deepEqual(await opened, { kind: "activated", ref: { id: "one", provider: "alpha" } }); assert.deepEqual(value.calls, [["refresh"], ["persist", "alpha", "one"], ["activate", "alpha", "one"]]);
});

test("controller locked selection performs login only while ready selection persists before activation", async () => {
  const alpha = model("alpha", "ready"), zeta = model("zeta", "locked"); const snapshot = { currentModel: alpha, exactCandidates: [alpha], models: [zeta, alpha], scope: "all" }; const value = fixture({ initial: snapshot }); assert.deepEqual(await value.controller.open(), { kind: "panel" }); value.releaseRefresh(); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await value.controller.select({ id: "locked", provider: "zeta" }), { kind: "login", provider: "zeta" }); assert.deepEqual(value.calls.slice(-1), [["login", "zeta"]]);
  assert.deepEqual(await value.controller.select({ id: "ready", provider: "alpha" }), { kind: "activated", ref: { id: "ready", provider: "alpha" } }); assert.deepEqual(value.calls.slice(-2), [["persist", "alpha", "ready"], ["activate", "alpha", "ready"]]);
});

test("controller close during persistence prevents activation and cycle delegates exactly once", async () => {
  const alpha = model("alpha", "one"); const snapshot = { currentModel: alpha, exactCandidates: [alpha], models: [alpha], scope: "all" }; const value = fixture({ initial: snapshot }); await value.controller.open(); value.releaseRefresh(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await value.controller.cycle("backward"), "backward"); assert.deepEqual(value.calls.slice(-1), [["cycle", "backward"]]); value.waitPersist(); const selection = value.controller.select({ id: "one", provider: "alpha" }); await new Promise((resolve) => setImmediate(resolve)); value.controller.close(); value.releasePersist(); assert.deepEqual(await selection, { kind: "cancelled" }); assert.equal(value.calls.some(([name]) => name === "activate"), false);
});

test("controller rejects concurrent selections and owns scoped exact cancellation", async () => {
  const alpha = model("alpha", "one"); const snapshot = { currentModel: alpha, exactCandidates: [alpha], models: [alpha], scope: "scoped" }; const value = fixture({ initial: snapshot }); value.waitPersist();
  const exact = value.controller.open({ query: "alpha/one" }); await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => value.controller.select({ id: "one", provider: "alpha" }), /MODEL_PANEL_ACTION_IN_PROGRESS/); value.controller.close(); value.releasePersist(); assert.deepEqual(await exact, { kind: "cancelled" }); assert.equal(value.calls.some(([name]) => name === "activate"), false);
});

test("background refresh timeout converges state before an uncooperative runtime resolves", async () => {
  const alpha = model("alpha", "one"); const snapshot = { currentModel: alpha, exactCandidates: [alpha], models: [alpha], scope: "all" }; const value = fixture({ initial: snapshot });
  const controller = createModelPanelController({ refreshTimeoutMs: 10, render: (input) => ({ rows: input.models }), runtime: value.runtime }); assert.deepEqual(await controller.open(), { kind: "panel" }); await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(controller.getState().status, "ready"); assert.equal(controller.getState().refresh.status, "aborted"); controller.close(); value.releaseRefresh(); await new Promise((resolve) => setImmediate(resolve)); assert.equal(controller.getState().status, "closed");
});
