import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createProviderSyncTestCapability, syncProviderModelsForTest } from "../scripts/dev-provider-sync.mjs";
import { StateError } from "../scripts/state-schema.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);

async function rejects(action) {
  try {
    await action();
  } catch (error) {
    return error instanceof StateError && error.code === "TEST_SEAM_FORBIDDEN";
  }
  return false;
}

test("Given a provider-sync capability, when used from its canonical test root, then fixture sync accepts it", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-provider-capability-"));
  const capability = createProviderSyncTestCapability(root);
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "test";
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability, origin: "http://127.0.0.1:1", provider: "idepub", root })), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    await rm(agentDir, { force: true, recursive: true });
  }
});

test("Given an absent, foreign-root, wrong-cwd, production, or non-loopback capability use, when fixture sync is requested, then it is rejected before networking", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-provider-capability-"));
  const otherRoot = await mkdtemp(join(tmpdir(), "coco-provider-capability-root-"));
  const capability = createProviderSyncTestCapability(root);
  const wrongRootCapability = createProviderSyncTestCapability(otherRoot);
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCwd = process.cwd();
  try {
    process.env.NODE_ENV = "test";
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, origin: "http://127.0.0.1:1", provider: "idepub", root })), true);
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability: wrongRootCapability, origin: "http://127.0.0.1:1", provider: "idepub", root })), true);
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability, origin: "http://localhost:1", provider: "idepub", root })), true);
    process.chdir(otherRoot);
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability, origin: "http://127.0.0.1:1", provider: "idepub", root })), true);
    process.chdir(previousCwd);
    process.env.NODE_ENV = "production";
    assert.equal(await rejects(() => syncProviderModelsForTest({ agentDir, capability, origin: "http://127.0.0.1:1", provider: "idepub", root })), true);
  } finally {
    process.chdir(previousCwd);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    await rm(agentDir, { force: true, recursive: true });
    await rm(otherRoot, { force: true, recursive: true });
  }
});
