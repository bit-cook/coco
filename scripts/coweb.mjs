import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_SPEC = "@lyhue1991/pi-web";
const MARKER = "installed-version.json";
const DEFAULT_PORT = 30141;

function fail(code) {
  console.error(`coweb: ${code}`);
  process.exitCode = 1;
}

export function parseCowebArgs(args) {
  const options = { update: false };
  const flags = { "--port": "port", "--hostname": "hostname", "--password": "password" };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--update") options.update = true;
    else if (flags[value]) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) return { error: "COWEB_FLAG_VALUE_MISSING", flag: value };
      options[flags[value]] = next;
      index += 1;
    } else return { error: "COWEB_UNKNOWN_ARGUMENT", value };
  }
  return { options };
}

export function webUiRoot(agentDir) {
  return join(agentDir, "webui");
}

export function envFor(options, agentDir) {
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_WEB_NO_OPEN: "1" };
  if (options.port) env.PORT = String(options.port);
  if (options.hostname) env.PI_WEB_HOSTNAME = options.hostname;
  if (options.password) env.PI_WEB_PASSWORD = options.password;
  delete env.PI_WEB_ALLOWED_HOSTS;
  return env;
}

async function installedVersion(root) {
  try {
    return JSON.parse(await readFile(join(root, MARKER), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

function npm(args, cwd, done) {
  execFile(process.env.COCO_NPM_BIN || "npm", args, { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 600_000 }, (error, stdout, stderr) => done(error, `${stdout}${stderr}`));
}

function resolveInstalledBin(root) {
  const bin = join(root, "node_modules", ".bin", "pi-web");
  return existsSync(bin) ? bin : null;
}

export async function cowebCommand(args, { agentDir }) {
  const parsed = parseCowebArgs(args);
  if (parsed.error) return fail(`${parsed.error}:${parsed.flag ?? parsed.value ?? ""}`);
  const options = parsed.options;
  const root = webUiRoot(agentDir);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const current = await installedVersion(root);
  const bin = resolveInstalledBin(root);
  if (options.update || !bin) {
    process.stdout.write(`coweb: installing ${PACKAGE_SPEC}@latest into ${root}\n`);
    const outcome = await new Promise((done) => npm(["install", "--prefix", root, "--ignore-scripts", "--no-audit", "--no-fund", `${PACKAGE_SPEC}@latest`], undefined, done));
    if (outcome.error) {
      console.error(String(outcome.stderr || outcome.error.message).split("\n").slice(-6).join("\n"));
      return fail("COWEB_INSTALL_FAILED");
    }
    const manifest = JSON.parse(await readFile(join(root, "node_modules", PACKAGE_SPEC, "package.json"), "utf8"));
    await writeFile(join(root, MARKER), `${JSON.stringify({ schemaVersion: 1, version: manifest.version })}\n`, { mode: 0o600 });
    if (!resolveInstalledBin(root)) return fail("COWEB_INSTALL_INCOMPLETE");
  } else if (current) {
    process.stdout.write(`coweb: using ${PACKAGE_SPEC} ${current} (${root})\n`);
  }
  const launcher = resolveInstalledBin(root);
  const url = `http://${options.hostname === "0.0.0.0" ? "127.0.0.1" : options.hostname || "127.0.0.1"}:${options.port ?? DEFAULT_PORT}`;
  process.stdout.write(`coweb: starting web frontend at ${url}\ncoweb: Ctrl-C stops the server\n`);
  const child = import("node:child_process").then(({ spawn }) => spawn(launcher, [], { env: envFor(options, agentDir), stdio: "inherit" }));
  const running = await child;
  running.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => running.kill(signal));
}
