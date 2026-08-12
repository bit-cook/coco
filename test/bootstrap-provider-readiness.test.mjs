import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bootstrapState } from "../scripts/bootstrap-state.mjs";

const root = new URL("..", import.meta.url).pathname;

test("fresh bootstrap dry run reports current and projected all-managed readiness without writing", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-bootstrap-readiness-")); const agentDir = join(sandbox, "agent");
  try {
    const result = await bootstrapState({ agentDir, dryRun: true, root });
    assert.equal(result.status, "planned"); assert.equal(result.providerReadiness.scope, "all-managed");
    assert.deepEqual(result.providerReadiness.current.map(({ localStatus }) => localStatus), Array(5).fill("provider-missing"));
    assert.deepEqual(result.providerReadiness.projected.map(({ provider }) => provider), ["achai", "agnes", "deepseek", "idepub", "stepfun"]);
    const agnes = result.providerReadiness.projected.find(({ provider }) => provider === "agnes");
    assert.equal(agnes.configuration.status, "configured"); assert.deepEqual(agnes.model, { id: "agnes-2.5-flash", status: "available" });
    assert.equal(agnes.catalog.status, "seeded"); assert.equal(agnes.credential.rotationRequired, null); assert.equal(agnes.localStatus, "unknown");
    await assert.rejects(readFile(join(agentDir, "models.json")), (error) => error.code === "ENOENT");
  } finally { await rm(sandbox, { force: true, recursive: true }); }
});

test("applied bootstrap projection equals the subsequent converged current snapshot", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-bootstrap-applied-")); const agentDir = join(sandbox, "agent");
  try {
    const applied = await bootstrapState({ agentDir, root }); assert.equal(applied.status, "applied");
    const converged = await bootstrapState({ agentDir, dryRun: true, root }); assert.equal(converged.status, "noop");
    assert.deepEqual(converged.providerReadiness.current, converged.providerReadiness.projected);
    assert.deepEqual(converged.providerReadiness.current.map(({ provider, configuration, model }) => ({ provider, configuration, model })), applied.providerReadiness.projected.map(({ provider, configuration, model }) => ({ provider, configuration, model })));
  } finally { await rm(sandbox, { force: true, recursive: true }); }
});

test("conflict-only bootstrap is noop and projects preserved provider state", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-bootstrap-conflict-")); const agentDir = join(sandbox, "agent");
  try {
    await bootstrapState({ agentDir, root });
    const modelsPath = join(agentDir, "models.json"); const models = JSON.parse(await readFile(modelsPath, "utf8")); models.providers.agnes.baseUrl = "https://example.invalid"; await writeFile(modelsPath, `${JSON.stringify(models)}\n`);
    const result = await bootstrapState({ agentDir, root });
    assert.equal(result.status, "noop"); assert.deepEqual(result.created, []); assert.ok(result.skipped.includes("/providers/agnes")); assert.ok(result.warnings.includes("PROVIDER_CONFLICT:/providers/agnes"));
    assert.deepEqual(result.providerReadiness.current, result.providerReadiness.projected);
    assert.equal(JSON.parse(await readFile(modelsPath, "utf8")).providers.agnes.baseUrl, "https://example.invalid");
  } finally { await rm(sandbox, { force: true, recursive: true }); }
});
