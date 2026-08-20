import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";
import { ensureAgentDirectory, inspectRegular, statePaths } from "./state-paths.mjs";
import { atomicReplace } from "./state-transaction.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }
const empty = () => ({ generationCounter: 0, generationId: null, revision: 0, schemaVersion: 1 });
function valid(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === "generationCounter,generationId,revision,schemaVersion"
    && value.schemaVersion === 1 && Number.isSafeInteger(value.generationCounter) && value.generationCounter >= 0 && Number.isSafeInteger(value.revision) && value.revision >= 0
    && (value.generationId === null || value.generationId === `generation-${value.generationCounter}`);
}

export function createRuntimeGenerationState({ agentDir }) {
  const path = statePaths(agentDir).runtimeGenerations;
  return Object.freeze({
    async load() {
      await ensureAgentDirectory(agentDir); if (await inspectRegular(path) === null) return empty();
      let value; try { const bytes = await readFile(path, "utf8"); value = JSON.parse(bytes); if (canonicalJson(value) !== bytes) fail("RUNTIME_GENERATION_STATE_INVALID"); } catch (error) { if (error?.code === "RUNTIME_GENERATION_STATE_INVALID") throw error; fail("RUNTIME_GENERATION_STATE_INVALID"); }
      if (!valid(value)) fail("RUNTIME_GENERATION_STATE_INVALID"); return structuredClone(value);
    },
    async write(snapshot) {
      const value = { generationCounter: snapshot?.generationCounter, generationId: snapshot?.generationId, revision: snapshot?.revision, schemaVersion: 1 };
      if (!valid(value) || value.generationId === null) fail("RUNTIME_GENERATION_STATE_INVALID");
      await atomicReplace({ agentDir, bytes: canonicalJson(value), path }); return structuredClone(value);
    },
  });
}
