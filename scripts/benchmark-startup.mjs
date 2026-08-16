import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

const root = resolve(new URL("..", import.meta.url).pathname);
const bootstrap = join(root, "scripts", "coco-bootstrap.cjs");
const samples = Number.parseInt(process.env.COCO_BENCHMARK_SAMPLES ?? "5", 10);

if (!Number.isSafeInteger(samples) || samples < 1 || samples > 100) {
  throw new Error("COCO_BENCHMARK_SAMPLES must be an integer from 1 to 100");
}

function run(agentDir, full = false, args = ["--version"]) {
  return new Promise((resolveRun, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, [bootstrap, ...args], {
      cwd: root,
      env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir, ...(full ? { COCO_INTEGRITY_FULL: "1" } : {}) },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `CoCo exited with ${code}`));
      else resolveRun(performance.now() - started);
    });
  });
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    maxMs: Number(sorted.at(-1).toFixed(2)),
    meanMs: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    p50Ms: Number(sorted[Math.floor((sorted.length - 1) * 0.5)].toFixed(2)),
    p95Ms: Number(sorted[Math.floor((sorted.length - 1) * 0.95)].toFixed(2)),
    samples: sorted.length,
  };
}

const directory = await mkdtemp(join(tmpdir(), "coco-startup-benchmark-"));
const agentDir = join(directory, "agent");
try {
  const coldMs = await run(agentDir);
  const warm = [];
  const full = [];
  const command = process.env.COCO_BENCHMARK_COMMAND?.split(" ").filter(Boolean);
  for (let index = 0; index < samples; index += 1) warm.push(await run(agentDir));
  for (let index = 0; index < samples; index += 1) full.push(await run(agentDir, true));
  let commandResult;
  if (command?.length) {
    const commandAgentDir = join(directory, "command-agent");
    const commandColdMs = await run(commandAgentDir, false, command);
    const commandWarm = [];
    for (let index = 0; index < samples; index += 1) commandWarm.push(await run(commandAgentDir, false, command));
    commandResult = { args: command, coldMs: Number(commandColdMs.toFixed(2)), warm: summarize(commandWarm) };
  }
  process.stdout.write(`${JSON.stringify({ coldMs: Number(coldMs.toFixed(2)), command: commandResult, full: summarize(full), node: process.version, platform: process.platform, warm: summarize(warm) }, null, 2)}\n`);
} finally {
  await rm(directory, { force: true, recursive: true });
}
