import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import extension from "../resources/coco-provider-generation.mjs";

test("provider lifecycle binds one generation and releases every terminal outcome", async () => {
  const handlers = new Map(), aborted = [], pi = { on(name, handler) { handlers.set(name, handler); } };
  const agentDir = await mkdtemp(join(tmpdir(), "coco-provider-generation-test-"));
  extension(pi, { agentDir }); const context = { abort() { aborted.push(true); }, model: { api: "openai", baseUrl: "https://one.example", id: "one", provider: "alpha" } };
  await handlers.get("session_start")({}, context);
  const headers = { authorization: "Bearer private" }; await handlers.get("before_provider_headers")({ attempt: 1, headers, requestId: "request-1" }, context);
  assert.deepEqual(headers, { authorization: "Bearer private" });
  await handlers.get("before_provider_request")({ payload: { messages: [{ role: "user", content: "hello" }], tools: [{ name: "read" }], system: "system" }, requestId: "request-1" }, context);
  handlers.get("after_provider_response")({ attempt: 1, headers: {}, requestId: "request-1", status: 200 }, context);
  await handlers.get("provider_request_end")({ attempt: 1, outcome: "done", requestId: "request-1" });
  await handlers.get("session_shutdown")(); assert.deepEqual(aborted, []); const record = JSON.parse(await readFile(join(agentDir, "model-input-ledger", "request-1.json"))); assert.equal(record.generationId, "generation-2"); assert.equal(record.projection.messages[0].content, "hello"); assert.equal(record.projection.tools[0].name, "read"); await rm(agentDir, { recursive: true, force: true });
});

test("provider lifecycle aborts missing and duplicate correlation", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-provider-generation-duplicate-"));
  const handlers = new Map(), context = { aborted: 0, abort() { this.aborted += 1; }, model: { api: "openai", baseUrl: "https://one.example", id: "one", provider: "alpha" } };
  extension({ on(name, handler) { handlers.set(name, handler); } }, { agentDir }); await handlers.get("session_start")({}, context);
  const event = { attempt: 1, headers: {}, requestId: "duplicate" }; await handlers.get("before_provider_headers")(event, context);
  await assert.rejects(handlers.get("before_provider_headers")(event, context), /PROVIDER_GENERATION_STATE_INVALID/);
  assert.throws(() => handlers.get("after_provider_response")({ requestId: "missing" }, context), /PROVIDER_GENERATION_LEASE_MISSING/);
  assert.equal(context.aborted, 2); await handlers.get("provider_request_end")({ requestId: "duplicate" }); await handlers.get("session_shutdown")(); await rm(agentDir, { recursive: true, force: true });
});
