import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { detectPiModelPanelCapabilities } from "../scripts/pi-model-panel-capabilities.mjs";

const root = new URL("..", import.meta.url).pathname;

test("patched baseline reports substrate but missing built-in selector ownership", async () => {
  const result = await detectPiModelPanelCapabilities({ artifactState: "baseline-patched", packageRoot: join(root, "node_modules", "@earendil-works", "pi-coding-agent") });
  assert.equal(result.capabilities.length, 6); assert.equal(result.status, "missing"); assert.equal(result.capabilities[0].id, "builtin-model-selector-ownership"); assert.equal(result.capabilities[0].status, "missing");
  assert.equal(result.capabilities.find(({ id }) => id === "visible-model-projection").status, "present"); assert.equal(JSON.stringify(result).includes(root), false);
  for (const capability of result.capabilities) for (const evidence of capability.evidence) assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
});

test("comments, strings, longer names, and wrong containers never satisfy exact methods", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-capabilities-"));
  try {
    await writeFile(join(fixture, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "not-semver" }));
    const files = ["dist/core/extensions/types.d.ts","dist/core/extensions/loader.js","dist/core/model-runtime.d.ts","dist/core/model-runtime.js","dist/core/settings-manager.d.ts","dist/core/settings-manager.js","dist/core/agent-session.d.ts","dist/core/agent-session.js"];
    for (const file of files) { await mkdir(dirname(join(fixture, file)), { recursive: true }); await writeFile(join(fixture, file), `// registerBuiltinModelPanel\nconst text="getVisibleSnapshot"; class Wrong { login(){} } interface ModelRuntime { getVisibleSnapshotLegacy(): void }`); }
    const result = await detectPiModelPanelCapabilities({ artifactState: "fixture", packageRoot: fixture }); assert.equal(result.status, "missing"); assert.ok(result.capabilities.every(({ status }) => status === "missing")); assert.equal(JSON.stringify(result).includes(fixture), false);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("exact extension type method and loader API property satisfy ownership without semver inference", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-capability-present-"));
  try {
    await writeFile(join(fixture, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "future" }));
    const definitions = {
      "dist/core/extensions/types.d.ts": "interface ExtensionAPI { registerBuiltinModelPanel(adapter: unknown): void }",
      "dist/core/extensions/loader.js": "function createExtensionAPI() { const other={registerBuiltinModelPanel(){}}; const api={registerBuiltinModelPanel(adapter){ return adapter; }}; return api; }",
      "dist/core/model-runtime.d.ts": "declare class ModelRuntime { getVisibleSnapshot(): unknown; hasConfiguredAuth(): boolean; login(): void }",
      "dist/core/model-runtime.js": "class ModelRuntime { getVisibleSnapshot(){} hasConfiguredAuth(){} login(){} }",
      "dist/core/settings-manager.d.ts": "declare class SettingsManager { setDefaultModelAndProvider(): void }", "dist/core/settings-manager.js": "class SettingsManager { setDefaultModelAndProvider(){} }",
      "dist/core/agent-session.d.ts": "declare class AgentSession { setModel(): void }", "dist/core/agent-session.js": "class AgentSession { setModel(){} }",
    };
    for (const [file, source] of Object.entries(definitions)) { await mkdir(dirname(join(fixture, file)), { recursive: true }); await writeFile(join(fixture, file), source); }
    const result = await detectPiModelPanelCapabilities({ artifactState: "fixture", packageRoot: fixture }); assert.equal(result.status, "present"); assert.ok(result.capabilities.every(({ status }) => status === "present")); assert.equal(JSON.stringify(result).includes(fixture), false);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});
