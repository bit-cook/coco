import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";

const receipts = [
  "/root/.omo/evidence/task-2-coco-production-hardening.json",
  "/root/.omo/evidence/task-3-coco-production-hardening.json",
];
const snapshots = await Promise.all(receipts.map(async (path) => {
  try { return { bytes: await readFile(path), path }; } catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
}));
const tests = (await readdir("test")).filter((path) => path.endsWith(".test.mjs")).sort().map((path) => `test/${path}`);
const code = await new Promise((finish) => {
  const child = spawn(process.execPath, ["--test", "--test-concurrency=1", ...tests], { env: process.env, stdio: "inherit" });
  child.once("close", (status) => finish(status ?? 1));
});
for (const snapshot of snapshots) if (snapshot) assert.deepEqual(await readFile(snapshot.path), snapshot.bytes, snapshot.path);
process.exitCode = code;
