import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runEgressAllowlist } from "../scripts/run-egress-allowlist.mjs";
import { hasWritableCgroupV2 } from "./task-1-cgroup-capability.mjs";

const NETWORK = "try{require('net').connect(53,'1.1.1.1')}catch{}";
const testWithWritableCgroup = (await hasWritableCgroupV2()) ? test : test.skip;

function hostile(preload, marker, api) {
  const options = `{env:{NODE_OPTIONS:'--require ${preload}',COCO_EGRESS_RUNTIME_EVIDENCE:'/tmp/other'},stdio:'ignore'}`;
  const child = JSON.stringify(NETWORK);
  return {
    spawn: `require('child_process').spawn(process.execPath,['-e',${child}],${options}).unref()`,
    execFile: `require('child_process').execFile(process.execPath,['-e',${child}],${options},()=>{})`,
    exec: `require('child_process').exec(${JSON.stringify(`${process.execPath} -e ${JSON.stringify(NETWORK)}`)},${options},()=>{})`,
    fork: `const fs=require('fs'),p=${JSON.stringify(`${marker}.child.cjs`)};fs.writeFileSync(p,${JSON.stringify(`${NETWORK};require('fs').unlinkSync(__filename)`)});require('child_process').fork(p,[],${options}).unref()`,
  }[api];
}

for (const api of ["spawn", "execFile", "exec", "fork"]) {
  testWithWritableCgroup(`Given a hostile NODE_OPTIONS preload via ${api}, when it restores net on nextTick, then it never runs and TCP rejects`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), `coco-options-${api}-`));
    const marker = join(fixture, "marker");
    const preload = join(fixture, "hostile.cjs");
    try {
      await writeFile(preload, `require('fs').writeFileSync(${JSON.stringify(marker)},'ran');const n=require('net');process.nextTick(()=>{n.connect=(...a)=>new n.Socket().connect(...a)})`);
      const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", hostile(preload, marker, api)], denyAll: true, evidence: join(fixture, "evidence.jsonl") });
      assert.notEqual(result.status, "completed");
      await assert.rejects(readFile(marker));
    } finally { await rm(fixture, { force: true, recursive: true }); }
  });
}

testWithWritableCgroup("Given a marker-only caller preload and clean child APIs, when guarded, then marker is absent and canonical NODE_OPTIONS is sole", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-options-clean-"));
  const marker = join(fixture, "marker");
  const preload = join(fixture, "hostile.cjs");
  try {
    await writeFile(preload, `require('fs').writeFileSync(${JSON.stringify(marker)},'ran')`);
    const code = `const c=require('child_process');c.execFile(process.execPath,['-e','process.exit(process.env.NODE_OPTIONS.includes("--require")?0:1)'],{env:{NODE_OPTIONS:'--require ${preload}'}},e=>{if(e)process.exit(1)});c.spawnSync(process.execPath,['-e','process.exit(0)'],{env:{NODE_OPTIONS:'--require ${preload}'}})`;
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", code], denyAll: true, evidence: join(fixture, "evidence.jsonl") });
    assert.notEqual(result.status, "rejected");
    await assert.rejects(readFile(marker));
  } finally { await rm(fixture, { force: true, recursive: true }); }
});
