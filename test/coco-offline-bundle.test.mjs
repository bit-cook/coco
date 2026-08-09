import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { configureIntranetModel } from "../scripts/configure-intranet-model.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-offline-model-"));
  await writeFile(join(root, "models.json"), '{"providers":{"existing":{"api":"openai-completions"}}}\n', { mode: 0o600 });
  await writeFile(join(root, "settings.json"), '{}\n', { mode: 0o600 });
  await writeFile(join(root, "auth.json"), '{}\n', { mode: 0o600 });
  return root;
}

test("intranet model configuration preserves existing providers and defaults to an environment credential", async () => {
  const agentDir = await fixture();
  try {
    const result = configureIntranetModel({ agentDir, environment: {
      COCO_INTRANET_BASE_URL: "http://10.0.0.8:8000/v1/",
      COCO_INTRANET_CONTEXT_WINDOW: "65536",
      COCO_INTRANET_MAX_TOKENS: "8192",
      COCO_INTRANET_MODEL_ID: "corp-model",
      COCO_INTRANET_MODEL_NAME: "Corp Model",
      COCO_INTRANET_PROVIDER: "corp-ai",
    } });
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    const settings = JSON.parse(await readFile(join(agentDir, "settings.json"), "utf8"));
    assert.equal(models.providers.existing.api, "openai-completions");
    assert.equal(models.providers["corp-ai"].baseUrl, "http://10.0.0.8:8000/v1");
    assert.equal(models.providers["corp-ai"].apiKey, "$INTRANET_AI_API_KEY");
    assert.equal(models.providers["corp-ai"].models[0].contextWindow, 65536);
    assert.equal(models.providers["corp-ai"].models[0].maxTokens, 8192);
    assert.equal(settings.defaultProvider, "corp-ai");
    assert.equal(settings.defaultModel, "corp-model");
    assert.equal(result.auth, "environment:INTRANET_AI_API_KEY");
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("intranet model configuration stores an explicit stdin key without exposing it in models", async () => {
  const agentDir = await fixture();
  try {
    configureIntranetModel({ agentDir, environment: {
      COCO_INTRANET_BASE_URL: "https://llm.intranet/v1",
      COCO_INTRANET_MODEL_ID: "private-model",
    }, key: "fixture-secret" });
    const models = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8"));
    const auth = JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8"));
    assert.equal("apiKey" in models.providers.intranet, false);
    assert.deepEqual(auth.intranet, { key: "fixture-secret", type: "api_key" });
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("intranet model configuration rejects conflicts and invalid routing without mutating state", async () => {
  const agentDir = await fixture();
  try {
    const before = await readFile(join(agentDir, "models.json"), "utf8");
    assert.throws(() => configureIntranetModel({ agentDir, environment: {
      COCO_INTRANET_BASE_URL: "file:///tmp/model",
      COCO_INTRANET_MODEL_ID: "model",
    } }), { message: "INTRANET_BASE_URL_INVALID" });
    assert.equal(await readFile(join(agentDir, "models.json"), "utf8"), before);
    assert.throws(() => configureIntranetModel({ agentDir, environment: {
      COCO_INTRANET_BASE_URL: "http://localhost:8000/v1",
      COCO_INTRANET_MODEL_ID: "model",
      COCO_INTRANET_PROVIDER: "existing",
    } }), { message: "INTRANET_PROVIDER_CONFLICT" });
    assert.equal(await readFile(join(agentDir, "models.json"), "utf8"), before);
  } finally { await rm(agentDir, { force: true, recursive: true }); }
});

test("offline installer source has no downloader and forces offline startup", async () => {
  const source = await readFile(new URL("../offline-install.sh", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bcurl\b|\bwget\b|https?:\/\//);
  assert.match(source, /export PI_OFFLINE=1/);
  assert.match(source, /export COCO_CODING_AGENT_DIR/);
  assert.match(source, /SHA256SUMS/);
  assert.match(source, /node-runtime\.tar\.gz/);
  assert.match(source, /configure-intranet-model\.mjs/);
});
