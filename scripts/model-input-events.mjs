import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.mjs";

const TYPES = new Set(["generation", "message", "system", "tool"]);
const MAX_EVENTS = 4096;
const MAX_BYTES = 4 * 1024 * 1024;
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function requestId(value) { if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) fail("MODEL_INPUT_EVENT_REQUEST_INVALID"); return value; }
function event(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "at,payload,requestId,seq,type" || !Number.isSafeInteger(value.seq) || value.seq < 0 || !TYPES.has(value.type)) fail("MODEL_INPUT_EVENT_INVALID");
  requestId(value.requestId); return value;
}

export function createModelInputEventStream({ requestId: expectedRequestId } = {}) {
  const expected = requestId(expectedRequestId), events = [];
  return Object.freeze({
    append(value) { const next = event(value); if (next.requestId !== expected || next.seq !== events.length) fail(next.requestId !== expected ? "MODEL_INPUT_EVENT_REQUEST_MISMATCH" : "MODEL_INPUT_EVENT_SEQUENCE_INVALID"); events.push(structuredClone(next)); if (Buffer.byteLength(canonicalJson(events)) > MAX_BYTES || events.length > MAX_EVENTS) fail("MODEL_INPUT_EVENT_LIMIT_EXCEEDED"); return { requestId: expected, seq: next.seq, status: "accepted" }; },
    events() { return structuredClone(events); },
    project(generationId) {
      if (typeof generationId !== "string" || generationId.length === 0) fail("MODEL_INPUT_GENERATION_INVALID");
      const result = { generationId, messages: [], provider: null, systemPrompt: null, tools: [] };
      for (const entry of events) {
        if (entry.type === "generation") result.generationId = entry.payload?.generationId ?? result.generationId;
        if (entry.type === "system") result.systemPrompt = entry.payload;
        if (entry.type === "message") result.messages.push(entry.payload);
        if (entry.type === "tool") result.tools.push(entry.payload);
      }
      if (result.provider === null) { const providerEvent = events.find(({ payload, type }) => type === "generation" && typeof payload?.provider === "string"); result.provider = providerEvent?.payload.provider ?? null; }
      const bytes = Buffer.from(canonicalJson(result)); if (bytes.length > MAX_BYTES) fail("MODEL_INPUT_TOO_LARGE");
      return Object.freeze({ projection: result, requestId: expected, sha256: createHash("sha256").update(bytes).digest("hex"), status: "projected" });
    },
  });
}

export function reconstructModelInput(events, { generationId, requestId: expectedRequestId } = {}) {
  const stream = createModelInputEventStream({ requestId: expectedRequestId }); for (const value of events ?? []) stream.append(value); return stream.project(generationId);
}
