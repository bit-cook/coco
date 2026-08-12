import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
    assert.equal(agnes.catalog.status, "seeded"); assert.equal(agnes.credential.rotationRequired, false); assert.equal(agnes.localStatus, "credential-missing");
    await assert.rejects(readFile(join(agentDir, "models.json")), (error) => error.code === "ENOENT");
  } finally { await rm(sandbox, { force: true, recursive: true }); }
});

test("bootstrap readiness observes auth, environment, legacy, and rotation without exposing values", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "coco-bootstrap-credentials-")); const agentDir = join(sandbox, "agent");
  const previous = process.env.ACHAI_API_KEY;
  try {
    await mkdir(agentDir, { recursive: true, mode: 0o700 });
    process.env.ACHAI_API_KEY = "environment-secret";
    await writeFile(join(agentDir, "auth.json"), JSON.stringify({ agnes: { key: "auth-secret", type: "api_key" } }));
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { deepseek: { apiKey: "legacy-secret" } } }));
    await writeFile(join(agentDir, "migration.json"), JSON.stringify({ rotationRequired: ["agnes"], schemaVersion: 1 }));
    const result = await bootstrapState({ agentDir, dryRun: true, root });
    const projected = Object.fromEntries(result.providerReadiness.projected.map((entry) => [entry.provider, entry]));
    assert.deepEqual(projected.achai.credential, { rotationRequired: false, source: "environment", status: "available" });
    assert.equal(projected.achai.localStatus, "ready");
    assert.deepEqual(projected.agnes.credential, { rotationRequired: true, source: "auth", status: "available" });
    assert.equal(projected.agnes.localStatus, "rotation-required");
    assert.deepEqual(projected.deepseek.credential, { rotationRequired: false, source: "legacy", status: "available" });
    assert.equal(projected.deepseek.localStatus, "ready");
    const serialized = JSON.stringify(result); for (const secret of ["environment-secret", "auth-secret", "legacy-secret", "ACHAI_API_KEY"]) assert.equal(serialized.includes(secret), false);
  } finally {
    if (previous === undefined) delete process.env.ACHAI_API_KEY; else process.env.ACHAI_API_KEY = previous;
    await rm(sandbox, { force: true, recursive: true });
  }
});

test("invalid or symlinked credential state rejects before bootstrap mutation", async () => {
  for (const fixture of ["invalid-auth", "invalid-migration", "symlink-auth"]) {
    const sandbox = await mkdtemp(join(tmpdir(), `coco-bootstrap-${fixture}-`)); const agentDir = join(sandbox, "agent");
    try {
      await mkdir(agentDir, { recursive: true, mode: 0o700 });
      if (fixture === "invalid-auth") await writeFile(join(agentDir, "auth.json"), "{broken");
      if (fixture === "invalid-migration") await writeFile(join(agentDir, "migration.json"), JSON.stringify({ rotationRequired: ["unknown"], schemaVersion: 1 }));
      if (fixture === "symlink-auth") { await writeFile(join(sandbox, "outside.json"), "{}"); await symlink(join(sandbox, "outside.json"), join(agentDir, "auth.json")); }
      const expected = fixture === "invalid-auth" ? "AUTH_SCHEMA_INVALID" : fixture === "invalid-migration" ? "MIGRATION_SCHEMA_INVALID" : "STATE_ENTRY_INVALID";
      await assert.rejects(() => bootstrapState({ agentDir, root }), (error) => error.code === expected);
      for (const name of ["settings.json", "ownership.json", "APPEND_SYSTEM.md"]) await assert.rejects(readFile(join(agentDir, name)), (error) => error.code === "ENOENT");
    } finally { await rm(sandbox, { force: true, recursive: true }); }
  }
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
