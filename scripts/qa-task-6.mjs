import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";
import { executeWindowsAbi } from "./execute-windows-abi.mjs";
import { generatePreflightMatrices } from "./generate-preflight-matrices.mjs";
import { ProjectResourcePreflightError, preflightProjectResources } from "./project-resource-preflight.mjs";

function options(argv) {
  if (argv.length !== 4 || argv[0] !== "--scenario" || argv[1] !== "all" || argv[2] !== "--evidence") throw new Error("TASK_6_QA_USAGE");
  return resolve(argv[3]);
}

function result(name, expected, actual) {
  return { actual, expected, name, status: expected === actual ? "passed" : "failed" };
}

async function rejects(action, code) {
  try {
    await action();
  } catch (error) {
    return error instanceof ProjectResourcePreflightError && error.code === code;
  }
  return false;
}

async function rootWithPolicy(fixture, policy = "global-only") {
  const root = join(fixture, "runtime");
  await mkdir(join(root, "resources"), { recursive: true, mode: 0o700 });
  await writeFile(join(root, "resources", "project-resource-policy.v1.json"), canonicalJson({ policy, schemaVersion: 1 }), { mode: 0o600 });
  return root;
}

async function preflight(root, cwd, hooks = {}) {
  const authority = await preflightProjectResources({ cwd, root, ...hooks });
  await authority.close();
  return authority;
}

