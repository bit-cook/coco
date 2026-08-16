import { randomBytes } from "node:crypto";
import { cwd as currentDirectory } from "node:process";

import { agentDirectory } from "./state-paths.mjs";
import { createTaskStore } from "./task-state.mjs";
import { cancelTask, createTaskRunner, getRunnerStatus, startDetachedRunner, stopRunner } from "./task-runner.mjs";
import { processMatches } from "./task-process.mjs";

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function visibleTask(task) {
  const { activeRunId, attempts, branch, createdAt, finishedAt, github, heartbeatAt, id, logsTruncated, schedule, startedAt, status, trigger, updatedAt, worktree } = task;
  return { activeRunId, attempts, branch, createdAt, finishedAt, github, heartbeatAt, id, logsTruncated, schedule, startedAt, status, trigger, updatedAt, worktree };
}
function visibleRunner(runner) {
  const { status, stopped } = runner;
  return stopped === undefined ? { status } : { status, stopped };
}
function output(value, json) {
  process.stdout.write(json ? `${JSON.stringify(value)}\n` : `${Array.isArray(value) ? value.map((task) => `${task.id}  ${task.status}`).join("\n") : typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  return { exitCode: 0, kind: "native" };
}
function resolveTask(tasks, value) {
  if (typeof value !== "string" || !value.trim() || value.startsWith("--")) fail("TASK_ID_REQUIRED");
  const exact = tasks.find(({ id }) => id === value);
  if (exact) return exact;
  const matches = tasks.filter(({ id }) => id.startsWith(value));
  if (matches.length > 1) fail("TASK_ID_AMBIGUOUS");
  if (matches.length === 0) fail("TASK_NOT_FOUND");
  return matches[0];
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
    const tasks = (await store.load()).tasks.filter((task) => task.status === "running" && task.pid);
    const observedAt = new Date().toISOString();
    const runner = await getRunnerStatus(agentDir);
    return output({ agents: await Promise.all(tasks.map(async (task) => ({ ...visibleTask(task), alive: await processMatches(task.pid, task.processIdentity), observedAt }))), runner: visibleRunner(runner) }, true);
  }
  if (action === "stop-all") {
    const result = await stopRunner(agentDir);
    return output({ stopped: result.stopped ?? 0, status: result.status === "stopped" ? "terminated" : result.status }, true);
  }
  if (action === "show") {
    const task = resolveTask((await store.load()).tasks, args[0]);
    return output(visibleTask(task), true);
  }
  if (action === "cancel") {
    let target = resolveTask((await store.load()).tasks, args[0]);
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
  return output({ ...visibleTask(task), webhook: secret ? { auth: github ? "github-hmac-sha256" : "bearer", path: `/v1/hooks/${task.id}`, secret } : null }, true);
}

export async function runnerCommand(argv, root) {
  const agentDir = agentDirectory(); const [action] = argv;
  if (action === "start") return output(visibleRunner(await startDetachedRunner({ agentDir, root })), true);
  if (action === "stop") return output(visibleRunner(await stopRunner(agentDir)), true);
  if (action === "status") return output(visibleRunner(await getRunnerStatus(agentDir)), true);
  if (action === "run") { await createTaskRunner({ agentDir, root }).run({ once: argv.includes("--once") }); return output({ status: "stopped" }, true); }
  fail("RUNNER_USAGE");
}
