import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

test("Given the runtime manifest, when startup closure is selected, then it strictly covers every entry", async () => {
  const manifest = JSON.parse(await readFile(join(root, "resources", "runtime-integrity-manifest.v1.json"), "utf8"));
  const startupClosure = manifest.startupClosure ?? manifest.entries.map((entry) => entry.path);
  const dependencyEntries = startupClosure.filter((path) => path.startsWith("node_modules/"));

  assert.deepEqual([...startupClosure].sort(), manifest.entries.map((entry) => entry.path).sort());
  assert.equal(new Set(startupClosure).size, manifest.entries.length);
  assert.ok(dependencyEntries.some((path) => path.startsWith("node_modules/@earendil-works/pi-tui/dist/")));
  assert.ok(dependencyEntries.some((path) => path.startsWith("node_modules/@modelcontextprotocol/sdk/dist/")));
});

test("Given the bootstrap warm path, then CAS reuse is metadata-gated and critical entries remain content-verified", async () => {
  const source = await readFile(join(root, "scripts", "coco-bootstrap.cjs"), "utf8");
  assert.match(source, /entrySnapshotsMatch\(cached\.entries, manifest, snapshotRoot\)/);
  assert.match(source, /directorySnapshotsMatch\(cached\.directories, runtimeRoots, snapshotRoot\)/);
  assert.match(source, /directoryCount: Object\.keys\(directories\)\.length/);
  assert.doesNotMatch(source, /function directorySnapshotsMatch[\s\S]{0,500}directorySnapshots\(runtimeRoots, base\)/);
  assert.match(source, /\["scripts\/coco-launcher\.mjs", "scripts\/runtime-store-policy\.cjs"\]/);
  assert.match(source, /hash\(storedManifest\) === hash\(manifestBytes\)/);
  assert.match(source, /hash\(storedSidecar\) === hash\(sidecarBytes\)/);
});

test("Given project resource preflight, launcher scans initially and revalidates immediately before Pi import", async () => {
  const [launcher, preflight] = await Promise.all([
    readFile(join(root, "scripts", "coco-launcher.mjs"), "utf8"),
    readFile(join(root, "scripts", "project-resource-preflight.mjs"), "utf8"),
  ]);
  assert.match(launcher, /preflightProjectResources[\s\S]*dispatchCoco/);
  assert.match(launcher, /coco-runtime-resource[\s\S]*preflight\.revalidate\(\)[\s\S]*runtime\.piCli/);
  assert.equal((launcher.match(/preflight\.revalidate\(\)/g) ?? []).length, 1);
  assert.equal((preflight.match(/inspectProjectResources\(snapshot\)/g) ?? []).length, 2);
});

test("startup benchmark records expected command exit status and full percentile summaries", async () => {
  const source = await readFile(join(root, "scripts", "benchmark-startup.mjs"), "utf8");
  assert.match(source, /COCO_BENCHMARK_EXPECTED_CODE/);
  assert.match(source, /expectedCode: expectedCommandCode/);
  for (const metric of ["minMs", "maxMs", "meanMs", "p50Ms", "p95Ms", "samples"]) assert.match(source, new RegExp(metric));
});
