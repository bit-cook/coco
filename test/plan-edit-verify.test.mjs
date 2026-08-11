import assert from "node:assert/strict";
import test from "node:test";

import { createPlanEditVerifyState, receiptVerification, transitionPlanEditVerify } from "../scripts/plan-edit-verify.mjs";

test("plan edit verify accepts only an evidenced completion", () => {
  let state = createPlanEditVerifyState({ taskId: "task-1" });
  state = transitionPlanEditVerify(state, "editing");
  state = transitionPlanEditVerify(state, "verifying");
  assert.throws(() => transitionPlanEditVerify(state, "completed"), /PLAN_COMPLETION_UNVERIFIED/);
  state = transitionPlanEditVerify(state, "completed", { verification: { receiptRef: "task-receipts/task-1/run.json", receiptSha256: "a".repeat(64), verdict: "passed" } });
  assert.equal(state.state, "completed"); assert.equal(state.revision, 3);
});

test("plan edit verify rejects skips and mutation after terminal state", () => {
  const planned = createPlanEditVerifyState({ taskId: "task-2" });
  assert.throws(() => transitionPlanEditVerify(planned, "verifying"), /PLAN_TRANSITION_FORBIDDEN/);
  const failed = transitionPlanEditVerify(planned, "failed", { verification: { receiptRef: "task-receipts/task-2/run.json", receiptSha256: "b".repeat(64), verdict: "failed" } });
  assert.throws(() => transitionPlanEditVerify(failed, "editing"), /PLAN_TRANSITION_FORBIDDEN/);
});

test("receipt verification produces a stable content binding", () => {
  const receipt = { runId: "run", verdict: "passed" };
  const binding = receiptVerification(receipt, "task-receipts/task/run.json");
  assert.equal(binding.verdict, "passed"); assert.match(binding.receiptSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(binding, receiptVerification(receipt, binding.receiptRef));
});