async function main() {
  const evidence = options(process.argv.slice(2));
  const root = resolve(new URL("..", import.meta.url).pathname);
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-6-"));
  const cases = [];
  try {
    await generatePreflightMatrices({ check: true, root });
    const projectMatrix = JSON.parse(await readFile(join(root, "resources", "project-resource-matrix.v1.json"), "utf8"));
    const cwdMatrix = JSON.parse(await readFile(join(root, "resources", "cwd-preflight-matrix.v1.json"), "utf8"));
    cases.push(result("canonical-matrix-row-counts", true, projectMatrix.rows.length === 57 && cwdMatrix.rows.length === 9600));
    cases.push(result("canonical-matrix-counters", true, projectMatrix.rows[0].counters.cocoPreflightInspection === 1 && projectMatrix.rows[0].counters.piImport === 1 && projectMatrix.rows.find((row) => row.id.endsWith("extensions:nonempty-regular")).counters.piImport === 0));

    const policyRoot = await rootWithPolicy(fixture);
    const safe = join(fixture, "safe");
    await mkdir(safe, { recursive: true, mode: 0o700 });
    const authority = await preflightProjectResources({ cwd: safe, root: policyRoot });
    cases.push(result("global-only-valid-project-retains-authority", true, authority.policy === "global-only" && authority.cwd.startsWith("/proc/self/fd/")));
    await authority.close();

    for (const kind of ["extensions", "hooks", "tools"]) {
      const cwd = join(fixture, `forbidden-${kind}`);
      await mkdir(join(cwd, ".coco", kind), { recursive: true, mode: 0o700 });
      await writeFile(join(cwd, ".coco", kind, "project-probe.mjs"), "throw new Error('PROJECT_RESOURCE_EXECUTED');\n", { mode: 0o600 });
      cases.push(result(`project-${kind}-never-loads`, "PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN", await rejects(() => preflight(policyRoot, cwd), "PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN") ? "PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN" : "unexpected"));
    }

    const settingsCwd = join(fixture, "forbidden-settings");
    await mkdir(join(settingsCwd, ".coco"), { recursive: true, mode: 0o700 });
    await writeFile(join(settingsCwd, ".coco", "settings.json"), '{"extensions":["./project-probe.mjs"]}\n', { mode: 0o600 });
    cases.push(result("project-settings-trust-flags-forbidden", "PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN", await rejects(() => preflight(policyRoot, settingsCwd), "PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN") ? "PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN" : "unexpected"));

    const malformedSettings = join(fixture, "malformed-settings");
    await mkdir(join(malformedSettings, ".coco"), { recursive: true, mode: 0o700 });
    await writeFile(join(malformedSettings, ".coco", "settings.json"), Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]), { mode: 0o600 });
    cases.push(result("malformed-utf8-settings-fails-closed", "PROJECT_RESOURCE_PREFLIGHT_FAILED", await rejects(() => preflight(policyRoot, malformedSettings), "PROJECT_RESOURCE_PREFLIGHT_FAILED") ? "PROJECT_RESOURCE_PREFLIGHT_FAILED" : "unexpected"));
    const duplicateSettings = join(fixture, "duplicate-settings");
    await mkdir(join(duplicateSettings, ".coco"), { recursive: true, mode: 0o700 });
    await writeFile(join(duplicateSettings, ".coco", "settings.json"), '{"extensions":[],"extensions":[]}\n', { mode: 0o600 });
    cases.push(result("duplicate-settings-fails-closed", "PROJECT_RESOURCE_PREFLIGHT_FAILED", await rejects(() => preflight(policyRoot, duplicateSettings), "PROJECT_RESOURCE_PREFLIGHT_FAILED") ? "PROJECT_RESOURCE_PREFLIGHT_FAILED" : "unexpected"));

    for (const checkpoint of ["WALK1_PRE_IMPORT", "WALK2_PRE_TRUST", "WALK3_POST_DISCOVERY", "WALK4_FINAL_PRELAUNCH"]) {
      const cwd = join(fixture, `race-${checkpoint}`);
      await mkdir(cwd, { recursive: true, mode: 0o700 });
      const failed = await rejects(() => preflight(policyRoot, cwd, { beforeCheckpoint: async (phase) => {
        if (phase === checkpoint) {
          await mkdir(join(cwd, ".coco", "extensions"), { recursive: true, mode: 0o700 });
          await writeFile(join(cwd, ".coco", "extensions", "race-probe.mjs"), "export {};\n", { mode: 0o600 });
        }
      } }), "PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN");
      cases.push(result(`race-${checkpoint}-blocks-before-pi`, true, failed));
    }

    const retained = join(fixture, "retained");
    const replacement = join(fixture, "replacement");
    await mkdir(retained, { recursive: true, mode: 0o700 });
    const committed = await preflightProjectResources({ cwd: retained, root: policyRoot, afterFinalCheckpoint: async () => {
      await rename(retained, replacement);
      await mkdir(retained, { mode: 0o700 });
    } });
    const retainedInfo = await committed.close().then(() => null, () => "close-failed");
    cases.push(result("after-final-rewalk-committed-retains-identity", true, committed.cwd.startsWith("/proc/self/fd/") && retainedInfo === null));

    const tamperedRoot = await rootWithPolicy(join(fixture, "tampered"), "project-trusted");
    cases.push(result("policy-tamper-fails-closed", "PROJECT_RESOURCE_PREFLIGHT_FAILED", await rejects(() => preflight(tamperedRoot, safe), "PROJECT_RESOURCE_PREFLIGHT_FAILED") ? "PROJECT_RESOURCE_PREFLIGHT_FAILED" : "unexpected"));
    await rm(join(tamperedRoot, "resources", "project-resource-policy.v1.json"));
    cases.push(result("missing-policy-fails-closed", "PROJECT_RESOURCE_PREFLIGHT_FAILED", await rejects(() => preflight(tamperedRoot, safe), "PROJECT_RESOURCE_PREFLIGHT_FAILED") ? "PROJECT_RESOURCE_PREFLIGHT_FAILED" : "unexpected"));

    const adapter = await executeWindowsAbi({ source: join(root, "resources", "windows-native-adapter-abi.v1.json") });
    cases.push(result("windows-native-adapter-contract", true, adapter.evidenceKind === "adapter" && adapter.transitions.length > 10 && adapter.identityEncoding === "volume-u64behex16-fileid128-nativebyteshex32"));
    const tamperedAdapter = join(fixture, "windows-native-adapter-abi.v1.json");
    await writeFile(tamperedAdapter, `${await readFile(join(root, "resources", "windows-native-adapter-abi.v1.json"), "utf8")} `, { mode: 0o600 });
    const adapterTamper = await (async () => {
      try { await executeWindowsAbi({ source: tamperedAdapter }); } catch (error) { return error.code === "WINDOWS_ABI_BOOTSTRAP_INVALID"; }
      return false;
    })();
    cases.push(result("windows-native-adapter-tamper-fails-closed", true, adapterTamper));
    const status = cases.every((entry) => entry.status === "passed") ? "approved" : "rejected";
    await writeFile(evidence, canonicalJson({ artifacts: { policySha256: sha256(await readFile(join(root, "resources", "project-resource-policy.v1.json"))), projectMatrixRows: projectMatrix.rows.length, windowsAdapterSha256: adapter.sha256 }, cases, schemaVersion: 1, status, task: 6 }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.exitCode = status === "approved" ? 0 : 1;
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
}

void main();
