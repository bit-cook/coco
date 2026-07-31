import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const fixtureTest = "test/receipt-runner-fixture.test.mjs";

async function runReceiptRunner({ cwd = root, env, uid } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/run-tests-preserving-receipts.mjs"], {
      cwd,
      env: { ...process.env, COCO_TEST_FILES: fixtureTest, ...env },
      gid: uid,
      stdio: "ignore",
      uid,
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
}

test("Given an explicit receipt fixture, when the serial runner executes, then its bytes remain untouched", async () => {
  const receiptDirectory = await mkdtemp(join(tmpdir(), "coco-receipts-"));
  const receipts = ["task-2.json", "task-3.json"];
  try {
    await Promise.all(receipts.map((receipt, index) => writeFile(join(receiptDirectory, receipt), Buffer.from([index, 0, 255]))));
    const before = await Promise.all(receipts.map((receipt) => readFile(join(receiptDirectory, receipt))));

    assert.equal(await runReceiptRunner({ env: { COCO_RECEIPT_DIR: receiptDirectory } }), 0);

    const after = await Promise.all(receipts.map((receipt) => readFile(join(receiptDirectory, receipt))));
    assert.deepEqual(after, before);
  } finally {
    await rm(receiptDirectory, { force: true, recursive: true });
  }
});

test("Given a non-root home with an absent receipt directory, when the serial runner executes, then it does not access private receipts", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-runner-"));
  try {
    const home = join(fixture, "home");
    await mkdir(join(fixture, "scripts"));
    await mkdir(join(fixture, "test"));
    await mkdir(home);
    await writeFile(join(fixture, "scripts", "run-tests-preserving-receipts.mjs"), await readFile(join(root, "scripts", "run-tests-preserving-receipts.mjs")));
    await writeFile(join(fixture, fixtureTest), await readFile(join(root, fixtureTest)));
    await chmod(fixture, 0o755);
    await chmod(home, 0o755);
    assert.equal(await runReceiptRunner({ cwd: fixture, env: { COCO_RECEIPT_DIR: join(home, ".omo", "evidence"), HOME: home }, uid: 65534 }), 0);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
