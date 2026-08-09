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

async function groupAlive(pid) {
  if (process.platform === "win32") return processAlive(pid);
  try { process.kill(-pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

export async function terminateProcessTree(pid, { graceMs = 3000 } = {}) {
  if (!Number.isSafeInteger(pid) || pid < 1 || pid === process.pid) return { pid, status: "absent" };
  if (process.platform === "win32") {
    try { await execute("taskkill", ["/PID", String(pid), "/T"]); } catch {}
    for (let elapsed = 0; elapsed < graceMs && await processAlive(pid); elapsed += 50) await delay(50);
    if (await processAlive(pid)) try { await execute("taskkill", ["/PID", String(pid), "/T", "/F"]); } catch {}
  } else {
    try { process.kill(-pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") try { process.kill(pid, "SIGTERM"); } catch {} }
    for (let elapsed = 0; elapsed < graceMs && await groupAlive(pid); elapsed += 50) await delay(50);
    if (await groupAlive(pid)) try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error?.code !== "ESRCH") try { process.kill(pid, "SIGKILL"); } catch {} }
  }
  for (let elapsed = 0; elapsed < 2000 && await groupAlive(pid); elapsed += 50) await delay(50);
  return { pid, status: await groupAlive(pid) ? "alive" : "terminated" };
}
