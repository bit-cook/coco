import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { COCO_VERSION, CORE_NAME, CORE_VERSION } from "./coco-runtime-identity.mjs";
import { MANAGED_PROVIDER_IDS } from "./product-identity.generated.mjs";

const MANAGED_PROVIDERS = new Set(MANAGED_PROVIDER_IDS);
const NATIVE_COMMANDS = new Set(["manage", "doctor", "core", "task", "runner", "control", "coweb", "mcp", "backup"]);

function help() {
  process.stdout.write(`CoCo ${COCO_VERSION}

Usage:
  coco [Pi arguments...]
  coco --help | -h | help
  coco --version | -v
  coco manage auth set <provider> [--stdin] [--json]
  coco manage auth status [provider] [--json]
  coco manage auth remove <provider> [--yes] [--json]
  coco manage providers status [provider] [--json]
  coco manage models sync [--provider <provider>] [--allow-empty] [--yes] [--json]
  coco manage migrate [--dry-run] [--json] [--yes]
  coco manage bootstrap [--dry-run] [--json] [--yes]
  coco doctor [--json] [--connectivity]
  coco core <status|check|model-panel-canary> [--json]
  coco task create <prompt> [--no-worktree] [--schedule <Nm|Nh|Nd>] [--webhook] [--github-event <event>]
  coco task list|active|show|cancel|stop-all|run [id] [--json]
  coco runner start|status|stop|run [--once]
  coco control start|status|token|stop [--host <address>] [--port <port>]
   coco coweb [--port <port>] [--password <secret>] [--public-host <host>]
  coco mcp add <name> -- <command> [args...] | list | approve|ask|deny|remove <name>
  coco backup create|verify|restore-drill|prune|store-publish|store-fetch|store-list|store-remove [options]

Interactive goals:
  /goal [status]            Show goal and step progress
  /goal <description>       Set a persistent goal for this session branch
  /goal set <description>   Explicitly set a new goal
  /goal plan                Ask the agent to create and store a plan
  /goal pause|resume        Pause or resume goal context
  /goal done <step>         Mark a verified step complete
  /goal active|block|reopen <step>
                            Change the state of a planned step
  /goal continue            Resume and ask the agent to continue
  /goal complete|clear      Complete or remove the goal

Interactive language:
  /language                 Select from installed languages
  /language <locale>        Switch language and persist the selection
  /language status|list     Show current or available languages

Interactive loops:
  /loop [prompt]             Create a dynamic recurring loop
  /loop <duration> [prompt]  Create a fixed recurring loop
  /loop [prompt] every <duration>
  /loop list|status          List loops for this saved session
  /loop cancel <id>          Cancel a loop by ID or unique prefix

Managed providers:
  idepub, achai, agnes, deepseek, stepfun

Credentials:
  Set a provider credential interactively with "coco manage auth set <provider>",
  or read it from standard input with --stdin. Do not put credentials on the
  command line. "auth status" reports availability and source, never a value.

Offline and resources:
  CoCo starts offline unless PI_OFFLINE is explicitly set. Network-dependent
  checks and model sync require an enabled connection. Packaged resources are
  integrity-checked; executable project resources are not trusted.

Security:
  CoCo safety guardrails are best-effort and are not a sandbox. "coco update"
  is prohibited; update CoCo through its approved installation process.

Pi compatibility:
  Commands outside this native grammar are forwarded to bundled Pi ${CORE_VERSION}
  with CoCo's guard. Pi options and commands remain compatible.
`);
  return { exitCode: 0, kind: "native" };
}

function usage(message) {
  process.stderr.write(`coco: ${message}\n`);
  return { exitCode: 2, kind: "native" };
}

function failure(code) {
  process.stderr.write(`coco: ${code}\n`);
  return { exitCode: 1, kind: "native" };
}

function beforeSeparator(argv) {
  const separator = argv.indexOf("--");
  return separator === -1 ? argv : argv.slice(0, separator);
}

function hasApiKeyArgument(argv) {
  return beforeSeparator(argv).some((token) => token === "--api-key" || token.startsWith("--api-key="));
}

