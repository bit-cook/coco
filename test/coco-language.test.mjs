import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import cocoLanguage, { createLanguageService } from "../resources/coco-language.mjs";

async function fixture() {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-language-"));
  return { agentDir, cleanup: () => rm(agentDir, { force: true, recursive: true }) };
}

test("built-in English and Chinese languages switch and persist", async () => {
  const setup = await fixture();
  try {
    const service = createLanguageService({ agentDir: setup.agentDir });
    assert.deepEqual(service.available().map((pack) => pack.locale), ["en", "zh-CN"]);
    assert.equal(service.locale, "en");
    assert.equal(service.select("zh-CN"), true);
    assert.equal(service.t("goal.label"), "目标");
    assert.deepEqual(JSON.parse(await readFile(join(setup.agentDir, "language.json"), "utf8")), { locale: "zh-CN", schemaVersion: 1 });
    assert.equal(createLanguageService({ agentDir: setup.agentDir }).locale, "zh-CN");
  } finally { await setup.cleanup(); }
});

test("language follows the environment until the user explicitly selects one", async () => {
  const setup = await fixture();
  const original = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL, LC_MESSAGES: process.env.LC_MESSAGES };
  try {
    delete process.env.LC_ALL; delete process.env.LC_MESSAGES; process.env.LANG = "zh_CN.UTF-8";
    assert.equal(createLanguageService({ agentDir: setup.agentDir }).locale, "zh-CN");
    const service = createLanguageService({ agentDir: setup.agentDir });
    assert.equal(service.select("en"), true);
    process.env.LANG = "zh_CN.UTF-8";
    assert.equal(createLanguageService({ agentDir: setup.agentDir }).locale, "en");
  } finally {
    for (const [key, value] of Object.entries(original)) value === undefined ? delete process.env[key] : process.env[key] = value;
    await setup.cleanup();
  }
});

test("valid user language packs merge over English while malformed packs are ignored", async () => {
  const setup = await fixture();
  try {
    const directory = join(setup.agentDir, "languages");
    await mkdir(directory);
    await writeFile(join(directory, "es.json"), `${JSON.stringify({ locale: "es", messages: { "goal.label": "Objetivo", "language.commandDescription": "Elegir idioma" }, name: "Español", schemaVersion: 1 })}\n`);
    await writeFile(join(directory, "bad.json"), '{"schemaVersion":1,"locale":"other","name":"Bad","messages":{}}\n');
    const service = createLanguageService({ agentDir: setup.agentDir });
    assert.deepEqual(service.available().map((pack) => pack.locale), ["en", "zh-CN", "es"]);
    assert.equal(service.select("es"), true);
    assert.equal(service.t("goal.label"), "Objetivo");
    assert.match(service.t("goal.noGoal"), /No goal is set/);
    assert.equal(service.select("../escape"), false);
    assert.equal(service.select("bad"), false);
  } finally { await setup.cleanup(); }
});

test("language command lists, switches, and injects response guidance", async () => {
  const setup = await fixture();
  const original = process.env.COCO_CODING_AGENT_DIR;
  process.env.COCO_CODING_AGENT_DIR = setup.agentDir;
  delete globalThis[Symbol.for("coco.language.service")];
  try {
    const commands = new Map(), events = new Map(), notices = [];
    let reloads = 0;
    cocoLanguage({ on: (name, handler) => events.set(name, handler), registerCommand: (name, command) => commands.set(name, command) });
    const context = { hasUI: true, reload: async () => { reloads += 1; }, ui: { notify: (message, level) => notices.push({ level, message }), select: async () => "zh-CN - 简体中文" } };
    await commands.get("language").handler("zh-CN", context);
    assert.match(notices.at(-1).message, /语言已切换/);
    assert.equal(reloads, 1);
    const result = await events.get("before_agent_start")({ systemPrompt: "Base" });
    assert.match(result.systemPrompt, /使用简体中文回答/);
    assert.equal(result.systemPrompt.match(/<user_language>/g).length, 1);
  } finally {
    if (original === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = original;
    delete globalThis[Symbol.for("coco.language.service")];
    await setup.cleanup();
  }
});
