import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const receiptDirectory = process.env.COCO_RECEIPT_DIR;
const receiptNames = receiptDirectory ? await readdir(receiptDirectory).catch((error) => {
  if (error && error.code === "ENOENT") return [];
  throw error;
}) : [];
const receipts = receiptDirectory ? receiptNames.map((name) => join(receiptDirectory, name)) : [];
const snapshots = await Promise.all(receipts.map(async (path) => {
  try { return { bytes: await readFile(path), path }; } catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
}));
const tests = process.env.COCO_TEST_FILES?.split(",").filter(Boolean) ?? (await readdir("test")).filter((path) => path.endsWith(".test.mjs")).sort().map((path) => `test/${path}`);
const code = await new Promise((finish) => {
  const child = spawn(process.execPath, ["--test", "--test-concurrency=1", ...tests], { env: process.env, stdio: "inherit" });
  child.once("close", (status) => finish(status ?? 1));
});
for (const snapshot of snapshots) if (snapshot) assert.deepEqual(await readFile(snapshot.path), snapshot.bytes, snapshot.path);
process.exitCode = code;
