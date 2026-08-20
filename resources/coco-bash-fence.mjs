import { getAgentDir, isBashToolResult, isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { createCommandRecoveryJournal } from "../scripts/command-recovery-journal.mjs";
import { createDurableEffectLifecycle } from "../scripts/durable-effect-fence.mjs";

export default function cocoBashFence(pi, options = {}) {
  let lifecycle;
  pi.on("session_start", async () => { const journal = createCommandRecoveryJournal({ directory: `${options.agentDir ?? getAgentDir()}/command-recovery/bash` }); await journal.recover(); lifecycle = createDurableEffectLifecycle({ journal }); });
  pi.on("tool_call", async (event) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    try { const result = await lifecycle.begin({ commandId: event.toolCallId, effectGeneration: 1, operationId: "bash.call", request: event.input }); return result.status === "replayed" ? { block: true, reason: "BASH_EFFECT_ALREADY_RECORDED" } : undefined; }
    catch (error) { return { block: true, reason: error?.code ?? "BASH_EFFECT_FENCE_FAILED" }; }
  });
  pi.on("tool_result", async (event) => {
    if (!isBashToolResult(event)) return undefined;
    try { await lifecycle.complete(event.toolCallId, { content: event.content, details: event.details, isError: event.isError }); return undefined; }
    catch { await lifecycle.uncertain(event.toolCallId); return { content: [{ type: "text", text: "BASH_EFFECT_OUTCOME_UNCERTAIN" }], details: { code: "BASH_EFFECT_OUTCOME_UNCERTAIN" }, isError: true }; }
  });
}
