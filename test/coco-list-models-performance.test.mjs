import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { canUseLightweightModelList } from "../scripts/coco-dispatcher.mjs";

const root = new URL("..", import.meta.url).pathname;

function runPath({ agentDir, cwd, mode, search }) {
  const dispatcher = pathToFileURL(join(root, "scripts", "coco-dispatcher.mjs")).href;
  const services = pathToFileURL(join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "core", "agent-session-services.js")).href;
  const listing = pathToFileURL(join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli", "list-models.js")).href;
  const argv = search === undefined ? ["--list-models"] : ["--list-models", search];
  const source = mode === "lightweight"
    ? `import { dispatchCoco } from ${JSON.stringify(dispatcher)}; const result = await dispatchCoco({ argv: ${JSON.stringify(argv)}, root: ${JSON.stringify(root)} }); process.exitCode = result.exitCode;`
    : `import { createAgentSessionServices } from ${JSON.stringify(services)}; import { listModels } from ${JSON.stringify(listing)}; const value = await createAgentSessionServices({ agentDir: ${JSON.stringify(agentDir)}, cwd: ${JSON.stringify(cwd)} }); await listModels(value.modelRuntime, ${JSON.stringify(search)});`;
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], { cwd, env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [], stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk)); child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => resolveRun({ exitCode, stderr: Buffer.concat(stderr), stdout: Buffer.concat(stdout) }));
  });
}

async function comparePaths(agentDir, cwd, search) {
  const full = await runPath({ agentDir, cwd, mode: "full", search });
  const lightweight = await runPath({ agentDir, cwd, mode: "lightweight", search });
  assert.deepEqual(lightweight, full);
}

test("lightweight and full model listing are byte-equivalent across visibility inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-list-models-matrix-"));
  const beforeAgent = process.env.COCO_CODING_AGENT_DIR, beforeOffline = process.env.PI_OFFLINE, beforeKey = process.env.ANTHROPIC_API_KEY;
  try {
    process.env.COCO_CODING_AGENT_DIR = directory; process.env.PI_OFFLINE = "1";
    const cwd = join(directory, "project"); await mkdir(cwd);
    const model = { id: "matrix-model", name: "Matrix", api: "anthropic-messages", baseUrl: "https://invalid.test", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 100 };
    await writeFile(join(directory, "models.json"), JSON.stringify({ providers: { matrix: { api: "anthropic-messages", baseUrl: "https://invalid.test", apiKey: "fixture", models: [model] } } }));
    for (const search of [undefined, "matrix", "definitely-missing"]) await comparePaths(directory, cwd, search);
    await writeFile(join(directory, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "fixture" } }));
    await comparePaths(directory, cwd, "anthropic");
    process.env.ANTHROPIC_API_KEY = "fixture-environment";
    await comparePaths(directory, cwd, "anthropic");
    await writeFile(join(directory, "models.json"), "{ malformed");
    await comparePaths(directory, cwd, "matrix");
  } finally {
    for (const [key, value] of [["COCO_CODING_AGENT_DIR", beforeAgent], ["PI_OFFLINE", beforeOffline], ["ANTHROPIC_API_KEY", beforeKey]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { force: true, recursive: true });
  }
});

test("all extension and unknown visibility inputs fail closed to full Pi", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-list-models-fallback-"));
  const agentDir = join(directory, "agent"), cwd = join(directory, "project");
  const options = { cwd, environment: { ...process.env, COCO_CODING_AGENT_DIR: agentDir } };
  try {
    await mkdir(agentDir, { recursive: true }); await mkdir(cwd, { recursive: true });
    assert.equal(canUseLightweightModelList(["--list-models", "agnes"], options), true);
    for (const argv of [["--list-models", "agnes", "extra"], ["--list-models", "--verbose"], ["--list-models", "@file"], ["--list-models", "agnes", "-e", "provider.mjs"]]) {
      assert.equal(canUseLightweightModelList(argv, options), false);
    }
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: ["provider-package"] }));
    assert.equal(canUseLightweightModelList(["--list-models"], options), false, "settings packages");
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ extensions: ["provider.mjs"] }));
    assert.equal(canUseLightweightModelList(["--list-models"], options), false, "global settings extension");
    await writeFile(join(agentDir, "settings.json"), "{ malformed");
    assert.equal(canUseLightweightModelList(["--list-models"], options), false, "malformed settings");
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ futureModelVisibilityPolicy: true }));
    assert.equal(canUseLightweightModelList(["--list-models"], options), false, "unknown settings");
    await rm(join(agentDir, "settings.json"));
    await mkdir(join(agentDir, "extensions")); await writeFile(join(agentDir, "extensions", "native-provider.mjs"), "export default () => {};");
    assert.equal(canUseLightweightModelList(["--list-models"], options), false, "global native/custom provider");
    await mkdir(join(cwd, ".coco", "extensions"), { recursive: true }); await writeFile(join(cwd, ".coco", "extensions", "provider.mjs"), "export default () => {};");
    assert.equal(canUseLightweightModelList(["--list-models"], options), false, "project provider");
  } finally { await rm(directory, { force: true, recursive: true }); }
});
