import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatModelPanelCanary, modelPanelCanary } from "../scripts/model-panel-canary.mjs";

const approved = { capabilities: { present: 6, required: 6 }, promotionAuthorized: false, pty: { panelOpens: 2, reload: "passed" }, rollout: { owner: "coco.model-panel.v1", scope: "isolated" }, scope: "isolated", status: "approved" };

test("model panel canary approves only complete isolated receipts and keeps production blocked", async () => {
  const result = await modelPanelCanary({ verify: async () => approved });
  assert.equal(result.exitCode, 0); assert.equal(result.productionRegistration, "blocked"); assert.equal(result.promotionAuthorized, false); assert.equal(Object.isFrozen(result), true);
  assert.equal(formatModelPanelCanary(result), "coco model-panel-canary: approved (isolated; 6/6 capabilities; reload passed; production blocked)\n");
  for (const mutate of [
    (value) => { value.scope = "production"; },
    (value) => { value.promotionAuthorized = true; },
    (value) => { value.pty.reload = "failed"; },
    (value) => { value.pty.panelOpens = 1; },
    (value) => { value.rollout.owner = "fallback"; },
  ]) {
    const invalid = structuredClone(approved); mutate(invalid); const rejected = await modelPanelCanary({ verify: async () => invalid });
    assert.equal(rejected.exitCode, 1); assert.equal(rejected.status, "rejected"); assert.equal(rejected.productionRegistration, "blocked");
  }
  const thrown = await modelPanelCanary({ verify: async () => { throw new Error("sensitive detail"); } });
  assert.equal(thrown.code, "MODEL_PANEL_CANARY_FAILED"); assert.equal(thrown.exitCode, 1); assert.equal(JSON.stringify(thrown).includes("sensitive detail"), false);
});

test("model panel canary formats stable failures and has no production mutation surface", async () => {
  const result = await modelPanelCanary({ verify: async () => ({ code: "MODEL_PANEL_TEST_FAILURE", promotionAuthorized: false, scope: "isolated", status: "rejected" }) });
  assert.equal(formatModelPanelCanary(result), "coco model-panel-canary: rejected (MODEL_PANEL_TEST_FAILURE; production blocked)\n");
  const source = await readFile(new URL("../scripts/model-panel-canary.mjs", import.meta.url), "utf8");
  for (const forbidden of ["process.env", "process.argv", "writeFile", "productionRegistration: \"enabled\""]) assert.equal(source.includes(forbidden), false);
});
