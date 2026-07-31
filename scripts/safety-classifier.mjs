import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";

export const SAFETY_OUTCOMES = Object.freeze({ ALLOW: "allow", BLOCK: "block", CONFIRM: "confirm", UNGUARDED: "unguarded" });
const PATH_RULE_IDS = ["path-component", "env-basename", "cloud-credentials", "coco-auth"];
const SHELL_RULE_IDS = ["rm-recursive", "git-reset-hard", "git-clean-force", "git-checkout-path", "sudo", "ownership-recursive", "mkfs", "dd-device", "power", "windows-del-recursive", "windows-rmdir-recursive", "powershell-remove-item"];

export function validateSafetyPolicy(policy) {
  const validRules = (rules, identifiers, property, outcome) => Array.isArray(rules) && rules.length === identifiers.length && rules.every((rule, index) => rule && rule.id === identifiers[index] && typeof rule[property] === "string" && rule.outcome === outcome);
  if (!policy || policy.schemaVersion !== 1 || policy.unsupportedOutcome !== SAFETY_OUTCOMES.UNGUARDED || !validRules(policy.pathRules, PATH_RULE_IDS, "matcher", SAFETY_OUTCOMES.BLOCK) || !validRules(policy.shellRules, SHELL_RULE_IDS, "tokens", SAFETY_OUTCOMES.CONFIRM)) throw new TypeError("SAFETY_POLICY_INVALID");
  return policy;
}

export async function readSafetyPolicy(path) {
  let parsed;
  try { parsed = JSON.parse(await readFile(path, "utf8")); } catch { throw new TypeError("SAFETY_POLICY_INVALID"); }
  return validateSafetyPolicy(parsed);
}

function canonicalExistingAncestor(path) {
  let cursor = resolve(path);
  const suffix = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  return resolve(existsSync(cursor) ? realpathSync(cursor) : cursor, ...suffix);
}

export function resolveSafetyPath(path, { cwd = process.cwd(), home = homedir() } = {}) {
  if (typeof path !== "string" || path.length === 0) return null;
  const expanded = path === "~" || path.startsWith(`~${sep}`) ? resolve(home, path.slice(2)) : path;
  return canonicalExistingAncestor(isAbsolute(expanded) ? expanded : resolve(cwd, expanded));
}

function under(path, root) {
  const difference = relative(root, path);
  return difference === "" || (!difference.startsWith(`..${sep}`) && difference !== "..");
}

export function classifyPath(path, options) {
  const resolved = resolveSafetyPath(path, options);
  if (resolved === null) return { outcome: SAFETY_OUTCOMES.UNGUARDED, reason: "PATH_UNRESOLVED" };
  const components = normalize(resolved).split(sep);
  if (components.some((component) => component === ".git" || component === "node_modules" || component === "vendor")) return { outcome: SAFETY_OUTCOMES.BLOCK, reason: "PROTECTED_PATH_COMPONENT", resolved };
  const name = basename(resolved);
  if (name === ".env" || name.startsWith(".env.")) return { outcome: SAFETY_OUTCOMES.BLOCK, reason: "PROTECTED_ENV_FILE", resolved };
  const home = options?.home ?? homedir();
  if ([".ssh", ".aws", ".config/gcloud"].some((protectedPath) => under(resolved, resolveSafetyPath(`~/${protectedPath}`, { home })))) return { outcome: SAFETY_OUTCOMES.BLOCK, reason: "PROTECTED_CREDENTIAL_PATH", resolved };
  if (resolved === resolveSafetyPath("~/.coco/agent/auth.json", { home })) return { outcome: SAFETY_OUTCOMES.BLOCK, reason: "PROTECTED_COCO_AUTH", resolved };
  return { outcome: SAFETY_OUTCOMES.ALLOW, reason: "SAFE_PATH", resolved };
}

function tokenize(command) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;
  for (const character of command) {
    if (escaped) { token += character; escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (quote !== null) { if (character === quote) quote = null; else token += character; continue; }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (/\s/.test(character)) { if (token) { tokens.push(token); token = ""; } continue; }
    token += character;
  }
  if (escaped || quote !== null) return null;
  if (token) tokens.push(token);
  return tokens;
}

function unsupported(command, tokens) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0] ?? "") || /(?:^|\s)(?:alias\s|\.\s|source\s|sh\s+-c|bash\s+-c|zsh\s+-c|python\S*\s+-c|node\s+-e)/.test(command) || /[|;&<>`$()]/.test(command) || tokens.length === 0;
}

function recursiveOption(tokens) { return tokens.some((token) => token === "-r" || token === "-R" || token === "--recursive" || (/^-[A-Za-z]+$/.test(token) && /[rR]/.test(token))); }

export function classifyShell(command) {
  if (typeof command !== "string") return { outcome: SAFETY_OUTCOMES.UNGUARDED, reason: "COMMAND_UNRESOLVED" };
  const tokens = tokenize(command);
  if (tokens === null || unsupported(command, tokens)) return { outcome: SAFETY_OUTCOMES.UNGUARDED, reason: "UNSUPPORTED_SHELL_FORM" };
  const [program, ...arguments_] = tokens;
  const lower = program.toLowerCase();
  if (lower === "sudo") return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "SUDO" };
  if (lower === "rm" && recursiveOption(arguments_)) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "RM_RECURSIVE" };
  if (lower === "git" && arguments_[0] === "reset" && arguments_.includes("--hard")) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "GIT_RESET_HARD" };
  if (lower === "git" && arguments_[0] === "clean" && arguments_.some((argument) => argument === "-f" || argument === "--force" || (/^-[A-Za-z]+$/.test(argument) && argument.includes("f")))) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "GIT_CLEAN_FORCE" };
  if (lower === "git" && arguments_[0] === "checkout" && arguments_[1] === "--" && arguments_.length > 2) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "GIT_CHECKOUT_PATH" };
  if ((lower === "chmod" || lower === "chown") && recursiveOption(arguments_)) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "RECURSIVE_OWNERSHIP" };
  if (lower.startsWith("mkfs")) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "MKFS" };
  if (lower === "dd" && arguments_.some((argument) => argument.startsWith("of=/dev/"))) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "DD_DEVICE" };
  if (["shutdown", "reboot", "poweroff", "halt"].includes(lower)) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "POWER" };
  if (lower === "del" && arguments_.some((argument) => argument.toLowerCase() === "/s")) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "WINDOWS_DEL_RECURSIVE" };
  if (["rd", "rmdir"].includes(lower) && arguments_.some((argument) => argument.toLowerCase() === "/s")) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "WINDOWS_RMDIR_RECURSIVE" };
  if (lower === "remove-item" && arguments_.some((argument) => ["-recurse", "-force"].includes(argument.toLowerCase()))) return { outcome: SAFETY_OUTCOMES.CONFIRM, reason: "POWERSHELL_REMOVE_ITEM" };
  return { outcome: SAFETY_OUTCOMES.ALLOW, reason: "SAFE_COMMAND" };
}

export function classifyToolCall({ toolName, input }, options) {
  if ((toolName === "write" || toolName === "edit") && input && typeof input.path === "string") return classifyPath(input.path, options);
  if (toolName === "bash" && input && typeof input.command === "string") return classifyShell(input.command);
  return { outcome: SAFETY_OUTCOMES.ALLOW, reason: "UNGUARDED_TOOL" };
}
