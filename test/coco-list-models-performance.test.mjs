import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bootstrapState } from "../scripts/bootstrap-state.mjs";
import { canUseLightweightModelList, dispatchCoco } from "../scripts/coco-dispatcher.mjs";
import { listModels } from "../node_modules/@earendil-works/pi-coding-agent/dist/cli/list-models.js";
import { ModelRuntime } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js";

const root = new URL("..", import.meta.url).pathname;

async function capture(operation) {
  const lines = [], original = console.log;
  console.log = (line) => lines.push(`${line}`);
  try { await operation(); } finally { console.log = original; }
  return lines;
}

test("lightweight model listing is byte-equivalent to bundled Pi model listing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-list-models-performance-"));
  const beforeAgent = process.env.COCO_CODING_AGENT_DIR, beforeOffline = process.env.PI_OFFLINE;
  try {
    process.env.COCO_CODING_AGENT_DIR = directory; process.env.PI_OFFLINE = "1";
    await bootstrapState({ agentDir: directory, root });
    const expected = await capture(async () => listModels(await ModelRuntime.create({ allowModelNetwork: false }), "agnes"));
    const actual = await capture(async () => assert.deepEqual(await dispatchCoco({ argv: ["--list-models", "agnes"], root }), { exitCode: 0, kind: "native" }));
    assert.deepEqual(actual, expected);
  } finally {
    if (beforeAgent === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = beforeAgent;
    if (beforeOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = beforeOffline;
    await rm(directory, { force: true, recursive: true });
  }
});

test("lightweight model listing falls back when arguments or user extensions require full Pi", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-list-models-fallback-"));
  const beforeAgent = process.env.COCO_CODING_AGENT_DIR;
  try {
    process.env.COCO_CODING_AGENT_DIR = directory;
    assert.equal(canUseLightweightModelList(["--list-models"]), true);
    assert.equal(canUseLightweightModelList(["--list-models", "agnes"]), true);
    assert.equal(canUseLightweightModelList(["--list-models", "agnes", "extra"]), false);
    assert.equal(canUseLightweightModelList(["--list-models", "--verbose"]), false);
    await mkdir(join(directory, "extensions"));
    assert.equal(canUseLightweightModelList(["--list-models"]), false);
  } finally {
    if (beforeAgent === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = beforeAgent;
    await rm(directory, { force: true, recursive: true });
  }
});
