import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson } from "../scripts/canonical-json.mjs";
import { createCommandRecoveryJournal, requestDigest } from "../scripts/command-recovery-journal.mjs";

const command = { commandId: "cmd-1", operationId: "op-1", effectGeneration: 1, request: { action: "write", value: 7 } };

test("receipt and response are durable, canonical, and idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-command-journal-"));
  try {
    const journal = createCommandRecoveryJournal({ directory });
    const receipt = await journal.receive(command);
    assert.equal(receipt.status, "received");
    assert.equal(receipt.requestDigest, requestDigest(command.request));
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(journal.pathFor(command.commandId))).mode & 0o777, 0o600);
    assert.deepEqual(await journal.receive(command), receipt);
    await journal.beginExecution(command.commandId);
    const response = await journal.recordResult(command.commandId, { ok: true, value: 8 });
    assert.equal(response.status, "result");
    assert.deepEqual(await journal.receive(command), response);
    assert.equal(await readFile(journal.pathFor(command.commandId), "utf8"), canonicalJson(response));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("digest conflicts are rejected and results cannot be overwritten", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-command-journal-conflict-"));
  try {
    const journal = createCommandRecoveryJournal({ directory });
    await journal.receive(command);
    await assert.rejects(journal.receive({ ...command, request: { action: "different" } }), /COMMAND_DIGEST_CONFLICT/);
    await journal.beginExecution(command.commandId);
    await journal.recordResult(command.commandId, "first");
    assert.deepEqual(await journal.recordResult(command.commandId, "second"), await journal.read(command.commandId));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("restart converts in-flight effects to uncertain and never replays them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coco-command-journal-recovery-"));
  try {
    const first = createCommandRecoveryJournal({ directory });
    await first.receive(command);
    await first.beginExecution(command.commandId);
    const restarted = createCommandRecoveryJournal({ directory });
    const recovered = await restarted.recover();
    assert.equal(recovered[0].status, "uncertain");
    assert.equal((await restarted.read(command.commandId)).uncertainReason, "process-restarted");
    assert.deepEqual(await restarted.beginExecution(command.commandId), await restarted.read(command.commandId));
    await assert.rejects(restarted.recordResult("missing", true), /COMMAND_NOT_FOUND/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
