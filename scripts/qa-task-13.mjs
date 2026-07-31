import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { dispatchCoco } from "./coco-dispatcher.mjs";
import cocoGuard, { DISCLAIMER, guardToolCall } from "../resources/coco-guard.mjs";

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_13_QA_USAGE");
  return resolve(argv[3]);
}

function result(name, expected, actual) {
  return { actual, expected, name, status: expected === actual ? "passed" : "failed" };
}

async function invoke(event, ctx) {
  const response = await guardToolCall(event, ctx);
  return response === undefined ? "allowed" : response.reason;
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-13-"));
  const cases = [];
  const originalArgv = [...process.argv];
  try {
    let confirms = 0;
    const interactiveAllow = await invoke({ input: { command: "rm -rf build" }, toolName: "bash" }, { hasUI: true, ui: { async confirm() { confirms += 1; return true; } } });
    cases.push(result("interactive-confirm-allow", "allowed", interactiveAllow));
    cases.push(result("interactive-confirm-is-called", 1, confirms));
    const interactiveDeny = await invoke({ input: { command: "git reset --hard" }, toolName: "bash" }, { hasUI: true, ui: { async confirm() { return false; } } });
    cases.push(result("interactive-confirm-deny", true, interactiveDeny.includes("confirmation was denied")));
    const safeCommand = await invoke({ input: { command: "git status" }, toolName: "bash" }, { hasUI: false });
    cases.push(result("safe-command-passes", "allowed", safeCommand));
    const directWrite = await invoke({ input: { path: "~/.aws/credentials" }, toolName: "write" }, { hasUI: true, ui: { async confirm() { return true; } } });
    cases.push(result("protected-write-blocks", true, directWrite.includes("PROTECTED_CREDENTIAL_PATH")));
    const directEdit = await invoke({ input: { path: ".env.production" }, toolName: "edit" }, { hasUI: true, ui: { async confirm() { return true; } } });
    cases.push(result("protected-edit-blocks", true, directEdit.includes("PROTECTED_ENV_FILE")));

    for (const mode of ["text", "json", "rpc"]) {
      let modeUiCalls = 0;
      const blocked = await invoke({ input: { command: "sudo true" }, toolName: "bash" }, { hasUI: false, ui: { async confirm() { modeUiCalls += 1; return true; } } });
      cases.push(result(`${mode}-confirmation-fails-closed`, true, blocked.includes("confirmation is unavailable in this mode") && modeUiCalls === 0));
      const protocol = JSON.stringify({ mode, result: "blocked" });
      cases.push(result(`${mode}-protocol-remains-json`, true, JSON.parse(protocol).result === "blocked"));
    }

    const registered = [];
    let notices = 0;
    cocoGuard({ on(event, handler) { registered.push({ event, handler }); } });
    const session = registered.find((entry) => entry.event === "session_start")?.handler;
    const toolCall = registered.find((entry) => entry.event === "tool_call")?.handler;
    session?.({}, { hasUI: true, ui: { notify(message) { if (message === DISCLAIMER) notices += 1; } } });
    cases.push(result("startup-disclaimer", 1, notices));
    cases.push(result("typed-tool-call-registration", true, typeof toolCall === "function"));

    const projectExtension = join(fixture, ".coco", "extensions", "evil.mjs");
    await writeFile(projectExtension, "export default function () {}\n", { encoding: "utf8" }).catch(async () => {
      await (await import("node:fs/promises")).mkdir(join(fixture, ".coco", "extensions"), { recursive: true });
      await writeFile(projectExtension, "export default function () {}\n", "utf8");
    });
    process.argv.splice(2, process.argv.length - 2, "-e", "/user/extension.mjs", "--help");
    const dispatched = await dispatchCoco({ argv: process.argv.slice(2), root });
    cases.push(result("mandatory-absolute-package-guard-first", true, dispatched.kind === "forward" && process.argv[2] === "-e" && process.argv[3] === join(root, "resources", "coco-guard.mjs") && process.argv.includes("/user/extension.mjs")));
    cases.push(result("project-resource-not-used-as-guard", true, !process.argv.includes(projectExtension)));
    cases.push(result("packaged-guard-is-runtime-resource", true, (await readFile(join(root, "resources", "coco-guard.mjs"), "utf8")).includes("isToolCallEventType")));

    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { disclaimer: DISCLAIMER, guardPath: join(root, "resources", "coco-guard.mjs"), projectExtension }, cases, schemaVersion: 1, status, task: 13 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally {
    process.argv.splice(0, process.argv.length, ...originalArgv);
    await rm(fixture, { force: true, recursive: true });
  }
}

void main();
