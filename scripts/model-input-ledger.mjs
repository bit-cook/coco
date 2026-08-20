import { createHash } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { inspectRegular } from "./state-paths.mjs";
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
  async function ensureRoot() { await mkdir(root, { recursive: true, mode: 0o700 }); const info = await lstat(root); if (!info.isDirectory() || info.isSymbolicLink() || process.platform !== "win32" && (info.mode & 0o077) !== 0) fail("MODEL_INPUT_DIRECTORY_INVALID"); }
  async function read(requestId) {
    const path = pathFor(requestId); if (await inspectRegular(path) === null) return null;
    try {
      const bytes = await readFile(path, "utf8"), value = JSON.parse(bytes);
      if (canonicalJson(value) !== bytes || value.schemaVersion !== 1 || value.requestId !== requestId || !/^[0-9a-f]{64}$/.test(value.requestSha256 ?? "") || typeof value.recordedAt !== "string" || Number.isNaN(Date.parse(value.recordedAt))) fail("MODEL_INPUT_LEDGER_CORRUPT");
      const projected = projection(value.projection); if (digest(projected.bytes) !== value.requestSha256 || value.generationId !== value.projection.generationId) fail("MODEL_INPUT_LEDGER_CORRUPT"); return value;
    } catch (error) { if (error?.code === "MODEL_INPUT_LEDGER_CORRUPT") throw error; fail("MODEL_INPUT_LEDGER_CORRUPT"); }
  }
  return Object.freeze({
    async recordProviderRequest(requestId, { generationId, model, payload }) {
      if (!model || typeof model.provider !== "string") fail("MODEL_INPUT_PROVIDER_INVALID");
      return this.record(requestId, { generationId, messages: payload?.messages ?? payload?.input ?? [], provider: model.provider, systemPrompt: payload?.system ?? payload?.instructions ?? null, tools: payload?.tools ?? [] });
    },
    async record(requestId, value) {
      const request = id(requestId), { bytes, value: normalized } = projection(value), requestSha256 = digest(bytes), path = pathFor(request);
      await ensureRoot(); let result;
      for (let attempt = 0; attempt < 100; attempt += 1) try {
        await applyStateTransaction({ agentDir, operations: async () => {
          const current = await read(request);
          if (current) { if (current.requestSha256 !== requestSha256) fail("MODEL_INPUT_DIGEST_CONFLICT"); result = structuredClone(current); return [{ bytes: Buffer.from(canonicalJson(current)), path }]; }
          result = { generationId: normalized.generationId, recordedAt: new Date().toISOString(), requestId: request, requestSha256, schemaVersion: 1, projection: normalized };
          return [{ bytes: Buffer.from(canonicalJson(result)), path }];
        } });
        break;
      } catch (error) { if (error?.code !== "STATE_LOCKED" || attempt === 99) throw error; await new Promise((done) => setTimeout(done, 10)); }
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
