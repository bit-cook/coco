import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { LEGACY_SYSTEM_SHA256, migrateState } from "./migrate-state.mjs";
import { StateError } from "./state-schema.mjs";

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }
function options(argv) { if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_7_QA_USAGE"); return resolve(argv[3]); }

async function regular(path) {
  try { return await readFile(path); } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return null; throw error; }
}

async function rejects(action, code) {
  try { await action(); } catch (error) { return error instanceof StateError && error.code === code; }
  return false;
}

async function fixture(agent, legacy, sentinel) {
  await mkdir(join(agent, "sessions"), { recursive: true, mode: 0o700 });
  await mkdir(join(agent, "skills"), { recursive: true, mode: 0o700 });
  await writeFile(join(agent, "sessions", "session.jsonl"), "session-bytes\n", { mode: 0o600 });
  await writeFile(join(agent, "skills", "user.md"), "user-bytes\n", { mode: 0o600 });
  await writeFile(join(agent, "SYSTEM.md"), legacy, { mode: 0o600 });
  await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { deepseek: { apiKey: sentinel, custom: { preserved: true } }, idepub: { apiKey: sentinel }, manual: { apiKey: "manual-key", untouched: true } } }, null, 2), { mode: 0o600 });
  await writeFile(join(agent, "auth.json"), canonicalJson({ unknown: { preserve: true } }), { mode: 0o600 });
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const sandbox = await mkdtemp(join(tmpdir(), "coco-task-7-"));
  const agent = join(sandbox, "agent");
  const sentinel = "TASK7_SENTINEL_EXPOSED_KEY";
  const cases = [];
  try {
    const legacy = await readFile(join(root, "resources", "legacy-system-v0.1.0.md"));
    cases.push(result("legacy-fixture-identity", true, legacy.length === 748 && digest(legacy) === LEGACY_SYSTEM_SHA256));
    await fixture(agent, legacy, sentinel);
    const session = await readFile(join(agent, "sessions", "session.jsonl"));
    const skill = await readFile(join(agent, "skills", "user.md"));
    const modelsBefore = await readFile(join(agent, "models.json"));
    const dry = await migrateState({ agentDir: agent, dryRun: true });
    cases.push(result("dry-run-reports-without-write", true, dry.changed.includes("models.json") && digest(modelsBefore) === digest(await readFile(join(agent, "models.json")))));
    const applied = await migrateState({ agentDir: agent });
    const models = JSON.parse(await readFile(join(agent, "models.json"), "utf8"));
    const auth = JSON.parse(await readFile(join(agent, "auth.json"), "utf8"));
    const ownership = JSON.parse(await readFile(join(agent, "ownership.json"), "utf8"));
    const migration = JSON.parse(await readFile(join(agent, "migration.json"), "utf8"));
    const backupFiles = await readdir(join(agent, "backups"));
    const backup = await readFile(join(agent, "backups", backupFiles[0]));
    cases.push(result("credentials-extracted-and-rotation-marked", true, !("apiKey" in models.providers.deepseek) && auth.deepseek.key === sentinel && migration.rotationRequired.includes("deepseek") && applied.rotationRequired.includes("deepseek") && auth.idepub.key === sentinel));
    cases.push(result("unknown-data-and-sessions-preserved", true, models.providers.deepseek.custom.preserved === true && models.providers.manual.apiKey === "manual-key" && auth.unknown.preserve === true && digest(session) === digest(await readFile(join(agent, "sessions", "session.jsonl"))) && digest(skill) === digest(await readFile(join(agent, "skills", "user.md")))));
    cases.push(result("ownership-and-redacted-backup", true, ownership.managedFiles["models.json"].ownedJsonPointers.includes("/providers/idepub/models") && ownership.managedFiles["APPEND_SYSTEM.md"].sourceSha256 === LEGACY_SYSTEM_SHA256 && !backup.includes(sentinel)));
    cases.push(result("owned-system-renamed-byte-exact", true, await regular(join(agent, "SYSTEM.md")) === null && digest(legacy) === digest(await readFile(join(agent, "APPEND_SYSTEM.md"), "utf8"))));
    cases.push(result("auth-mode-0600", 0, (await lstat(join(agent, "auth.json"))).mode & 0o077));
    const rerun = await migrateState({ agentDir: agent });
    cases.push(result("idempotent-rerun", true, rerun.changed.length === 0 && rerun.prompt === "absent"));

    const conflict = join(sandbox, "conflict");
    await fixture(conflict, legacy, sentinel);
    const append = Buffer.from("user append\r\n");
    await writeFile(join(conflict, "APPEND_SYSTEM.md"), append, { mode: 0o600 });
    const conflictSystem = await readFile(join(conflict, "SYSTEM.md"));
    const conflictResult = await migrateState({ agentDir: conflict });
    cases.push(result("append-conflict-preserves-system-and-append", true, conflictResult.prompt === "conflict" && digest(conflictSystem) === digest(await readFile(join(conflict, "SYSTEM.md"))) && digest(append) === digest(await readFile(join(conflict, "APPEND_SYSTEM.md")))));

    const unowned = join(sandbox, "unowned");
    const arbitrary = Buffer.from("arbitrary\r\nprompt\n");
    await fixture(unowned, arbitrary, sentinel);
    const unownedResult = await migrateState({ agentDir: unowned });
    cases.push(result("hash-mismatch-system-unchanged", true, unownedResult.prompt === "unowned" && digest(arbitrary) === digest(await readFile(join(unowned, "SYSTEM.md"))) && await regular(join(unowned, "APPEND_SYSTEM.md")) === null));

    const malformed = join(sandbox, "malformed");
    await fixture(malformed, legacy, sentinel);
    const malformedModels = await readFile(join(malformed, "models.json"));
    await writeFile(join(malformed, "auth.json"), "{broken\n", { mode: 0o600 });
    cases.push(result("malformed-auth-fails-closed", true, await rejects(() => migrateState({ agentDir: malformed }), "AUTH_SCHEMA_INVALID") && digest(malformedModels) === digest(await readFile(join(malformed, "models.json")))));

    const locked = join(sandbox, "locked");
    await fixture(locked, legacy, sentinel);
    await writeFile(join(locked, ".state.lock"), "lock", { mode: 0o600 });
    cases.push(result("lock-fails-without-mutation", true, await rejects(() => migrateState({ agentDir: locked }), "STATE_LOCKED") && digest(legacy) === digest(await readFile(join(locked, "SYSTEM.md")))));

    const evidenceText = JSON.stringify({ cases });
    cases.push(result("evidence-redacts-sentinel", false, evidenceText.includes(sentinel)));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { legacySystemSha256: digest(legacy) }, cases, schemaVersion: 1, status, task: 7 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally { await rm(sandbox, { force: true, recursive: true }); }
}

void main();
