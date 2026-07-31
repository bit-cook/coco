import { open, readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

async function descendants(pid) { const ids = []; for (const entry of await readdir("/proc")) { if (!/^\d+$/.test(entry)) continue; let fields; try { fields = (await readFile(`/proc/${entry}/stat`, "utf8")).split(" "); } catch (error) { if (error instanceof Error && error.code === "ENOENT") continue; throw error; } if (Number(fields[3]) === pid) ids.push(Number(entry), ...(await descendants(Number(entry)))); } return ids; }
function signal(pid, kind) { try { process.kill(pid, kind); } catch (error) { if (!(error instanceof Error && error.code === "ESRCH")) throw error; } }
export async function runWithTimeout(options) {
  const stdout = options.stdout === undefined ? "inherit" : (await open(options.stdout, "w")).createWriteStream(); const stderr = options.stderr === undefined ? "inherit" : (await open(options.stderr, "w")).createWriteStream(); const child = spawn(options.command[0], options.command.slice(1), { detached: true, stdio: ["ignore", stdout, stderr] }); let timedOut = false; let killed = [];
  const timer = setTimeout(async () => { timedOut = true; killed = [child.pid, ...(await descendants(child.pid))]; killed.forEach((id) => signal(id, "SIGTERM")); setTimeout(() => killed.forEach((id) => signal(id, "SIGKILL")), 100); }, options.timeout);
  const result = await new Promise((resolve, reject) => child.once("error", reject).once("close", (code, signalName) => resolve({ code, signal: signalName }))); clearTimeout(timer); if (timedOut) { await new Promise((resolve) => setTimeout(resolve, 150)); killed.push(...(await descendants(child.pid))); killed.forEach((id) => signal(id, "SIGKILL")); } if (stdout !== "inherit") stdout.end(); if (stderr !== "inherit") stderr.end(); return { ...result, reaped: timedOut, signals: timedOut ? ["TERM", "KILL"] : [], status: timedOut ? "timeout" : "completed" };
}
