import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("backup drill uses separate off-host upload and restore jobs without write credentials", async () => {
  const workflow = await readFile(new URL("../.github/workflows/backup-drill.yml", import.meta.url), "utf8");
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^  create-offhost-set:$/m);
  assert.match(workflow, /^  restore-offhost-set:\n    needs: create-offhost-set$/m);
  assert.match(workflow, /persist-credentials: false/g);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /COCO_BACKUP_DRILL_AUTH_KEY/);
  assert.match(workflow, /COCO_BACKUP_DRILL_STATE_KEY/);
  assert.match(workflow, /git bundle verify/);
  assert.doesNotMatch(workflow, /permissions:[\s\S]*contents: write/);
  assert.doesNotMatch(workflow, /echo.*COCO_BACKUP_DRILL|printenv|set -x/);
});
