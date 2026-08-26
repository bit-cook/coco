import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_SPEC = "@lyhue1991/pi-web";
const MARKER = "installed-version.json";
const DEFAULT_PORT = 30141;
const COWEB_ROOT = dirname(fileURLToPath(import.meta.url));
let agentDirParent = () => process.env.HOME ? join(process.env.HOME, ".coco") : "/root/.coco";

export function brandText(value) {
  return value
    .replaceAll("Pi Web interface for the pi coding agent", "Co Web interface for CoCo Agent")
    .replaceAll("Pi Web", "Co Web")
    .replaceAll("pi coding agent", "CoCo Agent")
    .replaceAll("pi Coding Agent", "CoCo Agent");
}

async function textFiles(root, relative = "") {
  const directory = join(root, relative);
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await textFiles(root, path));
    else if (/\.(?:html|js|rsc|body|webmanifest|json)$/u.test(entry.name)) output.push(path);
  }
  return output;
}

export async function applyCowebBrand(root) {
  const packageRoot = join(root, "node_modules", PACKAGE_SPEC);
  const textRoots = [".next/server/app", ".next/static", "public"];
  for (const textRoot of textRoots) {
    if (!existsSync(join(packageRoot, textRoot))) continue;
    for (const relative of await textFiles(packageRoot, textRoot)) {
      const path = join(packageRoot, relative);
      const current = await readFile(path, "utf8");
      const next = brandText(current).replaceAll("favicon.ico?8aa486c701a3d218", "icons/icon-512.png?coweb-v1");
      if (next !== current) await writeFile(path, next);
    }
  }
  const iconDirectory = join(packageRoot, "public", "icons");
  if (!existsSync(iconDirectory)) return;
  await copyFile(join(COWEB_ROOT, "..", "resources", "coweb-brand-192.png"), join(iconDirectory, "icon-192.png"));
  await copyFile(join(COWEB_ROOT, "..", "resources", "coweb-brand-512.png"), join(iconDirectory, "icon-512.png"));
  await copyFile(join(COWEB_ROOT, "..", "resources", "coweb-brand-180.png"), join(iconDirectory, "apple-touch-icon.png"));
  const favicon = join(packageRoot, ".next", "server", "app", "favicon.ico.body");
  if (existsSync(favicon)) await copyFile(join(COWEB_ROOT, "..", "resources", "coweb-brand-512.png"), favicon);
}

function fail(code) {
  console.error(`coweb: ${code}`);
  process.exitCode = 1;
}

export function parseCowebArgs(args) {
  const options = { update: false, allowHosts: [] };
  const flags = { "--port": "port", "--hostname": "hostname", "--password": "password", "--allow-host": "allowHost", "--public-host": "publicHost" };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--update") options.update = true;
    else if (flags[value]) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) return { error: "COWEB_FLAG_VALUE_MISSING", flag: value };
      if (flags[value] === "allowHost") options.allowHosts.push(next);
      else options[flags[value]] = next;
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
  if (options.allowHosts?.length) env.PI_WEB_ALLOWED_HOSTS = options.allowHosts.join(",");
  else delete env.PI_WEB_ALLOWED_HOSTS;
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
  const bundled = join(agentDirParent(), "node_modules", "npm", "bin", "npm-cli.js");
  const besideNode = join(dirname(process.execPath), "npm");
  if (process.env.COCO_NPM_BIN) return execFile(process.env.COCO_NPM_BIN, args, { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 600_000 }, (error, stdout, stderr) => done(error, `${stdout}${stderr}`));
  if (existsSync(bundled)) return execFile(process.execPath, [bundled, ...args], { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 600_000 }, (error, stdout, stderr) => done(error, `${stdout}${stderr}`));
  if (existsSync(besideNode)) return execFile(besideNode, args, { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 600_000 }, (error, stdout, stderr) => done(error, `${stdout}${stderr}`));
  execFile("npm", args, { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 600_000 }, (error, stdout, stderr) => done(error, `${stdout}${stderr}`));
}

function resolveInstalledBin(root) {
  const bin = join(root, "node_modules", ".bin", "pi-web");
  return existsSync(bin) ? bin : null;
}

export async function cowebCommand(args, { agentDir }) {
  agentDirParent = () => dirname(agentDir);
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
  await applyCowebBrand(root);
  const launcher = resolveInstalledBin(root);
  const url = `http://${options.hostname === "0.0.0.0" ? "127.0.0.1" : options.hostname || "127.0.0.1"}:${options.port ?? DEFAULT_PORT}`;
  const running = spawn(launcher, [], { detached: true, env: envFor(options, agentDir), stdio: "ignore" });
  running.unref();
  process.stdout.write(`coweb: started web frontend at ${url} (pid ${running.pid})\n`);
  if (options.publicHost) {
    const proxy = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "coweb-proxy.mjs")], {
      detached: true,
      env: { ...envFor(options, agentDir), COWEB_PUBLIC_HOST: options.publicHost, COWEB_UPSTREAM_PORT: String(options.port ?? DEFAULT_PORT) },
      stdio: "ignore",
    });
    proxy.unref();
    process.stdout.write(`coweb: started SSE proxy at http://127.0.0.1:30142 for ${options.publicHost} (pid ${proxy.pid})\n`);
  }
  return { exitCode: 0, kind: "native" };
}
