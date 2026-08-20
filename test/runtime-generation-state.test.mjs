import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createExecutionProviderRegistry } from "../scripts/execution-provider.mjs";
import { openRuntimeGenerationService } from "../scripts/runtime-generation-service.mjs";
import { createRuntimeGenerationState } from "../scripts/runtime-generation-state.mjs";
import { statePaths } from "../scripts/state-paths.mjs";

const capabilities = { isolated: true, networkControl: true, secretsControl: true, workspaceRead: true, workspaceWrite: true };
const source = { mcp: { name: "mcp" }, provider: { descriptors: [{ capabilities, id: "local" }] } };
const options = { initial: source, prepareProvider: async ({ descriptors }) => createExecutionProviderRegistry(descriptors), prepareMcp: async ({ name }) => ({ name }), executeProvider: async () => null, executeMcp: async () => null };

test("persistent service advances generation and revision across restart without storing resources", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-runtime-generation-state-")); t.after(() => rm(agentDir, { recursive: true, force: true }));
  const state = createRuntimeGenerationState({ agentDir }); const first = await openRuntimeGenerationService({ ...options, state });
  assert.deepEqual(first.status(), { generationCounter: 1, generationId: "generation-1", retained: ["generation-1"], revision: 1, schemaVersion: 1 }); await first.close();
  const second = await openRuntimeGenerationService({ ...options, state }); assert.equal(second.status().generationId, "generation-2"); assert.equal(second.status().revision, 2);
  assert.equal(JSON.stringify(await state.load()).includes("local"), false); await second.close();
});

test("generation state rejects malformed or noncanonical bytes", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-runtime-generation-corrupt-")); t.after(() => rm(agentDir, { recursive: true, force: true }));
  await writeFile(statePaths(agentDir).runtimeGenerations, '{"schemaVersion":1}\n', { mode: 0o600 });
  await assert.rejects(createRuntimeGenerationState({ agentDir }).load(), { code: "RUNTIME_GENERATION_STATE_INVALID" });
});

test("persistent service accepts response loss but fails closed on a stale state write", async () => {
  let durable = { generationCounter: 0, generationId: null, revision: 0, schemaVersion: 1 }, responseLoss = true;
  const state = { async load() { return structuredClone(durable); }, async write(value) { if (responseLoss) { durable = structuredClone(value); responseLoss = false; throw new Error("response lost"); } throw new Error("disk failed"); } };
  const service = await openRuntimeGenerationService({ ...options, state }); assert.equal(service.status().revision, 1);
  await assert.rejects(service.reload(source, 1), { code: "RUNTIME_GENERATION_STATE_WRITE_FAILED" });
  assert.throws(() => service.status(), { code: "RUNTIME_GENERATION_STATE_WRITE_FAILED" });
});
