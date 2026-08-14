import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { planModelPanelRollout } from "./model-panel-rollout.mjs";
import { detectPiModelPanelCapabilities } from "./pi-model-panel-capabilities.mjs";
import { verifyRemoteSelectiveForkArtifact } from "./verify-remote-selective-fork-artifact.mjs";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const MAX_EXTRACTED_BYTES = 256 * 1024 * 1024;
const MAX_MEMBERS = 25_000;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function extractCandidate(artifact, directory) {
  const [names, details] = await Promise.all([
    execute("tar", ["-tzf", artifact], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }),
    execute("tar", ["--numeric-owner", "-tvzf", artifact], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }),
  ]);
  const members = names.stdout.split("\n").filter(Boolean); const rows = details.stdout.split("\n").filter(Boolean); const types = rows.map((line) => line[0]);
  const bytes = rows.reduce((total, line) => total + Number(/^\S+\s+\S+\s+(\d+)\s+/.exec(line)?.[1] ?? 0), 0);
  const unsafe = members.length === 0 || members.length > MAX_MEMBERS || members.length !== types.length || bytes > MAX_EXTRACTED_BYTES || members.some((member) => !member.startsWith("package/") || member.includes("\\") || member.split("/").includes("..")) || types.some((type) => type !== "-" && type !== "d");
  if (unsafe) { const error = new Error("archive"); error.code = "MODEL_PANEL_CANDIDATE_ARCHIVE_INVALID"; throw error; }
  await execute("tar", ["-xzf", artifact, "--no-same-owner", "--no-same-permissions", "-C", directory], { timeout: 120_000 });
}

async function verifyPty(packageRoot, directory) {
  const home = join(directory, "home"); const log = join(directory, "model-panel-pty.log");
  await mkdir(home, { recursive: true });
  const quote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const command = `${quote(process.execPath)} ${quote(join(packageRoot, "dist", "cli.js"))} -e ${quote(join(root, "resources", "coco-model-panel.mjs"))}`;
  const child = spawn("timeout", ["30s", "script", "-qefc", command, log], { cwd: directory, env: { HOME: home, NO_COLOR: "1", PATH: "/usr/bin:/bin", PI_CODING_AGENT_DIR: join(home, "agent"), PI_OFFLINE: "1", TERM: "xterm-256color" }, stdio: ["pipe", "ignore", "ignore"] });
  const closed = new Promise((resolve) => child.once("close", (code) => resolve(code)));
  await delay(2_500); child.stdin.write("/model\r"); await delay(4_000); child.stdin.write("\x1b"); await delay(500); child.stdin.write("/reload\r"); await delay(4_000); child.stdin.write("/model\r"); await delay(4_000); child.stdin.write("\x1b"); await delay(500); child.stdin.end("\x03");
  const exitCode = await closed; const output = await readFile(log, "utf8");
  const states = ["Models", "No matching models", "Refreshing model catalogs", "Model catalogs refreshed", "Reloaded keybindings, extensions, skills, prompts, themes, and context files"];
  const panelOpens = output.split("Models").length - 1;
  if (![0, 130].includes(exitCode) || panelOpens < 2 || states.some((text) => !output.includes(text)) || output.includes("Failed to load extension")) { const error = new Error("pty"); error.code = "MODEL_PANEL_CANDIDATE_PTY_FAILED"; throw error; }
  return { exitCode, offline: true, panelOpens, reload: "passed", states, status: "passed" };
}

export async function verifyIsolatedModelPanelCandidate({ evidencePath = join(root, "resources", "selective-fork-promotion-evidence.v1.json") } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "coco-model-panel-candidate-"));
  let stage = "DOWNLOAD";
  try {
    const artifact = join(directory, "candidate.tgz");
    const remoteReceipt = await verifyRemoteSelectiveForkArtifact({ artifactPath: artifact, evidencePath });
    if (remoteReceipt.status !== "approved") return { ...remoteReceipt, scope: "isolated" };
    stage = "EXTRACT";
    await extractCandidate(artifact, directory);
    const packageRoot = join(directory, "node_modules", "@earendil-works", "pi-coding-agent");
    await mkdir(join(directory, "node_modules", "@earendil-works"), { recursive: true });
    await rename(join(directory, "package"), packageRoot);
    const closureRoot = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "node_modules");
    stage = "CLOSURE";
    await cp(closureRoot, join(packageRoot, "node_modules"), { recursive: true, verbatimSymlinks: false });
    await cp(join(root, "resources"), join(directory, "resources"), { recursive: true, verbatimSymlinks: false });
    stage = "CAPABILITIES";
    const capabilities = await detectPiModelPanelCapabilities({ artifactState: "candidate-before-patch", packageRoot });
    stage = "LOADER";
    const { loadExtensions } = await import(pathToFileURL(join(packageRoot, "dist", "core", "extensions", "loader.js")).href);
    const loaded = await loadExtensions([join(root, "resources", "coco-model-panel.mjs")], directory);
    const adapter = loaded.extensions[0]?.builtinModelPanel;
    const loader = { errors: loaded.errors.length, extensions: loaded.extensions.length, fallbackOwner: (await loadExtensions([], directory)).extensions.some((extension) => extension.builtinModelPanel) ? "unexpected" : "fallback", owner: adapter?.id ?? null, registered: typeof adapter?.open === "function" && typeof adapter?.cycle === "function" };
    stage = "PTY";
    const pty = await verifyPty(packageRoot, directory);
    stage = "ROLLOUT";
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    const rollout = planModelPanelRollout({ capabilities, enabled: true, evidence, extension: "resources/coco-model-panel.mjs", remoteReceipt, scope: "isolated" });
    const approved = rollout.owner === "coco.model-panel.v1" && loader.errors === 0 && loader.extensions === 1 && loader.owner === rollout.owner && loader.registered && loader.fallbackOwner === "fallback";
    return { capabilities: { present: capabilities.capabilities.filter(({ status }) => status === "present").length, required: capabilities.capabilities.length, status: capabilities.status }, dependencyClosure: { source: "coco-official-lock", version: evidence.base.package.split("@").at(-1) }, loader, promotionAuthorized: false, pty, remote: remoteReceipt, rollout, schemaVersion: 1, scope: "isolated", status: approved ? "approved" : "rejected" };
  } catch (error) {
    return { code: typeof error?.code === "string" && /^MODEL_PANEL_[A-Z0-9_]+$/.test(error.code) ? error.code : `MODEL_PANEL_ISOLATED_${stage}_FAILED`, promotionAuthorized: false, scope: "isolated", status: "rejected" };
  } finally { await rm(directory, { force: true, recursive: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyIsolatedModelPanelCandidate();
  console.log(JSON.stringify(result));
  process.exit(result.status === "approved" ? 0 : 1);
}
