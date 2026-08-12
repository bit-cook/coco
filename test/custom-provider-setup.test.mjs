import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { fetchCustomProviderModels, normalizeCustomBaseUrl, saveCustomProvider } from "../scripts/custom-provider-setup.mjs";

test("custom provider setup fetches, sorts, and deduplicates OpenAI-compatible models", async () => {
  let request;
  const models = await fetchCustomProviderModels({ baseUrl: "https://example.test/v1/", key: "secret", fetchImpl: async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ data: [{ id: "zeta" }, { id: "alpha" }, { id: "alpha" }] }) };
  } });
  assert.deepEqual(models, ["alpha", "zeta"]);
  assert.equal(request.url, "https://example.test/v1/models");
  assert.equal(request.init.headers.Authorization, "Bearer secret");
});

test("custom provider setup stores selected model separately from its private key", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-custom-provider-"));
  const result = await saveCustomProvider({ agentDir, baseUrl: "https://api.example.test/v1/", key: "secret", modelId: "alpha" });
  const modelsText = await readFile(join(agentDir, "models.json"), "utf8");
  const auth = JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8"));
  const settings = JSON.parse(await readFile(join(agentDir, "settings.json"), "utf8"));
  assert.equal(modelsText.includes("secret"), false);
  assert.equal(auth[result.providerId].key, "secret");
  assert.equal(settings.defaultProvider, result.providerId);
  assert.equal(settings.defaultModel, "alpha");
  assert.equal((await stat(join(agentDir, "auth.json"))).mode & 0o077, 0);
});

test("custom provider setup rejects unsafe or malformed endpoints", () => {
  for (const value of ["", "ftp://example.test/v1", "https://user:pass@example.test/v1", "https://example.test/v1?key=secret"]) {
    assert.throws(() => normalizeCustomBaseUrl(value), /CUSTOM_BASE_URL_INVALID/);
  }
});
