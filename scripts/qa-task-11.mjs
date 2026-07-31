import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { bootstrapState } from "./bootstrap-state.mjs";
import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { coreCheck, coreStatus, doctor } from "./diagnostics.mjs";

function options(argv) { if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_11_QA_USAGE"); return resolve(argv[3]); }
function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }
function shape(value, command) { return value.schemaVersion === 1 && value.command === command && ["healthy", "warning", "fatal", "inconclusive"].includes(value.status) && value.exitCode === (value.status === "fatal" || value.status === "inconclusive" ? 1 : 0) && value.checks.every((check) => typeof check.id === "string" && ["info", "warning", "fatal"].includes(check.severity) && ["pass", "fail", "skipped"].includes(check.status) && typeof check.message === "string"); }

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-11-"));
  const agent = join(fixture, "agent");
  const savedAgent = process.env.COCO_CODING_AGENT_DIR;
  const savedOffline = process.env.PI_OFFLINE;
  const cases = [];
  try {
    process.env.COCO_CODING_AGENT_DIR = agent;
    await bootstrapState({ agentDir: agent, root });
    await mkdir(join(agent, "sessions"), { recursive: true, mode: 0o700 });
    await writeFile(join(agent, "auth.json"), canonicalJson({ idepub: { key: "task-11-secret-sentinel", type: "api_key" } }), { mode: 0o600 });
    await writeFile(join(agent, "migration.json"), canonicalJson({ rotationRequired: ["idepub"], schemaVersion: 1 }), { mode: 0o600 });
    const before = sha256(await readFile(join(agent, "auth.json")));
    const status = await coreStatus({ root });
    cases.push(result("core-status-verifies-local-identity", true, shape(status, "core status") && status.checks.map((entry) => entry.id).join(",") === "CORE_INTEGRITY,CORE_VERSION" && status.checks.every((entry) => entry.status === "pass")));
    const localDoctor = await doctor({ root });
    const serialized = JSON.stringify(localDoctor);
    cases.push(result("doctor-schema-sorted-and-redacted", true, shape(localDoctor, "doctor") && localDoctor.checks.every((entry, index, array) => index === 0 || array[index - 1].id.localeCompare(entry.id) <= 0) && !serialized.includes("task-11-secret-sentinel")));
    cases.push(result("rotation-reports-redacted-warning", true, localDoctor.status === "warning" && localDoctor.exitCode === 0 && localDoctor.checks.some((entry) => entry.id === "AUTH_STATUS" && entry.status === "fail" && entry.details?.provider === "idepub" && entry.details?.rotationRequired === true && entry.details?.present === true && entry.details?.source === "auth")));
    cases.push(result("diagnostics-do-not-mutate-auth", before, sha256(await readFile(join(agent, "auth.json")))));
    await chmod(join(agent, "auth.json"), 0o644);
    const permissions = await doctor({ root });
    cases.push(result("unsafe-secret-permission-is-fatal", true, permissions.status === "fatal" && permissions.exitCode === 1 && permissions.checks.some((entry) => entry.id === "SECRET_PERMISSIONS" && entry.status === "fail" && entry.severity === "fatal")));
    await chmod(join(agent, "auth.json"), 0o600);
    await writeFile(join(agent, "settings.json"), "{broken", { mode: 0o600 });
    const invalid = await doctor({ root });
    cases.push(result("invalid-config-is-fatal", true, invalid.status === "fatal" && invalid.checks.some((entry) => entry.id === "CONFIG_SCHEMA" && entry.status === "fail" && entry.severity === "fatal")));
    process.env.PI_OFFLINE = "1";
    const offline = await coreCheck({ root });
    cases.push(result("offline-core-check-is-inconclusive", true, offline.status === "inconclusive" && offline.exitCode === 1 && offline.checks.some((entry) => entry.id === "CORE_REGISTRY_CHECK" && entry.details?.failureCode === "OFFLINE")));
    const connectivity = await doctor({ connectivity: true, root });
    cases.push(result("doctor-connectivity-is-explicit-and-nonmutating", true, connectivity.checks.some((entry) => entry.id === "PROVIDER_CONNECTIVITY" && entry.status === "skipped" && entry.details?.failureCode === "OFFLINE") && sha256(await readFile(join(agent, "auth.json"))) === before));
    const statusText = JSON.stringify(await coreStatus({ root }));
    cases.push(result("secret-never-appears-in-core-output", false, statusText.includes("task-11-secret-sentinel")));
    const approved = cases.every((entry) => entry.status === "passed");
    await writeFile(evidence, canonicalJson({ artifacts: { coreVersion: "0.82.1" }, cases, schemaVersion: 1, status: approved ? "approved" : "rejected", task: 11 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = approved ? 0 : 1;
  } finally {
    if (savedAgent === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = savedAgent;
    if (savedOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = savedOffline;
    await rm(fixture, { force: true, recursive: true });
  }
}

void main();
