const KEY = /^[a-f0-9]{64}-node[0-9]+-[a-z0-9]+-[a-z0-9]+$/;
function completionValid(value, key, manifestHash) { return value && value.schemaVersion === 1 && value.key === key && value.manifestHash === manifestHash; }
function storageBudgetValid({ availableBytes, availableInodes, minimumBytes = 64 * 1024 * 1024, minimumInodes = 1024 }) { return Number.isSafeInteger(availableBytes) && availableBytes >= minimumBytes && Number.isSafeInteger(availableInodes) && availableInodes >= minimumInodes; }

function collectRuntimeNames({ currentKey, references = new Set(), activeKeys = new Set(), now, entries, graceMs = 24 * 60 * 60 * 1000, staleMs = 60_000 }) {
  const remove = [];
  for (const entry of entries) {
    if (entry.name.endsWith(".lock") || entry.name.includes(".lock-")) continue;
    if (entry.name.startsWith(".staging-")) { if (now - entry.mtimeMs > staleMs) remove.push(entry.path); continue; }
    if (!entry.directory) continue;
    if (entry.name === ".leases" || entry.name === currentKey || !KEY.test(entry.name) || references.has(entry.path) || activeKeys.has(entry.name)) continue;
    if (now - entry.mtimeMs > graceMs) remove.push(entry.path);
  }
  return remove;
}

module.exports = { KEY, collectRuntimeNames, completionValid, storageBudgetValid };
