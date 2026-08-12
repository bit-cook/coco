import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bootstrapState } from "../scripts/bootstrap-state.mjs";
import { dispatchCoco } from "../scripts/coco-dispatcher.mjs";
import { formatProviderStatus, providerStatus } from "../scripts/provider-status.mjs";

const root = new URL("..", import.meta.url).pathname;

test("provider status observes fresh state in deterministic all-managed order without writing", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provider-status-")); const agentDir = join(sandbox, "agent");
  try {
    const result = await providerStatus({ agentDir });
    assert.deepEqual(result.providers.map(({ provider }) => provider), ["achai", "agnes", "deepseek", "idepub", "stepfun"]);
    assert.deepEqual(result.providers.map(({ localStatus }) => localStatus), Array(5).fill("provider-missing"));
    assert.deepEqual(result.defaultModel, { id: null, provider: null }); assert.equal(result.scope, "all-managed");
    await assert.rejects(lstat(agentDir), (error) => error.code === "ENOENT");
  } finally { await rm(sandbox, { force: true, recursive: true }); }
});

test("provider status reports default exact-model and sanitized credential lifecycle", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provider-state-")); const agentDir = join(sandbox, "agent"); const previous = process.env.ACHAI_API_KEY;
  try {
    await bootstrapState({ agentDir, root }); process.env.ACHAI_API_KEY = "environment-status-secret";
    await writeFile(join(agentDir, "auth.json"), JSON.stringify({ agnes: { key: "auth-status-secret", type: "api_key" } }));
    const modelsPath = join(agentDir, "models.json"); const models = JSON.parse(await readFile(modelsPath, "utf8")); models.providers.deepseek.apiKey = "legacy-status-secret"; await writeFile(modelsPath, `${JSON.stringify(models)}\n`);
    await writeFile(join(agentDir, "migration.json"), JSON.stringify({ rotationRequired: ["deepseek"], schemaVersion: 1 }));
    const result = await providerStatus({ agentDir }); const byId = Object.fromEntries(result.providers.map((entry) => [entry.provider, entry]));
    assert.equal(byId.achai.localStatus, "ready"); assert.equal(byId.achai.credential.source, "environment");
    assert.equal(byId.agnes.localStatus, "ready"); assert.deepEqual(byId.agnes.model, { id: "agnes-2.5-flash", status: "available" });
    assert.equal(byId.deepseek.localStatus, "rotation-required"); assert.equal(byId.deepseek.credential.source, "legacy");
    assert.ok(result.providers.every(({ verification }) => verification.scope === null && verification.status === "not-checked"));
    const text = formatProviderStatus(result); const serialized = JSON.stringify(result); for (const secret of ["environment-status-secret", "auth-status-secret", "legacy-status-secret", "ACHAI_API_KEY"]) { assert.equal(text.includes(secret), false); assert.equal(serialized.includes(secret), false); }
  } finally { if (previous === undefined) delete process.env.ACHAI_API_KEY; else process.env.ACHAI_API_KEY = previous; await rm(sandbox, { force: true, recursive: true }); }
});

test("provider status selects one provider and leaves pending transactions untouched", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provider-selected-")); const agentDir = join(sandbox, "agent");
  try {
    await bootstrapState({ agentDir, root }); const transactions = join(agentDir, "transactions"); await mkdir(transactions, { recursive: true }); const pending = join(transactions, "pending.json"); await writeFile(pending, "{broken");
    const before = await readFile(pending); const result = await providerStatus({ agentDir, provider: "agnes" });
    assert.equal(result.scope, "provider"); assert.deepEqual(result.providers.map(({ provider }) => provider), ["agnes"]); assert.deepEqual(await readFile(pending), before); await assert.rejects(lstat(join(agentDir, ".state.lock")), (error) => error.code === "ENOENT");
    await assert.rejects(() => providerStatus({ agentDir, provider: "unknown" }), (error) => error.code === "PROVIDER_INVALID");
  } finally { await rm(sandbox, { force: true, recursive: true }); }
});

test("provider status fails closed on malformed configured models", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provider-invalid-")); const agentDir = join(sandbox, "agent");
  try {
    await mkdir(agentDir, { recursive: true, mode: 0o700 }); await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { agnes: { models: "invalid" } } }));
    await assert.rejects(() => providerStatus({ agentDir }), (error) => error.code === "MODELS_SCHEMA_INVALID");
    await assert.rejects(lstat(join(agentDir, ".state.lock")), (error) => error.code === "ENOENT");
  } finally { await rm(sandbox, { force: true, recursive: true }); }
});

test("native provider status emits JSON and rejects malformed grammar", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-provider-dispatch-")); const previous = process.env.COCO_CODING_AGENT_DIR; const write = process.stdout.write; let stdout = "";
  try {
    process.env.COCO_CODING_AGENT_DIR = join(sandbox, "agent"); process.stdout.write = (chunk) => { stdout += chunk; return true; };
    assert.deepEqual(await dispatchCoco({ argv: ["manage", "providers", "status", "agnes", "--json"], root }), { exitCode: 0, kind: "native" });
    assert.equal(JSON.parse(stdout).providers[0].provider, "agnes");
    assert.equal((await dispatchCoco({ argv: ["manage", "providers", "status", "agnes", "deepseek"], root })).exitCode, 2);
  } finally { process.stdout.write = write; if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous; await rm(sandbox, { force: true, recursive: true }); }
});

test("provider status runtime has no network, recovery, bootstrap, or transaction dependency", async () => {
  const source = await readFile(join(root, "scripts", "provider-status.mjs"), "utf8");
  for (const forbidden of ["node:http", "node:https", "provider-sync.mjs", "diagnostics.mjs", "bootstrap-state.mjs", "state-transaction.mjs", "recoverTransactions"]) assert.equal(source.includes(forbidden), false);
});
