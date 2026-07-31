import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("provider integration executes fake-provider QA through coco", async () => {
  const root = resolve(new URL("..", import.meta.url).pathname);
  const fixture = await mkdtemp(join(tmpdir(), "coco-provider-integration-"));
  const evidence = join(fixture, "evidence.json");
  try {
    const child = spawn(process.execPath, ["scripts/qa-task-14.mjs", "--scenario", "all", "--evidence", evidence], { cwd: root, stdio: "ignore" });
    const code = await new Promise((complete) => child.once("close", (status) => complete(status ?? 1)));
    const report = JSON.parse(await readFile(evidence, "utf8"));
    assert.equal(code, 0);
    assert.equal(report.status, "approved");
    assert.equal(report.cases.every((entry) => entry.status === "passed"), true);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
