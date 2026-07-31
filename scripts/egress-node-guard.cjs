const fs = require("node:fs");
const net = require("node:net");
const dns = require("node:dns");
const childProcess = require("node:child_process");
const guard = __filename;
const channel = Number(process.env.COCO_EGRESS_CHANNEL_FD);
const session = process.env.COCO_EGRESS_SESSION;
let seq = 0;
let attempts = 0;
function event(type, fields = {}) { fs.writeSync(channel, `${JSON.stringify({ fields, pid: process.pid, seq: ++seq, session, type, v: 1 })}\n`); }
function tracked(result) { if (Number.isInteger(result?.pid)) event("child", { pid: result.pid }); return result; }
function blocked(kind) { attempts += 1; event("attempt", { kind }); const error = new Error("EGRESS_FORBIDDEN"); error.code = "EGRESS_FORBIDDEN"; return error; }
function patch(target, names, kind) { for (const name of names) if (typeof target[name] === "function") target[name] = () => { throw blocked(kind); }; }
event("start");
patch(net, ["connect", "createConnection"], "tcp");
patch(net.Socket.prototype, ["connect"], "tcp");
const names = (target) => Object.keys(target).filter((name) => name === "lookup" || name === "lookupService" || name === "resolve" || name === "reverse" || name.startsWith("resolve"));
patch(dns, names(dns), "dns"); patch(dns.promises, names(dns.promises), "dns");
patch(dns.Resolver.prototype, Object.getOwnPropertyNames(dns.Resolver.prototype).filter((name) => name === "resolve" || name === "reverse" || name.startsWith("resolve")), "dns");
if (dns.promises.Resolver) patch(dns.promises.Resolver.prototype, Object.getOwnPropertyNames(dns.promises.Resolver.prototype).filter((name) => name === "resolve" || name === "reverse" || name.startsWith("resolve")), "dns");
const original = Object.fromEntries(["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"].map((name) => [name, childProcess[name]]));
function forced(options = {}) { const env = { ...process.env, ...(options.env ?? {}), COCO_EGRESS_CHANNEL_FD: String(channel), COCO_EGRESS_SESSION: session, NODE_OPTIONS: `--require ${guard}` }; const stdio = Array.isArray(options.stdio) ? [...options.stdio.slice(0, 3)] : [options.stdio ?? "pipe", options.stdio ?? "pipe", options.stdio ?? "pipe"]; stdio[channel] = channel; return { ...options, env, stdio }; }
function withOptions(args, callback) { const values = [...args]; const last = values.at(-1); const options = last !== null && typeof last === "object" && !Array.isArray(last) ? values.pop() : {}; values.push(forced(options)); if (callback !== undefined) values.push(callback); return values; }
childProcess.spawn = (command, args = [], options = {}) => tracked(original.spawn(command, args, forced(options))); childProcess.spawnSync = (command, args = [], options = {}) => tracked(original.spawnSync(command, args, forced(options)));
function opaque() { event("opaque"); }
childProcess.execFile = (...args) => { opaque(); const callback = typeof args.at(-1) === "function" ? args.pop() : undefined; return tracked(original.execFile(...withOptions(args, callback))); }; childProcess.execFileSync = (...args) => { opaque(); return tracked(original.execFileSync(...withOptions(args))); };
childProcess.exec = (...args) => { opaque(); const callback = typeof args.at(-1) === "function" ? args.pop() : undefined; return tracked(original.exec(...withOptions(args, callback))); }; childProcess.execSync = (...args) => { opaque(); return tracked(original.execSync(...withOptions(args))); }; childProcess.fork = (...args) => { opaque(); return tracked(original.fork(...withOptions(args))); };
process.on("exit", () => event("summary", { attempts }));
