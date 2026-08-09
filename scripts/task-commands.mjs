import { randomBytes } from "node:crypto";
import { cwd as currentDirectory } from "node:process";

import { agentDirectory } from "./state-paths.mjs";
import { createTaskStore } from "./task-state.mjs";
import { createTaskRunner, getRunnerStatus, startDetachedRunner, stopRunner } from "./task-runner.mjs";
import { processAlive, terminateProcessTree } from "./task-process.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }
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
  if (action === "list") return output((await store.load()).tasks.map(({ webhookSecret: _secret, ...task }) => task), json);
  if (action === "active") {
    const tasks = (await store.load()).tasks.filter((task) => task.status === "running" && task.pid).map(({ webhookSecret: _secret, ...task }) => task);
    return output({ agents: await Promise.all(tasks.map(async (task) => ({ ...task, alive: await processAlive(task.pid) }))), runner: await getRunnerStatus(agentDir) }, true);
  }
  if (action === "stop-all") {
    const state = await store.load();
    const active = state.tasks.filter(({ pid, status }) => pid || status === "running"); const ids = new Set(active.map(({ id }) => id));
    const results = await Promise.all(active.filter(({ pid }) => pid).map(({ pid }) => terminateProcessTree(pid)));
    await stopRunner(agentDir);
    const at = new Date().toISOString();
    await store.update((value) => { for (const task of value.tasks) if (ids.has(task.id)) { task.status = "cancelled"; task.pid = null; task.finishedAt = at; task.updatedAt = at; task.lastError = "TERMINATED_BY_USER"; } return value; });
    if (results.some(({ status }) => status === "alive")) fail("TASK_PROCESS_STILL_ALIVE");
    return output({ stopped: results.length, status: "terminated" }, true);
  }
  if (action === "show") {
    const task = (await store.load()).tasks.find(({ id }) => id === args[0] || id.startsWith(args[0] ?? ""));
    if (!task) fail("TASK_NOT_FOUND"); const { webhookSecret: _secret, ...visible } = task; return output(visible, true);
  }
  if (action === "cancel") {
    const id = args[0]; let target;
    const snapshot = await store.load(); target = snapshot.tasks.find((task) => task.id === id || task.id.startsWith(id ?? "")); if (!target) fail("TASK_NOT_FOUND");
    if (target.pid) { const result = await terminateProcessTree(target.pid); if (result.status === "alive") fail("TASK_PROCESS_STILL_ALIVE"); }
    await store.update((state) => { target = state.tasks.find((task) => task.id === id || task.id.startsWith(id ?? "")); target.status = "cancelled"; target.finishedAt = new Date().toISOString(); target.updatedAt = target.finishedAt; target.pid = null; target.lastError = "TERMINATED_BY_USER"; return state; });
    const { webhookSecret: _secret, ...visible } = target; return output(visible, true);
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
