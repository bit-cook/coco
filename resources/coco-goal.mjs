import { translate } from "./coco-language.mjs";

const STATE_TYPE = "coco-goal-v1";
const CONTEXT_TYPE = "coco-goal-context-v1";
const VALID_STATUSES = new Set(["active", "paused", "completed"]);
const VALID_STEP_STATUSES = new Set(["pending", "active", "done", "blocked"]);

function emptyState() {
  return { goal: null, revision: 0, schemaVersion: 1, status: "paused", steps: [] };
}

function validStep(value) {
  return value && typeof value === "object" && Number.isSafeInteger(value.id) && value.id > 0
    && typeof value.text === "string" && value.text.trim() !== "" && VALID_STEP_STATUSES.has(value.status);
}

export function validGoalState(value) {
  return value && typeof value === "object" && value.schemaVersion === 1
    && Number.isSafeInteger(value.revision) && value.revision >= 0
    && (value.goal === null || (typeof value.goal === "string" && value.goal.trim() !== ""))
    && VALID_STATUSES.has(value.status) && Array.isArray(value.steps) && value.steps.every(validStep)
    && new Set(value.steps.map((step) => step.id)).size === value.steps.length;
}

export function restoreGoalState(entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "custom" && entry.customType === STATE_TYPE && validGoalState(entry.data)) return structuredClone(entry.data);
  }
  return emptyState();
}

function normalizeSteps(steps) {
  return steps.map((step, index) => ({
    id: index + 1,
    status: VALID_STEP_STATUSES.has(step?.status) ? step.status : "pending",
    text: String(typeof step === "string" ? step : step?.text ?? "").trim(),
  })).filter((step) => step.text !== "");
}

export function reduceGoalState(state, action) {
  const next = structuredClone(validGoalState(state) ? state : emptyState());
  if (action.type === "set") {
    const goal = String(action.goal ?? "").trim();
    if (goal === "") throw new Error("GOAL_TEXT_REQUIRED");
    next.goal = goal; next.status = "active"; next.steps = [];
  } else if (action.type === "set_steps") {
    if (next.goal === null) throw new Error("GOAL_NOT_SET");
    next.steps = normalizeSteps(Array.isArray(action.steps) ? action.steps : []);
    if (next.steps.length === 0) throw new Error("GOAL_STEPS_REQUIRED");
    next.status = "active";
  } else if (["pause", "resume", "complete"].includes(action.type)) {
    if (next.goal === null) throw new Error("GOAL_NOT_SET");
    next.status = action.type === "pause" ? "paused" : action.type === "resume" ? "active" : "completed";
    if (action.type === "complete") next.steps = next.steps.map((step) => ({ ...step, status: "done" }));
  } else if (action.type === "clear") {
    return { ...emptyState(), revision: next.revision + 1 };
  } else if (["complete_step", "activate_step", "block_step", "reopen_step"].includes(action.type)) {
    if (next.goal === null) throw new Error("GOAL_NOT_SET");
    const id = Number(action.id);
    const step = next.steps.find((candidate) => candidate.id === id);
    if (!step) throw new Error("GOAL_STEP_NOT_FOUND");
    step.status = action.type === "complete_step" ? "done" : action.type === "activate_step" ? "active" : action.type === "block_step" ? "blocked" : "pending";
    next.status = next.steps.every((candidate) => candidate.status === "done") ? "completed" : "active";
  } else throw new Error("GOAL_ACTION_INVALID");
  next.revision += 1;
  return next;
}

export function formatGoalState(state) {
  if (state.goal === null) return translate("goal.noGoal");
  const completed = state.steps.filter((step) => step.status === "done").length;
  const header = translate("goal.header", { completed, goal: state.goal, status: translate(`goal.status.${state.status}`), total: state.steps.length });
  if (state.steps.length === 0) return `${header}\n${translate("goal.noPlan")}`;
  const mark = { active: ">", blocked: "!", done: "x", pending: " " };
  return `${header}\n${state.steps.map((step) => `[${mark[step.status]}] ${step.id}. ${step.text}`).join("\n")}`;
}

export function goalContext(state) {
  if (state.goal === null || state.status !== "active") return null;
  const remaining = state.steps.filter((step) => step.status !== "done");
  return `[COCO GOAL ACTIVE]\nObjective: ${state.goal}\nStatus: ${state.steps.length - remaining.length}/${state.steps.length} steps complete.\n${remaining.length === 0 ? "No planned steps remain. Confirm completion with the user." : `Remaining steps:\n${remaining.map((step) => `${step.id}. [${step.status}] ${step.text}`).join("\n")}`}\nWork toward this objective without ignoring the user's current instruction. Use the goal tool to update plan progress. Never mark a step complete before its work and verification are finished.`;
}

export function applyCompletionMarkers(state, text) {
  let next = state; let changed = false;
  for (const match of String(text).matchAll(/\[GOAL-DONE:(\d+)\]/gi)) {
    const id = Number(match[1]);
    if (next.steps.some((step) => step.id === id && step.status !== "done")) {
      next = reduceGoalState(next, { id, type: "complete_step" }); changed = true;
    }
  }
  return changed ? next : state;
}

function assistantText(message) {
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return "";
  return message.content.filter((part) => part?.type === "text").map((part) => part.text).join("\n");
}

