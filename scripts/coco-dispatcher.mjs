import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { COCO_VERSION } from "./coco-runtime-identity.mjs";

const MANAGED_PROVIDERS = new Set(["idepub", "achai", "agnes", "deepseek", "stepfun"]);
const NATIVE_COMMANDS = new Set(["manage", "doctor", "core"]);

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
  return usage("NATIVE_USAGE");
}

function userExtensions(argv) {
  const tokens = beforeSeparator(argv);
  if (tokens.some((token) => token === "-e" || token === "--extension")) return true;
  const agentDir = process.env.COCO_CODING_AGENT_DIR || join(process.env.HOME || homedir(), ".coco", "agent");
  return existsSync(join(agentDir, "extensions"));
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

function diagnosticOutput(body, json) { process.stdout.write(json ? `${JSON.stringify(body)}\n` : `coco ${body.command}: ${body.status}\n`); return { exitCode: body.exitCode, kind: "native" }; }

async function native(argv, root) {
  if (argv[0] === "doctor") {
    const { doctor } = await import("./diagnostics.mjs");
    const flags = argv.slice(1);
    return hasOnlyFlags(flags, new Set(["--json", "--connectivity"])) ? diagnosticOutput(await doctor({ connectivity: flags.includes("--connectivity"), root }), flags.includes("--json")) : usage("NATIVE_USAGE");
  }
  if (argv[0] === "core") {
    const { coreCheck, coreStatus } = await import("./diagnostics.mjs");
    const [action, ...flags] = argv.slice(1);
    if ((action !== "status" && action !== "check") || !hasOnlyFlags(flags, new Set(["--json"]))) return usage("NATIVE_USAGE");
    return diagnosticOutput(await (action === "status" ? coreStatus({ root }) : coreCheck({ root })), flags.includes("--json"));
  }
  const validation = parseManage(argv.slice(1));
  if (validation !== null) return validation;
  if (argv[1] === "auth") return manageAuth(argv.slice(2));
  if (argv[1] === "models") return manageModels(argv.slice(2), root);
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
  if (argv[0] === "--version" || argv[0] === "-v") {
    process.stdout.write(`${COCO_VERSION}\n`);
    return { exitCode: 0, kind: "native" };
  }
  if (NATIVE_COMMANDS.has(argv[0])) return native(argv, root);
  const guard = join(root, "resources", "coco-guard.mjs");
  if (argv.includes("--help") || argv.includes("-h")) process.stderr.write("coco: safety guardrails are best-effort and not a sandbox.\n");
  process.argv.splice(2, process.argv.length - 2, "-e", guard, ...argv);
  return { guard, kind: "forward" };
}
