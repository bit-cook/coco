import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { applyStateTransaction } from "./state-transaction.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function id(value) { if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) fail("MODEL_INPUT_ID_INVALID"); return value; }
function projection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "generationId,messages,provider,systemPrompt,tools") fail("MODEL_INPUT_PROJECTION_INVALID");
  const bytes = Buffer.from(canonicalJson(value)); if (bytes.length > MAX_BYTES) fail("MODEL_INPUT_TOO_LARGE");
  return { bytes, value };
}
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function createModelInputLedger({ agentDir }) {
  const root = join(agentDir, "model-input-ledger");
  const pathFor = (requestId) => join(root, `${id(requestId)}.json`);
  async function read(requestId) { try { return JSON.parse(await readFile(pathFor(requestId), "utf8")); } catch (error) { if (error?.code === "ENOENT") return null; throw error; } }
  return Object.freeze({
    async recordProviderRequest(requestId, { generationId, model, payload }) {
      if (!model || typeof model.provider !== "string") fail("MODEL_INPUT_PROVIDER_INVALID");
      return this.record(requestId, { generationId, messages: payload?.messages ?? payload?.input ?? [], provider: model.provider, systemPrompt: payload?.system ?? payload?.instructions ?? null, tools: payload?.tools ?? [] });
    },
    async record(requestId, value) {
      const request = id(requestId), { bytes, value: normalized } = projection(value), requestSha256 = digest(bytes), path = pathFor(request);
      await mkdir(root, { recursive: true, mode: 0o700 }); let result;
      await applyStateTransaction({ agentDir, operations: async () => {
        const current = await read(request);
        if (current) { if (current.requestSha256 !== requestSha256) fail("MODEL_INPUT_DIGEST_CONFLICT"); result = structuredClone(current); return [{ bytes: Buffer.from(canonicalJson(current)), path }]; }
        result = { generationId: normalized.generationId, recordedAt: new Date().toISOString(), requestId: request, requestSha256, schemaVersion: 1, projection: normalized };
        return [{ bytes: Buffer.from(canonicalJson(result)), path }];
      } });
      return { generationId: result.generationId, requestId: result.requestId, requestSha256: result.requestSha256, schemaVersion: 1 };
    },
    read,
    async verify(requestId, value) {
      const current = await read(requestId); if (!current) fail("MODEL_INPUT_NOT_FOUND");
      const { bytes } = projection(value); if (digest(bytes) !== current.requestSha256) fail("MODEL_INPUT_DIGEST_MISMATCH");
      return { generationId: current.generationId, requestId: current.requestId, requestSha256: current.requestSha256, schemaVersion: 1, status: "verified" };
    },
  });
}