function commandAction(argument) {
  const input = String(argument ?? "").trim();
  if (input === "" || input === "status") return { type: "status" };
  if (["pause", "resume", "complete", "clear", "plan", "continue"].includes(input)) return { type: input };
  if (input.startsWith("set ")) return { goal: input.slice(4), type: "set" };
  const step = /^(done|reopen|block|active)\s+(\d+)$/.exec(input);
  if (step) return { id: Number(step[2]), type: step[1] === "done" ? "complete_step" : step[1] === "reopen" ? "reopen_step" : step[1] === "block" ? "block_step" : "activate_step" };
  if (/^(?:set|done|reopen|block|active)(?:\s|$)/.test(input)) throw new Error("GOAL_COMMAND_INVALID");
  return { goal: input, type: "set" };
}

const GoalParameters = {
  additionalProperties: false,
  properties: {
    action: { enum: ["status", "set_steps", "complete_step", "activate_step", "block_step", "reopen_step", "complete"] },
    id: { minimum: 1, type: "integer" },
    steps: { items: { oneOf: [{ type: "string" }, { additionalProperties: false, properties: { status: { enum: ["pending", "active", "done", "blocked"] }, text: { minLength: 1, type: "string" } }, required: ["text"], type: "object" }] }, type: "array" },
  },
  required: ["action"],
  type: "object",
};

export default function cocoGoal(pi) {
  let state = emptyState();
  let lastContext = null;

  function persist(next, ctx) {
    state = next;
    pi.appendEntry(STATE_TYPE, structuredClone(state));
    updateUi(ctx);
  }

  function updateUi(ctx) {
    if (!ctx?.hasUI) return;
    if (state.goal === null) {
      ctx.ui.setStatus("coco-goal", undefined); ctx.ui.setWidget("coco-goal", undefined); return;
    }
    const completed = state.steps.filter((step) => step.status === "done").length;
    ctx.ui.setStatus("coco-goal", `goal ${state.status} ${completed}/${state.steps.length}`);
    ctx.ui.setWidget("coco-goal", formatGoalState(state).split("\n").slice(0, 8));
  }

  function restore(ctx) {
    state = restoreGoalState(ctx.sessionManager.getBranch());
    updateUi(ctx);
  }

  pi.registerCommand("goal", {
    description: translate("goal.commandDescription"),
    handler: async (argument, ctx) => {
      try {
        const action = commandAction(argument);
        if (action.type === "status") { ctx.ui.notify(formatGoalState(state), "info"); return; }
        if (action.type === "plan") {
          if (state.goal === null) throw new Error("GOAL_NOT_SET");
          pi.sendMessage({ customType: "coco-goal-plan-request", content: `Create a concise, verifiable execution plan for this objective:\n${state.goal}\nCall the goal tool with action=set_steps and the ordered steps. Do not execute the plan yet.`, display: true }, { triggerTurn: true });
          return;
        }
        if (action.type === "continue") {
          const next = reduceGoalState(state, { type: "resume" }); persist(next, ctx);
          pi.sendMessage({ customType: "coco-goal-continue", content: `Continue working toward the active goal:\n${next.goal}\nStart with the first unfinished step and update progress with the goal tool.`, display: true }, { triggerTurn: true });
          return;
        }
        const next = reduceGoalState(state, action); persist(next, ctx);
        ctx.ui.notify(formatGoalState(state), "info");
      } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : "GOAL_COMMAND_FAILED", "error"); }
    },
  });

  pi.registerTool({
    name: "goal",
    label: translate("goal.label"),
    description: "Read or update the current persistent session goal. Use set_steps to record a plan and complete_step only after work is verified.",
    parameters: GoalParameters,
    async execute(_toolCallId, parameters, _signal, _onUpdate, ctx) {
      try {
        if (parameters.action !== "status") persist(reduceGoalState(state, { ...parameters, type: parameters.action }), ctx);
        return { content: [{ text: formatGoalState(state), type: "text" }], details: structuredClone(state) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "GOAL_TOOL_FAILED";
        return { content: [{ text: `Error: ${message}`, type: "text" }], details: { error: message, state: structuredClone(state) }, isError: true };
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => restore(ctx));
  pi.on("session_tree", async (_event, ctx) => restore(ctx));
  pi.on("session_shutdown", async (_event, ctx) => {
    if (!ctx?.hasUI) return;
    ctx.ui.setStatus("coco-goal", undefined);
    ctx.ui.setWidget("coco-goal", undefined);
  });

  pi.on("before_agent_start", async () => {
    lastContext = goalContext(state);
    if (lastContext === null) return undefined;
    return { message: { content: lastContext, customType: CONTEXT_TYPE, details: { revision: state.revision }, display: false } };
  });

  pi.on("context", async (event) => {
    const goalMessages = event.messages.filter((message) => message?.customType === CONTEXT_TYPE);
    if (goalMessages.length <= 1 && lastContext !== null) return undefined;
    const latest = lastContext === null ? undefined : goalMessages.at(-1);
    return { messages: event.messages.filter((message) => message?.customType !== CONTEXT_TYPE || message === latest) };
  });

  pi.on("turn_end", async (event, ctx) => {
    const next = applyCompletionMarkers(state, assistantText(event.message));
    if (next !== state) persist(next, ctx);
  });
}
