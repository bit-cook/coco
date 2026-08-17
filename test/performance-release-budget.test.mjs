import assert from "node:assert/strict";
import test from "node:test";

import { evaluateStartupBudget, STARTUP_BENCHMARK_PROFILE, summarize } from "../scripts/benchmark-startup.mjs";

test("startup release profile versions host/runtime matrix, semantics, samples and regression policy", () => {
  assert.equal(STARTUP_BENCHMARK_PROFILE.schemaVersion, 1);
  assert.match(STARTUP_BENCHMARK_PROFILE.profileVersion, /v1$/);
  assert.deepEqual(Object.keys(STARTUP_BENCHMARK_PROFILE.definitions).sort(), ["cold", "full", "percentiles", "warm"]);
  assert.deepEqual(STARTUP_BENCHMARK_PROFILE.hostProfile, { architecture: "x64", node: ">=22.19.0", platform: "linux", runtime: "coco-bootstrap-integrity-v1" });
  assert.equal(STARTUP_BENCHMARK_PROFILE.integrity.mayDisableVerification, false);
  assert.ok(STARTUP_BENCHMARK_PROFILE.policy.minimumSamples >= 5);
  assert.ok(STARTUP_BENCHMARK_PROFILE.policy.noiseAllowanceRatio >= 0);
  assert.ok(STARTUP_BENCHMARK_PROFILE.policy.maximumRegressionRatio > 0);
  assert.deepEqual(STARTUP_BENCHMARK_PROFILE.matrix.map(({ id }) => id), ["version", "help", "task-list", "control-status", "list-models-lightweight", "list-models-full"]);
  assert.deepEqual(summarize([1, 2, 3, 4, 100]), { maxMs: 100, meanMs: 22, minMs: 1, p50Ms: 3, p95Ms: 100, samples: 5 });
});

test("warm samples are primed before percentile collection", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../scripts/benchmark-startup.mjs", import.meta.url), "utf8");
  assert.match(source, /await run\(agentDir,[^\n]+\);\n\s*for \(let index = 0; index < samples; index \+= 1\) warm\.push/);
});

test("executable budget accepts declared noise and rejects injected delay without weakening integrity", () => {
  const samples = STARTUP_BENCHMARK_PROFILE.policy.minimumSamples;
  const modes = () => Object.fromEntries(["cold", "warm", "full"].map((mode) => [mode, { p50Ms: 100, p95Ms: 120, samples }]));
  const baseline = { host: { architecture: "x64", platform: "linux" }, matrix: Object.fromEntries(STARTUP_BENCHMARK_PROFILE.matrix.map(({ id }) => [id, modes()])), profile: STARTUP_BENCHMARK_PROFILE, runtime: { node: "v22.19.0" } };
  const withinNoise = structuredClone(baseline);
  withinNoise.matrix.version.full.p95Ms *= 1 + STARTUP_BENCHMARK_PROFILE.policy.noiseAllowanceRatio;
  assert.equal(evaluateStartupBudget({ baseline, measurement: withinNoise }).status, "pass");

  const delayed = structuredClone(baseline);
  delayed.matrix.help.warm.p50Ms = 1000;
  const result = evaluateStartupBudget({ baseline, measurement: delayed });
  assert.equal(result.status, "fail");
  assert.ok(result.failures.includes("help.warm.p50Ms:regression"));
  assert.equal(STARTUP_BENCHMARK_PROFILE.integrity.mayDisableVerification, false);
});

test("budget fails closed for missing percentiles and insufficient samples", () => {
  const baseline = { host: { architecture: "x64", platform: "linux" }, matrix: Object.fromEntries(STARTUP_BENCHMARK_PROFILE.matrix.map(({ id }) => [id, Object.fromEntries(["cold", "warm", "full"].map((mode) => [mode, { p50Ms: 100, p95Ms: 120 }]))])), profile: STARTUP_BENCHMARK_PROFILE, runtime: { node: "v22.19.0" } };
  const result = evaluateStartupBudget({ baseline, measurement: { host: baseline.host, matrix: {}, profile: STARTUP_BENCHMARK_PROFILE, runtime: baseline.runtime } });
  assert.equal(result.status, "fail");
  assert.ok(result.failures.includes("version.cold.p50Ms:missing"));
  assert.ok(result.failures.includes("version.full.samples:insufficient"));
});

test("budget rejects profile, host, and runtime drift", () => {
  const base = { host: { architecture: "x64", platform: "linux" }, matrix: {}, profile: STARTUP_BENCHMARK_PROFILE, runtime: { node: "v22.19.0" } };
  const result = evaluateStartupBudget({ baseline: base, measurement: { ...base, host: { architecture: "arm64", platform: "linux" }, runtime: { node: "v24.0.0" } } });
  assert.ok(result.failures.includes("host:mismatch"));
  assert.ok(result.failures.includes("runtime.node:mismatch"));
});
