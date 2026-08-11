const STATES = Object.freeze(["planned", "editing", "verifying", "completed", "failed"]);
const TRANSITIONS = new Map([
  ["planned", new Set(["editing", "failed"])],
  ["editing", new Set(["verifying", "failed"])],
  ["verifying", new Set(["completed", "failed"])],
  ["completed", new Set()],
  ["failed", new Set()],
]);
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const SHA256 = /^[0-9a-f]{64}$/;

function valid(value) {
  return value && value.schemaVersion === 1 && typeof value.taskId === "string" && value.taskId.length > 0
    && STATES.includes(value.state) && typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0
    && (value.verification === null || (value.verification && typeof value.verification.verdict === "string" && ["passed", "failed"].includes(value.verification.verdict) && typeof value.verification.receiptRef === "string" && value.verification.receiptRef.startsWith("task-receipts/") && SHA256.test(value.verification.receiptSha256)))
    && Object.keys(value).sort().join(",") === "revision,schemaVersion,state,taskId,verification";
}

export function createPlanEditVerifyState({ taskId, state = "planned", revision = 0, verification = null } = {}) {
  const value = { revision, schemaVersion: 1, state, taskId, verification };
  if (!valid(value)) fail("PLAN_STATE_INVALID");
  return Object.freeze(value);
}

export function transitionPlanEditVerify(current, next, { verification = null } = {}) {
  if (!valid(current) || !STATES.includes(next)) fail("PLAN_STATE_INVALID");
  if (!TRANSITIONS.get(current.state).has(next)) fail("PLAN_TRANSITION_FORBIDDEN");
  if (next === "completed" && (!verification || verification.verdict !== "passed")) fail("PLAN_COMPLETION_UNVERIFIED");
  if (next === "failed" && verification && verification.verdict !== "failed") fail("PLAN_FAILURE_EVIDENCE_INVALID");
  return Object.freeze({ revision: current.revision + 1, schemaVersion: 1, state: next, taskId: current.taskId, verification: next === "verifying" ? null : verification });
}

export { STATES as planEditVerifyStates };
