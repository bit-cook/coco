function fail(code) { const error = new Error(code); error.code = code; throw error; }

export function createDurableEffectFence({ journal }) {
  if (!journal || typeof journal.receive !== "function" || typeof journal.beginExecution !== "function" || typeof journal.recordResult !== "function" || typeof journal.markUncertain !== "function") fail("DURABLE_EFFECT_JOURNAL_INVALID");
  return Object.freeze({
    async run({ commandId, effect, effectGeneration, operationId, request }) {
      if (typeof effect !== "function") fail("DURABLE_EFFECT_FUNCTION_INVALID");
      const record = await journal.receive({ commandId, effectGeneration, operationId, request });
      if (record.status === "result") return { response: record.response, status: "replayed" };
      if (record.status === "uncertain") fail("DURABLE_EFFECT_UNCERTAIN");
      if (record.status === "executing") fail("DURABLE_EFFECT_IN_PROGRESS");
      try { await journal.beginExecution(commandId); } catch (error) {
        if (error?.message !== "COMMAND_STATE_INVALID") throw error;
        const current = await journal.read(commandId); if (current?.status === "result") return { response: current.response, status: "replayed" }; if (current?.status === "uncertain") fail("DURABLE_EFFECT_UNCERTAIN"); fail("DURABLE_EFFECT_IN_PROGRESS");
      }
      let response;
      try { response = await effect(); }
      catch { const uncertain = await journal.markUncertain(commandId, "effect-result-unconfirmed"); if (uncertain.status === "result") return { response: uncertain.response, status: "replayed" }; fail("DURABLE_EFFECT_UNCERTAIN"); }
      try { await journal.recordResult(commandId, response); }
      catch { const uncertain = await journal.markUncertain(commandId, "effect-result-persist-failed"); if (uncertain.status === "result") return { response: uncertain.response, status: "replayed" }; fail("DURABLE_EFFECT_UNCERTAIN"); }
      return { response, status: "completed" };
    },
  });
}

export function createDurableEffectLifecycle({ journal }) {
  if (!journal || typeof journal.receive !== "function" || typeof journal.beginExecution !== "function" || typeof journal.recordResult !== "function" || typeof journal.markUncertain !== "function") fail("DURABLE_EFFECT_JOURNAL_INVALID");
  return Object.freeze({
    async begin({ commandId, effectGeneration, operationId, request }) {
      const record = await journal.receive({ commandId, effectGeneration, operationId, request });
      if (record.status === "result") return { response: record.response, status: "replayed" };
      if (record.status === "uncertain") fail("DURABLE_EFFECT_UNCERTAIN");
      if (record.status === "executing") fail("DURABLE_EFFECT_IN_PROGRESS");
      await journal.beginExecution(commandId); return { status: "prepared" };
    },
    async complete(commandId, response) { const record = await journal.recordResult(commandId, response); return { response: record.response, status: "completed" }; },
    async uncertain(commandId, reason = "effect-result-unconfirmed") { const record = await journal.markUncertain(commandId, reason); if (record.status === "result") return { response: record.response, status: "replayed" }; return { status: "uncertain" }; },
  });
}
