import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyProviderCorrelationCandidate } from "../scripts/verify-provider-correlation-candidate.mjs";

test("provider correlation candidate evidence is pinned and fail-closed", async () => {
  assert.deepEqual(await verifyProviderCorrelationCandidate(), { sourceCommit: "b3ec5bed87ab4edd47eadb036d2527118c8bae6b", sourceTag: "coco-v0.82.1-coco.6", status: "approved" });
});

test("installed candidate exposes correlated provider lifecycle types", async () => {
  const root = new URL("../node_modules/@earendil-works/pi-coding-agent/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const types = await readFile(new URL("dist/core/extensions/types.d.ts", root), "utf8");
  assert.equal(manifest.cocoCandidate.sourceTag, "coco-v0.82.1-coco.6");
  assert.match(types, /requestId: string/); assert.match(types, /type: "provider_request_end"/); assert.match(types, /outcome: "done" \| "error" \| "aborted"/);
});
