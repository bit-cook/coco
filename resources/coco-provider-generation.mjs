import { createHash } from "node:crypto";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { createRuntimeGenerationService } from "../scripts/runtime-generation-service.mjs";

function modelSource(model, headers) {
  const headerShape = Object.fromEntries(Object.entries(headers).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => [name.toLowerCase(), createHash("sha256").update(String(value ?? "")).digest("hex")]));
  return { mcp: {}, provider: { api: model?.api ?? null, baseUrl: model?.baseUrl ?? null, headerShape, id: model?.id ?? null, provider: model?.provider ?? null } };
}

export default function cocoProviderGeneration(pi) {
  let service, fingerprint = null;
  const leases = new Map();
  pi.on("session_start", async (_event, ctx) => {
    const initial = modelSource(ctx.model, {});
    service = createRuntimeGenerationService({ initial, prepareProvider: async (value) => value, prepareMcp: async (value) => value, executeProvider: async () => null, executeMcp: async () => null });
    await service.initialize(); fingerprint = canonicalJson(initial);
  });
  pi.on("before_provider_headers", async (event, ctx) => {
    try {
      if (!service || leases.has(event.requestId)) throw new Error("PROVIDER_GENERATION_STATE_INVALID");
      const source = modelSource(ctx.model, event.headers), next = canonicalJson(source);
      if (next !== fingerprint) { await service.reload(source, service.status().revision); fingerprint = next; }
      leases.set(event.requestId, service.lease());
    } catch (error) { ctx.abort(); throw error; }
  });
  pi.on("after_provider_response", (event, ctx) => { if (!leases.has(event.requestId)) { ctx.abort(); throw new Error("PROVIDER_GENERATION_LEASE_MISSING"); } });
  pi.on("provider_request_end", async (event) => { const lease = leases.get(event.requestId); leases.delete(event.requestId); await lease?.release(); });
  pi.on("session_shutdown", async () => { await Promise.allSettled([...leases.values()].map(({ release }) => release())); leases.clear(); await service?.close(); service = undefined; });
}
