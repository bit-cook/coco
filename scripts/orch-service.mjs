import { createOrchContinuation } from "./orch-continuation.mjs";
import { createOrchInbox } from "./orch-inbox.mjs";
import { createOrchLineage } from "./orch-lineage.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }

export function createOrchService({ agentDir, continuation, inbox, lineage } = {}) {
  if (!agentDir && (!continuation || !inbox || !lineage)) fail("ORCH_SERVICE_CONFIG_INVALID");
  const workInbox = inbox ?? createOrchInbox({ agentDir });
  const workContinuation = continuation ?? createOrchContinuation({ agentDir });
  const workLineage = lineage ?? createOrchLineage({ agentDir });
  return Object.freeze({
    admit: (item) => workInbox.admit(item),
    cancelChild: (childId) => workLineage.cancel(childId),
    completeChild: (childId) => workLineage.complete(childId),
    completeContinuation: (sessionId) => workContinuation.complete(sessionId),
    failChild: (childId) => workLineage.fail(childId),
    next: () => workInbox.peek(),
    pop: () => workInbox.pop(),
    popExpected: (id) => workInbox.popExpected(id),
    registerChild: (parentId, childId) => workLineage.register(parentId, childId),
    recordTurn: (sessionId, tokens) => workContinuation.recordTurn(sessionId, tokens),
    startContinuation: (sessionId, policy) => workContinuation.start(sessionId, policy),
    async status() { return { activeContinuations: (await workContinuation.list()).filter(({ status }) => status === "active").length, inboxSize: await workInbox.size(), lineageSize: (await workLineage.list()).length, schemaVersion: 1 }; },
  });
}
