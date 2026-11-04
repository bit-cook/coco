import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyModelPanelRollback } from "../scripts/verify-model-panel-rollback.mjs";

const currentVersion = JSON.parse(await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version;

test("model panel rollback rejects candidate failures and preserves the official runtime", async () => {
  const calls = [];
  const receipt = await verifyModelPanelRollback({ run: async (command, args, options) => { calls.push({ args, command, hasAgentDir: typeof options.env.COCO_CODING_AGENT_DIR === "string" }); return { stdout: `${currentVersion}\n` }; } });
  assert.deepEqual(receipt, {
    failures: { officialCapabilities: "MODEL_PANEL_CAPABILITIES_INVALID", productionScope: "MODEL_PANEL_PRODUCTION_PROMOTION_BLOCKED", tamperedReceipt: "MODEL_PANEL_REMOTE_RECEIPT_INVALID" },
    officialRuntime: { status: "passed", version: currentVersion }, owner: "fallback", productionRegistration: "blocked", schemaVersion: 1, status: "approved",
  });
  assert.equal(calls.length, 1); assert.equal(calls[0].hasAgentDir, true); assert.match(calls[0].args[0], /bin\/coco$/); assert.deepEqual(calls[0].args.slice(1), ["--version"]);
});

test("model panel rollback fails closed when the official runtime reports a stale version", async () => {
  const receipt = await verifyModelPanelRollback({ run: async () => ({ stdout: "0.5.3\n" }) });
  assert.equal(receipt.status, "rejected");
  assert.equal(receipt.officialRuntime.status, "failed");
  assert.equal(receipt.officialRuntime.version, "0.5.3");
});

test("model panel rollback fails closed when the official runtime cannot start", async () => {
  const receipt = await verifyModelPanelRollback({ run: async () => { throw new Error("sensitive failure"); } });
  assert.deepEqual(receipt, { code: "MODEL_PANEL_ROLLBACK_RUNTIME_FAILED", owner: "fallback", productionRegistration: "blocked", schemaVersion: 1, status: "rejected" });
});
