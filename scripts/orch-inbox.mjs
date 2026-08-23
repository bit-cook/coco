import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";

const CATEGORIES = new Set(["follow-up", "scheduled", "child", "webhook"]);
const MAX_ITEMS = 256;

function fail(code) { const error = new Error(code); error.code = code; throw error; }

function validItem(item) {
  return item && typeof item === "object" && !Array.isArray(item)
    && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 200
    && CATEGORIES.has(item.category)
    && typeof item.priority === "number" && Number.isFinite(item.priority)
    && typeof item.createdAt === "string" && !Number.isNaN(Date.parse(item.createdAt))
    && typeof item.source === "string" && item.source.length > 0 && item.source.length <= 200
    && Object.keys(item).sort().join(",") === "category,createdAt,id,priority,source";
}

function validState(state) {
  return state && typeof state === "object" && !Array.isArray(state)
    && state.schemaVersion === 1
    && Array.isArray(state.items)
    && state.items.every(validItem)
    && state.items.length <= MAX_ITEMS;
}

const empty = () => ({ items: [], schemaVersion: 1 });

export function createOrchInbox({ agentDir }) {
  const path = statePaths(agentDir).orchInbox;

  async function load() {
    await ensureAgentDirectory(agentDir);
    if (await inspectRegular(path) === null) return empty();
    try {
      const bytes = await readFile(path, "utf8"), value = JSON.parse(bytes);
      if (canonicalJson(value) !== bytes || !validState(value)) fail("ORCH_INBOX_CORRUPT");
      return structuredClone(value);
    } catch (error) { if (error?.code === "ORCH_INBOX_CORRUPT") throw error; fail("ORCH_INBOX_CORRUPT"); }
  }

  function write(state) { return [{ bytes: canonicalJson(state), path }]; }

  return Object.freeze({
    async admit(item) {
      if (!validItem(item)) fail("ORCH_INBOX_ITEM_INVALID");
      let result;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const state = await load();
          if (state.items.some((existing) => existing.id === item.id)) { result = { admitted: false, reason: "duplicate" }; return write(state); }
          if (state.items.length >= MAX_ITEMS) { result = { admitted: false, reason: "capacity" }; return write(state); }
          state.items.push(structuredClone(item));
          state.items.sort((left, right) => left.priority - right.priority || Date.parse(left.createdAt) - Date.parse(right.createdAt));
          result = { admitted: true, position: state.items.findIndex(({ id }) => id === item.id) };
          return write(state);
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      return result;
    },

    async peek() {
      const state = await load();
      return state.items.length > 0 ? structuredClone(state.items[0]) : null;
    },

    async pop() {
      let item = null;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const state = await load();
          if (state.items.length === 0) { item = null; return write(state); }
          item = structuredClone(state.items[0]);
          state.items.shift();
          return write(state);
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      return item;
    },

    async popExpected(id) {
      if (typeof id !== "string" || id.length === 0) fail("ORCH_INBOX_ID_INVALID");
      let result = false;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const state = await load();
          if (state.items[0]?.source !== id) return [{ bytes: canonicalJson(state), path }];
          state.items.shift(); result = true; return [{ bytes: canonicalJson(state), path }];
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      return result;
    },

    async list() {
      const state = await load();
      return structuredClone(state.items);
    },

    async size() {
      const state = await load();
      return state.items.length;
    },
  });
}
