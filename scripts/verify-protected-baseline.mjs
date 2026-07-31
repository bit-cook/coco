import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { VerificationError, readCanonicalJson, sha256 } from "./canonical-json.mjs";

const ROOTS = { "coco-agent": "/root/.coco/agent", "global-pi": "/root/.bun/install/global/node_modules/@earendil-works/pi-coding-agent", opencode: "/root/.config/opencode" };
const TOP = ["createdAtUtc", "entries", "platform", "reparse", "root", "rootIdentities", "schemaVersion"];
const ENTRY = ["comparison", "mode", "path", "policy", "rootId", "sha256", "size", "symlinkTarget", "type"];
const IDENTITY = ["absolutePath", "id", "posixDev", "posixIno", "reparse", "windowsFileId", "windowsVolumeSerial"];
const TYPES = new Set(["directory", "file", "symlink"]);

function keys(value, expected) { return value !== null && typeof value === "object" && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key)); }
function pathValid(path) { return typeof path === "string" && (path === "" || (!path.startsWith("/") && path.split("/").every((part) => part !== "" && part !== "." && part !== ".."))); }
function classified(entry) {
  if (entry.path === "" || entry.rootId !== "coco-agent") return ["immutable", "exact"];
  if (entry.path === "auth.json") return ["managed-mutation", "managed-secret"];
  if (["settings.json", "models.json", "ownership.json"].includes(entry.path)) return ["managed-mutation", "managed-json"];
  if (entry.path.startsWith("catalogs/") || entry.path.startsWith("transactions/") || entry.path.startsWith("backups/") || entry.path === "APPEND_SYSTEM.md") return ["managed-mutation", "lifecycle"];
  if (entry.path === "SYSTEM.md" && entry.sha256 === "96132c8e262880d041b57891a69a4a6efc40a60864d64cbc5021af9427d67e5e" && entry.size === 748) return ["legacy-system-transition", "exact"];
  return ["immutable", "exact"];
}
function validEntry(entry) {
  if (!keys(entry, ENTRY) || !Object.hasOwn(ROOTS, entry.rootId) || !TYPES.has(entry.type) || !pathValid(entry.path) || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) return false;
  if (entry.type === "directory" && (entry.sha256 !== null || entry.size !== null || entry.symlinkTarget !== null)) return false;
  if (entry.type === "symlink" && (entry.sha256 !== null || entry.size !== null || typeof entry.symlinkTarget !== "string")) return false;
  if (entry.type === "file" && (entry.symlinkTarget !== null || ((entry.rootId === "coco-agent" && entry.path === "auth.json") ? entry.sha256 !== null || entry.size !== null : !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 0))) return false;
  const [policy, comparison] = classified(entry);
  return entry.policy === policy && entry.comparison === comparison;
}
function validIdentity(identity, id) {
  return keys(identity, IDENTITY) && identity.id === id && identity.absolutePath === ROOTS[id] && identity.reparse === false && typeof identity.posixDev === "string" && /^\d+$/.test(identity.posixDev) && typeof identity.posixIno === "string" && /^\d+$/.test(identity.posixIno) && identity.windowsFileId === null && identity.windowsVolumeSerial === null;
}
export function validBaseline(value) {
  if (!keys(value, TOP) || value.schemaVersion !== 1 || value.platform !== "linux" || value.root !== null || value.reparse !== false || typeof value.createdAtUtc !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value.createdAtUtc) || !Array.isArray(value.entries) || !Array.isArray(value.rootIdentities)) return false;
  if (value.rootIdentities.length !== 3 || !["opencode", "coco-agent", "global-pi"].every((id, index) => validIdentity(value.rootIdentities[index], id))) return false;
  const seen = new Set();
  return value.entries.length > 0 && value.entries.every((entry) => { const key = `${entry.rootId}\0${entry.path}`; if (seen.has(key)) return false; seen.add(key); return validEntry(entry); }) && value.entries.every((entry, index, entries) => index === 0 || Buffer.compare(Buffer.from(`${entries[index - 1].rootId}\0${entries[index - 1].path}`), Buffer.from(`${entry.rootId}\0${entry.path}`)) < 0) && [...Object.keys(ROOTS)].every((id) => seen.has(`${id}\0`));
}
function rejected(code) { return { code, status: "rejected" }; }
export async function verifyBaseline({ baselinePath }) {
  try {
    const stat = await lstat(baselinePath); if (!stat.isFile() || stat.isSymbolicLink()) return rejected("BASELINE_FILE_INVALID");
    const sidecar = join(dirname(baselinePath), `${basename(baselinePath)}.sha256`); const sidecarStat = await lstat(sidecar); if (!sidecarStat.isFile() || sidecarStat.isSymbolicLink()) return rejected("BASELINE_SIDECAR_INVALID");
    const { bytes, parsed } = await readCanonicalJson(baselinePath, "BASELINE_CANONICAL_INVALID"); if (!validBaseline(parsed)) return rejected("BASELINE_SCHEMA_INVALID");
    if ((await readFile(sidecar, "utf8")) !== `${sha256(bytes)}  ${basename(baselinePath)}\n`) return rejected("BASELINE_SIDECAR_INVALID");
    return { entries: parsed.entries.length, sha256: sha256(bytes), status: "approved" };
  } catch (error) { return rejected(error instanceof VerificationError ? error.code : "BASELINE_UNAVAILABLE"); }
}
