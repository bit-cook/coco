import { createOrchService } from "./orch-service.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }

export function createOrchChildService({ agentDir, orchestration, root, startRunner, taskStore } = {}) {
  if (!taskStore || typeof taskStore.create !== "function" || typeof taskStore.update !== "function") fail("ORCH_CHILD_SERVICE_CONFIG_INVALID");
  const service = orchestration ?? createOrchService({ agentDir });
  return Object.freeze({
    async createChild({ cost, cwd, parentId, priority = 10, prompt, worktree = false }) {
      if (typeof prompt !== "string" || prompt.trim().length === 0) fail("ORCH_CHILD_PROMPT_INVALID");
      const task = await taskStore.create({ cwd, initialStatus: "blocked", prompt, trigger: "child", worktree });
      let reserved = false, lineage = false, admitted = false;
      try {
        let reservation; try { reservation = await service.reserveChild(parentId, task.id, cost); } catch (error) { if (["ORCH_CHILD_BUDGET_EXCEEDED", "ORCH_CHILD_LIMIT_EXCEEDED"].includes(error?.code)) return { admitted: false, reason: error.code, task }; throw error; } if (!reservation.admitted) return { admitted: false, reason: reservation.reason, task };
        reserved = true; await service.registerChild(parentId, task.id); lineage = true;
        const inbox = await service.admit({ category: "child", createdAt: new Date().toISOString(), id: `child-${task.id}`, priority, source: task.id });
        if (!inbox.admitted) fail("ORCH_CHILD_INBOX_REJECTED"); admitted = true; await service.commitChild(parentId, task.id);
        const queued = await taskStore.update((state) => { const target = state.tasks.find(({ id }) => id === task.id); if (!target || target.status !== "blocked") fail("ORCH_CHILD_TASK_STATE_INVALID"); target.status = "queued"; target.updatedAt = new Date().toISOString(); return state; });
        try { if (typeof startRunner === "function") await startRunner({ agentDir, root }); } catch {}
        return { admitted: true, task: queued.tasks.find(({ id }) => id === task.id) ?? queued };
      } catch (error) {
        if (admitted) await service.removeSource?.(task.id).catch(() => {});
        if (lineage) await service.cancelChild(task.id).catch(() => {});
        if (reserved) await service.releaseChild(parentId, task.id).catch(() => {});
        await taskStore.update((state) => { const target = state.tasks.find(({ id }) => id === task.id); if (target?.status === "blocked") { target.lastError = error?.code ?? "ORCH_CHILD_ADMISSION_FAILED"; target.updatedAt = new Date().toISOString(); } return state; }).catch(() => {});
        throw error;
      }
    },
  });
}
