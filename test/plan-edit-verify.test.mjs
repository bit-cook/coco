import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createPlanEditVerifyState, receiptVerification, transitionPlanEditVerify } from "../scripts/plan-edit-verify.mjs";
import { canonicalJson } from "../scripts/canonical-json.mjs";

test("plan edit verify accepts only an evidenced completion", () => {
  let state = createPlanEditVerifyState({ taskId: "task00000001" });
  state = transitionPlanEditVerify(state, "editing");
  state = transitionPlanEditVerify(state, "verifying");
  assert.throws(() => transitionPlanEditVerify(state, "completed"), /PLAN_COMPLETION_UNVERIFIED/);
  state = transitionPlanEditVerify(state, "completed", { verification: { receiptRef: "task-receipts/task00000001/018f47a0-7b20-7cc5-8a33-111111111111.json", receiptSha256: "a".repeat(64), verdict: "passed" } });
  assert.equal(state.state, "completed"); assert.equal(state.revision, 3);
});

test("plan edit verify rejects skips and mutation after terminal state", () => {
  const planned = createPlanEditVerifyState({ taskId: "task00000002" });
  assert.throws(() => transitionPlanEditVerify(planned, "verifying"), /PLAN_TRANSITION_FORBIDDEN/);
  const failed = transitionPlanEditVerify(planned, "failed", { verification: { receiptRef: "task-receipts/task00000002/018f47a0-7b20-7cc5-8a33-222222222222.json", receiptSha256: "b".repeat(64), verdict: "failed" } });
  assert.throws(() => transitionPlanEditVerify(failed, "editing"), /PLAN_TRANSITION_FORBIDDEN/);
});

test("receipt verification produces a stable content binding", () => {
  const receipt = { runId: "run", verdict: "passed" };
  const binding = receiptVerification(receipt, "task-receipts/receipttest1/018f47a0-7b20-7cc5-8a33-111111111111.json");
  assert.equal(binding.verdict, "passed"); assert.match(binding.receiptSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(binding.receiptSha256, ""); assert.equal(binding.receiptSha256, createHash("sha256").update(canonicalJson(receipt)).digest("hex"));
  assert.deepEqual(binding, receiptVerification(receipt, binding.receiptRef));
});

test("receipt verification rejects traversal and malformed references", () => {
  assert.throws(() => receiptVerification({ verdict: "passed" }, "task-receipts/../secrets.json"), /PLAN_RECEIPT_INVALID/);
});
