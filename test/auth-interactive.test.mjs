import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import test from "node:test";

import { confirmInteractiveRemove, readInteractiveKey } from "../scripts/auth-management.mjs";

class FakeTty extends EventEmitter {
  isTTY = true;
  offCalls = [];
  paused = 0;
  rawModes = [];
  resumed = 0;

  constructor({ failRawDisable = false, failRawEnable = false } = {}) {
    super();
    this.failRawDisable = failRawDisable;
    this.failRawEnable = failRawEnable;
  }

  off(event, handler) {
    this.offCalls.push(event);
    return super.off(event, handler);
  }

  pause() {
    this.paused += 1;
    return this;
  }

  resume() {
    this.resumed += 1;
    return this;
  }

  setRawMode(enabled) {
    this.rawModes.push(enabled);
    if (enabled && this.failRawEnable) throw new Error("raw mode unavailable");
    if (!enabled && this.failRawDisable) throw new Error("raw mode restore unavailable");
    return this;
  }
}

function output() {
  let text = "";
  return {
    text: () => text,
    write: (chunk) => {
      text += chunk;
      return true;
    },
  };
}

async function settles(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("interactive input did not settle")), 100);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function rejectsCode(promise, code) {
  await assert.rejects(settles(promise), (error) => error instanceof Error && error.code === code);
}

function assertRestored(input) {
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(input.paused, 1);
  assert.deepEqual(input.offCalls.sort(), ["close", "data", "end", "error"]);
  for (const event of ["close", "data", "end", "error"]) assert.equal(input.listenerCount(event), 0);
}

test("Given a fake TTY, when hidden confirmation receives Enter, then it settles and restores terminal state exactly once", async () => {
  const input = new FakeTty();
  const stderr = output();
  const confirmation = confirmInteractiveRemove(input, stderr);

  input.emit("data", Buffer.from("yes\n"));

  await settles(confirmation);
  assertRestored(input);
  assert.equal(stderr.text(), "Remove credential? [y/N] \n");
});

for (const [event, argument] of [["data", Buffer.from([3])], ["data", Buffer.from([4])], ["end"], ["close"], ["error", new Error("stream failure")]]) {
  test(`Given a fake TTY, when hidden confirmation receives ${event}, then it cancels and restores terminal state`, async () => {
    const input = new FakeTty();
    const confirmation = confirmInteractiveRemove(input, output());

    input.emit(event, argument);

    await rejectsCode(confirmation, "AUTH_INPUT_CANCELLED");
    assertRestored(input);
  });
}

test("Given raw mode enabling fails synchronously, when hidden confirmation starts, then it rejects and safely restores terminal state", async () => {
  const input = new FakeTty({ failRawEnable: true });

  await rejectsCode(confirmInteractiveRemove(input, output()), "AUTH_TTY_UNAVAILABLE");
  assertRestored(input);
});

test("Given raw mode restoration fails synchronously, when hidden confirmation is cancelled, then it still settles after the restoration attempt", async () => {
  const input = new FakeTty({ failRawDisable: true });
  const confirmation = confirmInteractiveRemove(input, output());

  input.emit("data", Buffer.from([3]));

  await rejectsCode(confirmation, "AUTH_INPUT_CANCELLED");
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(input.paused, 1);
  assert.deepEqual(input.offCalls.sort(), ["close", "data", "end", "error"]);
});

for (const [name, bytes] of [["an invalid UTF-8 sequence", Buffer.from([0xc3, 10])], ["a NUL byte", Buffer.from([121, 101, 115, 0, 10])], ["more than the key byte limit", Buffer.concat([Buffer.alloc(16 * 1024 + 1, 120), Buffer.from("\n")])]]) {
  test(`Given a fake TTY, when hidden confirmation receives ${name}, then it rejects without relaxing key constraints`, async () => {
    const input = new FakeTty();
    const confirmation = confirmInteractiveRemove(input, output());

    input.emit("data", bytes);

    await rejectsCode(confirmation, "AUTH_KEY_INVALID");
    assertRestored(input);
  });
}

test("Given a fake TTY, when backspace or delete corrects hidden entries, then matching confirmation returns the corrected UTF-8 key", async () => {
  const input = new FakeTty();
  const stderr = output();
  const key = readInteractiveKey(input, stderr);

  input.emit("data", Buffer.from([115, 0xc3, 0xa9, 99, 114, 101, 88, 127, 116, 10]));
  await new Promise((resolve) => setImmediate(resolve));
  input.emit("data", Buffer.from([115, 0xc3, 0xa9, 99, 114, 101, 88, 27, 91, 51, 126, 116, 10]));

  assert.equal(await settles(key), "s\u00e9cret");
  assert.deepEqual(input.rawModes, [true, false, true, false]);
  assert.equal(input.paused, 2);
  assert.equal(stderr.text().includes("s\u00e9cret"), false);
});

test("Given distinct hidden entries, when confirmation completes, then mismatch rejects without writing either credential", async () => {
  const input = new FakeTty();
  const stderr = output();
  const key = readInteractiveKey(input, stderr);

  input.emit("data", Buffer.from("first-secret\n"));
  await new Promise((resolve) => setImmediate(resolve));
  input.emit("data", Buffer.from("second-secret\n"));

  await rejectsCode(key, "AUTH_CONFIRMATION_MISMATCH");
  assert.equal(stderr.text().includes("first-secret"), false);
  assert.equal(stderr.text().includes("second-secret"), false);
});

test("Given a subprocess receives a credential over stdin, when it rejects an API-key argv option, then neither output stream nor its argv discloses the credential", async () => {
  const root = new URL("..", import.meta.url).pathname;
  const source = `
    import { dispatchCoco } from ${JSON.stringify(new URL("../scripts/coco-dispatcher.mjs", import.meta.url).href)};
    let stdin = "";
    for await (const chunk of process.stdin) stdin += chunk;
    const secret = stdin.trim();
    let stderr = "";
    const write = process.stderr.write;
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    const result = await dispatchCoco({ argv: ["manage", "auth", "set", "achai", "--api-key=" + secret], root: ${JSON.stringify(root)} });
    process.stderr.write = write;
    process.stdout.write(JSON.stringify({ argvHasSecret: process.argv.includes(secret), exitCode: result.exitCode, leaked: stderr.includes(secret) }));
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end("SUBPROCESS_SECRET_MUST_NOT_LEAK\n");

  const code = await new Promise((resolve) => child.once("close", (status) => resolve(status ?? 1)));
  const report = JSON.parse(stdout);
  assert.equal(code, 0);
  assert.deepEqual(report, { argvHasSecret: false, exitCode: 1, leaked: false });
  assert.equal(stderr.includes("SUBPROCESS_SECRET_MUST_NOT_LEAK"), false);
});
