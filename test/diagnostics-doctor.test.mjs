import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { setAuthKey } from "../scripts/auth-management.mjs";
import { bootstrapState } from "../scripts/bootstrap-state.mjs";
import { coreCheck, doctor } from "../scripts/diagnostics.mjs";

const cocoRoot = new URL("..", import.meta.url).pathname;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-diagnostics-"));
  const agentDir = join(root, "agent");
  await bootstrapState({ agentDir, root: cocoRoot });
  await mkdir(join(agentDir, "sessions"), { recursive: true, mode: 0o700 });
  return { agentDir, root };
}

test("doctor checks auth for the configured default provider rather than an arbitrary provider", async () => {
  const { agentDir, root } = await fixture();
  const previous = process.env.COCO_CODING_AGENT_DIR;
  try {
    process.env.COCO_CODING_AGENT_DIR = agentDir;
    await setAuthKey({ agentDir, key: "default-provider-only", provider: "agnes" });
    const result = await doctor({ root: cocoRoot });
    const auth = result.checks.find((entry) => entry.id === "AUTH_STATUS");
    assert.deepEqual(auth.details, { present: true, provider: "agnes", rotationRequired: false, source: "auth" });
    assert.equal(auth.status, "pass");
    assert.equal(result.providers.length, 1);
    assert.equal(result.providers[0].provider, "agnes");
    assert.equal(result.providers[0].localStatus, "ready");
    assert.deepEqual(result.providers[0].verification, { scope: null, status: "not-checked" });
  } finally {
    if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous;
    await rm(root, { force: true, recursive: true });
  }
});

test("doctor connectivity probes configured providers only and skips when none are configured", async () => {
  const { agentDir, root } = await fixture();
  const previous = process.env.COCO_CODING_AGENT_DIR;
  try {
    process.env.COCO_CODING_AGENT_DIR = agentDir;
    const noCredentials = await doctor({ connectivity: true, root: cocoRoot, providerProbe: () => { throw new Error("PROBE_NOT_EXPECTED"); } });
    assert.equal(noCredentials.checks.find((entry) => entry.id === "PROVIDER_CONNECTIVITY").status, "skipped");
    await setAuthKey({ agentDir, key: "configured-provider-only", provider: "agnes" });
    const calls = [];
    const configured = await doctor({ connectivity: true, root: cocoRoot, providerProbe: async (url, key) => { calls.push({ key, url: url.href }); return { kind: "ok" }; } });
    assert.deepEqual(calls, [{ key: "configured-provider-only", url: "https://apihub.agnes-ai.com/v1/models" }]);
    assert.equal(configured.checks.find((entry) => entry.id === "PROVIDER_CONNECTIVITY").status, "pass");
    assert.equal(configured.providers[0].localStatus, "ready");
    assert.deepEqual(configured.providers[0].verification, { scope: "models-endpoint", status: "verified" });
  } finally {
    if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous;
    await rm(root, { force: true, recursive: true });
  }
});

test("doctor connectivity projects every configured provider without changing aggregate failure semantics or exposing credentials", async () => {
  const { agentDir, root } = await fixture();
  const previous = process.env.COCO_CODING_AGENT_DIR;
  const providers = ["achai", "agnes", "deepseek", "idepub", "stepfun"];
  const outcomes = { achai: { kind: "ok" }, agnes: { kind: "auth", status: 401 }, deepseek: { kind: "http", status: 429 }, idepub: { kind: "schema" }, stepfun: { failureCode: "TIMEOUT", kind: "error" } };
  const calls = [];
  try {
    process.env.COCO_CODING_AGENT_DIR = agentDir;
    for (const provider of providers) await setAuthKey({ agentDir, key: `${provider}-doctor-secret`, provider });
    const result = await doctor({ connectivity: true, root: cocoRoot, providerProbe: async (url, key) => { const provider = key.split("-")[0]; calls.push({ key, provider, url: url.href }); return outcomes[provider]; } });
    assert.equal(calls.length, 5);
    assert.equal(new Set(calls.map(({ provider }) => provider)).size, 5);
    assert.deepEqual(result.providers.map(({ provider }) => provider), ["agnes", "achai", "deepseek", "idepub", "stepfun"]);
    assert.deepEqual(Object.fromEntries(result.providers.map(({ provider, verification }) => [provider, verification])), {
      achai: { scope: "models-endpoint", status: "verified" }, agnes: { scope: "models-endpoint", status: "rejected" }, deepseek: { scope: "models-endpoint", status: "inconclusive" }, idepub: { scope: "models-endpoint", status: "inconclusive" }, stepfun: { scope: "models-endpoint", status: "inconclusive" },
    });
    assert.equal(result.providers[0].localStatus, "ready");
    assert.deepEqual(result.checks.find((entry) => entry.id === "PROVIDER_CONNECTIVITY"), { details: { failureCode: "AUTH_REJECTED", httpStatus: 401 }, id: "PROVIDER_CONNECTIVITY", message: "Provider rejected credentials.", severity: "fatal", status: "fail" });
    assert.equal(result.status, "fatal"); assert.equal(result.exitCode, 1);
    const serialized = JSON.stringify(result); for (const provider of providers) assert.equal(serialized.includes(`${provider}-doctor-secret`), false);
  } finally {
    if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous;
    await rm(root, { force: true, recursive: true });
  }
});

