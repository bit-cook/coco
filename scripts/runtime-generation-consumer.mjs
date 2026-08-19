import { bindGenerationRequest } from "./runtime-generation-registry.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function createRuntimeGenerationConsumer({ executeMcp, executeProvider, registry }) {
  if (!registry || typeof registry.acquire !== "function" || typeof executeMcp !== "function" || typeof executeProvider !== "function") fail("RUNTIME_GENERATION_CONSUMER_INVALID");

  async function consume(kind, input, execute) {
    const lease = registry.acquire();
    try {
      const binding = kind === "provider" ? bindGenerationRequest(lease, input.providerId, input.request) : null;
      const result = await execute({ binding, generationId: lease.generationId, request: input, resource: lease[kind], revision: lease.revision });
      return Object.freeze({ generationId: lease.generationId, result, revision: lease.revision, schemaVersion: 1 });
    } finally { await lease.release(); }
  }

  return Object.freeze({
    mcp(input) { return consume("mcp", input, executeMcp); },
    provider(input) { return consume("provider", input, executeProvider); },
  });
}
