import assert from "node:assert/strict";
import test from "node:test";

import { createModelInputEventStream, reconstructModelInput } from "../scripts/model-input-events.mjs";

const at = "2026-08-20T00:00:00.000Z";
const entry = (seq, type, payload, requestId = "request-1") => ({ at, payload, requestId, seq, type });

test("session events reconstruct a canonical normal, resumed, and tool projection", () => {
  const events = [entry(0, "generation", { generationId: "generation-2", provider: "local" }), entry(1, "system", "system"), entry(2, "message", { role: "user", content: "resume" }), entry(3, "tool", { name: "mcp", schema: { type: "object" } })];
  const projected = reconstructModelInput(events, { generationId: "generation-1", requestId: "request-1" });
  assert.equal(projected.projection.generationId, "generation-2"); assert.equal(projected.projection.provider, "local"); assert.equal(projected.projection.messages[0].content, "resume"); assert.match(projected.sha256, /^[0-9a-f]{64}$/);
});

test("missing, duplicate, out-of-order, unknown, and cross-request events fail closed", () => {
  const stream = createModelInputEventStream({ requestId: "request-1" }); stream.append(entry(0, "message", "one"));
  for (const value of [entry(2, "message", "skip"), entry(1, "message", "wrong", "request-2"), { ...entry(1, "message", "ok"), type: "unknown" }]) assert.throws(() => stream.append(value));
  assert.throws(() => reconstructModelInput([entry(1, "message", "missing")], { generationId: "generation-1", requestId: "request-1" }));
});

test("stream reconstruction is bounded and cannot expose event contents in public result", () => {
  const stream = createModelInputEventStream({ requestId: "public" }); stream.append(entry(0, "message", "private", "public")); const result = stream.project("generation-1");
  assert.deepEqual(Object.keys(result).sort(), ["projection", "requestId", "sha256", "status"]); assert.equal(result.requestId, "public");
});
