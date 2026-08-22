import assert from "node:assert/strict";
import test from "node:test";

import { createOrderedToolPool } from "../scripts/ordered-tool-pool.mjs";

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

test("parallel-safe calls overlap but results commit in request order", async () => {
  let active = 0, peak = 0; const complete = [];
  const pool = createOrderedToolPool({ classify: ({ safe }) => safe ? "parallel-safe" : "exclusive", maxConcurrency: 3 });
  const calls = [30, 5, 15].map((ms, index) => ({ id: `read-${index}`, safe: true, async run() { active += 1; peak = Math.max(peak, active); await delay(ms); active -= 1; complete.push(index); return index; } }));
  const results = await pool.run(calls); assert.ok(peak > 1); assert.notDeepEqual(complete, [0, 1, 2]); assert.deepEqual(results.map(({ callId, index, status, value }) => ({ callId, index, status, value })), [0, 1, 2].map((index) => ({ callId: `read-${index}`, index, status: "completed", value: index })));
});

test("exclusive calls form barriers before and after execution", async () => {
  const timeline = [], call = (id, safe, ms) => ({ id, safe, async run() { timeline.push(`start:${id}`); await delay(ms); timeline.push(`end:${id}`); return id; } });
  const pool = createOrderedToolPool({ classify: ({ safe }) => safe ? "parallel-safe" : "exclusive" }); await pool.run([call("a", true, 20), call("b", true, 5), call("write", false, 1), call("c", true, 1)]);
  assert.ok(timeline.indexOf("start:write") > timeline.indexOf("end:a")); assert.ok(timeline.indexOf("start:write") > timeline.indexOf("end:b")); assert.ok(timeline.indexOf("start:c") > timeline.indexOf("end:write"));
});

test("failure, timeout, and cancellation produce exactly one ordered terminal result", async () => {
  const controller = new AbortController();
  const pool = createOrderedToolPool({ classify: () => "parallel-safe", timeoutMs: 20 });
  const results = await pool.run([{ id: "failed", async run() { throw new Error("boom"); } }, { id: "timed", async run({ signal }) { await new Promise((done) => signal.addEventListener("abort", done, { once: true })); } }, { id: "ok", async run() { return "ok"; } }], { signal: controller.signal });
  assert.deepEqual(results.map(({ status }) => status), ["failed", "cancelled", "completed"]); assert.deepEqual(results.map(({ index }) => index), [0, 1, 2]);
});

test("invalid capability classification fails before any call starts", async () => {
  let calls = 0; const pool = createOrderedToolPool({ classify: () => "guessed" });
  await assert.rejects(pool.run([{ id: "unsafe", async run() { calls += 1; } }]), { code: "TOOL_POOL_CAPABILITY_INVALID" }); assert.equal(calls, 0);
});
