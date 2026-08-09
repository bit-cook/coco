import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../examples/extensions/subagent/index.ts", import.meta.url), "utf8");

test("headless project agents cannot bypass interactive approval", () => {
  assert.match(source, /if \(!ctx\.hasUI\) return \{/);
  assert.match(source, /if \(params\.confirmProjectAgents === false\) return \{/);
  assert.doesNotMatch(source, /&& confirmProjectAgents/);
});

test("subagent abort waits for shared process-tree termination", () => {
	assert.match(source, /terminateProcessTree\(proc\.pid!, \{ graceMs: 5000, identity: value \}\)/);
	assert.match(source, /if \(proc\.exitCode === null\) proc\.kill\("SIGTERM"\)/);
	assert.match(source, /if \(abortTermination\) await abortTermination/);
	assert.match(source, /signal\.removeEventListener\("abort", killProc\)/);
});
