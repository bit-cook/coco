import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }

function validRelation(relation) {
  return relation && typeof relation === "object" && !Array.isArray(relation)
    && typeof relation.childId === "string" && relation.childId.length > 0 && relation.childId.length <= 200
    && typeof relation.createdAt === "string" && !Number.isNaN(Date.parse(relation.createdAt))
    && typeof relation.parentId === "string" && relation.parentId.length > 0 && relation.parentId.length <= 200
    && typeof relation.status === "string" && ["active", "completed", "failed", "cancelled"].includes(relation.status)
    && Object.keys(relation).sort().join(",") === "childId,createdAt,parentId,status";
}

function validState(state) {
  return state && typeof state === "object" && !Array.isArray(state)
    && state.schemaVersion === 1
    && Array.isArray(state.relations)
    && state.relations.every(validRelation);
}

const empty = () => ({ relations: [], schemaVersion: 1 });

export function createOrchLineage({ agentDir }) {
  const path = statePaths(agentDir).orchLineage;

  async function load() {
    await ensureAgentDirectory(agentDir);
    if (await inspectRegular(path) === null) return empty();
    try {
      const bytes = await readFile(path, "utf8"), value = JSON.parse(bytes);
      if (canonicalJson(value) !== bytes || !validState(value)) fail("ORCH_LINEAGE_CORRUPT");
      return structuredClone(value);
    } catch (error) { if (error?.code === "ORCH_LINEAGE_CORRUPT") throw error; fail("ORCH_LINEAGE_CORRUPT"); }
  }

  function write(state) { return [{ bytes: canonicalJson(state), path }]; }

  return Object.freeze({
    async register(parentId, childId) {
      if (typeof parentId !== "string" || parentId.length === 0 || parentId.length > 200) fail("ORCH_PARENT_ID_INVALID");
      if (typeof childId !== "string" || childId.length === 0 || childId.length > 200) fail("ORCH_CHILD_ID_INVALID");
      if (parentId === childId) fail("ORCH_LINEAGE_CYCLE");
      let result;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const state = await load();
          if (state.relations.some((r) => r.childId === childId)) { result = { registered: false, reason: "duplicate" }; return write(state); }
          const relation = { childId, createdAt: new Date().toISOString(), parentId, status: "active" };
          state.relations.push(relation);
          result = { registered: true, relation: structuredClone(relation) };
          return write(state);
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      return result;
    },

    async complete(childId) { return this.transition(childId, "completed"); },
    async fail(childId) { return this.transition(childId, "failed"); },
    async cancel(childId) { return this.transition(childId, "cancelled"); },

    async transition(childId, status) {
      if (typeof childId !== "string" || !["completed", "failed", "cancelled"].includes(status)) fail("ORCH_TRANSITION_INVALID");
      let result;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const state = await load();
          const relation = state.relations.find((r) => r.childId === childId && r.status === "active");
          if (!relation) { result = null; return write(state); }
          relation.status = status;
          result = { relation: structuredClone(relation) };
          return write(state);
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      return result;
    },

    async children(parentId) {
      const state = await load();
      return structuredClone(state.relations.filter((r) => r.parentId === parentId));
    },

    async parent(childId) {
      const state = await load();
      const relation = state.relations.find((r) => r.childId === childId);
      return relation ? structuredClone(relation) : null;
    },

    async list() {
      const state = await load();
      return structuredClone(state.relations);
    },
  });
}
