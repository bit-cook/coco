import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseTask } from "../scripts/task-diagnosis.mjs";

const task = { activeRunId: "018f47a0-7b20-7cc5-8a33-111111111111", heartbeatAt: "2026-08-11T12:00:00.000Z", status: "running" };
const now = Date.parse("2026-08-11T12:02:00.000Z");

test("task diagnosis uses process, heartbeat, and output signals", () => {
  assert.equal(diagnoseTask({ task, now, processAlive: true }).state, "stuck");
  assert.equal(diagnoseTask({ latestLogAt: "2026-08-11T12:01:30.000Z", task, now, processAlive: true }).state, "waiting");
  assert.equal(diagnoseTask({ task: { ...task, heartbeatAt: "2026-08-11T12:01:45.000Z" }, now, processAlive: true }).state, "healthy");
  assert.equal(diagnoseTask({ task, now, processAlive: false }).state, "unknown");
});

test("non-running tasks do not produce a false stuck diagnosis", () => {
  const result = diagnoseTask({ task: { ...task, status: "completed" }, now, processAlive: true });
  assert.deepEqual(result, { schemaVersion: 1, state: "unknown", reason: "NOT_RUNNING", signals: {} });
});
