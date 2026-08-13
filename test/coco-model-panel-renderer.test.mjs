import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLanguageService } from "../resources/coco-language.mjs";
import { COCO_MODEL_PANEL_MESSAGE_KEYS, renderModelPanel } from "../resources/coco-model-panel-renderer.mjs";

const model = (provider, id, name) => ({ id, name, provider });
const current = model("alpha", "alpha/model:one", "Alpha");
const input = { currentModel: current, hasConfiguredAuth: (provider) => provider === "alpha", models: [model("zeta", "zeta-model", ""), current] };

test("renderer requests stable keys and preserves semantic identity and status", () => {
  const calls = []; const t = (key, values = {}) => { calls.push({ key, values }); return `translated:${key}`; }; const panel = renderModelPanel(input, { t });
  assert.deepEqual(new Set(calls.map(({ key }) => key)), new Set(Object.values(COCO_MODEL_PANEL_MESSAGE_KEYS)));
  assert.deepEqual(panel.rows.map(({ provider, id, status }) => ({ id, provider, status })), [{ id: "alpha/model:one", provider: "alpha", status: "ready" }, { id: "zeta-model", provider: "zeta", status: "login-required" }]);
  assert.equal(panel.rows[0].statusText, null); assert.equal(panel.rows[1].statusText, `translated:${COCO_MODEL_PANEL_MESSAGE_KEYS.loginRequired}`);
  const names = calls.filter(({ key }) => key === COCO_MODEL_PANEL_MESSAGE_KEYS.modelName).map(({ values }) => values.name); assert.deepEqual(names, ["Alpha", "zeta-model"]);
  assert.equal(Object.isFrozen(panel), true); assert.equal(Object.isFrozen(panel.rows), true); assert.equal(Object.isFrozen(panel.rows[0]), true); assert.equal(Object.isFrozen(panel.rows[0].ref), true);
});

test("built-in English and Chinese render exact model-panel labels without translating identifiers", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-model-renderer-"));
  try {
    const service = createLanguageService({ agentDir }); service.select("en"); const english = renderModelPanel(input, { t: service.t });
    assert.equal(english.title, "Models"); assert.equal(english.rows[0].detail, "Model Name: Alpha"); assert.equal(english.rows[1].detail, "Model Name: zeta-model"); assert.equal(english.rows[1].statusText, "login-required");
    service.select("zh-CN"); const chinese = renderModelPanel(input, { t: service.t });
    assert.equal(chinese.title, "模型"); assert.equal(chinese.rows[0].detail, "模型名称：Alpha"); assert.equal(chinese.rows[1].detail, "模型名称：zeta-model"); assert.equal(chinese.rows[1].statusText, "需要登录"); assert.equal(chinese.rows[0].id, "alpha/model:one");
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("partial packs fall back to English and malformed placeholder packs are rejected", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-model-pack-")); const directory = join(agentDir, "languages");
  try {
    await mkdir(directory); await writeFile(join(directory, "es.json"), `${JSON.stringify({ locale: "es", messages: { "modelPanel.title": "Modelos" }, name: "Español", schemaVersion: 1 })}\n`);
    await writeFile(join(directory, "bad.json"), `${JSON.stringify({ locale: "bad", messages: { "modelPanel.modelName": "Broken" }, name: "Bad", schemaVersion: 1 })}\n`);
    const service = createLanguageService({ agentDir }); assert.equal(service.select("es"), true); const panel = renderModelPanel(input, { t: service.t });
    assert.equal(panel.title, "Modelos"); assert.equal(panel.noMatches, "No matching models"); assert.equal(panel.rows[0].detail, "Model Name: Alpha"); assert.equal(service.select("bad"), false);
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("renderer has no Pi, legacy display-string localization, or registration dependency", async () => {
  const source = await readFile(new URL("../resources/coco-model-panel-renderer.mjs", import.meta.url), "utf8");
  for (const forbidden of ["@earendil-works", "pi-coding-agent", "pi-tui", "coco-ui-language", "registerCommand", "registerShortcut"]) assert.equal(source.includes(forbidden), false);
});
