import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("CLI autocomplete menu does not add a redundant CoCo fallback prefix", async () => {
  const patcher = await readFile(join(root, "scripts", "apply-coco-identity-patch.mjs"), "utf8");
  assert.match(patcher, /sourceInfo\.scope === "project" \? uiText\("Project"\) : undefined/);
  assert.doesNotMatch(patcher, /sourceInfo\.scope === "project" \? uiText\("Project"\) : uiText\("CoCo"\)/);
});
