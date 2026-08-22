import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOrchInbox } from "../scripts/orch-inbox.mjs";

const item = (id, category = "follow-up", priority = 100) => ({
  category,
  createdAt: "2026-08-22T00:00:00.000Z",
  id,
  priority,
  source: "test",
});

test("inbox admits items sorted by priority then time", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-inbox-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const inbox = createOrchInbox({ agentDir });
  assert.equal(await inbox.size(), 0);
  assert.deepEqual(await inbox.admit(item("a", "follow-up", 200)), { admitted: true, position: 0 });
  assert.deepEqual(await inbox.admit(item("b", "scheduled", 100)), { admitted: true, position: 0 });
  assert.deepEqual(await inbox.admit(item("c", "child", 100)), { admitted: true, position: 1 });
  assert.equal(await inbox.size(), 3);
  assert.equal((await inbox.peek()).id, "b");
  assert.equal((await inbox.pop()).id, "b");
  assert.equal((await inbox.pop()).id, "c");
  assert.equal((await inbox.pop()).id, "a");
  assert.equal(await inbox.pop(), null);
});

test("inbox rejects duplicates and invalid items", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-inbox-reject-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const inbox = createOrchInbox({ agentDir });
  await inbox.admit(item("dup"));
  assert.deepEqual(await inbox.admit(item("dup")), { admitted: false, reason: "duplicate" });
  await assert.rejects(inbox.admit({ ...item("bad"), category: "unknown" }), { code: "ORCH_INBOX_ITEM_INVALID" });
  await assert.rejects(inbox.admit({ ...item("bad2"), priority: "high" }), { code: "ORCH_INBOX_ITEM_INVALID" });
});

test("inbox survives restart and rejects corrupt files", async (t) => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-orch-inbox-restart-"));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  const first = createOrchInbox({ agentDir });
  await first.admit(item("persist"));
  const second = createOrchInbox({ agentDir });
  assert.equal(await second.size(), 1);
  assert.equal((await second.peek()).id, "persist");
});
