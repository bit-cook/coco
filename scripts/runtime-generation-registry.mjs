function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function prepared(value) {
  if (!plain(value) || Object.keys(value).sort().join(",") !== "mcp,provider" || !plain(value.provider) || !plain(value.mcp)) fail("RUNTIME_GENERATION_INVALID");
  return Object.freeze({ mcp: value.mcp, provider: value.provider });
}

export function bindGenerationRequest(lease, providerId, request) {
  if (!lease || typeof lease.generationId !== "string" || !Number.isSafeInteger(lease.revision) || typeof lease.provider?.preflight !== "function") fail("RUNTIME_GENERATION_LEASE_INVALID");
  const preflight = lease.provider.preflight(providerId, request);
  const binding = { generationId: lease.generationId, generationRevision: lease.revision, preflight, schemaVersion: 1, status: "approved" };
  return Object.freeze({ ...binding, bindingSha256: createHash("sha256").update(canonicalJson(binding)).digest("hex") });
}

export function createRuntimeGenerationRegistry({ dispose = async () => {}, initial, maxGenerations = 3, prepare }) {
  if (typeof prepare !== "function" || typeof dispose !== "function" || !Number.isSafeInteger(maxGenerations) || maxGenerations < 2 || maxGenerations > 10) fail("RUNTIME_GENERATION_CONFIG_INVALID");
  const records = new Map(); let currentId = null, generation = 0, revision = 0, queue = Promise.resolve(), closed = false;

  const serialized = (operation) => { const result = queue.then(operation, operation); queue = result.catch(() => {}); return result; };
  async function cleanup() {
    const candidates = [...records.values()].filter((record) => record.id !== currentId && record.refs === 0).sort((left, right) => left.createdOrder - right.createdOrder);
    for (const record of candidates) if (record.resources) { const resources = record.resources; record.resources = null; await Promise.resolve(dispose(resources)).catch(() => {}); }
    while (records.size > maxGenerations && candidates.length > 0) {
      records.delete(candidates.shift().id);
    }
  }
  async function commit(source, expectedRevision) {
    if (closed) fail("RUNTIME_GENERATION_CLOSED");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== revision) fail("RUNTIME_GENERATION_REVISION_CONFLICT");
    const resources = prepared(await prepare(structuredClone(source)));
    if (expectedRevision !== revision) { await dispose(resources); fail("RUNTIME_GENERATION_REVISION_CONFLICT"); }
    generation += 1; revision += 1;
    const id = `generation-${generation}`;
    records.set(id, { createdOrder: generation, id, refs: 0, resources, source: structuredClone(source) }); currentId = id;
    await cleanup(); return snapshot();
  }
  function snapshot() {
    return Object.freeze({ generationId: currentId, retained: Object.freeze([...records.keys()]), revision, schemaVersion: 1 });
  }
  async function initialize() {
    if (currentId) return snapshot();
    if (initial === undefined) return snapshot();
    return commit(initial, 0);
  }
  async function publish(source, { expectedRevision } = {}) { return serialized(() => commit(source, expectedRevision)); }
  async function rollback(generationId, { expectedRevision } = {}) {
    return serialized(async () => {
      const target = records.get(generationId); if (!target) fail("RUNTIME_GENERATION_NOT_FOUND");
      return commit(target.source, expectedRevision);
    });
  }
  function acquire() {
    if (closed || !currentId) fail("RUNTIME_GENERATION_UNAVAILABLE");
    const record = records.get(currentId); record.refs += 1; let released = false;
    return Object.freeze({
      generationId: record.id,
      mcp: record.resources.mcp,
      provider: record.resources.provider,
      revision,
      async release() { if (released) return; released = true; record.refs -= 1; await serialized(cleanup); },
      schemaVersion: 1,
    });
  }
  function assertCurrent(generationId) { if (generationId !== currentId) fail("RUNTIME_GENERATION_STALE"); return true; }
  async function close() {
    return serialized(async () => {
      closed = true;
      if ([...records.values()].some(({ refs }) => refs > 0)) fail("RUNTIME_GENERATION_IN_USE");
      for (const record of records.values()) if (record.resources) await dispose(record.resources);
      records.clear(); currentId = null;
    });
  }

  return Object.freeze({ acquire, assertCurrent, close, initialize, publish, rollback, snapshot });
}
import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.mjs";
