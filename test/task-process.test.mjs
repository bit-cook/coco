import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

import { processAlive, terminateProcessTree } from "../scripts/task-process.mjs";

test("process-tree termination kills a TERM-ignoring agent and its descendants", { skip: process.platform === "win32" }, async () => {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  assert.equal(await processAlive(child.pid), true);
  const result = await terminateProcessTree(child.pid, { graceMs: 100 });
  assert.equal(result.status, "terminated");
  assert.equal(await processAlive(child.pid), false);
});
