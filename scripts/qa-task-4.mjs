import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { generateAssetMap } from "./generate-asset-map.mjs";
import { generateRuntimeIntegrityManifest } from "./runtime-integrity.mjs";

const execute = promisify(execFile);
const MAX_BUFFER = 16 * 1024 * 1024;

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_4_QA_USAGE");
  return resolve(argv[3]);
}

function result(name, expected, actual) {
  return { actual, expected, name, status: expected === actual ? "passed" : "failed" };
}

async function command(file, args, cwd, env = process.env) {
  try {
    const output = await execute(file, args, { cwd, env, maxBuffer: MAX_BUFFER });
    return { code: 0, signal: null, stderr: output.stderr, stdout: output.stdout };
  } catch (error) {
    return { code: typeof error.code === "number" ? error.code : -1, signal: error.signal ?? null, stderr: error.stderr ?? "", stdout: error.stdout ?? "" };
  }
}

async function prepareProbe(root, observation, events) {
  const guard = join(root, "resources", "coco-guard.mjs");
  await writeFile(guard, `import { appendFileSync } from "node:fs"; export default function(){ appendFileSync(${JSON.stringify(events)}, "guard\\n"); globalThis[Symbol.for("coco.guard.loaded")] = true; }\n`);
  const cli = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
  await writeFile(cli, `import { appendFileSync, writeFileSync } from "node:fs"; import { pathToFileURL } from "node:url"; const argv=process.argv.slice(2); const separator=argv.indexOf("--"); const end=separator===-1?argv.length:separator; for(let i=0;i<end;i+=1){if((argv[i]==="-e"||argv[i]==="--extension")&&i+1<end){const module=await import(pathToFileURL(argv[i+1]).href); await module.default?.(); i+=1;}} writeFileSync(${JSON.stringify(observation)}, JSON.stringify({argv,cwd:process.cwd()})); appendFileSync(${JSON.stringify(events)}, "core\\n"); process.exitCode=23;\n`);
  await generateAssetMap({ output: join(root, "scripts", "package-asset-map.v1.json"), root });
  await generateRuntimeIntegrityManifest({ root });
  return root;
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-4-"));
  const cases = [];
  const sentinel = "TASK4_SENTINEL_NOT_A_SECRET";
  const guardPath = join(root, "resources", "coco-guard.mjs");
  const cliPath = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
  const originalGuard = await readFile(guardPath);
  const originalCli = await readFile(cliPath);
  try {
    const observation = join(fixture, "observation.json");
    const events = join(fixture, "events.log");
    const userExtension = join(fixture, "user extension.mjs");
    await writeFile(userExtension, `import { appendFileSync } from "node:fs"; export default function(){appendFileSync(${JSON.stringify(events)}, "user\\n");}\n`);
    const probe = await prepareProbe(root, observation, events);
    const executable = join(probe, "bin", "coco");
    const env = { ...process.env, COCO_CODING_AGENT_DIR: join(fixture, "agent"), HOME: join(fixture, "home") };

    for (const flag of ["--no-extensions", "-ne"]) {
      await rm(observation, { force: true }); await rm(events, { force: true });
      const forwarded = await command(executable, [flag, "-e", userExtension, "--", "hello space", ""] , fixture, env);
      if (!await exists(observation)) throw new Error(`TASK_4_PROBE_FAILED:${forwarded.code}:${forwarded.stderr}`);
      const seen = JSON.parse(await readFile(observation, "utf8"));
      const loaded = await readFile(events, "utf8");
      const guard = join(probe, "resources", "coco-guard.mjs");
      cases.push(result(`guard-first-${flag}`, true, forwarded.code === 23 && loaded === "guard\nuser\ncore\n" && JSON.stringify(seen.argv) === JSON.stringify(["-e", guard, flag, "-e", userExtension, "--", "hello space", ""]) && seen.cwd === fixture));
    }

    for (const commandName of ["install", "remove", "uninstall", "list", "config"]) {
      await rm(observation, { force: true });
      const forwarded = await command(executable, [commandName, "sp ace"], fixture, env);
      const seen = JSON.parse(await readFile(observation, "utf8"));
      cases.push(result(`allowed-upstream-${commandName}`, true, forwarded.code === 23 && seen.argv.at(-2) === commandName && seen.argv.at(-1) === "sp ace"));
    }

    const native = await command(executable, ["doctor", "--json"], fixture, env);
    cases.push(result("native-doctor-json", true, native.code === 0 && JSON.parse(native.stdout).command === "doctor" && !native.stdout.includes(sentinel)));
    const invalidNative = await command(executable, ["core", "status", "--bad"], fixture, env);
    cases.push(result("native-usage-exit-two", true, invalidNative.code === 2 && invalidNative.stderr.includes("NATIVE_USAGE")));
    const managed = await command(executable, ["manage", "migrate", "--dry-run", "--json"], fixture, env);
    cases.push(result("native-manage-grammar", true, managed.code === 1 && managed.stderr.includes("NATIVE_COMMAND_UNAVAILABLE")));

    for (const args of [["update"], ["update", "self"], ["update", "pi"]]) {
      const blocked = await command(executable, args, fixture, env);
      cases.push(result(`update-blocked-${args.join("-")}`, true, blocked.code === 1 && blocked.stderr.includes("UPDATE_COMMAND_FORBIDDEN") && !blocked.stdout.includes(sentinel)));
    }
    for (const args of [["--api-key", sentinel], [`--api-key=${sentinel}`]]) {
      await rm(observation, { force: true });
      const blocked = await command(executable, args, fixture, env);
      const combined = `${blocked.stdout}${blocked.stderr}`;
      cases.push(result(`api-key-blocked-${args[0]}`, true, blocked.code === 1 && combined.includes("API_KEY_ARG_FORBIDDEN") && !combined.includes(sentinel) && !await exists(observation)));
    }

    await rm(observation, { force: true });
    const literal = await command(executable, ["--", `--api-key=${sentinel}`], fixture, env);
    const literalSeen = JSON.parse(await readFile(observation, "utf8"));
    cases.push(result("post-separator-api-key-preserved", true, literal.code === 23 && literalSeen.argv.at(-2) === "--" && literalSeen.argv.at(-1) === `--api-key=${sentinel}`));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { guardSha256: sha256(await readFile(join(probe, "resources", "coco-guard.mjs"))), probeRoot: probe }, cases, schemaVersion: 1, status, task: 4 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally {
    await writeFile(guardPath, originalGuard);
    await writeFile(cliPath, originalCli);
    await generateAssetMap({ output: join(root, "scripts", "package-asset-map.v1.json"), root });
    await generateRuntimeIntegrityManifest({ root });
    await rm(fixture, { force: true, recursive: true });
  }
}

async function exists(path) {
  try { await readFile(path); return true; } catch { return false; }
}

void main();
