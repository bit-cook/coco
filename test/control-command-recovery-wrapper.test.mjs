import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCommandRecoveryJournal } from "../scripts/command-recovery-journal.mjs";
import { runControlCommandMutation } from "../scripts/control-command-recovery.mjs";

const input = {
  commandId: "control-command-1",
  effectGeneration: 1,
  operationId: "control.test.mutation",
  request: { input: { value: 7 }, method: "POST", path: "/v1/test" },
};

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "coco-control-command-wrapper-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return createCommandRecoveryJournal({ directory });
}

test("duplicate commands replay the recorded HTTP status and body", async (t) => {
  const journal = await fixture(t);
  let effects = 0;
  const run = () => runControlCommandMutation({
    ...input,
    effect: async () => { effects += 1; return { body: { created: true }, status: 201 }; },
    journal,
  });

  const first = await run();
  const duplicate = await run();

  assert.deepEqual(first, { body: { created: true }, status: 201 });
  assert.deepEqual(duplicate, first);
  assert.equal(effects, 1);
});

test("command ID reuse with a different request returns a digest conflict", async (t) => {
  const journal = await fixture(t);
  await runControlCommandMutation({ ...input, effect: async () => ({ body: { ok: true }, status: 200 }), journal });

  let effects = 0;
  const response = await runControlCommandMutation({
    ...input,
    effect: async () => { effects += 1; return { body: { ok: false }, status: 200 }; },
    journal,
    request: { ...input.request, input: { value: 8 } },
  });

  assert.deepEqual(response, { body: { error: "IDEMPOTENCY_KEY_CONFLICT" }, status: 409 });
  assert.equal(effects, 0);
});

test("a concurrent duplicate reports the effect in progress", async (t) => {
  const journal = await fixture(t);
  let releaseEffect;
  let effectStarted;
  const started = new Promise((resolve) => { effectStarted = resolve; });
  const release = new Promise((resolve) => { releaseEffect = resolve; });
  let effects = 0;

  const first = runControlCommandMutation({
    ...input,
    effect: async () => {
      effects += 1;
      effectStarted();
      await release;
      return { body: { ok: true }, status: 202 };
    },
    journal,
  });
  await started;

  const concurrent = await runControlCommandMutation({
    ...input,
    effect: async () => { effects += 1; return { body: { duplicated: true }, status: 200 }; },
    journal,
  });
  assert.deepEqual(concurrent, { body: { error: "COMMAND_IN_PROGRESS", status: "executing" }, status: 409 });

  releaseEffect();
  assert.deepEqual(await first, { body: { ok: true }, status: 202 });
  assert.equal(effects, 1);
});

test("an uncertain effect is recorded and never retried", async (t) => {
  const journal = await fixture(t);
  let effects = 0;
  const run = () => runControlCommandMutation({
    ...input,
    effect: async () => { effects += 1; throw new Error("connection lost after effect"); },
    journal,
  });

  const first = await run();
  const duplicate = await run();

  assert.deepEqual(first, { body: { error: "COMMAND_OUTCOME_UNCERTAIN", status: "uncertain" }, status: 409 });
  assert.deepEqual(duplicate, first);
  assert.equal(effects, 1);
  assert.equal((await journal.read(input.commandId)).status, "uncertain");
});
