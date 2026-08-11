import assert from "node:assert/strict";
import test from "node:test";

import { createPlanEditVerifyState, transitionPlanEditVerify } from "../scripts/plan-edit-verify.mjs";

test("plan edit verify accepts only an evidenced completion", () => {
  let state = createPlanEditVerifyState({ taskId: "task-1" });
  state = transitionPlanEditVerify(state, "editing");
  state = transitionPlanEditVerify(state, "verifying");
  assert.throws(() => transitionPlanEditVerify(state, "completed"), /PLAN_COMPLETION_UNVERIFIED/);
  state = transitionPlanEditVerify(state, "completed", { verification: { verdict: "passed" } });
  assert.equal(state.state, "completed"); assert.equal(state.revision, 3);
});

test("plan edit verify rejects skips and mutation after terminal state", () => {
  const planned = createPlanEditVerifyState({ taskId: "task-2" });
  assert.throws(() => transitionPlanEditVerify(planned, "verifying"), /PLAN_TRANSITION_FORBIDDEN/);
  const failed = transitionPlanEditVerify(planned, "failed", { verification: { verdict: "failed" } });
  assert.throws(() => transitionPlanEditVerify(failed, "editing"), /PLAN_TRANSITION_FORBIDDEN/);
});