test("doctor keeps an uncredentialed default projection when a non-default provider is verified", async () => {
  const { agentDir, root } = await fixture(); const previous = process.env.COCO_CODING_AGENT_DIR; const calls = [];
  try {
    process.env.COCO_CODING_AGENT_DIR = agentDir;
    await setAuthKey({ agentDir, key: "deepseek-only", provider: "deepseek" });
    const result = await doctor({ connectivity: true, root: cocoRoot, providerProbe: async (url) => { calls.push(url.href); return { kind: "ok" }; } });
    assert.deepEqual(calls, ["https://api.deepseek.com/models"]);
    assert.deepEqual(result.providers.map(({ provider }) => provider), ["agnes", "deepseek"]);
    assert.equal(result.providers[0].localStatus, "credential-missing");
    assert.deepEqual(result.providers[0].verification, { scope: null, status: "not-checked" });
    assert.equal(result.providers[1].localStatus, "ready");
    assert.deepEqual(result.providers[1].verification, { scope: "models-endpoint", status: "verified" });
  } finally {
    if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous;
    await rm(root, { force: true, recursive: true });
  }
});

test("doctor recognizes and probes a legacy default-provider credential without exposing it", async () => {
  const { agentDir, root } = await fixture(); const previousAgent = process.env.COCO_CODING_AGENT_DIR; const previousKey = process.env.AGNES_API_KEY; const calls = [];
  try {
    process.env.COCO_CODING_AGENT_DIR = agentDir; delete process.env.AGNES_API_KEY;
    await writeFile(join(agentDir, "auth.json"), "{}\n");
    const modelsPath = join(agentDir, "models.json"); const models = JSON.parse(await readFile(modelsPath, "utf8")); models.providers.agnes.apiKey = "agnes-legacy-doctor-secret"; await writeFile(modelsPath, `${JSON.stringify(models)}\n`);
    const result = await doctor({ connectivity: true, root: cocoRoot, providerProbe: async (url, key) => { calls.push({ key, url: url.href }); return { kind: "ok" }; } });
    assert.deepEqual(calls, [{ key: "agnes-legacy-doctor-secret", url: "https://apihub.agnes-ai.com/v1/models" }]);
    assert.deepEqual(result.checks.find(({ id }) => id === "AUTH_STATUS").details, { present: true, provider: "agnes", rotationRequired: false, source: "legacy" });
    assert.deepEqual(result.providers[0].credential, { rotationRequired: false, source: "legacy", status: "available" });
    assert.equal(result.providers[0].localStatus, "ready"); assert.deepEqual(result.providers[0].verification, { scope: "models-endpoint", status: "verified" });
    assert.equal(JSON.stringify(result).includes("agnes-legacy-doctor-secret"), false); assert.equal(JSON.stringify(result).includes("AGNES_API_KEY"), false);
  } finally {
    if (previousAgent === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previousAgent;
    if (previousKey === undefined) delete process.env.AGNES_API_KEY; else process.env.AGNES_API_KEY = previousKey;
    await rm(root, { force: true, recursive: true });
  }
});

test("doctor credential observation does not recover or mutate a pending transaction", async () => {
  const { agentDir, root } = await fixture(); const previous = process.env.COCO_CODING_AGENT_DIR;
  try {
    process.env.COCO_CODING_AGENT_DIR = agentDir; await setAuthKey({ agentDir, key: "doctor-read-only", provider: "agnes" });
    const transactions = join(agentDir, "transactions"); await mkdir(transactions, { recursive: true }); const pending = join(transactions, "pending.json"); await writeFile(pending, "{broken"); const before = await readFile(pending);
    const result = await doctor({ connectivity: true, root: cocoRoot, providerProbe: async () => ({ kind: "ok" }) });
    assert.equal(result.checks.find(({ id }) => id === "AUTH_STATUS").status, "pass"); assert.equal(result.checks.find(({ id }) => id === "PROVIDER_CONNECTIVITY").status, "pass");
    assert.deepEqual(await readFile(pending), before); await assert.rejects(lstat(join(agentDir, ".state.lock")), (error) => error.code === "ENOENT");
  } finally { if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous; await rm(root, { force: true, recursive: true }); }
});

test("core check treats the default offline registry check as skipped", async () => {
  const previous = process.env.PI_OFFLINE;
  try {
    process.env.PI_OFFLINE = "1";
    const result = await coreCheck({ root: cocoRoot });
    const registry = result.checks.find((entry) => entry.id === "CORE_REGISTRY_CHECK");
    assert.equal(registry.status, "skipped");
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "healthy");
  } finally {
    if (previous === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = previous;
  }
});
