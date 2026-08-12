import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getAuthStatus, removeAuthKey, setAuthKey } from "../scripts/auth-management.mjs";
import { bootstrapState } from "../scripts/bootstrap-state.mjs";
import { dispatchCoco } from "../scripts/coco-dispatcher.mjs";
import { migrateState } from "../scripts/migrate-state.mjs";
import { resolveCredential } from "../scripts/state-schema.mjs";

const providers = [
  ["idepub", "IDEPUB_API_KEY"],
  ["achai", "ACHAI_API_KEY"],
  ["deepseek", "DEEPSEEK_API_KEY"],
  ["agnes", "AGNES_API_KEY"],
  ["stepfun", "STEPFUN_API_KEY"],
];

const publicEndpoints = {
  achai: { baseUrl: "https://www.achai.cc/v1", chatPath: "/v1/chat/completions", modelsPath: "/v1/models", origin: "https://www.achai.cc" },
  agnes: { baseUrl: "https://apihub.agnes-ai.com/v1", chatPath: "/v1/chat/completions", modelsPath: "/v1/models", origin: "https://apihub.agnes-ai.com" },
  deepseek: { baseUrl: "https://api.deepseek.com", chatPath: "/chat/completions", modelsPath: "/models", origin: "https://api.deepseek.com" },
  idepub: { baseUrl: "https://api.ide.pub/v1", chatPath: "/v1/chat/completions", modelsPath: "/v1/models", origin: "https://api.ide.pub" },
  stepfun: { baseUrl: "https://api.stepfun.com/step_plan/v1", chatPath: "/step_plan/v1/chat/completions", modelsPath: "/step_plan/v1/models", origin: "https://api.stepfun.com" },
};

