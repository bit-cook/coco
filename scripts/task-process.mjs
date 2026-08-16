import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function zombie(pid) {
  if (process.platform !== "linux") return false;
  try { return (await readFile(`/proc/${pid}/stat`, "utf8")).split(" ")[2] === "Z"; } catch { return false; }
}

export async function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1 || await zombie(pid)) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

export async function processIdentity(pid) {
  if (!await processAlive(pid)) return null;
  if (process.platform === "linux") {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      const end = stat.lastIndexOf(")");
      const fields = stat.slice(end + 2).split(" ");
      return `linux:${fields[19]}`;
    } catch { return null; }
  }
  try {
    if (process.platform === "win32") {
      const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`]);
      return `win32:${stdout.trim()}`;
    }
    const { stdout } = await execute("ps", ["-o", "lstart=", "-p", String(pid)]);
    return `${process.platform}:${stdout.trim()}`;
  } catch { return null; }
}

export async function processMatches(pid, identity) {
  return typeof identity === "string" && identity.length > 0 && await processIdentity(pid) === identity;
}

async function groupAlive(pid) {
  if (process.platform === "win32") return processAlive(pid);
  try { process.kill(-pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

async function signalTarget(pid, signal) {
  let groupSignalled = false;
  if (process.platform !== "win32") {
    try { process.kill(-pid, signal); groupSignalled = true; } catch (error) { if (error?.code !== "ESRCH" && error?.code !== "EPERM") throw error; }
  }
  if (!groupSignalled || !(await groupAlive(pid))) {
    try { process.kill(pid, signal); } catch (error) { if (error?.code !== "ESRCH") throw error; }
  }
}

export async function terminateProcessTree(pid, { graceMs = 3000, identity } = {}) {
  if (!Number.isSafeInteger(pid) || pid < 1 || pid === process.pid) return { pid, status: "absent" };
  if (identity !== undefined) {
    const currentIdentity = await processIdentity(pid);
    if (currentIdentity === null) return { pid, status: "absent" };
    if (currentIdentity !== identity) return { pid, status: "identity-mismatch" };
  }
  if (process.platform === "win32") {
    try { await execute("taskkill", ["/PID", String(pid), "/T"]); } catch {}
    for (let elapsed = 0; elapsed < graceMs && await processAlive(pid); elapsed += 50) await delay(50);
    if (await processAlive(pid)) try { await execute("taskkill", ["/PID", String(pid), "/T", "/F"]); } catch {}
  } else {
    await signalTarget(pid, "SIGTERM");
    for (let elapsed = 0; elapsed < graceMs && (await processAlive(pid) || await groupAlive(pid)); elapsed += 50) await delay(50);
    if (await processAlive(pid) || await groupAlive(pid)) await signalTarget(pid, "SIGKILL");
  }
  for (let elapsed = 0; elapsed < 2000 && (await processAlive(pid) || await groupAlive(pid)); elapsed += 50) await delay(50);
  const alive = await processAlive(pid) || await groupAlive(pid);
  return { pid, status: alive ? "alive" : "terminated" };
}
