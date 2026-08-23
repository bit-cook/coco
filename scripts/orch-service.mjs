import { createOrchContinuation } from "./orch-continuation.mjs";
import { createOrchInbox } from "./orch-inbox.mjs";
import { createOrchLineage } from "./orch-lineage.mjs";
import { createOrchChildAdmission } from "./orch-child-admission.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }

export function createOrchService({ agentDir, childAdmission, continuation, inbox, lineage } = {}) {
  if (!agentDir && (!continuation || !inbox || !lineage)) fail("ORCH_SERVICE_CONFIG_INVALID");
  const workInbox = inbox ?? createOrchInbox({ agentDir });
  const workContinuation = continuation ?? createOrchContinuation({ agentDir });
  const workLineage = lineage ?? createOrchLineage({ agentDir });
  const workChildAdmission = childAdmission ?? (agentDir ? createOrchChildAdmission({ agentDir }) : null);
  return Object.freeze({
    admit: (item) => workInbox.admit(item),
    configureParent: (parentId, budget) => { if (!workChildAdmission) throw new Error("ORCH_CHILD_ADMISSION_UNAVAILABLE"); return workChildAdmission.configure(parentId, budget); },
    reserveChild: (parentId, childId, cost) => { if (!workChildAdmission) throw new Error("ORCH_CHILD_ADMISSION_UNAVAILABLE"); return workChildAdmission.reserve(parentId, childId, cost); },
    commitChild: (parentId, childId) => { if (!workChildAdmission) throw new Error("ORCH_CHILD_ADMISSION_UNAVAILABLE"); return workChildAdmission.commit(parentId, childId); },
    releaseChild: (parentId, childId) => { if (!workChildAdmission) throw new Error("ORCH_CHILD_ADMISSION_UNAVAILABLE"); return workChildAdmission.release(parentId, childId); },
    cancelChild: (childId) => workLineage.cancel(childId),
    completeChild: (childId) => workLineage.complete(childId),
    completeContinuation: (sessionId) => workContinuation.complete(sessionId),
    failChild: (childId) => workLineage.fail(childId),
    next: () => workInbox.peek(),
    parent: (childId) => workLineage.parent(childId),
    pop: () => workInbox.pop(),
    popExpected: (id) => workInbox.popExpected(id),
    removeSource: (source) => workInbox.removeSource(source),
    registerChild: (parentId, childId) => workLineage.register(parentId, childId),
    recordTurn: (sessionId, tokens) => workContinuation.recordTurn(sessionId, tokens),
    startContinuation: (sessionId, policy) => workContinuation.start(sessionId, policy),
    async status() { return { activeContinuations: (await workContinuation.list()).filter(({ status }) => status === "active").length, inboxSize: await workInbox.size(), lineageSize: (await workLineage.list()).length, schemaVersion: 1 }; },
  });
}
