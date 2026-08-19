import { createRuntimeGenerationComposition } from "./runtime-generation-composition.mjs";
import { createRuntimeGenerationConsumer } from "./runtime-generation-consumer.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function createRuntimeGenerationService(options = {}) {
  if (typeof options.executeProvider !== "function" || typeof options.executeMcp !== "function") fail("RUNTIME_GENERATION_SERVICE_INVALID");
  const registry = createRuntimeGenerationComposition(options);
  const consumer = createRuntimeGenerationConsumer({ registry, executeMcp: options.executeMcp, executeProvider: options.executeProvider });
  return Object.freeze({
    close: () => registry.close(),
    initialize: () => registry.initialize(),
    mcp: (request) => consumer.mcp(request),
    provider: (request) => consumer.provider(request),
    reload: (source, expectedRevision) => registry.publish(source, { expectedRevision }),
    rollback: (generationId, expectedRevision) => registry.rollback(generationId, { expectedRevision }),
    status: () => registry.snapshot(),
  });
}

export async function openRuntimeGenerationService({ state, ...options }) {
  if (!state || typeof state.load !== "function" || typeof state.write !== "function") fail("RUNTIME_GENERATION_STATE_INVALID");
  const resume = await state.load();
  const service = createRuntimeGenerationService({ ...options, initialGeneration: resume.generationCounter, initialRevision: resume.revision });
  let failed = false;
  const ensure = () => { if (failed) fail("RUNTIME_GENERATION_STATE_WRITE_FAILED"); };
  const persist = async (operation) => {
    ensure(); const snapshot = await operation();
    try { await state.write(snapshot); }
    catch {
      try { const durable = await state.load(); if (durable.generationId === snapshot.generationId && durable.revision === snapshot.revision && durable.generationCounter === snapshot.generationCounter) return snapshot; } catch {}
      failed = true; await service.close().catch(() => {}); fail("RUNTIME_GENERATION_STATE_WRITE_FAILED");
    }
    return snapshot;
  };
  await persist(service.initialize);
  return Object.freeze({
    close: service.close,
    mcp: (request) => { ensure(); return service.mcp(request); },
    provider: (request) => { ensure(); return service.provider(request); },
    reload: (source, expectedRevision) => persist(() => service.reload(source, expectedRevision)),
    rollback: (generationId, expectedRevision) => persist(() => service.rollback(generationId, expectedRevision)),
    status: () => { ensure(); return service.status(); },
  });
}
