import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createProviderSyncTestCapability, syncProviderModelsForTest } from "../scripts/dev-provider-sync.mjs";
import { StateError } from "../scripts/state-schema.mjs";

test("capability transformations allowlist schema accepts model IDs and rejects invalid entries", async () => {
  const schema = JSON.parse(await readFile(join(resolve(new URL("..", import.meta.url).pathname), "resources/capability.schema.v1.json"), "utf8"));
  const allowlist = schema.properties.allowlist;
  assert.deepEqual(allowlist, {
    type: "object",
    additionalProperties: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", minLength: 1 },
    },
  });

  const validate = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every((models) => Array.isArray(models)
      && new Set(models).size === models.length
      && models.every((modelId) => typeof modelId === "string" && modelId.length >= 1));
  assert.equal(validate({ deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"] }), true);
  assert.equal(validate({ deepseek: "deepseek-v4-flash" }), false);
  assert.equal(validate({ deepseek: [""] }), false);
  assert.equal(validate({ deepseek: ["duplicate", "duplicate"] }), false);
});

const root = resolve(new URL("..", import.meta.url).pathname);

async function rejects(action) {
  try {
    await action();
  } catch (error) {
    return error instanceof StateError && error.code === "TEST_SEAM_FORBIDDEN";
  }
  return false;
}

test("Given a provider-sync capability, when used from its canonical test root, then fixture sync accepts it", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-provider-capability-"));
  const capability = createProviderSyncTestCapability(root);
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "test";
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability, origin: "http://127.0.0.1:1", provider: "idepub", root })), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    await rm(agentDir, { force: true, recursive: true });
  }
});

test("Given an absent, foreign-root, wrong-cwd, production, or non-loopback capability use, when fixture sync is requested, then it is rejected before networking", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-provider-capability-"));
  const otherRoot = await mkdtemp(join(tmpdir(), "coco-provider-capability-root-"));
  const capability = createProviderSyncTestCapability(root);
  const wrongRootCapability = createProviderSyncTestCapability(otherRoot);
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCwd = process.cwd();
  try {
    process.env.NODE_ENV = "test";
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, origin: "http://127.0.0.1:1", provider: "idepub", root })), true);
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability: wrongRootCapability, origin: "http://127.0.0.1:1", provider: "idepub", root })), true);
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability, origin: "http://localhost:1", provider: "idepub", root })), true);
    process.chdir(otherRoot);
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability, origin: "http://127.0.0.1:1", provider: "idepub", root })), true);
    process.chdir(previousCwd);
    process.env.NODE_ENV = "production";
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability, origin: "http://127.0.0.1:1", provider: "idepub", root })), true);
  } finally {
    process.chdir(previousCwd);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    await rm(agentDir, { force: true, recursive: true });
    await rm(otherRoot, { force: true, recursive: true });
  }
});

test("Given the official DeepSeek fixture response, when provider sync normalizes it, then frozen capability metadata produces only the two supported DeepSeek models", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-deepseek-sync-"));
  const capability = createProviderSyncTestCapability(root);
  const previousNodeEnv = process.env.NODE_ENV;
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ authorization: request.headers.authorization, path: request.url });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "deepseek-v4-pro" }, { id: "deepseek-v4-flash" }, { id: "unexpected" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_SERVER_INVALID");
  try {
    process.env.NODE_ENV = "test";
    await writeFile(join(agentDir, "auth.json"), JSON.stringify({ deepseek: { key: "deepseek-fixture-key", type: "api_key" } }));
    await syncProviderModelsForTest({ agentDir, capability, origin: `http://127.0.0.1:${address.port}`, provider: "deepseek", root });
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    assert.deepEqual(models.providers.deepseek.models, [
      { compat: { requiresReasoningContentOnAssistantMessages: true, supportsDeveloperRole: false, supportsStore: false, thinkingFormat: "deepseek" }, contextWindow: 1000000, cost: { cacheRead: 0.0028, cacheWrite: 0, input: 0.14, output: 0.28 }, id: "deepseek-v4-flash", input: ["text"], maxTokens: 384000, name: "DeepSeek V4 Flash", reasoning: true, thinkingLevelMap: { high: "high", low: null, max: "max", medium: null, minimal: null } },
      { compat: { requiresReasoningContentOnAssistantMessages: true, supportsDeveloperRole: false, supportsStore: false, thinkingFormat: "deepseek" }, contextWindow: 1000000, cost: { cacheRead: 0.003625, cacheWrite: 0, input: 0.435, output: 0.87 }, id: "deepseek-v4-pro", input: ["text"], maxTokens: 384000, name: "DeepSeek V4 Pro", reasoning: true, thinkingLevelMap: { high: "high", low: null, max: "max", medium: null, minimal: null } },
    ]);
    assert.deepEqual(models.providers.deepseek.compat, { supportsDeveloperRole: false, supportsReasoningEffort: true });
    assert.equal(models.providers.achai, undefined);
    assert.deepEqual(requests, [{ authorization: "Bearer deepseek-fixture-key", path: "/models" }]);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    await new Promise((resolve) => server.close(resolve));
    await rm(agentDir, { force: true, recursive: true });
  }
});

test("Given concurrent provider syncs, when both commit to one agent directory, then neither provider update is lost", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-concurrent-provider-sync-"));
  const capability = createProviderSyncTestCapability(root);
  const previousNodeEnv = process.env.NODE_ENV;
  const server = createServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "deepseek-v4-flash" }, { id: "gpt-5.6" }] }));
    }, 25);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_SERVER_INVALID");
  try {
    process.env.NODE_ENV = "test";
    await writeFile(join(agentDir, "auth.json"), JSON.stringify({ deepseek: { key: "deepseek-fixture-key", type: "api_key" }, idepub: { key: "idepub-fixture-key", type: "api_key" } }));
    const options = { agentDir, capability, origin: `http://127.0.0.1:${address.port}`, root };
    await Promise.all([
      syncProviderModelsForTest({ ...options, provider: "deepseek" }),
      syncProviderModelsForTest({ ...options, provider: "idepub" }),
    ]);
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    assert.deepEqual(Object.keys(models.providers).sort(), ["deepseek", "idepub"]);
    await Promise.all([
      readFile(join(agentDir, "catalogs", "deepseek", "current.models.json")),
      readFile(join(agentDir, "catalogs", "idepub", "current.models.json")),
    ]);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    await new Promise((resolve) => server.close(resolve));
    await rm(agentDir, { force: true, recursive: true });
  }
});
