import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runEgressAllowlist } from "../scripts/run-egress-allowlist.mjs";

async function run(options) { const fixture = await mkdtemp(join(tmpdir(), "coco-observer-")); return { evidence: join(fixture, "evidence.jsonl"), fixture, result: await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", "process.exit(0)"], denyAll: true, ...options, evidence: join(fixture, "evidence.jsonl") }) }; }

test("Given a missing observer binary, when egress starts, then it records inconclusive instead of throwing", async () => {
  const item = await run({ observerCommand: "missing-coco-observer" });
  try { assert.equal(item.result.status, "inconclusive"); assert.match(await readFile(item.evidence, "utf8"), /"reason":"OBSERVER_SPAWN"|"reason":"OBSERVER_EXIT"/); } finally { await rm(item.fixture, { force: true, recursive: true }); }
});

test("Given an observer that exits early or cannot create a trace, when egress starts, then it is inconclusive", async () => {
  const item = await run({ observerCommand: process.execPath, observerArgs: ["-e", "process.exit(9)"] });
  try { assert.equal(item.result.status, "inconclusive"); } finally { await rm(item.fixture, { force: true, recursive: true }); }
});

test("Given a hung direct child, when internal deadline expires, then it is reaped and evidence is inconclusive", async () => {
  const item = await run({ command: [process.execPath, "-e", "setInterval(()=>{},1000)"], timeoutMs: 100 });
  try { assert.equal(item.result.status, "inconclusive"); assert.match(await readFile(item.evidence, "utf8"), /"reason":"OBSERVER_TIMEOUT"/); } finally { await rm(item.fixture, { force: true, recursive: true }); }
});

test("Given a hung detached descendant, when internal deadline expires, then it is reaped", async () => {
  const item = await run({ command: [process.execPath, "-e", "require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}).unref();setInterval(()=>{},1000)"], timeoutMs: 100 });
  try { assert.equal(item.result.status, "inconclusive"); } finally { await rm(item.fixture, { force: true, recursive: true }); }
});

async function pidFrom(path) { return Number(await readFile(path, "utf8")); }
function isAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

test("Given a TERM-ignoring direct child, when timeout resolves, then its recorded PID is already dead", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-observer-term-"));
  const pidPath = join(fixture, "pid");
  try {
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", `require('fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`], denyAll: true, evidence: join(fixture, "evidence.jsonl"), timeoutMs: 250 });
    assert.equal(result.status, "inconclusive");
    assert.equal(isAlive(await pidFrom(pidPath)), false);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given a TERM-ignoring detached descendant, when timeout resolves, then every recorded PID is dead", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-observer-detached-term-"));
  const pidPath = join(fixture, "pid");
  try {
    const child = `require('fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`;
    const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:'ignore'}).unref();process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`;
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", parent], denyAll: true, evidence: join(fixture, "evidence.jsonl"), timeoutMs: 500 });
    assert.equal(result.status, "inconclusive");
    assert.equal(isAlive(await pidFrom(pidPath)), false);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});

test("Given an immediate-parent-exit detached TERM-ignoring child, when timeout resolves, then it is contained and dead", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-observer-reparent-"));
  const pidPath = join(fixture, "pid");
  const before = new Set((await readdir("/sys/fs/cgroup")).filter((name) => name.startsWith("coco-egress-"))); let group;
  try {
    const child = `require('fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`;
    const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:'ignore'}).unref();process.exit(0)`;
    const started = Date.now();
    const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", parent], containment: { create: async (...args) => { group = await args.at(-1)(...args.slice(0, -1)); return group; } }, denyAll: true, evidence: join(fixture, "evidence.jsonl"), timeoutMs: 500 });
    assert.ok(Date.now() - started < 2_000);
    assert.equal(result.status, "inconclusive");
    assert.equal(isAlive(await pidFrom(pidPath)), false);
    await assert.rejects(access(group, constants.F_OK));
    assert.equal((await readdir("/sys/fs/cgroup")).filter((name) => name.startsWith("coco-egress-") && !before.has(name)).length, 0);
  } finally { await rm(fixture, { force: true, recursive: true }); }
});