function hasProviderTestSeam(environment = process.env) {
  return Object.keys(environment).some((key) => key.startsWith("COCO_PROVIDER_TEST_") || key === "COCO_TEST_PROVIDER_ORIGIN");
}

function hasOnlyFlags(argv, allowed) {
  const seen = new Set();
  for (const token of argv) {
    if (!allowed.has(token) || seen.has(token)) return false;
    seen.add(token);
  }
  return true;
}

function parseManage(argv) {
  const [area, ...rest] = argv;
  if (area === "migrate" || area === "bootstrap") return hasOnlyFlags(rest, new Set(["--dry-run", "--json", "--yes"])) ? null : usage("NATIVE_USAGE");
  const [action, ...flags] = rest;
  if (area === "auth") {
    if (action === "set" && MANAGED_PROVIDERS.has(flags[0])) return hasOnlyFlags(flags.slice(1), new Set(["--stdin", "--json"])) ? null : usage("NATIVE_USAGE");
    if (action === "status" && (flags.length === 0 || MANAGED_PROVIDERS.has(flags[0]) || flags[0] === "--json")) return hasOnlyFlags(flags[0] === "--json" ? flags : flags.slice(1), new Set(["--json"])) ? null : usage("NATIVE_USAGE");
    if (action === "remove" && MANAGED_PROVIDERS.has(flags[0])) return hasOnlyFlags(flags.slice(1), new Set(["--yes", "--json"])) ? null : usage("NATIVE_USAGE");
    return usage("NATIVE_USAGE");
  }
  if (area === "models" && action === "sync") {
    const normalized = [];
    for (let index = 0; index < flags.length; index += 1) {
      if (flags[index] === "--provider") {
        if (index + 1 >= flags.length || flags[index + 1].startsWith("-")) return usage("NATIVE_USAGE");
        normalized.push("--provider");
        index += 1;
      } else normalized.push(flags[index]);
    }
    return hasOnlyFlags(normalized, new Set(["--provider", "--allow-empty", "--yes", "--json"])) ? null : usage("NATIVE_USAGE");
  }
  if (area === "providers" && action === "status") {
    const positional = flags.filter((token) => token !== "--json");
    return positional.length <= 1 && flags.filter((token) => token === "--json").length <= 1 && flags.every((token) => token === "--json" || !token.startsWith("-")) ? null : usage("NATIVE_USAGE");
  }
  return usage("NATIVE_USAGE");
}

function nonEmptyDirectory(path) {
  try { return readdirSync(path).length > 0; } catch { return existsSync(path); }
}

function settingsMayChangeModelVisibility(path) {
  if (!existsSync(path)) return false;
  try {
    const settings = JSON.parse(readFileSync(path, "utf8"));
    if (settings === null || typeof settings !== "object" || Array.isArray(settings)) return true;
    const knownVisibilityNeutral = new Set([
      "autocompleteMaxVisible", "branchSummary", "collapseChangelog", "compaction", "defaultModel", "defaultProjectTrust", "defaultProvider",
      "defaultThinkingLevel", "doubleEscapeAction", "editorPaddingX", "enableAnalytics", "enableInstallTelemetry", "enableSkillCommands", "enabledModels",
      "externalEditor", "followUpMode", "hideThinkingBlock", "httpIdleTimeoutMs", "httpProxy", "images", "lastChangelogVersion", "markdown", "npmCommand",
      "outputPad", "prompts", "quietStartup", "retry", "sessionDir", "shellCommandPrefix", "shellPath", "showCacheMissNotices", "showHardwareCursor",
      "skills", "steeringMode", "terminal", "theme", "themes", "thinkingBudgets", "trackingId", "transport", "treeFilterMode", "warnings",
      "websocketConnectTimeoutMs",
    ]);
    return Object.entries(settings).some(([key, value]) => {
      if (key === "extensions" || key === "packages") return !Array.isArray(value) || value.length > 0;
      return !knownVisibilityNeutral.has(key);
    });
  } catch { return true; }
}

