import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listModels } from "../node_modules/@earendil-works/pi-coding-agent/dist/cli/list-models.js";
import { ModelRuntime } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js";
import { stream } from "../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js";
import { clampThinkingLevel, getSupportedThinkingLevels } from "../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/models.js";

const declaredModel = {
  contextWindow: 128000,
  cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
  id: "gpt-5.6",
  input: ["text"],
  maxTokens: 16384,
  name: "GPT-5.6",
  reasoning: false,
};

test("Given an unauthenticated explicitly declared model, when the runtime projects visible models, then it remains visible but unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-visible-models-"));
  const modelsPath = join(directory, "models.json");
  const authPath = join(directory, "auth.json");
  try {
    await Promise.all([
      writeFile(authPath, "{}\n"),
      writeFile(modelsPath, `${JSON.stringify({ providers: { idepub: { api: "openai-completions", authHeader: true, baseUrl: "https://ai.ide.pub/v1", models: [declaredModel] } } })}\n`),
    ]);
    const runtime = await ModelRuntime.create({ allowModelNetwork: false, authPath, modelsPath });

    assert.deepEqual((await runtime.getAvailable()).map((model) => `${model.provider}/${model.id}`), []);
    assert.deepEqual(runtime.getVisible().map((model) => `${model.provider}/${model.id}`), ["idepub/gpt-5.6"]);
    const model = runtime.getModel("idepub", "gpt-5.6");
    assert.notEqual(model, undefined);
    const result = await runtime.completeSimple(model, { messages: [], systemPrompt: "" });
    assert.equal(result.stopReason, "error");
    assert.match(result.errorMessage, /Provider is not configured: idepub/);
    assert.equal(result.usage.totalTokens, 0);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Given an unauthenticated builtin provider with one declared model, when the runtime projects visible models, then it excludes the provider's undeclared builtins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-visible-builtins-"));
  const modelsPath = join(directory, "models.json");
  const authPath = join(directory, "auth.json");
  try {
    await Promise.all([
      writeFile(authPath, "{}\n"),
      writeFile(modelsPath, `${JSON.stringify({ providers: { openai: { models: [{ ...declaredModel, id: "gpt-5.4" }] } } })}\n`),
    ]);
    const runtime = await ModelRuntime.create({ allowModelNetwork: false, authPath, modelsPath });
    const builtinModels = runtime.getModels("openai").filter((model) => model.id !== "gpt-5.4");

    assert.ok(builtinModels.length > 0);
    assert.deepEqual(runtime.getVisible().filter((model) => model.provider === "openai").map((model) => model.id), ["gpt-5.4"]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Given the official declared DeepSeek models, when the runtime loads them, then both are visible with Pi's model-level thinking compatibility", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-visible-deepseek-"));
  const modelsPath = join(directory, "models.json");
  const authPath = join(directory, "auth.json");
  const compat = { requiresReasoningContentOnAssistantMessages: true, supportsDeveloperRole: false, supportsStore: false, thinkingFormat: "deepseek" };
  const thinkingLevelMap = { high: "high", low: null, max: "max", medium: null, minimal: null };
  try {
    await Promise.all([
      writeFile(authPath, "{}\n"),
      writeFile(modelsPath, `${JSON.stringify({ providers: { deepseek: { api: "openai-completions", authHeader: true, baseUrl: "https://api.deepseek.com", models: [
        { ...declaredModel, compat, contextWindow: 1000000, cost: { cacheRead: 0.0028, cacheWrite: 0, input: 0.14, output: 0.28 }, id: "deepseek-v4-flash", maxTokens: 384000, name: "DeepSeek V4 Flash", reasoning: true, thinkingLevelMap },
        { ...declaredModel, compat, contextWindow: 1000000, cost: { cacheRead: 0.003625, cacheWrite: 0, input: 0.435, output: 0.87 }, id: "deepseek-v4-pro", maxTokens: 384000, name: "DeepSeek V4 Pro", reasoning: true, thinkingLevelMap },
      ] } } })}\n`),
    ]);
    const runtime = await ModelRuntime.create({ allowModelNetwork: false, authPath, modelsPath });
    const models = runtime.getVisible().filter((model) => model.provider === "deepseek");
    assert.deepEqual(models.map((model) => model.id), ["deepseek-v4-flash", "deepseek-v4-pro"]);
    assert.deepEqual(models.map((model) => model.compat), [compat, compat]);
    assert.deepEqual(models.map(getSupportedThinkingLevels), [["off", "high", "max"], ["off", "high", "max"]]);
    assert.equal(clampThinkingLevel(models[0], "max"), "max");
    let payload;
    const result = await stream(models[0], { messages: [], systemPrompt: "" }, {
      apiKey: "test-only",
      onPayload: (params) => {
        payload = params;
        throw new Error("PAYLOAD_CAPTURED");
      },
      reasoningEffort: "max",
    }).result();
    assert.equal(result.stopReason, "error");
    assert.deepEqual(payload?.thinking, { type: "enabled" });
    assert.equal(payload?.reasoning_effort, "max");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Given visible ready and unauthenticated models, when --list-models renders them, then it prints deterministic statuses", async () => {
  const output = [];
  const originalLog = console.log;
  console.log = (line) => output.push(line);
  try {
    await listModels({
      hasConfiguredAuth: (provider) => provider === "agnes",
      getError: () => undefined,
      getVisible: () => [
        { ...declaredModel, id: "agnes-2.5-flash", provider: "agnes" },
        { ...declaredModel, provider: "idepub" },
      ],
    });
  } finally {
    console.log = originalLog;
  }

  assert.match(output.join("\n"), /status/);
  assert.match(output.join("\n"), /agnes\s+agnes-2\.5-flash[\s\S]*ready/);
  assert.match(output.join("\n"), /idepub\s+gpt-5\.6[\s\S]*login-required/);
});
