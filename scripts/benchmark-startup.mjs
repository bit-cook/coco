import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { arch, cpus, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const bootstrap = join(root, "scripts", "coco-bootstrap.cjs");
export const STARTUP_BENCHMARK_PROFILE = Object.freeze({
  schemaVersion: 1,
  profileVersion: "coco-startup-linux-v1",
  definitions: {
    cold: "first invocation with a new private agent directory",
    warm: "subsequent invocation reusing verified local integrity state",
    full: "subsequent invocation with complete integrity hashing required",
    percentiles: "nearest-rank percentile over elapsed wall-clock milliseconds",
  },
  hostProfile: { architecture: "x64", node: ">=22.19.0", platform: "linux", runtime: "coco-bootstrap-integrity-v1" },
  integrity: { fullEnvironment: "COCO_INTEGRITY_FULL=1", mayDisableVerification: false },
  matrix: [
    { id: "version", args: ["--version"], expectedCode: 0 },
    { id: "help", args: ["--help"], expectedCode: 0 },
    { id: "task-list", args: ["task", "list", "--json"], expectedCode: 0 },
    { id: "control-status", args: ["control", "status"], expectedCode: 0 },
    { id: "list-models-lightweight", args: ["--list-models", "agnes"], expectedCode: 0 },
    { id: "list-models-full", args: ["--list-models", "agnes", "extra"], expectedCode: 0 },
  ],
  policy: { minimumSamples: 5, noiseAllowanceRatio: 0.15, maximumRegressionRatio: 0.25 },
});

export function evaluateStartupBudget({ baseline, measurement, profile = STARTUP_BENCHMARK_PROFILE }) {
  const limitRatio = profile.policy.noiseAllowanceRatio + profile.policy.maximumRegressionRatio;
  const failures = [];
  if (baseline?.profile?.profileVersion !== profile.profileVersion || measurement?.profile?.profileVersion !== profile.profileVersion) failures.push("profile:mismatch");
  if (baseline?.host?.architecture !== measurement?.host?.architecture || baseline?.host?.platform !== measurement?.host?.platform) failures.push("host:mismatch");
  if (baseline?.runtime?.node !== measurement?.runtime?.node) failures.push("runtime.node:mismatch");
  for (const { id } of profile.matrix) {
    for (const mode of ["cold", "warm", "full"]) {
      for (const percentile of ["p50Ms", "p95Ms"]) {
        const expected = baseline?.matrix?.[id]?.[mode]?.[percentile];
        const actual = measurement?.matrix?.[id]?.[mode]?.[percentile];
        if (!(Number.isFinite(expected) && expected > 0 && Number.isFinite(actual))) failures.push(`${id}.${mode}.${percentile}:missing`);
        else if (actual > expected * (1 + limitRatio)) failures.push(`${id}.${mode}.${percentile}:regression`);
      }
      if ((measurement?.matrix?.[id]?.[mode]?.samples ?? 0) < profile.policy.minimumSamples) failures.push(`${id}.${mode}.samples:insufficient`);
    }
  }
  return { failures, limitRatio, status: failures.length === 0 ? "pass" : "fail" };
}

const samples = Number.parseInt(process.env.COCO_BENCHMARK_SAMPLES ?? `${STARTUP_BENCHMARK_PROFILE.policy.minimumSamples}`, 10);
const expectedCommandCode = Number.parseInt(process.env.COCO_BENCHMARK_EXPECTED_CODE ?? "0", 10);

if (!Number.isSafeInteger(samples) || samples < STARTUP_BENCHMARK_PROFILE.policy.minimumSamples || samples > 100 || !Number.isInteger(expectedCommandCode) || expectedCommandCode < 0 || expectedCommandCode > 255) {
  throw new Error(`COCO_BENCHMARK_SAMPLES must be an integer from ${STARTUP_BENCHMARK_PROFILE.policy.minimumSamples} to 100`);
}

function run(agentDir, full = false, args = ["--version"], expectedCode = 0) {
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
      if (code !== expectedCode) reject(new Error(stderr.trim() || `CoCo exited with ${code}, expected ${expectedCode}`));
      else resolveRun(performance.now() - started);
    });
  });
}

export function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio) => sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
  return {
    maxMs: Number(sorted.at(-1).toFixed(2)),
    meanMs: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    samples: sorted.length,
  };
}

export async function benchmarkStartup() {
  const directory = await mkdtemp(join(tmpdir(), "coco-startup-benchmark-"));
  try {
    const cases = [...STARTUP_BENCHMARK_PROFILE.matrix];
    const command = process.env.COCO_BENCHMARK_COMMAND?.split(" ").filter(Boolean);
    if (command?.length) cases.push({ id: "custom", args: command, expectedCode: expectedCommandCode });
    const matrix = {};
    for (const entry of cases) {
      const agentDir = join(directory, `${entry.id}-agent`);
      const cold = [], warm = [], full = [];
      for (let index = 0; index < samples; index += 1) cold.push(await run(join(directory, `${entry.id}-cold-${index}`), false, entry.args, entry.expectedCode));
      await run(agentDir, false, entry.args, entry.expectedCode);
      for (let index = 0; index < samples; index += 1) warm.push(await run(agentDir, false, entry.args, entry.expectedCode));
      for (let index = 0; index < samples; index += 1) full.push(await run(agentDir, true, entry.args, entry.expectedCode));
      matrix[entry.id] = { args: entry.args, cold: summarize(cold), expectedCode: entry.expectedCode, full: summarize(full), warm: summarize(warm) };
    }
    const primary = matrix.version;
    return {
      profile: STARTUP_BENCHMARK_PROFILE,
      host: { architecture: arch(), cpu: cpus()[0]?.model ?? "unknown", logicalCpus: cpus().length, osRelease: release(), platform: platform() },
      runtime: { execPath: process.execPath, node: process.version, versions: { modules: process.versions.modules, v8: process.versions.v8 } },
      cold: primary.cold, full: primary.full, matrix, warm: primary.warm,
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const measurement = await benchmarkStartup();
  const baselinePath = process.env.COCO_BENCHMARK_BASELINE;
  if (baselinePath) {
    const baseline = JSON.parse(await readFile(resolve(baselinePath), "utf8"));
    const evaluation = evaluateStartupBudget({ baseline, measurement });
    process.stdout.write(`${JSON.stringify({ evaluation, measurement }, null, 2)}\n`);
    if (evaluation.status !== "pass") process.exitCode = 1;
  } else process.stdout.write(`${JSON.stringify(measurement, null, 2)}\n`);
}
