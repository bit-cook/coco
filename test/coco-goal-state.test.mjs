import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  applyCompletionMarkers,
  formatGoalState,
  goalContext,
  reduceGoalState,
  restoreGoalState,
  validGoalState,
} from "../resources/coco-goal.mjs";
import { createLanguageService } from "../resources/coco-language.mjs";

globalThis[Symbol.for("coco.language.service")] = createLanguageService({ agentDir: join(new URL(".", import.meta.url).pathname, ".nonexistent-language-state") });

const empty = { goal: null, revision: 0, schemaVersion: 1, status: "paused", steps: [] };

function state(overrides = {}) {
  return {
    goal: "Ship goal tracking",
    revision: 4,
    schemaVersion: 1,
    status: "active",
    steps: [{ id: 1, status: "pending", text: "Write tests" }, { id: 2, status: "active", text: "Run checks" }],
    ...overrides,
  };
}

test("validGoalState accepts complete schemas and rejects malformed state", () => {
  assert.equal(validGoalState(empty), true);
  assert.equal(validGoalState(state()), true);
  for (const invalid of [
    null,
    [],
    { ...state(), schemaVersion: 2 },
    { ...state(), revision: -1 },
    { ...state(), revision: 1.5 },
    { ...state(), goal: "  " },
    { ...state(), status: "unknown" },
    { ...state(), steps: {} },
    { ...state(), steps: [{ id: 1, status: "pending", text: "  " }] },
    { ...state(), steps: [{ id: 1, status: "waiting", text: "Work" }] },
    { ...state(), steps: [{ id: 1, status: "pending", text: "Work" }, { id: 1, status: "done", text: "Duplicate" }] },
  ]) assert.ok(!validGoalState(invalid));
});

test("restoreGoalState selects the latest valid snapshot in the current branch and clones it", () => {
  const older = state({ revision: 2, goal: "Older branch state" });
  const latest = state({ revision: 3, goal: "Latest branch state" });
  const restored = restoreGoalState([
    { type: "custom", customType: "coco-goal-v1", data: older },
    { type: "message", customType: "coco-goal-v1", data: state({ goal: "Wrong entry type" }) },
    { type: "custom", customType: "other", data: state({ goal: "Wrong custom type" }) },
    { type: "custom", customType: "coco-goal-v1", data: { ...latest, steps: [{ id: 1, status: "invalid", text: "Bad" }] } },
    { type: "custom", customType: "coco-goal-v1", data: latest },
  ]);

  assert.deepEqual(restored, latest);
  assert.notStrictEqual(restored, latest);
  assert.notStrictEqual(restored.steps, latest.steps);
  restored.steps[0].text = "Mutated restore";
  assert.equal(latest.steps[0].text, "Write tests");
  assert.deepEqual(restoreGoalState([]), empty);
  assert.deepEqual(restoreGoalState([{ type: "custom", customType: "coco-goal-v1", data: null }]), empty);
});

test("set, pause, resume, complete, and clear advance state predictably", () => {
  const set = reduceGoalState(empty, { type: "set", goal: "  Deliver release  " });
  assert.deepEqual(set, { ...empty, goal: "Deliver release", revision: 1, status: "active" });

  const paused = reduceGoalState(set, { type: "pause" });
  const resumed = reduceGoalState(paused, { type: "resume" });
  const plan = reduceGoalState(resumed, { type: "set_steps", steps: ["Build", "Verify"] });
  const complete = reduceGoalState(plan, { type: "complete" });
  assert.equal(paused.status, "paused");
  assert.equal(resumed.status, "active");
  assert.deepEqual(complete.steps.map((step) => step.status), ["done", "done"]);
  assert.equal(complete.status, "completed");
  assert.deepEqual(reduceGoalState(complete, { type: "clear" }), { ...empty, revision: complete.revision + 1 });
});

test("malformed input state resets safely and invalid goal operations report their contract errors", () => {
  assert.deepEqual(reduceGoalState({ goal: "not a valid state" }, { type: "clear" }), { ...empty, revision: 1 });
  assert.throws(() => reduceGoalState(empty, { type: "set", goal: " \n " }), { message: "GOAL_TEXT_REQUIRED" });
  for (const action of [{ type: "set_steps", steps: ["Plan"] }, { type: "pause" }, { type: "complete" }, { type: "complete_step", id: 1 }]) {
    assert.throws(() => reduceGoalState(empty, action), { message: "GOAL_NOT_SET" });
  }
  assert.throws(() => reduceGoalState(state(), { type: "set_steps", steps: ["", { text: "  " }] }), { message: "GOAL_STEPS_REQUIRED" });
  assert.throws(() => reduceGoalState(state(), { type: "complete_step", id: "1.5" }), { message: "GOAL_STEP_NOT_FOUND" });
  assert.throws(() => reduceGoalState(state(), { type: "unknown" }), { message: "GOAL_ACTION_INVALID" });
});

