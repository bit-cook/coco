import { createRuntimeGenerationRegistry } from "./runtime-generation-registry.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function createRuntimeGenerationComposition({
  disposeMcp = async () => {},
  disposeProvider = async () => {},
  initial,
  initialGeneration,
  initialRevision,
  maxGenerations,
  prepareMcp,
  prepareProvider,
}) {
  if (typeof prepareMcp !== "function" || typeof prepareProvider !== "function" || typeof disposeMcp !== "function" || typeof disposeProvider !== "function") fail("RUNTIME_COMPOSITION_INVALID");
  const prepare = async (source) => {
    if (!source || typeof source !== "object" || Array.isArray(source) || Object.keys(source).sort().join(",") !== "mcp,provider") fail("RUNTIME_COMPOSITION_SOURCE_INVALID");
    const [provider, mcp] = await Promise.allSettled([prepareProvider(source.provider), prepareMcp(source.mcp)]);
    if (provider.status === "rejected" || mcp.status === "rejected") {
      await Promise.allSettled([
        provider.status === "fulfilled" ? disposeProvider(provider.value) : undefined,
        mcp.status === "fulfilled" ? disposeMcp(mcp.value) : undefined,
      ]);
      throw provider.status === "rejected" ? provider.reason : mcp.reason;
    }
    return { mcp: mcp.value, provider: provider.value };
  };
  const dispose = async ({ mcp, provider }) => { await Promise.allSettled([disposeProvider(provider), disposeMcp(mcp)]); };
  return createRuntimeGenerationRegistry({ dispose, initial, initialGeneration, initialRevision, maxGenerations, prepare });
}
