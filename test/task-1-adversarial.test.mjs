import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runEgressAllowlist } from "../scripts/run-egress-allowlist.mjs";
import { verifyBaseline } from "../scripts/verify-protected-baseline.mjs";
import { runWithTimeout } from "../scripts/run-with-timeout.mjs";
import { validateAuthorizationTable, authorizeChange } from "../scripts/verify-baseline-authorization.mjs";
import { verifyPlanEvidence } from "../scripts/verify-plan-evidence.mjs";
import { receiptValid } from "../scripts/bootstrap-final-verification.mjs";
import { verifyScope } from "../scripts/final-scope-redaction.mjs";
import { hasWritableCgroupV2 } from "./task-1-cgroup-capability.mjs";

const testWithWritableCgroup = (await hasWritableCgroupV2()) ? test : test.skip;

testWithWritableCgroup("Given a child creating a local TCP connection, when egress deny-all runs it, then the connection is blocked and evidenced", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-egress-"));
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", `require("net").connect(${address.port},"127.0.0.1")`], denyAll: true, evidence: join(fixture, "egress.jsonl") });
    assert.equal(result.status, "rejected");
    assert.match(await readFile(join(fixture, "egress.jsonl"), "utf8"), /"kinds":\["tcp"\]/);
  } finally {
    server.close();
    await rm(fixture, { force: true, recursive: true });
  }
});