test("Given each canonical provider, when auth is set, inspected, resolved, and removed, then every management path uses its mapped environment variable", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-four-provider-auth-"));
  const agentDir = join(root, "agent");
  try {
    await mkdir(agentDir, { recursive: true, mode: 0o700 });
    for (const [provider, environmentName] of providers) {
      const environment = { [environmentName]: `${provider}-environment` };
      const [initial] = await getAuthStatus({ agentDir, environment, provider });
      assert.equal(initial.available, true);
      assert.equal(initial.provider, provider);
      assert.equal(initial.rotationRequired, false);
      assert.equal(initial.source, "environment");
      assert.equal(initial.readiness.localStatus, "unknown");
      assert.deepEqual(initial.readiness.verification, { scope: null, status: "not-checked" });
      await setAuthKey({ agentDir, key: `${provider}-stored`, provider });
      const [stored] = await getAuthStatus({ agentDir, environment, provider });
      assert.equal(stored.source, "auth");
      assert.equal(stored.readiness.credential.status, "available");
      assert.equal(resolveCredential({ auth: { [provider]: { key: `${provider}-stored`, type: "api_key" } }, environment, provider }).source, "auth");
      const removed = await removeAuthKey({ agentDir, environment, provider });
      assert.equal(removed.source, "environment");
      assert.equal(removed.readiness.localStatus, "unknown");
      const dispatched = await dispatchCoco({ argv: ["manage", "auth", "status", provider, "--json"], root });
      assert.equal(dispatched.exitCode, 0);
    }
    assert.deepEqual((await getAuthStatus({ agentDir })).map((entry) => entry.provider).sort(), providers.map(([provider]) => provider).sort());
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given a fresh agent directory, when CoCo bootstraps public provider state, then all canonical providers are available without credential fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-four-provider-bootstrap-"));
  const agentDir = join(root, "agent");
  const cocoRoot = new URL("..", import.meta.url).pathname;
  try {
    await bootstrapState({ agentDir, root: cocoRoot });
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    assert.deepEqual(Object.keys(models.providers).sort(), providers.map(([provider]) => provider).sort());
    assert.equal(JSON.stringify(models).includes("apiKey"), false);
    assert.deepEqual(Object.fromEntries(Object.entries(models.providers).map(([provider, model]) => [provider, model.baseUrl])), Object.fromEntries(Object.entries(publicEndpoints).map(([provider, endpoint]) => [provider, endpoint.baseUrl])));
    const ownership = JSON.parse(await readFile(join(agentDir, "ownership.json"), "utf8"));
    const providerOrder = ownership.managedFiles["models.json"].ownedJsonPointers.filter((pointer) => pointer.endsWith("/baseUrl")).map((pointer) => pointer.split("/")[2]);
    assert.deepEqual(providerOrder, ["idepub", "achai", "agnes", "deepseek", "stepfun"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given the frozen public registry, when its five providers are inspected, then their exact endpoint metadata is credential-free", async () => {
  const cocoRoot = new URL("..", import.meta.url).pathname;
  const registry = JSON.parse(await readFile(join(cocoRoot, "resources", "provider-registry.v1.json"), "utf8"));

  assert.deepEqual(Object.keys(registry.providers).sort(), Object.keys(publicEndpoints).sort());
  assert.deepEqual(Object.fromEntries(Object.entries(registry.providers).map(([provider, entry]) => [provider, { baseUrl: entry.baseUrl, chatPath: entry.chatPath, modelsPath: entry.modelsPath, origin: entry.origin }])), publicEndpoints);
  assert.equal(JSON.stringify(registry).includes("apiKey"), false);
  assert.equal(JSON.stringify(registry).includes("credential"), false);
});

test("Given official DeepSeek bootstrap state, when its provider is inspected, then it preserves Pi's DeepSeek thinking compatibility", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-deepseek-bootstrap-"));
  const agentDir = join(root, "agent");
  const cocoRoot = new URL("..", import.meta.url).pathname;
  try {
    await bootstrapState({ agentDir, root: cocoRoot });
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    const seeds = JSON.parse(await readFile(join(cocoRoot, "resources", "provider-model-seeds.v1.json"), "utf8"));
    assert.deepEqual(models.providers.deepseek, {
      api: "openai-completions",
      authHeader: true,
      baseUrl: "https://api.deepseek.com",
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: true },
      models: seeds.providers.deepseek.map((model) => ({ contextWindow: 128000, cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 }, input: ["text"], maxTokens: 16384, reasoning: false, ...model })),
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given legacy official DeepSeek credentials, when state migrates, then the credential is isolated in auth without changing the provider identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-deepseek-migration-"));
  const agentDir = join(root, "agent");
  try {
    await mkdir(agentDir, { recursive: true, mode: 0o700 });
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { deepseek: { apiKey: "deepseek-legacy" } } }));
    const result = await migrateState({ agentDir });
    assert.deepEqual(result.rotationRequired, ["deepseek"]);
    assert.deepEqual(JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8")), { deepseek: { key: "deepseek-legacy", type: "api_key" } });
    assert.deepEqual(JSON.parse(await readFile(join(agentDir, "models.json"), "utf8")), { providers: { deepseek: {} } });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given all legacy managed credentials, when state migrates, then persisted compatibility order remains stable", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-provider-order-"));
  const agentDir = join(root, "agent");
  const legacyOrder = ["idepub", "achai", "agnes", "deepseek", "stepfun"];
  try {
    await mkdir(agentDir, { recursive: true, mode: 0o700 });
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: Object.fromEntries(legacyOrder.map((provider) => [provider, { apiKey: `${provider}-legacy` }])) }));
    const result = await migrateState({ agentDir });
    assert.deepEqual(result.rotationRequired, [...legacyOrder].sort());
    const [backupName] = await readdir(join(agentDir, "backups"));
    const backup = JSON.parse(await readFile(join(agentDir, "backups", backupName), "utf8"));
    assert.deepEqual(backup.migratedProviders, legacyOrder);
    const ownership = JSON.parse(await readFile(join(agentDir, "ownership.json"), "utf8"));
    const providerOrder = ownership.managedFiles["models.json"].ownedJsonPointers.filter((pointer) => pointer.endsWith("/baseUrl")).map((pointer) => pointer.split("/")[2]);
    assert.deepEqual(providerOrder, legacyOrder);
  } finally { await rm(root, { force: true, recursive: true }); }
});
