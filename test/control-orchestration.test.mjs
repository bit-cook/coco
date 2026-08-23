import assert from "node:assert/strict";
import test from "node:test";

test("control orchestration route contract exposes status, inbox, and pop", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../scripts/control-service.mjs", import.meta.url), "utf8");
  assert.match(source, /\/v1\/orchestration\/status/); assert.match(source, /\/v1\/orchestration\/inbox/); assert.match(source, /\/v1\/orchestration\/pop/); assert.match(source, /createOrchService/);
});
