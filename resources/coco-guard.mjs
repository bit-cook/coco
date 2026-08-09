import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { classifyPath, classifyShell, SAFETY_OUTCOMES } from "../scripts/safety-classifier.mjs";
import { translate } from "./coco-language.mjs";

const DISCLAIMER = "Coco safety guard is best-effort, not a sandbox.";

function reasonFor(classification) {
  return `Coco safety: ${classification.reason}.`;
}

function block(classification, suffix = "Blocked.") {
  return { block: true, reason: `${reasonFor(classification)} ${suffix}` };
}

async function guardToolCall(event, ctx) {
  const classification = isToolCallEventType("write", event) || isToolCallEventType("edit", event)
    ? classifyPath(event.input.path)
    : isToolCallEventType("bash", event)
      ? classifyShell(event.input.command)
      : { outcome: SAFETY_OUTCOMES.ALLOW, reason: "READ_ONLY_OR_UNGUARDED_TOOL" };

  if (classification.outcome === SAFETY_OUTCOMES.BLOCK) return block(classification);
  if (classification.outcome !== SAFETY_OUTCOMES.CONFIRM) return undefined;
  if (!ctx.hasUI || typeof ctx.ui?.confirm !== "function") return block(classification, "Blocked because confirmation is unavailable in this mode.");

  try {
    const allowed = await ctx.ui.confirm(translate("guard.confirmationTitle"), `${reasonFor(classification)} ${translate("guard.allow")}`);
    return allowed === true ? undefined : block(classification, "Blocked because confirmation was denied.");
  } catch {
    return block(classification, "Blocked because confirmation is unavailable.");
  }
}

export { DISCLAIMER, guardToolCall };

export default function cocoGuard(pi) {
  globalThis[Symbol.for("coco.guard.loaded")] = true;
  pi.on("tool_call", guardToolCall);
}
