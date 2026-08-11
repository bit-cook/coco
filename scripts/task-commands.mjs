import { randomBytes } from "node:crypto";
import { cwd as currentDirectory } from "node:process";

import { agentDirectory } from "./state-paths.mjs";
import { createTaskStore } from "./task-state.mjs";
import { cancelTask, createTaskRunner, getRunnerStatus, startDetachedRunner, stopRunner } from "./task-runner.mjs";
import { processMatches } from "./task-process.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function visibleTask({ cancelPending: _cancelPending, pendingRunEvent: _pendingRunEvent, webhookSecret: _secret, ...task }) { return task; }
function output(value, json) {
  process.stdout.write(json ? `${JSON.stringify(value)}\n` : `${Array.isArray(value) ? value.map((task) => `${task.id}  ${task.status.padEnd(9)} ${task.prompt}`).join("\n") : typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  return { exitCode: 0, kind: "native" };
}
function duration(value) {
  const match = /^(\d+)(m|h|d)$/.exec(value ?? "");
  if (!match) fail("SCHEDULE_INVALID");
  return Number(match[1]) * ({ m: 60000, h: 3600000, d: 86400000 })[match[2]];
}
export async function taskCommand(argv, root) {
  const agentDir = agentDirectory(); const store = createTaskStore({ agentDir });
  const [action, ...args] = argv; const json = args.includes("--json");
  if (action === "list") return output((await store.load()).tasks.map(visibleTask), json);
  if (action === "active") {
    const tasks = (await store.load()).tasks.filter((task) => task.status === "running" && task.pid).map(visibleTask);
    return output({ agents: await Promise.all(tasks.map(async (task) => ({ ...task, alive: await processMatches(task.pid, task.processIdentity) }))), runner: await getRunnerStatus(agentDir) }, true);
  }
  if (action === "stop-all") {
    const state = await store.load();
    const active = state.tasks.filter(({ pid, status }) => pid || status === "running");
    const result = await stopRunner(agentDir);
    return output({ stopped: active.length, status: result.status === "stopped" ? "terminated" : result.status }, true);
  }
  if (action === "show") {
    const task = (await store.load()).tasks.find(({ id }) => id === args[0] || id.startsWith(args[0] ?? ""));
    if (!task) fail("TASK_NOT_FOUND"); return output(visibleTask(task), true);
  }
  if (action === "cancel") {
    const id = args[0]; let target;
    const snapshot = await store.load(); target = snapshot.tasks.find((task) => task.id === id || task.id.startsWith(id ?? "")); if (!target) fail("TASK_NOT_FOUND");
    target = await cancelTask(store, target.id);
    return output(visibleTask(target), true);
  }
  if (action === "run") { await createTaskRunner({ agentDir, root }).run({ once: true }); return output("task runner: completed", json); }
  if (action !== "create") fail("TASK_USAGE");
  const flags = new Set(args.filter((token) => token.startsWith("--")));
  const scheduleIndex = args.indexOf("--schedule"); const githubIndex = args.indexOf("--github-event");
  const consumed = new Set();
  if (scheduleIndex !== -1) { consumed.add(scheduleIndex); consumed.add(scheduleIndex + 1); }
  if (githubIndex !== -1) { consumed.add(githubIndex); consumed.add(githubIndex + 1); }
  const prompt = args.filter((token, index) => !token.startsWith("--") && !consumed.has(index)).join(" ").trim();
  if (!prompt) fail("TASK_USAGE");
  const intervalMs = scheduleIndex === -1 ? null : duration(args[scheduleIndex + 1]);
  const webhook = flags.has("--webhook");
  const github = githubIndex === -1 ? null : { event: args[githubIndex + 1], repository: null };
  const trigger = github ? "github" : webhook ? "webhook" : intervalMs ? "schedule" : "manual";
  const secret = webhook || github ? randomBytes(32).toString("hex") : null;
  const task = await store.create({ cwd: currentDirectory(), github, initialStatus: webhook || github ? "blocked" : "queued", prompt, schedule: intervalMs ? { intervalMs, nextRunAt: new Date().toISOString() } : null, trigger, webhookSecret: secret, worktree: !flags.has("--no-worktree") });
  await startDetachedRunner({ agentDir, root });
  return output({ ...task, webhookPath: secret ? `/v1/hooks/${task.id}` : null }, true);
}

export async function runnerCommand(argv, root) {
  const agentDir = agentDirectory(); const [action] = argv;
  if (action === "start") return output(await startDetachedRunner({ agentDir, root }), true);
  if (action === "stop") return output(await stopRunner(agentDir), true);
  if (action === "status") return output(await getRunnerStatus(agentDir), true);
  if (action === "run") { await createTaskRunner({ agentDir, root }).run({ once: argv.includes("--once") }); return output({ status: "stopped" }, true); }
  fail("RUNNER_USAGE");
}
