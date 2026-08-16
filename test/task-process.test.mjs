import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

import { processAlive, processIdentity, terminateProcessTree } from "../scripts/task-process.mjs";

test("process-tree termination kills a TERM-ignoring agent and its descendants", { skip: process.platform === "win32" }, async () => {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  assert.equal(await processAlive(child.pid), true);
  const identity = await processIdentity(child.pid); assert.ok(identity);
  assert.equal((await terminateProcessTree(child.pid, { graceMs: 10, identity: `${identity}-wrong` })).status, "identity-mismatch");
  assert.equal(await processAlive(child.pid), true);
  const result = await terminateProcessTree(child.pid, { graceMs: 100, identity });
  assert.equal(result.status, "terminated");
  assert.equal(await processAlive(child.pid), false);
});

test("process-tree termination kills descendants after their group leader exits on TERM", { skip: process.platform === "win32" }, async () => {
  const child = spawn(process.execPath, ["-e", "require('node:child_process').spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
  const identity = await processIdentity(child.pid); assert.ok(identity);
  const result = await terminateProcessTree(child.pid, { graceMs: 100, identity });
  assert.equal(result.status, "terminated");
  assert.equal(await processAlive(child.pid), false);
});

test("process-tree termination kills a non-group root instead of trusting a missing group", { skip: process.platform === "win32" }, async () => {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { detached: false, stdio: "ignore" });
  const identity = await processIdentity(child.pid); assert.ok(identity);
  const result = await terminateProcessTree(child.pid, { graceMs: 50, identity });
  assert.equal(result.status, "terminated"); assert.equal(await processAlive(child.pid), false);
});
