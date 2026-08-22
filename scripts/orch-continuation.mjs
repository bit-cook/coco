import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }

function validPolicy(policy) {
  return policy && typeof policy === "object" && !Array.isArray(policy)
    && Number.isSafeInteger(policy.maxTurns) && policy.maxTurns > 0
    && Number.isSafeInteger(policy.maxTokens) && policy.maxTokens > 0
    && Number.isSafeInteger(policy.maxTimeMs) && policy.maxTimeMs > 0
    && Object.keys(policy).sort().join(",") === "maxTimeMs,maxTokens,maxTurns";
}

function validSession(session) {
  return session && typeof session === "object" && !Array.isArray(session)
    && typeof session.sessionId === "string" && session.sessionId.length > 0
    && validPolicy(session.policy)
    && Number.isSafeInteger(session.turns) && session.turns >= 0
    && Number.isSafeInteger(session.tokens) && session.tokens >= 0
    && Number.isSafeInteger(session.startedAt) && session.startedAt > 0
    && typeof session.status === "string" && ["active", "exhausted", "completed"].includes(session.status)
    && Object.keys(session).sort().join(",") === "policy,sessionId,startedAt,status,tokens,turns";
}

function validState(state) {
  return state && typeof state === "object" && !Array.isArray(state)
    && state.schemaVersion === 1
    && Array.isArray(state.sessions)
    && state.sessions.every(validSession);
}

const empty = () => ({ schemaVersion: 1, sessions: [] });

export function createOrchContinuation({ agentDir }) {
  const path = statePaths(agentDir).orchContinuation;

  async function load() {
    await ensureAgentDirectory(agentDir);
    if (await inspectRegular(path) === null) return empty();
    try {
      const bytes = await readFile(path, "utf8"), value = JSON.parse(bytes);
      if (canonicalJson(value) !== bytes || !validState(value)) fail("ORCH_CONTINUATION_CORRUPT");
      return structuredClone(value);
    } catch (error) { if (error?.code === "ORCH_CONTINUATION_CORRUPT") throw error; fail("ORCH_CONTINUATION_CORRUPT"); }
  }

  function write(state) { return [{ bytes: canonicalJson(state), path }]; }

  function checkLimits(session) {
    const now = Date.now(), elapsed = now - session.startedAt;
    if (session.turns >= session.policy.maxTurns) return { exceeded: true, reason: "maxTurns" };
    if (session.tokens >= session.policy.maxTokens) return { exceeded: true, reason: "maxTokens" };
    if (elapsed >= session.policy.maxTimeMs) return { exceeded: true, reason: "maxTimeMs" };
    return { exceeded: false };
  }

  return Object.freeze({
    async start(sessionId, policy) {
      if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 200) fail("ORCH_SESSION_ID_INVALID");
      if (!validPolicy(policy)) fail("ORCH_POLICY_INVALID");
      let result;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const state = await load();
          if (state.sessions.some((s) => s.sessionId === sessionId && s.status === "active")) { result = { started: false, reason: "duplicate" }; return write(state); }
          const session = { policy: structuredClone(policy), sessionId, startedAt: Date.now(), status: "active", tokens: 0, turns: 0 };
          state.sessions.push(session);
          result = { started: true, session: structuredClone(session) };
          return write(state);
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      return result;
    },

    async recordTurn(sessionId, tokens) {
      if (typeof sessionId !== "string" || !Number.isSafeInteger(tokens) || tokens < 0) fail("ORCH_TURN_INVALID");
      let result;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const state = await load();
          const session = state.sessions.find((s) => s.sessionId === sessionId && s.status === "active");
          if (!session) { result = null; return write(state); }
          const before = checkLimits(session);
          if (before.exceeded) { session.status = "exhausted"; result = { limits: before, session: structuredClone(session) }; return write(state); }
          session.turns += 1; session.tokens += tokens;
          const limits = checkLimits(session);
          if (limits.exceeded) session.status = "exhausted";
          result = { limits, session: structuredClone(session) };
          return write(state);
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      return result;
    },

    async complete(sessionId) {
      if (typeof sessionId !== "string") fail("ORCH_SESSION_ID_INVALID");
      let result;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const state = await load();
          const session = state.sessions.find((s) => s.sessionId === sessionId && s.status === "active");
          if (!session) { result = null; return write(state); }
          session.status = "completed";
          result = { session: structuredClone(session) };
          return write(state);
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
      return result;
    },

    async status(sessionId) {
      const state = await load();
      const session = state.sessions.find((s) => s.sessionId === sessionId);
      if (!session) return null;
      return { limits: checkLimits(session), session: structuredClone(session) };
    },

    async list() {
      const state = await load();
      return structuredClone(state.sessions);
    },
  });
}
