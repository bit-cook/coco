import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runEgressAllowlist } from "../scripts/run-egress-allowlist.mjs";

async function run(code) { const fixture = await mkdtemp(join(tmpdir(), "coco-channel-")); try { return { fixture, result: await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", code], denyAll: true, evidence: join(fixture, "evidence.jsonl") }) }; } catch (error) { await rm(fixture, { force: true, recursive: true }); throw error; } }

test("Given caught TCP plus old-path truncation and forged zero output, when guarded, then parent rejects", async () => {
  const { fixture, result } = await run("try{require('fs').writeFileSync(process.env.COCO_EGRESS_RUNTIME_EVIDENCE||'/tmp/other','{\\\"attempts\\\":0}')}catch{};try{require('net').connect(53,'1.1.1.1')}catch{}");
  try { assert.equal(result.status, "rejected"); assert.match(await readFile(join(fixture, "evidence.jsonl"), "utf8"), /"kinds":\["tcp"\]/); } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given clean direct and descendant children, when channel lifecycle completes, then parent approves zero attempts", async () => {
  const { fixture, result } = await run("require('child_process').spawn(process.execPath,['-e','process.exit(0)'],{stdio:'ignore'}).unref()");
  try { assert.equal(result.status, "completed"); assert.match(await readFile(join(fixture, "evidence.jsonl"), "utf8"), /"attempts":0/); } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given abrupt exit before guard summary, when channel closes, then it fails closed", async () => {
  const { fixture, result } = await run("process.kill(process.pid,'SIGKILL')");
  try { assert.equal(result.status, "inconclusive"); } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a forged FD summary before a caught TCP attempt, when frames conflict, then parent rejects", async () => {
  const { fixture, result } = await run("const s=process.env.COCO_EGRESS_SESSION;require('fs').writeSync(3,JSON.stringify({v:1,session:s,pid:process.pid,seq:2,type:'summary',fields:{attempts:0}})+'\\n');try{require('net').connect(53,'1.1.1.1')}catch{}");
  try { assert.equal(result.status, "rejected"); assert.match(await readFile(join(fixture, "evidence.jsonl"), "utf8"), /"malformed":true/); } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a forged FD summary without a network call, when duplicate summary conflicts with guard lifecycle, then it is inconclusive", async () => {
  const { fixture, result } = await run("const s=process.env.COCO_EGRESS_SESSION;require('fs').writeSync(3,JSON.stringify({v:1,session:s,pid:process.pid,seq:2,type:'summary',fields:{attempts:0}})+'\\n')");
  try { assert.equal(result.status, "inconclusive"); assert.match(await readFile(join(fixture, "evidence.jsonl"), "utf8"), /"malformed":true/); } finally { await rm(fixture, { force: true, recursive: true }); }
});
