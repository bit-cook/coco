import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import extension from "../resources/coco-bash-fence.mjs";

test("bash fence persists before execution and records one result", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-bash-fence-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const handlers = new Map(); extension({ on(name, handler) { handlers.set(name, handler); } }, { agentDir }); await handlers.get("session_start")();
  const call = { input: { command: "true" }, toolCallId: "bash-1", toolName: "bash", type: "tool_call" }; assert.equal(await handlers.get("tool_call")(call), undefined);
  assert.equal(await handlers.get("tool_result")({ ...call, content: [{ type: "text", text: "ok" }], details: { exitCode: 0 }, isError: false, type: "tool_result" }), undefined);
  assert.deepEqual(await handlers.get("tool_call")(call), { block: true, reason: "BASH_EFFECT_ALREADY_RECORDED" });
});

test("bash fence blocks duplicate in-flight and unrelated tools remain unchanged", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-bash-fence-duplicate-")); t.after(() => rm(agentDir, { recursive: true, force: true })); const handlers = new Map(); extension({ on(name, handler) { handlers.set(name, handler); } }, { agentDir }); await handlers.get("session_start")();
  const call = { input: { command: "sleep 1" }, toolCallId: "bash-live", toolName: "bash", type: "tool_call" }; await handlers.get("tool_call")(call); assert.deepEqual(await handlers.get("tool_call")(call), { block: true, reason: "DURABLE_EFFECT_IN_PROGRESS" });
  assert.equal(await handlers.get("tool_call")({ input: {}, toolCallId: "read", toolName: "read", type: "tool_call" }), undefined);
});
