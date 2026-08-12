import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { bootstrapState } from "./bootstrap-state.mjs";
import { canonicalJson } from "./canonical-json.mjs";

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function options(argv) { if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_10_QA_USAGE"); return resolve(argv[3]); }
function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-10-"));
  const cases = [];
  try {
    const agent = join(fixture, "empty");
    const dry = await bootstrapState({ agentDir: agent, dryRun: true, root });
    cases.push(result("dry-run-plans-without-write", true, dry.status === "planned" && dry.created.includes("APPEND_SYSTEM.md")));
    const applied = await bootstrapState({ agentDir: agent, root });
    const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
    const models = JSON.parse(await readFile(join(agent, "models.json"), "utf8"));
    const ownership = JSON.parse(await readFile(join(agent, "ownership.json"), "utf8"));
    const guidance = await readFile(join(root, "resources", "append-system-v1.md"));
    cases.push(result("empty-state-creates-owned-defaults", true, applied.status === "applied" && settings.defaultProvider === "agnes" && settings.defaultModel === "agnes-2.5-flash" && settings.defaultThinkingLevel === "max" && models.providers.idepub.models.some((model) => model.id === "gpt-5.6") && models.providers.agnes.models.some((model) => model.id === "agnes-2.5-flash") && ownership.managedFiles["APPEND_SYSTEM.md"].sourceSha256 === digest(guidance)));
    cases.push(result("owned-append-is-created-once", true, digest(guidance) === digest(await readFile(join(agent, "APPEND_SYSTEM.md"))) && (await bootstrapState({ agentDir: agent, root })).status === "noop"));

    const system = join(fixture, "system");
    await mkdir(system, { recursive: true, mode: 0o700 });
    const override = Buffer.from("user system override\n");
    await writeFile(join(system, "SYSTEM.md"), override, { mode: 0o600 });
    const systemResult = await bootstrapState({ agentDir: system, root });
    cases.push(result("unowned-system-suppresses-append", true, systemResult.warnings.includes("UNOWNED_SYSTEM_OVERRIDE") && systemResult.skipped.includes("APPEND_SYSTEM.md") && digest(override) === digest(await readFile(join(system, "SYSTEM.md")))));

    const drift = join(fixture, "drift");
    await bootstrapState({ agentDir: drift, root });
    const altered = Buffer.from("user altered append\n");
    await writeFile(join(drift, "APPEND_SYSTEM.md"), altered, { mode: 0o600 });
    const driftResult = await bootstrapState({ agentDir: drift, root });
    cases.push(result("drifted-owned-append-is-preserved", true, driftResult.warnings.includes("OWNED_APPEND_DRIFT") && driftResult.skipped.includes("APPEND_SYSTEM.md") && digest(altered) === digest(await readFile(join(drift, "APPEND_SYSTEM.md")))));

    const conflict = join(fixture, "conflict");
    await mkdir(conflict, { recursive: true, mode: 0o700 });
    await writeFile(join(conflict, "settings.json"), canonicalJson({ defaultModel: "manual-model", theme: "dark" }), { mode: 0o600 });
    const conflictResult = await bootstrapState({ agentDir: conflict, root });
    const conflictSettings = JSON.parse(await readFile(join(conflict, "settings.json"), "utf8"));
    cases.push(result("settings-conflicts-stay-user-owned", true, conflictResult.skipped.includes("/defaultModel") && conflictResult.warnings.includes("SETTING_CONFLICT:/defaultModel") && conflictSettings.defaultModel === "manual-model" && conflictSettings.theme === "dark" && conflictSettings.defaultProvider === "idepub"));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { guidanceSha256: digest(guidance) }, cases, schemaVersion: 1, status, task: 10 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally { await rm(fixture, { force: true, recursive: true }); }
}

void main();