testWithWritableCgroup("Given a direct Node child catching TCP and DNS errors, when deny-all runs it, then runtime attempts reject", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-deny-direct-"));
  try {
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", "const net=require('net'),dns=require('dns');try{net.connect(53,'1.1.1.1')}catch{};try{dns.lookup('example.com',()=>{})}catch{}"], denyAll: true, evidence: join(fixture, "egress.jsonl") });
    assert.notEqual(result.status, "completed");
    assert.match(await readFile(join(fixture, "egress.jsonl"), "utf8"), /"kinds":\["dns","tcp"\]/);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given a spawned Node child catching network errors, when its parent exits zero under deny-all, then it rejects", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-deny-descendant-"));
  try {
    const childCode = "const net=require('net');try{net.connect(53,'1.1.1.1')}catch{}";
    const parentCode = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'}).unref()`;
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", parentCode], denyAll: true, evidence: join(fixture, "egress.jsonl") });
    assert.notEqual(result.status, "completed");
    assert.match(await readFile(join(fixture, "egress.jsonl"), "utf8"), /"kinds":\["tcp"\]/);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given a network-free Node child, when deny-all guard runs it, then zero-attempt evidence permits completion", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-deny-clean-"));
  try {
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", "process.exit(0)"], denyAll: true, evidence: join(fixture, "egress.jsonl") });
    assert.equal(result.status, "completed");
    assert.match(await readFile(join(fixture, "egress.jsonl"), "utf8"), /"attempts":0/);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given a descendant overriding its evidence path, when it attempts TCP, then the parent sink still rejects", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-deny-sink-"));
  try {
    const childCode = "try{require('net').connect(53,'1.1.1.1')}catch{}";
    const parentCode = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{env:{COCO_EGRESS_RUNTIME_EVIDENCE:'/tmp/other'},stdio:'ignore'}).unref()`;
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", parentCode], denyAll: true, evidence: join(fixture, "authoritative.jsonl") });
    assert.equal(result.status, "rejected");
    assert.match(await readFile(join(fixture, "authoritative.jsonl"), "utf8"), /"kinds":\["tcp"\]/);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given Socket and DNS API variants, when caught attempts run, then each is runtime-evidenced", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-deny-apis-"));
  try {
    const code = "const n=require('net'),d=require('dns');for(const f of [()=>new n.Socket().connect(53,'1.1.1.1'),()=>d.resolve4('example.com',()=>{}),()=>d.promises.lookup('example.com'),()=>new d.Resolver().resolve4('example.com',()=>{})])try{f()}catch{}";
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", code], denyAll: true, evidence: join(fixture, "egress.jsonl") });
    assert.equal(result.status, "rejected");
    assert.match(await readFile(join(fixture, "egress.jsonl"), "utf8"), /"kinds":\["dns","tcp"\]/);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given a network-free descendant with hostile env, when deny-all runs it, then authoritative zero proof completes", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-deny-clean-child-"));
  try {
    const code = "require('child_process').spawn(process.execPath,['-e','process.exit(0)'],{env:{COCO_EGRESS_RUNTIME_EVIDENCE:'/tmp/other',NODE_OPTIONS:''},stdio:'ignore'}).unref()";
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", code], denyAll: true, evidence: join(fixture, "egress.jsonl") });
    assert.equal(result.status, "completed");
    assert.match(await readFile(join(fixture, "egress.jsonl"), "utf8"), /"attempts":0/);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

testWithWritableCgroup("Given registry-only mode, when a Node child connects to loopback, then it rejects rather than bypassing", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-registry-"));
  const server = createServer();
  let connections = 0;
  server.on("connection", () => { connections += 1; });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const result = await runEgressAllowlist({ allow: ["https://registry.npmjs.org"], command: [process.execPath, "-e", `require("net").connect(${address.port},"127.0.0.1")`], denyAll: false, evidence: join(fixture, "egress.jsonl") });
    assert.equal(result.status, "inconclusive");
    assert.equal(connections, 0);
  } finally { server.close(); await rm(fixture, { force: true, recursive: true }); }
});

test("Given registry-only mode, when a proxy environment is present, then it fails closed", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-proxy-"));
  try {
    const result = await runEgressAllowlist({ allow: ["https://registry.npmjs.org"], command: [process.execPath, "-e", "process.exit(0)"], denyAll: false, evidence: join(fixture, "egress.jsonl"), environment: { HTTPS_PROXY: "http://127.0.0.1:9" } });
    assert.equal(result.status, "rejected");
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a canonical baseline with traversal or weak entry metadata, when verified, then it rejects", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-baseline-"));
  try {
    const baseline = JSON.parse(await readFile(new URL("../scripts/protected-baseline.json", import.meta.url), "utf8"));
    baseline.entries[0].path = "../escape";
    await writeFile(join(fixture, "protected-baseline.json"), `${JSON.stringify(baseline, Object.keys(baseline).sort())}\n`);
    await writeFile(join(fixture, "protected-baseline.json.sha256"), "0".repeat(64) + "  protected-baseline.json\n");
    assert.equal((await verifyBaseline({ baselinePath: join(fixture, "protected-baseline.json") })).status, "rejected");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given a detached grandchild, when timeout expires, then it is reaped", async () => {
  const result = await runWithTimeout({ command: [process.execPath, "-e", "require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}).unref();setInterval(()=>{},1000)"], timeout: 100 });
  assert.equal(result.status, "timeout");
  assert.equal(result.reaped, true);
});

test("Given an arbitrary authorization table, when validated, then it rejects", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-auth-"));
  try {
    await writeFile(join(fixture, "table.json"), '{"rules":[{"pathPattern":"*"}],"schemaVersion":1}\n');
    assert.equal((await validateAuthorizationTable(join(fixture, "table.json"))).status, "rejected");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given evidence with tampered partial manifest hash, when verified, then it rejects", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-evidence-"));
  try {
    await writeFile(join(fixture, "evidence.json"), '{"artifacts":{"partialManifestSha256":"0"},"planSha256":"x","schemaVersion":1,"status":"approved","task":1}\n');
    const planPath = join(fixture, "plan.md");
    await writeFile(planPath, "fixture plan\n");
    const result = await verifyPlanEvidence({ evidencePath: join(fixture, "evidence.json"), manifestPath: new URL("../scripts/final-verifier-manifest.partial.v1.json", import.meta.url), planPath });
    assert.equal(result.status, "rejected");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given authorization lifecycle changes, when evaluated, then root exceptions and transient transactions reject", async () => {
  await validateAuthorizationTable(new URL("../resources/baseline-authorization.v1.json", import.meta.url));
  assert.equal(authorizeChange({ action: "delete", evidence: ["committed-receipt"], path: "transactions/x.json", present: true }).status, "rejected");
  assert.equal(authorizeChange({ action: "update", evidence: [], path: "unknown.json", present: true }).status, "rejected");
});

test("Given canonical authorization rules, when each rule action/evidence/pointers are evaluated, then policy is exact", async () => {
  await validateAuthorizationTable(new URL("../resources/baseline-authorization.v1.json", import.meta.url));
  assert.equal(authorizeChange({ action: "update", comparison: "managed-json", evidence: ["ownership", "committed-receipt"], path: "settings.json", pointers: ["/defaultModel"], present: true }).status, "approved");
  assert.equal(authorizeChange({ action: "update", comparison: "managed-json", evidence: ["ownership"], path: "settings.json", pointers: ["/defaultModel"], present: true }).status, "rejected");
  assert.equal(authorizeChange({ action: "create", comparison: "managed-json", evidence: ["ownership", "committed-receipt"], path: "settings.json", pointers: [], present: true }).status, "rejected");
  assert.equal(authorizeChange({ action: "update", comparison: "lifecycle", evidence: [], path: "catalogs/idepub/current.models.json", pointers: [], present: true }).status, "rejected");
  assert.equal(authorizeChange({ action: "create", comparison: "lifecycle", evidence: ["ownership"], path: "APPEND_SYSTEM.md", pointers: [], present: true }).status, "rejected");
});

test("Given credential markers split across multiline and binary chunks, when scope audit runs, then it rejects without emitting content", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-scope-"));
  try {
    await writeFile(join(fixture, "secret.bin"), Buffer.from("api\nKey = 'sentinel-value'\0"));
    await writeFile(join(fixture, "evidence.json"), "{}\n");
    const result = await verifyScope({ baselinePath: new URL("../scripts/protected-baseline.json", import.meta.url), root: fixture, evidencePath: join(fixture, "evidence.json") });
    assert.equal(result.status, "rejected");
    assert.deepEqual(result.secretViolations, ["SECRET_PATTERN"]);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given the approved receipt and binding variants, when parsed, then only the exact receipt passes", async () => {
  const receipt = `---
status: review-approved
plan_sha256: 03966a1e794e6f766d381d429ac6a5a4197e349b0a9e80c7a34d60cbdfc7c9d6
review_round_id: 5d084cdd-c96f-43a4-b3b6-32a8378da93a
  momus:
    status: approved
    launch_id: ea5aa9c3-6d04-487e-9f8d-3b03b787aae6
    session: ses_fixture_momus
    result: OKAY
  independent:
    status: approved
    launch_id: 76078c2b-abe4-4450-9639-f1a0deba9976
    session: ses_fixture_independent
    result: OKAY
`;
  assert.equal(receiptValid(receipt), true);
  assert.equal(receiptValid(receipt.replace("result: OKAY", "result: NO")), false);
  assert.equal(receiptValid(receipt.replace("review-approved", "review-in-flight")), false);
});
