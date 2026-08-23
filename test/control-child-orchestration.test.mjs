import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Control exposes the child admission route without a new execution path", async () => {
  const source = await readFile(new URL("../scripts/control-service.mjs", import.meta.url), "utf8");
  assert.match(source, /\/v1\/orchestration\/children/); assert.match(source, /createOrchChildService/); assert.match(source, /startDetachedRunner/);
});
