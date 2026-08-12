import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { PRODUCT_COMMAND, PRODUCT_CONFIG_DIR, PRODUCT_NAME, PRODUCT_VERSION, UPSTREAM_PACKAGE, UPSTREAM_VERSION } from "./product-identity.generated.mjs";

export const CORE_NAME = UPSTREAM_PACKAGE;
export const CORE_VERSION = UPSTREAM_VERSION;
export const COCO_VERSION = PRODUCT_VERSION;

function rejected(code) { return { code, status: "rejected" }; }

function supportedNode(version) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match !== null && (Number(match[1]) > 22 || (Number(match[1]) === 22 && Number(match[2]) >= 19));
}

async function packageJson(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("RUNTIME_PACKAGE_INVALID");
  return JSON.parse(await readFile(path, "utf8"));
}

export async function resolveCocoRuntime({ root }) {
  try {
    if (!supportedNode(process.version)) return rejected("RUNTIME_NODE_UNSUPPORTED");
    const canonicalRoot = await realpath(resolve(root));
    const coco = await packageJson(join(canonicalRoot, "package.json"));
    const piRoot = join(canonicalRoot, "node_modules", ...CORE_NAME.split("/"));
    const pi = await packageJson(join(piRoot, "package.json"));
    if (coco.name !== PRODUCT_NAME || coco.version !== PRODUCT_VERSION || coco.piConfig?.name !== PRODUCT_COMMAND || coco.piConfig?.configDir !== PRODUCT_CONFIG_DIR) return rejected("RUNTIME_COCO_IDENTITY_INVALID");
    if (coco.dependencies?.[CORE_NAME] !== CORE_VERSION || pi.name !== CORE_NAME || pi.version !== CORE_VERSION) return rejected("RUNTIME_CORE_VERSION_MISMATCH");
    const cli = join(piRoot, "dist", "cli.js");
    const cliInfo = await lstat(cli);
    if (!cliInfo.isFile() || cliInfo.isSymbolicLink()) return rejected("RUNTIME_CORE_MISSING");
    return {
      identity: {
        agentEnv: "COCO_CODING_AGENT_DIR",
        appName: PRODUCT_COMMAND,
        configDir: PRODUCT_CONFIG_DIR,
        packageName: PRODUCT_NAME,
        sessionEnv: "COCO_CODING_AGENT_SESSION_DIR",
        version: PRODUCT_VERSION,
      },
      piCli: cli,
      piRoot,
      piVersion: pi.version,
      root: canonicalRoot,
      status: "approved",
    };
  } catch {
    return rejected("RUNTIME_PACKAGE_INVALID");
  }
}

export function cocoStatePaths(env = process.env) {
  const agentDir = env.COCO_CODING_AGENT_DIR || join(env.HOME || homedir(), PRODUCT_CONFIG_DIR, "agent");
  return { agentDir, sessionsDir: env.COCO_CODING_AGENT_SESSION_DIR || join(agentDir, "sessions") };
}

export function applyCocoIdentity(runtime) {
  process.env.PI_PACKAGE_DIR = runtime.root;
  process.env.PI_SKIP_VERSION_CHECK = "1";
}