function userExtensions(argv, cwd = process.cwd(), environment = process.env) {
  const tokens = beforeSeparator(argv);
  if (tokens.some((token) => token === "-e" || token === "--extension")) return true;
  const agentDir = environment.COCO_CODING_AGENT_DIR || join(environment.HOME || homedir(), ".coco", "agent");
  return nonEmptyDirectory(join(agentDir, "extensions"))
    || nonEmptyDirectory(join(cwd, ".coco", "extensions"))
    || settingsMayChangeModelVisibility(join(agentDir, "settings.json"))
    || settingsMayChangeModelVisibility(join(cwd, ".coco", "settings.json"));
}

export function canUseLightweightModelList(argv, { cwd = process.cwd(), environment = process.env } = {}) {
  return argv[0] === "--list-models"
    && argv.length <= 2
    && (argv.length === 1 || !argv[1].startsWith("-") && !argv[1].startsWith("@"))
    && !userExtensions(argv, cwd, environment);
}

async function listModelsCommand(argv, root) {
  const piRoot = join(root, "node_modules", ...CORE_NAME.split("/"));
  const agentDir = process.env.COCO_CODING_AGENT_DIR || join(process.env.HOME || homedir(), ".coco", "agent");
  const [{ listModels }, { ModelRuntime }] = await Promise.all([
    import(pathToFileURL(join(piRoot, "dist", "cli", "list-models.js")).href),
    import(pathToFileURL(join(piRoot, "dist", "core", "model-runtime.js")).href),
  ]);
  const runtime = await ModelRuntime.create({ allowModelNetwork: false, authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json") });
  await listModels(runtime, argv[1]);
  return { exitCode: 0, kind: "native" };
}

function promptWarnings() {
  const agentDir = process.env.COCO_CODING_AGENT_DIR || join(process.env.HOME || homedir(), ".coco", "agent");
  if (existsSync(join(agentDir, "SYSTEM.md"))) return ["UNOWNED_SYSTEM_OVERRIDE"];
  const append = join(agentDir, "APPEND_SYSTEM.md");
  const ownership = join(agentDir, "ownership.json");
  if (!existsSync(append) || !existsSync(ownership)) return [];
  try {
    const expected = JSON.parse(readFileSync(ownership, "utf8"))?.managedFiles?.["APPEND_SYSTEM.md"]?.sourceSha256;
    return typeof expected === "string" && createHash("sha256").update(readFileSync(append)).digest("hex") !== expected ? ["OWNED_APPEND_DRIFT"] : [];
  } catch { return ["OWNED_APPEND_DRIFT"]; }
}

function diagnosticOutput(body, json) {
  if (json) process.stdout.write(`${JSON.stringify(body)}\n`);
  else {
    process.stdout.write(`coco ${body.command}: ${body.status}\n`);
    for (const check of body.checks) {
      const marker = check.status === "pass" ? "PASS" : check.status === "skipped" ? "SKIP" : check.severity === "fatal" ? "FAIL" : "WARN";
      process.stdout.write(`${marker.padEnd(4)}  ${check.id.padEnd(32)} ${check.message}\n`);
    }
  }
  return { exitCode: body.exitCode, kind: "native" };
}

async function native(argv, root) {
  if (argv[0] === "task" || argv[0] === "runner") {
    try {
      const commands = await import("./task-commands.mjs");
      return argv[0] === "task" ? commands.taskCommand(argv.slice(1), root) : commands.runnerCommand(argv.slice(1), root);
    } catch (error) { return failure(error instanceof Error && "code" in error ? error.code : "TASK_COMMAND_FAILED"); }
  }
  if (argv[0] === "mcp") {
    try { const { agentDirectory } = await import("./state-paths.mjs"); return await (await import("./mcp-config.mjs")).mcpCommand(argv.slice(1), agentDirectory()); }
    catch (error) { return failure(error instanceof Error && "code" in error ? error.code : "MCP_COMMAND_FAILED"); }
  }
  if (argv[0] === "control") {
    try { const { agentDirectory } = await import("./state-paths.mjs"); return await (await import("./control-service.mjs")).controlCommand(argv.slice(1), { agentDir: agentDirectory(), root }); }
    catch (error) { return failure(error instanceof Error && "code" in error ? error.code : "CONTROL_COMMAND_FAILED"); }
  }
  if (argv[0] === "coweb") {
    try { const { agentDirectory } = await import("./state-paths.mjs"); return await (await import("./coweb.mjs")).cowebCommand(argv.slice(1), { agentDir: agentDirectory() }); }
    catch (error) { return failure(error instanceof Error && "code" in error ? error.code : "COWEB_COMMAND_FAILED"); }
  }
  if (argv[0] === "backup") {
    try { const exitCode = await (await import("./backup-command.mjs")).main(argv.slice(1)); return { exitCode, kind: "native" }; }
    catch (error) { return failure(error instanceof Error && "code" in error ? error.code : "BACKUP_COMMAND_FAILED"); }
  }
  if (argv[0] === "doctor") {
    const { doctor } = await import("./diagnostics.mjs");
    const flags = argv.slice(1);
    return hasOnlyFlags(flags, new Set(["--json", "--connectivity"])) ? diagnosticOutput(await doctor({ connectivity: flags.includes("--connectivity"), root }), flags.includes("--json")) : usage("NATIVE_USAGE");
  }
  if (argv[0] === "core") {
    const [action, ...flags] = argv.slice(1);
    if (!hasOnlyFlags(flags, new Set(["--json"]))) return usage("NATIVE_USAGE");
    if (action === "model-panel-canary") {
      const { formatModelPanelCanary, modelPanelCanary } = await import("./model-panel-canary.mjs"); const receipt = await modelPanelCanary();
      (flags.includes("--json") ? process.stdout : receipt.exitCode === 0 ? process.stdout : process.stderr).write(flags.includes("--json") ? `${JSON.stringify(receipt)}\n` : formatModelPanelCanary(receipt));
      return { exitCode: receipt.exitCode, kind: "native" };
    }
    if (action !== "status" && action !== "check") return usage("NATIVE_USAGE");
    const { coreCheck, coreStatus } = await import("./diagnostics.mjs");
    return diagnosticOutput(await (action === "status" ? coreStatus({ root }) : coreCheck({ root })), flags.includes("--json"));
  }
  const validation = parseManage(argv.slice(1));
  if (validation !== null) return validation;
  if (argv[1] === "auth") return manageAuth(argv.slice(2));
  if (argv[1] === "models") return manageModels(argv.slice(2), root);
  if (argv[1] === "providers") {
    try {
      const { agentDirectory } = await import("./state-paths.mjs"); const { formatProviderStatus, providerStatus } = await import("./provider-status.mjs");
      const flags = argv.slice(3); const provider = flags.find((token) => token !== "--json"); const result = await providerStatus({ agentDir: agentDirectory(), provider });
      process.stdout.write(flags.includes("--json") ? `${JSON.stringify(result)}\n` : formatProviderStatus(result)); return { exitCode: 0, kind: "native" };
    } catch (error) { return failure(error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "PROVIDER_STATUS_FAILED"); }
  }
  if (argv[1] !== "migrate" && argv[1] !== "bootstrap") return failure("NATIVE_COMMAND_UNAVAILABLE");
  const flags = argv.slice(2);
  if (!flags.includes("--dry-run") && !flags.includes("--yes") && !process.stdin.isTTY) return usage("CONFIRMATION_REQUIRED");
  try {
    const { agentDirectory } = await import("./state-paths.mjs");
    const bootstrap = argv[1] === "bootstrap";
    const operation = bootstrap ? (await import("./bootstrap-state.mjs")).bootstrapState : (await import("./migrate-state.mjs")).migrateState;
    const state = bootstrap ? await operation({ agentDir: agentDirectory(), dryRun: flags.includes("--dry-run"), root }) : await operation({ agentDir: agentDirectory(), dryRun: flags.includes("--dry-run") });
    const body = { ...state, schemaVersion: 1 };
    const changed = bootstrap ? state.created.length > 0 : state.changed.length > 0;
    process.stdout.write(flags.includes("--json") ? `${JSON.stringify(body)}\n` : `coco ${bootstrap ? "bootstrap" : "migrate"}: ${changed ? "applied" : "noop"}\n`);
    return { exitCode: 0, kind: "native" };
  } catch (error) {
    return failure(error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "MIGRATION_FAILED");
  }
}

async function manageModels(argv, root) {
  const { agentDirectory } = await import("./state-paths.mjs");
  const { syncProviderModels } = await import("./provider-sync.mjs");
  const flags = argv.slice(1);
  const providerIndex = flags.indexOf("--provider");
  const provider = providerIndex === -1 ? undefined : flags[providerIndex + 1];
  if (!flags.includes("--yes") && !process.stdin.isTTY) return usage("CONFIRMATION_REQUIRED");
  try {
    const value = await syncProviderModels({ agentDir: agentDirectory(), allowEmpty: flags.includes("--allow-empty"), providerIds: provider === undefined ? undefined : [provider], root });
    process.stdout.write(flags.includes("--json") ? `${JSON.stringify({ ...value, schemaVersion: 1 })}\n` : `coco models sync: ${value.modelCount} models\n`);
    return { exitCode: 0, kind: "native" };
  } catch (error) {
    return failure(error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "PROVIDER_SYNC_FAILED");
  }
}

function authOutput(value, json, action) {
  process.stdout.write(json ? `${JSON.stringify(value)}\n` : `coco auth ${action}: ${value.provider ?? value.map((entry) => entry.provider).join(", ")}\n`);
  return { exitCode: 0, kind: "native" };
}

async function manageAuth(argv) {
  const { agentDirectory } = await import("./state-paths.mjs");
  const { confirmInteractiveRemove, getAuthStatus, readInteractiveKey, readStdinKey, removeAuthKey, setAuthKey } = await import("./auth-management.mjs");
  const [action, provider, ...flags] = argv;
  const json = flags.includes("--json") || provider === "--json";
  const agentDir = agentDirectory();
  try {
    if (action === "status") return authOutput(await getAuthStatus({ agentDir, provider: provider === "--json" ? undefined : provider }), json, "status");
    if (action === "set") {
      const key = flags.includes("--stdin") ? await readStdinKey(process.stdin) : await readInteractiveKey(process.stdin, process.stderr);
      return authOutput(await setAuthKey({ agentDir, key, provider }), json, "set");
    }
    if (action === "remove") {
      if (!flags.includes("--yes") && !process.stdin.isTTY) return usage("CONFIRMATION_REQUIRED");
      if (!flags.includes("--yes")) await confirmInteractiveRemove(process.stdin, process.stderr);
      return authOutput(await removeAuthKey({ agentDir, provider }), json, "remove");
    }
    return usage("NATIVE_USAGE");
  } catch (error) {
    return failure(error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "AUTH_FAILED");
  }
}

export async function dispatchCoco({ argv = process.argv.slice(2), root }) {
  if (hasProviderTestSeam()) return failure("TEST_SEAM_FORBIDDEN");
  if (hasApiKeyArgument(argv)) return failure("API_KEY_ARG_FORBIDDEN");
  if (argv[0] === "update") return failure("UPDATE_COMMAND_FORBIDDEN");
  if (argv.length === 1 && ["--help", "-h", "help"].includes(argv[0])) return help();
  if (argv[0] === "--version" || argv[0] === "-v") {
    process.stdout.write(`${COCO_VERSION}\n`);
    return { exitCode: 0, kind: "native" };
  }
  if (canUseLightweightModelList(argv, { cwd: process.cwd() })) return listModelsCommand(argv, root);
  if (NATIVE_COMMANDS.has(argv[0])) return native(argv, root);
  const language = join(root, "resources", "coco-language.mjs");
  const guard = join(root, "resources", "coco-guard.mjs");
  const bashFence = join(root, "resources", "coco-bash-fence.mjs");
  const goal = join(root, "resources", "coco-goal.mjs");
  const loop = join(root, "resources", "coco-loop.mjs");
  const mcp = join(root, "resources", "coco-mcp.mjs");
  const generations = join(root, "resources", "coco-provider-generation.mjs");
  const subagents = join(root, "examples", "extensions", "subagent", "index.ts");
  if (argv.includes("--help") || argv.includes("-h")) process.stderr.write("coco: CoCo safety guardrails are best-effort and not a sandbox.\n");
  process.argv.splice(2, process.argv.length - 2, "-e", language, "-e", guard, "-e", bashFence, "-e", goal, "-e", loop, "-e", generations, "-e", mcp, "-e", subagents, ...argv);
  return { bashFence, generations, goal, guard, kind: "forward", language, loop, mcp, subagents };
}
