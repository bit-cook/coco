import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const SAFETY_MODE_SCHEMA_VERSION = 1;

export function registerSafetyModeCharacterization(pi, transcript) {
  if (!pi || typeof pi.on !== "function") throw new TypeError("TOOL_CALL_HANDLER_REQUIRED");
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash" || event.input?.command !== "coco-safety-confirm-probe") return undefined;
    if (!ctx?.hasUI || !ctx.ui || typeof ctx.ui.confirm !== "function") return { block: true, reason: "SAFETY_CONFIRM_UNAVAILABLE" };
    try {
      const allowed = await ctx.ui.confirm("CoCo safety characterization", "Allow the harmless characterization probe?");
      transcript.push({ callback: typeof allowed === "boolean", decision: allowed === true ? "allow" : "deny", handler: "tool_call" });
      return allowed === true ? undefined : { block: true, reason: "SAFETY_CONFIRM_DENIED" };
    } catch {
      transcript.push({ callback: false, decision: "error", handler: "tool_call" });
      return { block: true, reason: "SAFETY_CONFIRM_UNAVAILABLE" };
    }
  });
}

export async function characterizeSafetyMode({ extensionSource, invoke, piVersion }) {
  const source = await readFile(extensionSource);
  const transcript = [];
  const registered = [];
  registerSafetyModeCharacterization({ on(event, handler) { registered.push({ event, handler }); } }, transcript);
  const handler = registered.find((entry) => entry.event === "tool_call")?.handler;
  if (!handler || typeof invoke !== "function") return { interactive: false, reason: "TOOL_CALL_HANDLER_REQUIRED", transcript };
  const allow = await invoke(handler, true);
  const deny = await invoke(handler, false);
  const proven = allow === undefined && deny?.block === true && transcript.length === 2 && transcript[0].decision === "allow" && transcript[0].callback && transcript[1].decision === "deny" && transcript[1].callback;
  return { handlerSha256: createHash("sha256").update(source).digest("hex"), interactive: proven, piVersion, schemaVersion: SAFETY_MODE_SCHEMA_VERSION, transcript };
}
