import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { dispatchCoco } from "./coco-dispatcher.mjs";
import { syncProviderModelsForTest } from "./dev-provider-sync.mjs";
import { StateError } from "./state-schema.mjs";

function options(argv) { if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_9_QA_USAGE"); return resolve(argv[3]); }
function result(name, expected, actual) { return { actual, expected, name, status: expected === actual ? "passed" : "failed" }; }
async function rejects(action, code) { try { await action(); } catch (error) { return error instanceof StateError && error.code === code; } return false; }

async function server() {
  let mode = "happy";
  const instance = createServer((request, response) => {
    if (mode === "redirect") { response.writeHead(302, { Location: "/v1/models" }); response.end(); return; }
    if (mode === "timeout") return;
    if (mode === "oversize") { response.writeHead(200); response.end(Buffer.alloc(2 * 1024 * 1024 + 1)); return; }
    if (mode === "malformed") { response.writeHead(200); response.end("{bad"); return; }
    if (mode === "duplicate") { response.writeHead(200); response.end(JSON.stringify({ data: [{ id: "z" }, { id: "z" }] })); return; }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "zeta" }, { id: "alpha" }, { id: "gpt-image-1" }] }));
  });
  await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const address = instance.address();
  if (address === null || typeof address === "string") throw new Error("TASK_9_SERVER");
  return { close: () => new Promise((resolve) => instance.close(resolve)), origin: `http://127.0.0.1:${address.port}`, setMode: (value) => { mode = value; } };
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const sandbox = await mkdtemp(join(tmpdir(), "coco-task-9-"));
  const agent = join(sandbox, "agent");
  const marker = join(root, ".coco-provider-sync-test-root");
  const cases = [];
  let fixture;
  try {
    fixture = await server();
    await writeFile(marker, "coco-source-test-root-v1\n", { mode: 0o600 });
    await chmod(marker, 0o600);
    const environment = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const sync = () => syncProviderModelsForTest({ agentDir: agent, origin: fixture.origin, provider: "idepub", root });
    const first = await sync();
    const current = join(agent, "catalogs", "idepub", "current.models.json");
    const firstBytes = await readFile(current);
    const firstModels = JSON.parse(firstBytes.toString("utf8")).models;
    cases.push(result("happy-canonical-order-and-hash", true, first.modelCount === 2 && firstModels.map((model) => model.id).join(",") === "alpha,zeta" && /^[a-f0-9]{64}$/.test(first.providers[0].catalogSha256)));
    await sync();
    cases.push(result("lkg-rotates-previous", sha256(firstBytes), sha256(await readFile(join(agent, "catalogs", "idepub", "previous.models.json")))));
    for (const [name, mode, code] of [["malformed", "malformed", "CATALOG_SCHEMA_INVALID"], ["duplicate", "duplicate", "CATALOG_SCHEMA_INVALID"], ["oversize", "oversize", "PROVIDER_BODY_TOO_LARGE"], ["redirect", "redirect", "PROVIDER_HTTP_STATUS"], ["timeout", "timeout", "PROVIDER_TIMEOUT"]]) {
      fixture.setMode(mode);
      cases.push(result(`failure-${name}-preserves-lkg`, true, await rejects(sync, code) && sha256(firstBytes) === sha256(await readFile(current))));
    }
    cases.push(result("origin-rejected-before-network", true, await rejects(() => syncProviderModelsForTest({ agentDir: agent, origin: "http://localhost:1234", provider: "idepub", root }), "TEST_SEAM_FORBIDDEN")));
    const sourceCwd = process.cwd();
    process.chdir(sandbox);
    cases.push(result("wrong-source-root-rejected", true, await rejects(sync, "TEST_SEAM_FORBIDDEN")));
    process.chdir(sourceCwd);
    await rm(marker);
    cases.push(result("missing-marker-rejected", true, await rejects(sync, "TEST_SEAM_FORBIDDEN")));
    await writeFile(marker, "coco-source-test-root-v1\n", { mode: 0o600 });
    process.env.NODE_ENV = "production";
    cases.push(result("production-seam-rejected", true, await rejects(sync, "TEST_SEAM_FORBIDDEN")));
    if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment;
    const saved = process.env.COCO_TEST_PROVIDER_ORIGIN;
    process.env.COCO_TEST_PROVIDER_ORIGIN = fixture.origin;
    const dispatched = await dispatchCoco({ argv: [], root });
    if (saved === undefined) delete process.env.COCO_TEST_PROVIDER_ORIGIN; else process.env.COCO_TEST_PROVIDER_ORIGIN = saved;
    cases.push(result("dispatcher-rejects-seam-environment", 1, dispatched.exitCode));
    const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
    const tarball = packed[0]?.filename;
    const contents = typeof tarball === "string" ? execFileSync("tar", ["-tzf", tarball], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }) : "package/scripts/dev-provider-sync.mjs";
    if (typeof tarball === "string") await rm(join(root, tarball), { force: true });
    cases.push(result("tarball-excludes-test-seam", false, contents.includes("package/scripts/dev-provider-sync.mjs") || contents.includes("package/scripts/qa-task-9.mjs") || contents.includes("package/test/")));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { providerRegistrySha256: "42e2dca1532ac2b5ee2f55e8c5c3f85ac5bbe7c63da25ce1dbf7fcaf540b20e2", transformationsSha256: "39c834dbadf987506ca74b75c9ebc4e36b37734ac7c4be6f996f63b3f924ad70" }, cases, schemaVersion: 1, status, task: 9 }), { flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally { await fixture?.close(); await rm(marker, { force: true }); await rm(sandbox, { force: true, recursive: true }); }
}

void main();
