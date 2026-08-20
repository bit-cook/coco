import { createHash } from "node:crypto";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { createCommandRecoveryJournal } from "../scripts/command-recovery-journal.mjs";
import { createDurableEffectLifecycle } from "../scripts/durable-effect-fence.mjs";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createModelInputLedger } from "../scripts/model-input-ledger.mjs";
import { createRuntimeGenerationService } from "../scripts/runtime-generation-service.mjs";

function modelSource(model, headers) {
  const headerShape = Object.fromEntries(Object.entries(headers).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => [name.toLowerCase(), createHash("sha256").update(String(value ?? "")).digest("hex")]));
  return { mcp: {}, provider: { api: model?.api ?? null, baseUrl: model?.baseUrl ?? null, headerShape, id: model?.id ?? null, provider: model?.provider ?? null } };
}
function requestProjection(generationId, model, payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : Array.isArray(payload?.input) ? payload.input : payload?.input === undefined ? [] : [payload.input];
  const tools = Array.isArray(payload?.tools) ? payload.tools : [];
  return { generationId, messages, provider: model?.provider ?? null, systemPrompt: payload?.system ?? payload?.instructions ?? null, tools };
}
function requestEvents(requestId, projection) {
  const values = [{ generationId: projection.generationId, provider: projection.provider }, projection.systemPrompt, ...projection.messages, ...projection.tools];
  const types = ["generation", "system", ...projection.messages.map(() => "message"), ...projection.tools.map(() => "tool")];
  return values.map((value, seq) => ({ at: new Date().toISOString(), payload: value, requestId, seq, type: types[seq] }));
}

export default function cocoProviderGeneration(pi, options = {}) {
  let service, fingerprint = null, ledger, effects;
  const leases = new Map();
  const effectRequests = new Set();
  pi.on("session_start", async (_event, ctx) => {
    const initial = modelSource(ctx.model, {});
    const agentDir = options.agentDir ?? getAgentDir();
    ledger = createModelInputLedger({ agentDir });
    const journal = createCommandRecoveryJournal({ directory: `${agentDir}/command-recovery/provider` }); await journal.recover(); effects = createDurableEffectLifecycle({ journal });
    service = createRuntimeGenerationService({ initial, prepareProvider: async (value) => value, prepareMcp: async (value) => value, executeProvider: async () => null, executeMcp: async () => null });
    await service.initialize(); fingerprint = canonicalJson(initial);
  });
  pi.on("before_provider_request", async (event, ctx) => {
    try { if (!ledger || !effects) throw new Error("MODEL_INPUT_LEDGER_UNAVAILABLE"); const generationId = leases.get(event.requestId)?.generationId ?? "unbound", projection = requestProjection(generationId, ctx.model, event.payload); const receipt = await ledger.recordEvents(event.requestId, requestEvents(event.requestId, projection), generationId); await ledger.verify(event.requestId, projection); const prepared = await effects.begin({ commandId: event.requestId, effectGeneration: generationId, operationId: "provider.call", request: { requestSha256: receipt.requestSha256 } }); if (prepared.status === "replayed") throw new Error("PROVIDER_EFFECT_REPLAY_UNSUPPORTED"); effectRequests.add(event.requestId); }
    catch (error) { ctx.abort(); throw error; }
  });
  pi.on("before_provider_headers", async (event, ctx) => {
    try {
      if (!service || leases.has(event.requestId)) throw new Error("PROVIDER_GENERATION_STATE_INVALID");
      const source = modelSource(ctx.model, event.headers), next = canonicalJson(source);
      if (next !== fingerprint) { await service.reload(source, service.status().revision); fingerprint = next; }
      leases.set(event.requestId, service.lease());
    } catch (error) { ctx.abort(); throw error; }
  });
  pi.on("after_provider_response", async (event, ctx) => {
    if (!leases.has(event.requestId)) { ctx.abort(); throw new Error("PROVIDER_GENERATION_LEASE_MISSING"); }
    try { if (effectRequests.delete(event.requestId)) await effects?.complete(event.requestId, { httpStatus: event.status }); }
    catch (error) { await effects?.uncertain(event.requestId); ctx.abort(); throw error; }
  });
  pi.on("provider_request_end", async (event) => { const lease = leases.get(event.requestId), started = effectRequests.delete(event.requestId); leases.delete(event.requestId); try { if (started && event.outcome === "done") await effects?.complete(event.requestId, { outcome: "done" }); else if (started) await effects?.uncertain(event.requestId, `provider-${event.outcome}`); } finally { await lease?.release(); } });
  pi.on("session_shutdown", async () => { await Promise.allSettled([...leases.values()].map(({ release }) => release())); leases.clear(); effectRequests.clear(); await service?.close(); service = undefined; });
}
