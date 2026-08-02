import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { getAuthStatus, parseStdinKey, removeAuthKey, setAuthKey } from "./auth-management.mjs";
import { canonicalJson } from "./canonical-json.mjs";
import { dispatchCoco } from "./coco-dispatcher.mjs";
import { StateError, resolveCredential } from "./state-schema.mjs";

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_8_QA_USAGE");
  return resolve(argv[3]);
}

function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }

async function rejects(action, code) {
  try { await action(); } catch (error) { return error instanceof StateError && error.code === code; }
  return false;
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const sandbox = await mkdtemp(join(tmpdir(), "coco-task-8-"));
  const agent = join(sandbox, "agent");
  const sentinel = "TASK8_SECRET_MUST_NOT_LEAK";
  const cases = [];
  try {
    await mkdir(agent, { recursive: true, mode: 0o700 });
    await writeFile(join(agent, "auth.json"), canonicalJson({ achai: { env: { PRESERVE_ME: "yes" }, key: "old", type: "api_key" }, unknown: { preserve: true } }), { mode: 0o600 });
    await writeFile(join(agent, "migration.json"), canonicalJson({ rotationRequired: ["achai", "idepub"], schemaVersion: 1 }), { mode: 0o600 });

    cases.push(result("stdin-framing", true, parseStdinKey(Buffer.from(`${sentinel}\r\n`)) === sentinel));
    await setAuthKey({ agentDir: agent, key: sentinel, provider: "achai" });
    const auth = JSON.parse(await readFile(join(agent, "auth.json"), "utf8"));
    const migration = JSON.parse(await readFile(join(agent, "migration.json"), "utf8"));
    cases.push(result("set-preserves-env-and-unknown-clears-rotation", true, auth.achai.env.PRESERVE_ME === "yes" && auth.unknown.preserve && !migration.rotationRequired.includes("achai") && migration.rotationRequired.includes("idepub")));
    cases.push(result("auth-file-private", 0, (await lstat(join(agent, "auth.json"))).mode & 0o077));
    const [stored] = await getAuthStatus({ agentDir: agent, environment: { ACHAI_API_KEY: "environment" }, provider: "achai" });
    cases.push(result("status-redacts-auth-precedence", true, stored.available && stored.source === "auth" && !JSON.stringify(stored).includes(sentinel)));
    const precedence = resolveCredential({ auth, environment: { ACHAI_API_KEY: "environment" }, legacyModels: { providers: { achai: { apiKey: "legacy" } } }, provider: "achai" });
    cases.push(result("credential-precedence", "auth", precedence.source));
    const removed = await removeAuthKey({ agentDir: agent, environment: { ACHAI_API_KEY: "environment" }, provider: "achai" });
    cases.push(result("remove-uses-environment-and-keeps-rotation", true, removed.available && removed.source === "environment" && (await getAuthStatus({ agentDir: agent, provider: "idepub" }))[0].rotationRequired));
    const unavailable = await removeAuthKey({ agentDir: agent, provider: "achai" });
    cases.push(result("remove-without-environment-unavailable", true, !unavailable.available && unavailable.source === "none"));
    cases.push(result("invalid-keys-rejected", true, await rejects(() => Promise.resolve(parseStdinKey(Buffer.from("\n"))), "AUTH_KEY_INVALID") && await rejects(() => Promise.resolve(parseStdinKey(Buffer.from(" key"))), "AUTH_KEY_INVALID")));
    await setAuthKey({ agentDir: agent, key: "deepseek-stored", provider: "deepseek" });
    const [deepseek] = await getAuthStatus({ agentDir: agent, environment: { DEEPSEEK_API_KEY: "environment" }, provider: "deepseek" });
    const deepseekRemoved = await removeAuthKey({ agentDir: agent, environment: { DEEPSEEK_API_KEY: "environment" }, provider: "deepseek" });
    cases.push(result("deepseek-native-auth-and-environment", true, deepseek.source === "auth" && deepseekRemoved.source === "environment"));
    cases.push(result("unknown-provider-rejected", true, await rejects(() => setAuthKey({ agentDir: agent, key: "safe", provider: "unknown" }), "AUTH_PROVIDER_INVALID")));
    const savedArgv = process.argv.slice();
    const savedWrite = process.stderr.write;
    let stderr = "";
    process.stderr.write = (text) => { stderr += text; return true; };
    const dispatched = await dispatchCoco({ argv: ["manage", "auth", "set", "achai", `--api-key=${sentinel}`], root: sandbox });
    process.stderr.write = savedWrite;
    process.argv.splice(0, process.argv.length, ...savedArgv);
    cases.push(result("api-key-argv-rejected-without-secret", true, dispatched.exitCode === 1 && stderr.includes("API_KEY_ARG_FORBIDDEN") && !stderr.includes(sentinel)));
    const evidenceText = JSON.stringify({ cases });
    cases.push(result("evidence-redacts-sentinel", false, evidenceText.includes(sentinel)));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { authMode: "0600" }, cases, schemaVersion: 1, status, task: 8 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally { await rm(sandbox, { force: true, recursive: true }); }
}

void main();
