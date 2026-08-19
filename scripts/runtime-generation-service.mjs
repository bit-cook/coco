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
