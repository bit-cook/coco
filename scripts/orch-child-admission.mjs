import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function id(value, code) { if (typeof value !== "string" || value.length === 0 || value.length > 200) fail(code); return value; }
function budget(value) {
  if (!value || typeof value !== "object" || !Number.isSafeInteger(value.maxChildren) || value.maxChildren < 1 || !Number.isSafeInteger(value.maxTokens) || value.maxTokens < 1 || !Number.isSafeInteger(value.maxTimeMs) || value.maxTimeMs < 1 || !Number.isSafeInteger(value.maxTurns) || value.maxTurns < 1) fail("ORCH_BUDGET_INVALID");
  return { maxChildren: value.maxChildren, maxTimeMs: value.maxTimeMs, maxTokens: value.maxTokens, maxTurns: value.maxTurns };
}
function cost(value) {
  if (!value || typeof value !== "object" || !Number.isSafeInteger(value.timeMs) || value.timeMs < 0 || !Number.isSafeInteger(value.tokens) || value.tokens < 0 || !Number.isSafeInteger(value.turns) || value.turns < 0) fail("ORCH_CHILD_COST_INVALID");
  return { timeMs: value.timeMs, tokens: value.tokens, turns: value.turns };
}
function validState(state) { return state && state.schemaVersion === 1 && Array.isArray(state.parents) && state.parents.every((p) => p && typeof p.parentId === "string" && budget(p.budget) && Array.isArray(p.children) && p.children.every((c) => c && typeof c.childId === "string" && ["reserved", "committed", "released"].includes(c.status) && cost(c.cost))); }

const empty = () => ({ parents: [], schemaVersion: 1 });

export function createOrchChildAdmission({ agentDir }) {
  const path = statePaths(agentDir).orchChildAdmission;
  async function load() {
    await ensureAgentDirectory(agentDir); if (await inspectRegular(path) === null) return empty();
    try { const bytes = await readFile(path, "utf8"), value = JSON.parse(bytes); if (canonicalJson(value) !== bytes || !validState(value)) fail("ORCH_CHILD_STATE_CORRUPT"); return structuredClone(value); } catch (error) { if (error?.code === "ORCH_CHILD_STATE_CORRUPT") throw error; fail("ORCH_CHILD_STATE_CORRUPT"); }
  }
  const write = (state) => [{ bytes: canonicalJson(state), path }];
  return Object.freeze({
    async configure(parentId, parentBudget) {
      parentId = id(parentId, "ORCH_PARENT_ID_INVALID"); parentBudget = budget(parentBudget); let result;
      await applyStateTransaction({ agentDir, operations: async () => { const state = await load(), parent = state.parents.find((p) => p.parentId === parentId); if (parent && canonicalJson(parent.budget) !== canonicalJson(parentBudget)) fail("ORCH_BUDGET_CONFLICT"); if (!parent) state.parents.push({ budget: parentBudget, children: [], parentId }); result = { configured: true, parentId, budget: parentBudget }; return write(state); } }); return result;
    },
    async reserve(parentId, childId, childCost) {
      parentId = id(parentId, "ORCH_PARENT_ID_INVALID"); childId = id(childId, "ORCH_CHILD_ID_INVALID"); childCost = cost(childCost); let result;
      await applyStateTransaction({ agentDir, operations: async () => {
        const state = await load(), parent = state.parents.find((p) => p.parentId === parentId); if (!parent) fail("ORCH_PARENT_NOT_CONFIGURED");
        const existing = parent.children.find((c) => c.childId === childId); if (existing && existing.status !== "released") { result = { admitted: false, reason: "duplicate", child: structuredClone(existing) }; return write(state); }
        const active = parent.children.filter((c) => c.status !== "released"); if (active.length >= parent.budget.maxChildren) fail("ORCH_CHILD_LIMIT_EXCEEDED");
        const used = active.reduce((sum, c) => ({ timeMs: sum.timeMs + c.cost.timeMs, tokens: sum.tokens + c.cost.tokens, turns: sum.turns + c.cost.turns }), { timeMs: 0, tokens: 0, turns: 0 });
        if (used.timeMs + childCost.timeMs > parent.budget.maxTimeMs || used.tokens + childCost.tokens > parent.budget.maxTokens || used.turns + childCost.turns > parent.budget.maxTurns) fail("ORCH_CHILD_BUDGET_EXCEEDED");
        const child = { childId, cost: childCost, status: "reserved" }; parent.children.push(child); result = { admitted: true, child: structuredClone(child) }; return write(state);
      } }); return result;
    },
    async commit(parentId, childId) { return this.transition(parentId, childId, "committed"); },
    async release(parentId, childId) { return this.transition(parentId, childId, "released"); },
    async transition(parentId, childId, status) { parentId = id(parentId, "ORCH_PARENT_ID_INVALID"); childId = id(childId, "ORCH_CHILD_ID_INVALID"); let result; await applyStateTransaction({ agentDir, operations: async () => { const state = await load(), parent = state.parents.find((p) => p.parentId === parentId), child = parent?.children.find((c) => c.childId === childId); if (!child || child.status !== "reserved" && status !== "released") fail("ORCH_CHILD_STATE_INVALID"); child.status = status; result = { child: structuredClone(child) }; return write(state); } }); return result; },
    async get(parentId) { const state = await load(), parent = state.parents.find((p) => p.parentId === parentId); return parent ? structuredClone(parent) : null; },
  });
}