test("plans normalize content and step transitions preserve identities and revisions", () => {
  const planned = reduceGoalState(state({ status: "paused" }), {
    type: "set_steps",
    steps: ["  First task  ", { text: " Second task ", status: "active" }, { text: "Third", status: "bogus" }, "  "],
  });
  assert.deepEqual(planned.steps, [
    { id: 1, status: "pending", text: "First task" },
    { id: 2, status: "active", text: "Second task" },
    { id: 3, status: "pending", text: "Third" },
  ]);
  assert.equal(planned.status, "active");
  assert.equal(planned.revision, 5);

  const blocked = reduceGoalState(planned, { type: "block_step", id: 2 });
  const reopened = reduceGoalState(blocked, { type: "reopen_step", id: 2 });
  const active = reduceGoalState(reopened, { type: "activate_step", id: 2 });
  assert.equal(blocked.steps[1].status, "blocked");
  assert.equal(reopened.steps[1].status, "pending");
  assert.equal(active.steps[1].status, "active");
  assert.equal(active.revision, 8);
});

test("completing every step automatically completes the goal, including after reopening", () => {
  const planned = reduceGoalState(state(), { type: "set_steps", steps: ["One", "Two"] });
  const oneDone = reduceGoalState(planned, { type: "complete_step", id: 1 });
  const complete = reduceGoalState(oneDone, { type: "complete_step", id: 2 });
  const reopened = reduceGoalState(complete, { type: "reopen_step", id: 1 });

  assert.equal(oneDone.status, "active");
  assert.equal(complete.status, "completed");
  assert.equal(reopened.steps[0].status, "pending");
  assert.equal(reopened.status, "active");
  assert.match(goalContext(reopened), /1\. \[pending\] One/);
  assert.equal(reduceGoalState(reopened, { type: "complete_step", id: 1 }).status, "completed");
  assert.throws(() => reduceGoalState(planned, { type: "block_step", id: 99 }), { message: "GOAL_STEP_NOT_FOUND" });
});

test("completion markers are case-insensitive, ignore unknown or completed steps, and only change state when needed", () => {
  const planned = reduceGoalState(state(), { type: "set_steps", steps: ["One", "Two", "Three"] });
  const marked = applyCompletionMarkers(planned, "[goal-done:1] duplicate [GOAL-DONE:1] [GOAL-DONE:99] [GOAL-DONE:2]");
  assert.deepEqual(marked.steps.map((step) => step.status), ["done", "done", "pending"]);
  assert.equal(marked.revision, planned.revision + 2);
  assert.strictEqual(applyCompletionMarkers(marked, "[GOAL-DONE:1] [GOAL-DONE:99]"), marked);
  assert.strictEqual(applyCompletionMarkers(marked, null), marked);
  assert.equal(applyCompletionMarkers(marked, "[GOAL-DONE:3]").status, "completed");
});

test("formatGoalState renders empty, unplanned, and planned states", () => {
  assert.equal(formatGoalState(empty), "No goal is set. Use /goal <description> to start one.");
  assert.equal(formatGoalState(state({ steps: [] })), "Goal [active] 0/0: Ship goal tracking\nNo plan yet. Use /goal plan.");
  assert.equal(formatGoalState(state({ status: "paused", steps: [
    { id: 1, status: "active", text: "Work" }, { id: 2, status: "blocked", text: "Wait" }, { id: 3, status: "done", text: "Finish" }, { id: 4, status: "pending", text: "Later" },
  ] })), "Goal [paused] 1/4: Ship goal tracking\n[>] 1. Work\n[!] 2. Wait\n[x] 3. Finish\n[ ] 4. Later");
});

test("goalContext appears only for active goals and lists remaining work", () => {
  assert.equal(goalContext(empty), null);
  assert.equal(goalContext(state({ status: "paused" })), null);
  assert.equal(goalContext(state({ status: "completed" })), null);
  assert.equal(goalContext(state({ steps: [] })), "[COCO GOAL ACTIVE]\nObjective: Ship goal tracking\nStatus: 0/0 steps complete.\nNo planned steps remain. Confirm completion with the user.\nWork toward this objective without ignoring the user's current instruction. Use the goal tool to update plan progress. Never mark a step complete before its work and verification are finished.");
  assert.equal(goalContext(state()), "[COCO GOAL ACTIVE]\nObjective: Ship goal tracking\nStatus: 0/2 steps complete.\nRemaining steps:\n1. [pending] Write tests\n2. [active] Run checks\nWork toward this objective without ignoring the user's current instruction. Use the goal tool to update plan progress. Never mark a step complete before its work and verification are finished.");
});
