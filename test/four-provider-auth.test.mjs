import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getAuthStatus, removeAuthKey, setAuthKey } from "../scripts/auth-management.mjs";
import { bootstrapState } from "../scripts/bootstrap-state.mjs";
import { dispatchCoco } from "../scripts/coco-dispatcher.mjs";
import { resolveCredential } from "../scripts/state-schema.mjs";

const providers = [
  ["idepub", "IDEPUB_API_KEY"],
  ["achai", "ACHAI_API_KEY"],
  ["agnes", "AGNES_API_KEY"],
  ["stepfun", "STEPFUN_API_KEY"],
];

const publicEndpoints = {
  achai: { baseUrl: "https://www.achai.cc/v1", chatPath: "/v1/chat/completions", modelsPath: "/v1/models", origin: "https://www.achai.cc" },
  agnes: { baseUrl: "https://apihub.agnes-ai.com/v1", chatPath: "/v1/chat/completions", modelsPath: "/v1/models", origin: "https://apihub.agnes-ai.com" },
  idepub: { baseUrl: "https://ai.ide.pub/v1", chatPath: "/v1/chat/completions", modelsPath: "/v1/models", origin: "https://ai.ide.pub" },
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
      assert.deepEqual(initial, { available: true, provider, rotationRequired: false, source: "environment" });
      await setAuthKey({ agentDir, key: `${provider}-stored`, provider });
      const [stored] = await getAuthStatus({ agentDir, environment, provider });
      assert.equal(stored.source, "auth");
      assert.equal(resolveCredential({ auth: { [provider]: { key: `${provider}-stored`, type: "api_key" } }, environment, provider }).source, "auth");
      const removed = await removeAuthKey({ agentDir, environment, provider });
      assert.equal(removed.source, "environment");
      const dispatched = await dispatchCoco({ argv: ["manage", "auth", "status", provider, "--json"], root });
      assert.equal(dispatched.exitCode, 0);
    }
    assert.deepEqual((await getAuthStatus({ agentDir })).map((entry) => entry.provider).sort(), providers.map(([provider]) => provider).sort());
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given a fresh agent directory, when Coco bootstraps public provider state, then all canonical providers are available without credential fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "coco-four-provider-bootstrap-"));
  const agentDir = join(root, "agent");
  const cocoRoot = new URL("..", import.meta.url).pathname;
  try {
    await bootstrapState({ agentDir, root: cocoRoot });
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    assert.deepEqual(Object.keys(models.providers).sort(), providers.map(([provider]) => provider).sort());
    assert.equal(JSON.stringify(models).includes("apiKey"), false);
    assert.deepEqual(Object.fromEntries(Object.entries(models.providers).map(([provider, model]) => [provider, model.baseUrl])), Object.fromEntries(Object.entries(publicEndpoints).map(([provider, endpoint]) => [provider, endpoint.baseUrl])));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given the frozen public registry, when its four providers are inspected, then their exact endpoint metadata is credential-free", async () => {
  const cocoRoot = new URL("..", import.meta.url).pathname;
  const registry = JSON.parse(await readFile(join(cocoRoot, "resources", "provider-registry.v1.json"), "utf8"));

  assert.deepEqual(Object.keys(registry.providers).sort(), Object.keys(publicEndpoints).sort());
  assert.deepEqual(Object.fromEntries(Object.entries(registry.providers).map(([provider, entry]) => [provider, { baseUrl: entry.baseUrl, chatPath: entry.chatPath, modelsPath: entry.modelsPath, origin: entry.origin }])), publicEndpoints);
  assert.equal(JSON.stringify(registry).includes("apiKey"), false);
  assert.equal(JSON.stringify(registry).includes("credential"), false);
});
