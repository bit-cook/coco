import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalJson } from "./canonical-json.mjs";
import { classifyPath, classifyShell, classifyToolCall, readSafetyPolicy, SAFETY_OUTCOMES, validateSafetyPolicy } from "./safety-classifier.mjs";
import { characterizeSafetyMode, registerSafetyModeCharacterization } from "./safety-mode-characterization.mjs";

function options(argv) { if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_12_QA_USAGE"); return resolve(argv[3]); }
function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }

async function invoke(handler, decision, children) {
  const response = await handler({ input: { command: "coco-safety-confirm-probe" }, toolName: "bash" }, { hasUI: true, ui: { async confirm() { return decision; } } });
  if (response === undefined) children.count += 1;
  return response;
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const policyFile = resolve(root, "resources", "safety-policy.json");
  const source = resolve(root, "scripts", "safety-mode-characterization.mjs");
  const cases = [];
  const policy = await readSafetyPolicy(policyFile);
  cases.push(result("versioned-policy-schema", 1, policy.schemaVersion));
  const pathOptions = { cwd: "/workspace/project", home: "/home/coco" };
  for (const [name, path, outcome] of [["git", "source/.git/config", "block"], ["node-modules", "node_modules/pkg/index.js", "block"], ["vendor", "vendor/lib.js", "block"], ["env", ".env.production", "block"], ["ssh", "~/.ssh/id_ed25519", "block"], ["aws", "~/.aws/credentials", "block"], ["gcloud", "~/.config/gcloud/configurations/config_default", "block"], ["coco-auth", "~/.coco/agent/auth.json", "block"], ["safe-path", "src/index.mjs", "allow"]]) cases.push(result(`protected-path-${name}`, outcome, classifyPath(path, pathOptions).outcome));
  for (const [name, command, outcome] of [["rm", "rm -rf build", "confirm"], ["reset", "git reset --hard", "confirm"], ["clean", "git clean -fd", "confirm"], ["checkout", "git checkout -- README.md", "confirm"], ["sudo", "sudo apt update", "confirm"], ["chmod", "chmod -R 700 private", "confirm"], ["mkfs", "mkfs.ext4 /dev/sdb", "confirm"], ["dd", "dd if=image of=/dev/sdb", "confirm"], ["power", "reboot", "confirm"], ["del", "del /s temp", "confirm"], ["rmdir", "rmdir /s temp", "confirm"], ["remove-item", "Remove-Item -Force temp", "confirm"], ["safe", "git status", "allow"], ["redirection", "rm file > output", "unguarded"], ["interpreter", "sh -c 'rm -rf build'", "unguarded"], ["substitution", "echo $(date)", "unguarded"]]) cases.push(result(`shell-${name}`, outcome, classifyShell(command).outcome));
  cases.push(result("direct-write-blocks", SAFETY_OUTCOMES.BLOCK, classifyToolCall({ input: { path: "~/.aws/credentials" }, toolName: "write" }, pathOptions).outcome));
  const children = { count: 0 };
  const characterized = await characterizeSafetyMode({ extensionSource: source, piVersion: "0.82.1", invoke: (handler, decision) => invoke(handler, decision, children) });
  cases.push(result("tool-call-confirm-allow-deny", true, characterized.interactive && children.count === 1 && characterized.transcript.map((entry) => entry.decision).join(",") === "allow,deny"));
  const handlers = [];
  registerSafetyModeCharacterization({ on(_event, handler) { handlers.push(handler); } }, []);
  cases.push(result("noninteractive-blocks", true, (await handlers[0]({ input: { command: "coco-safety-confirm-probe" }, toolName: "bash" }, { hasUI: false })).block === true));
  cases.push(result("confirm-throw-blocks", true, (await handlers[0]({ input: { command: "coco-safety-confirm-probe" }, toolName: "bash" }, { hasUI: true, ui: { async confirm() { throw new Error("no ui"); } } })).block === true));
  const noCallback = await characterizeSafetyMode({ extensionSource: source, piVersion: "0.82.1", invoke: async () => undefined });
  cases.push(result("missing-callback-is-not-interactive", false, noCallback.interactive));
  const tampered = structuredClone(policy); tampered.shellRules.reverse();
  let rejected = false; try { validateSafetyPolicy(tampered); } catch { rejected = true; }
  cases.push(result("policy-tamper-rejected", true, rejected));
  const sourceHash = createHash("sha256").update(await readFile(source)).digest("hex");
  cases.push(result("mode-hash-binds-handler", sourceHash, characterized.handlerSha256));
  const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
  await writeFile(evidence, canonicalJson({ artifacts: { handlerSha256: sourceHash, piVersion: "0.82.1", policySha256: createHash("sha256").update(await readFile(policyFile)).digest("hex"), transcript: characterized.transcript }, cases, schemaVersion: 1, status, task: 12 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.exitCode = status === "approved" ? 0 : 1;
}

void main();
