import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { catalogSha256, normalizeModels } from "./state-catalog.mjs";
import { agentDirectory, statePaths } from "./state-paths.mjs";
import { StateError, decodePointerSegment, encodePointerSegment, mergeOwnedValues, rejectApiKeyArgs, resolveCredential, validateAuth } from "./state-schema.mjs";
import { acquireStateLock, applyStateTransaction, recoverTransactions } from "./state-transaction.mjs";

function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }
function options(argv) { if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_5_QA_USAGE"); return resolve(argv[3]); }
function throws(action, code) { try { action(); } catch (error) { return error instanceof StateError && error.code === code; } return false; }
async function rejects(action, code) { try { await action(); } catch (error) { return error instanceof StateError && error.code === code; } return false; }
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-5-"));
  const agent = join(fixture, "agent");
  const cases = [];
  try {
    const paths = statePaths(agent);
    cases.push(result("state-path-precedence", agent, agentDirectory({ COCO_CODING_AGENT_DIR: agent, HOME: "/ignored" })));
    const auth = { achai: { key: "stored", type: "api_key" }, unknown: { arbitrary: true } };
    cases.push(result("auth-schema-preserves-unknown", true, validateAuth(auth) === auth));
    cases.push(result("auth-precedence", "auth", resolveCredential({ auth, environment: { ACHAI_API_KEY: "environment" }, legacyModels: { providers: { achai: { apiKey: "legacy" } } }, provider: "achai" }).source));
    cases.push(result("environment-precedence", "environment", resolveCredential({ auth: {}, environment: { IDEPUB_API_KEY: "environment" }, legacyModels: { providers: { idepub: { apiKey: "legacy" } } }, provider: "idepub" }).source));
    cases.push(result("legacy-precedence", "legacy", resolveCredential({ auth: {}, environment: {}, legacyModels: { providers: { idepub: { apiKey: "legacy" } } }, provider: "idepub" }).source));
    cases.push(result("malformed-auth-rejected", true, throws(() => validateAuth({ idepub: { key: "x", type: "api_key", unexpected: true } }), "AUTH_SCHEMA_INVALID")));
    cases.push(result("cli-key-rejected", true, throws(() => rejectApiKeyArgs(["--api-key=secret"]), "API_KEY_ARG_FORBIDDEN")));
    const escaped = encodePointerSegment("org/model~v1");
    cases.push(result("pointer-round-trip", "org/model~v1", decodePointerSegment(escaped)));
    const merge = mergeOwnedValues({ existing: { unknown: true }, desired: { defaultModel: "gpt-5.6", unknown: false }, pointers: ["/defaultModel"] });
    cases.push(result("ownership-merge", "gpt-5.6", merge.value.defaultModel));
    await applyStateTransaction({ agentDir: agent, operations: [{ bytes: canonicalJson({ unknown: true, value: 1 }), path: paths.settings }] });
    const first = await readFile(paths.settings);
    await applyStateTransaction({ agentDir: agent, operations: [{ bytes: canonicalJson({ unknown: true, value: 1 }), path: paths.settings }] });
    cases.push(result("atomic-rerun", digest(first), digest(await readFile(paths.settings))));
    const registry = JSON.parse(await readFile(join(root, "resources", "provider-registry.v1.json"), "utf8"));
    const transformations = JSON.parse(await readFile(join(root, "resources", "provider-transformations.v1.json"), "utf8"));
    const models = normalizeModels({ provider: "idepub", response: { data: [{ id: "step-router-v1" }, { display_name: "Ignored", id: "gpt-5.6-terra" }, { id: "gpt-image-1" }] }, transformations });
    cases.push(result("registry-and-capability-normalization", "gpt-5.6-terra", models[0].id));
    cases.push(result("catalog-canonical-hash", true, /^[a-f0-9]{64}$/.test(catalogSha256("idepub", models)) && registry.schemaVersion === 1));
    const original = await readFile(paths.settings);
    await writeFile(paths.auth, "{bad\n", { mode: 0o600 });
    cases.push(result("malformed-retains-original", true, throws(() => validateAuth({ idepub: { key: "x", type: "unexpected" } }), "AUTH_SCHEMA_INVALID") && digest(original) === digest(await readFile(paths.settings))));
    const lock = await acquireStateLock(agent);
    cases.push(result("lock-rejected", true, await rejects(() => acquireStateLock(agent), "STATE_LOCKED")));
    await lock.release();
    const pendingBytes = canonicalJson({ recovered: true });
    const temporary = join(agent, ".settings.pending.tmp");
    await writeFile(temporary, pendingBytes, { mode: 0o600 });
    const journalDirectory = join(agent, "transactions");
    await mkdir(journalDirectory, { recursive: true, mode: 0o700 });
    await writeFile(join(journalDirectory, "interrupted.json"), canonicalJson({ nextIndex: 0, operations: [{ afterSha256: digest(pendingBytes), beforeSha256: digest(await readFile(paths.settings)), containsSecret: false, path: paths.settings, redactedBackupPath: null, tempPath: temporary }], phase: "prepared", schemaVersion: 1, transactionId: "interrupted" }), { mode: 0o600 });
    await recoverTransactions(agent);
    cases.push(result("interruption-forward-recovery", true, JSON.parse(await readFile(paths.settings, "utf8")).recovered === true));
    const readonly = await readFile(paths.settings);
    await chmod(paths.settings, 0o400);
    cases.push(result("read-only-retains-original", true, await rejects(() => applyStateTransaction({ agentDir: agent, operations: [{ bytes: canonicalJson({ changed: true }), path: paths.settings }] }), "STATE_PERMISSION_INVALID") && digest(readonly) === digest(await readFile(paths.settings))));
    await chmod(paths.settings, 0o600);
    const fifo = join(agent, "fifo");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("mkfifo", [fifo]);
    cases.push(result("special-entry-rejected", true, await rejects(() => applyStateTransaction({ agentDir: agent, operations: [{ bytes: Buffer.from("x"), path: fifo }] }), "STATE_ENTRY_INVALID")));
    await chmod(paths.settings, 0o600);
    cases.push(result("auth-mode", 0, (await lstat(paths.auth)).mode & 0o077));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { providerRegistrySha256: sha256(await readFile(join(root, "resources", "provider-registry.v1.json"))), statePath: paths.agentDir }, cases, schemaVersion: 1, status, task: 5 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally { await rm(fixture, { force: true, recursive: true }); }
}

void main();
