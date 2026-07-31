import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runEgressAllowlist } from "../scripts/run-egress-allowlist.mjs";
import { hasWritableCgroupV2 } from "./task-1-cgroup-capability.mjs";

const CHILD = "try{require('net').connect(53,'1.1.1.1')}catch{}";
const HOSTILE = "{env:{COCO_EGRESS_RUNTIME_EVIDENCE:'/tmp/other',NODE_OPTIONS:''},stdio:'ignore'}";
const testWithWritableCgroup = (await hasWritableCgroupV2()) ? test : test.skip;

function parent(api) {
  const quoted = JSON.stringify(CHILD);
  const code = {
    spawn: `require('child_process').spawn(process.execPath,['-e',${quoted}],${HOSTILE}).unref()`,
    spawnSync: `require('child_process').spawnSync(process.execPath,['-e',${quoted}],${HOSTILE})`,
    execFile: `require('child_process').execFile(process.execPath,['-e',${quoted}],${HOSTILE},()=>{})`,
    execFileSync: `require('child_process').execFileSync(process.execPath,['-e',${quoted}],${HOSTILE})`,
    exec: `require('child_process').exec(${JSON.stringify(`${process.execPath} -e ${JSON.stringify(CHILD)}`)},${HOSTILE},()=>{})`,
    execSync: `require('child_process').execSync(${JSON.stringify(`${process.execPath} -e ${JSON.stringify(CHILD)}`)},${HOSTILE})`,
    fork: `const fs=require('fs'),p='/tmp/coco-fork-'+process.pid+'.cjs';fs.writeFileSync(p,${JSON.stringify(`${CHILD};require('fs').unlinkSync(__filename)`)});require('child_process').fork(p,[],${HOSTILE}).unref()`,
  };
  return code[api];
}

for (const api of ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"]) {
  testWithWritableCgroup(`Given hostile ${api} child options, when its child catches TCP, then authoritative evidence rejects`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), `coco-child-${api}-`));
    try {
      const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", parent(api)], denyAll: true, evidence: join(fixture, "evidence.jsonl") });
      assert.notEqual(result.status, "completed");
      assert.match(await readFile(join(fixture, "evidence.jsonl"), "utf8"), /"kinds":\["tcp"\]|"status":"inconclusive"/);
    } finally { await rm(fixture, { force: true, recursive: true }); }
  });
}

testWithWritableCgroup("Given callback and sync child APIs with no network, when guarded, then they retain valid execution semantics", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-child-clean-"));
  try {
    const code = `const c=require('child_process');c.execFile(process.execPath,['-e','process.exit(0)'],{env:{NODE_OPTIONS:''}},(e)=>{if(e)process.exit(1)});c.spawnSync(process.execPath,['-e','process.exit(0)'],{env:{NODE_OPTIONS:''}})`;
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", code], denyAll: true, evidence: join(fixture, "evidence.jsonl") });
    assert.notEqual(result.status, "rejected");
  } finally { await rm(fixture, { force: true, recursive: true }); }
});
