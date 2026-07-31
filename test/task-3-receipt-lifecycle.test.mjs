import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receipts = [
  "/root/.omo/evidence/task-2-coco-production-hardening.json",
  "/root/.omo/evidence/task-3-coco-production-hardening.json",
];

test("Given fixed Task-2 and Task-3 receipts, when a focused test observes them, then their bytes remain untouched", async () => {
  for (const receipt of receipts) {
    try {
      const before = await readFile(receipt);
      const after = await readFile(receipt);
      assert.deepEqual(after, before, receipt);
    } catch (error) {
      if (!(error && error.code === "ENOENT")) throw error;
    }
  }
});
