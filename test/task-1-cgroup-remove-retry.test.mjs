import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runEgressAllowlist } from "../scripts/run-egress-allowlist.mjs";
import { hasWritableCgroupV2 } from "./task-1-cgroup-capability.mjs";

async function groups() { return new Set((await readdir("/sys/fs/cgroup")).filter((name) => name.startsWith("coco-egress-"))); }
async function run(containment = {}) { const fixture = await mkdtemp(join(tmpdir(), "coco-remove-retry-")); const evidence = join(fixture, "evidence.jsonl"); return { evidence, fixture, result: await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", "process.exit(0)"], containment, denyAll: true, evidence }) }; }
const testWithWritableCgroup = (await hasWritableCgroupV2()) ? test : test.skip;

testWithWritableCgroup("Given a clean completion, when egress returns, then its cgroup is immediately absent", async () => {
  let created;
  const item = await run({ create: async (...args) => { created = await args.at(-1)(...args.slice(0, -1)); return created; } });
  try { assert.equal(item.result.status, "completed"); await assert.rejects(access(created, constants.F_OK)); assert.equal((await groups()).has(created.split("/").at(-1)), false); } finally { await rm(item.fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given transient remove failures, when egress cleans up, then it retries until the cgroup is absent", async () => {
  let attempts = 0; let created;
  const item = await run({ create: async (...args) => { created = await args.at(-1)(...args.slice(0, -1)); return created; }, remove: async (...args) => { attempts += 1; if (attempts < 3) throw new Error("transient"); await args.at(-1)(...args.slice(0, -1)); } });
  try { assert.equal(item.result.status, "completed"); assert.equal(attempts, 3); await assert.rejects(access(created, constants.F_OK)); } finally { await rm(item.fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given a persistent remove failure after real removal, when egress returns, then it is typed inconclusive and absent", async () => {
  let created;
  const item = await run({ create: async (...args) => { created = await args.at(-1)(...args.slice(0, -1)); return created; }, remove: async (...args) => { await args.at(-1)(...args.slice(0, -1)); throw new Error("persistent"); } });
  try { assert.equal(item.result.status, "inconclusive"); assert.match(await readFile(item.evidence, "utf8"), /"reason":"CGROUP_REMOVE_FAILED"/); await assert.rejects(access(created, constants.F_OK)); } finally { await rm(item.fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given a disappearing cgroup remove race, when removal reports ENOENT, then egress completes safely", async () => {
  const item = await run({ remove: async (...args) => { await args.at(-1)(...args.slice(0, -1)); const error = new Error("gone"); error.code = "ENOENT"; throw error; } });
  try { assert.equal(item.result.status, "completed"); } finally { await rm(item.fixture, { force: true, recursive: true }); }
});
