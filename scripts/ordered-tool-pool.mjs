import { canonicalJson } from "./canonical-json.mjs";

const MODES = new Set(["exclusive", "parallel-safe"]);
function fail(code) { const error = new Error(code); error.code = code; throw error; }

export function createOrderedToolPool({ classify, maxCalls = 64, maxConcurrency = 4, maxResultBytes = 1024 * 1024, timeoutMs = 30000 }) {
  if (typeof classify !== "function" || !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 4096 || !Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 32 || !Number.isSafeInteger(maxResultBytes) || maxResultBytes < 1024 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) fail("TOOL_POOL_CONFIG_INVALID");
  async function execute(call, index, signal) {
    if (signal?.aborted) return { callId: call.id, index, status: "cancelled" };
    const controller = new AbortController(), abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true }); const timer = setTimeout(abort, timeoutMs);
    try {
      const value = await call.run({ signal: controller.signal });
      if (controller.signal.aborted) return { callId: call.id, index, status: "cancelled" };
      let bytes; try { bytes = Buffer.byteLength(canonicalJson(value)); } catch { return { callId: call.id, error: "TOOL_RESULT_INVALID", index, status: "failed" }; }
      return bytes > maxResultBytes ? { callId: call.id, error: "TOOL_RESULT_LIMIT_EXCEEDED", index, status: "failed" } : { callId: call.id, index, status: "completed", value };
    } catch (error) { return { callId: call.id, error: controller.signal.aborted ? undefined : String(error?.message ?? "TOOL_EXECUTION_FAILED").slice(0, 1000), index, status: controller.signal.aborted ? "cancelled" : "failed" }; }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  async function parallel(segment, results, signal) {
    let cursor = 0;
    const worker = async () => { while (cursor < segment.length) { const current = segment[cursor++]; results[current.index] = await execute(current.call, current.index, signal); } };
    await Promise.all(Array.from({ length: Math.min(maxConcurrency, segment.length) }, worker));
  }
  return Object.freeze({
    async run(calls, { signal } = {}) {
      if (!Array.isArray(calls) || calls.length > maxCalls) fail("TOOL_POOL_CALLS_INVALID");
      const ids = new Set(), prepared = calls.map((call, index) => { if (!call || typeof call.id !== "string" || call.id.length === 0 || ids.has(call.id) || typeof call.run !== "function") fail("TOOL_POOL_CALL_INVALID"); ids.add(call.id); const mode = classify(call); if (!MODES.has(mode)) fail("TOOL_POOL_CAPABILITY_INVALID"); return { call, index, mode }; });
      const results = Array(calls.length); let safe = [];
      for (const current of prepared) {
        if (current.mode === "parallel-safe") { safe.push(current); continue; }
        if (safe.length) { await parallel(safe, results, signal); safe = []; }
        results[current.index] = await execute(current.call, current.index, signal);
      }
      if (safe.length) await parallel(safe, results, signal);
      return Object.freeze(results.map(Object.freeze));
    },
  });
}
