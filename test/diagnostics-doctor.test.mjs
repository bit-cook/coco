import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { setAuthKey } from "../scripts/auth-management.mjs";
import { bootstrapState } from "../scripts/bootstrap-state.mjs";
import { coreCheck, doctor } from "../scripts/diagnostics.mjs";

const cocoRoot = new URL("..", import.meta.url).pathname;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-diagnostics-"));
  const agentDir = join(root, "agent");
  await bootstrapState({ agentDir, root: cocoRoot });
  await mkdir(join(agentDir, "sessions"), { recursive: true, mode: 0o700 });
  return { agentDir, root };
}

test("doctor checks auth for the configured default provider rather than an arbitrary provider", async () => {
  const { agentDir, root } = await fixture();
  const previous = process.env.COCO_CODING_AGENT_DIR;
  try {
    process.env.COCO_CODING_AGENT_DIR = agentDir;
    await setAuthKey({ agentDir, key: "default-provider-only", provider: "agnes" });
    const result = await doctor({ root: cocoRoot });
    const auth = result.checks.find((entry) => entry.id === "AUTH_STATUS");
    assert.deepEqual(auth.details, { present: true, provider: "agnes", rotationRequired: false, source: "auth" });
    assert.equal(auth.status, "pass");
    assert.equal(result.providers.length, 1);
    assert.equal(result.providers[0].provider, "agnes");
    assert.equal(result.providers[0].localStatus, "ready");
    assert.deepEqual(result.providers[0].verification, { scope: null, status: "not-checked" });
  } finally {
    if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous;
    await rm(root, { force: true, recursive: true });
  }
});

test("doctor connectivity probes configured providers only and skips when none are configured", async () => {
  const { agentDir, root } = await fixture();
  const previous = process.env.COCO_CODING_AGENT_DIR;
  try {
    process.env.COCO_CODING_AGENT_DIR = agentDir;
    const noCredentials = await doctor({ connectivity: true, root: cocoRoot, providerProbe: () => { throw new Error("PROBE_NOT_EXPECTED"); } });
    assert.equal(noCredentials.checks.find((entry) => entry.id === "PROVIDER_CONNECTIVITY").status, "skipped");
    await setAuthKey({ agentDir, key: "configured-provider-only", provider: "agnes" });
    const calls = [];
    const configured = await doctor({ connectivity: true, root: cocoRoot, providerProbe: async (url, key) => { calls.push({ key, url: url.href }); return { kind: "ok" }; } });
    assert.deepEqual(calls, [{ key: "configured-provider-only", url: "https://apihub.agnes-ai.com/v1/models" }]);
    assert.equal(configured.checks.find((entry) => entry.id === "PROVIDER_CONNECTIVITY").status, "pass");
  } finally {
    if (previous === undefined) delete process.env.COCO_CODING_AGENT_DIR; else process.env.COCO_CODING_AGENT_DIR = previous;
    await rm(root, { force: true, recursive: true });
  }
});

test("core check treats the default offline registry check as skipped", async () => {
  const previous = process.env.PI_OFFLINE;
  try {
    process.env.PI_OFFLINE = "1";
    const result = await coreCheck({ root: cocoRoot });
    const registry = result.checks.find((entry) => entry.id === "CORE_REGISTRY_CHECK");
    assert.equal(registry.status, "skipped");
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "healthy");
  } finally {
    if (previous === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = previous;
  }
});
