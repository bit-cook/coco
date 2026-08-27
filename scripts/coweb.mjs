import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 30141;

export function parseCowebArgs(args) {
  const options = {};
  const flags = { "--port": "port", "--password": "password", "--public-host": "publicHost" };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--update") return { error: "COWEB_NATIVE_UPDATE_UNSUPPORTED" };
    if (value === "--hostname" || value === "--allow-host") return { error: "COWEB_LOOPBACK_REQUIRED", flag: value };
    if (flags[value]) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) return { error: "COWEB_FLAG_VALUE_MISSING", flag: value };
      options[flags[value]] = next;
      index += 1;
    } else return { error: "COWEB_UNKNOWN_ARGUMENT", value };
  }
  if (options.port && (!/^\d+$/u.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535)) return { error: "COWEB_PORT_INVALID", value: options.port };
  return { options };
}

export async function cowebCommand(args, { agentDir }) {
  const parsed = parseCowebArgs(args);
  if (parsed.error) {
    process.stderr.write(`coweb: ${parsed.error}:${parsed.flag ?? parsed.value ?? ""}\n`);
    return { exitCode: 2, kind: "native" };
  }
  if (parsed.options.publicHost && !parsed.options.password) {
    process.stderr.write("coweb: COWEB_PUBLIC_PASSWORD_REQUIRED\n");
    return { exitCode: 2, kind: "native" };
  }
  const port = Number(parsed.options.port ?? DEFAULT_PORT);
  const service = spawn(process.execPath, [fileURLToPath(new URL("./coweb-native-service.mjs", import.meta.url)), "--serve", ...args], {
    detached: true,
    env: { ...process.env, COCO_CODING_AGENT_DIR: agentDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  service.stderr.on("data", (chunk) => { output += chunk; });
  service.stdout.on("data", (chunk) => { output += chunk; });
  let outcome;
  try {
    outcome = await Promise.race([
      once(service.stdout, "data"),
      once(service, "exit").then(([code]) => { throw new Error(`COWEB_START_FAILED:${code}:${output.trim()}`); }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("COWEB_START_TIMEOUT")), 10_000)),
    ]);
  } catch (error) {
    service.kill();
    process.stderr.write(`coweb: ${error instanceof Error ? error.message : "COWEB_START_FAILED"}\n`);
    return { exitCode: 1, kind: "native" };
  }
  if (!String(outcome[0]).startsWith("COWEB_READY")) {
    service.kill();
    process.stderr.write(`coweb: COWEB_START_FAILED:${output.trim()}\n`);
    return { exitCode: 1, kind: "native" };
  }
  service.stdout.destroy();
  service.stderr.destroy();
  service.unref();
  process.stdout.write(`coweb: native Co Web available at http://127.0.0.1:${port} (pid ${service.pid})\n`);
  return { exitCode: 0, kind: "native" };
}
