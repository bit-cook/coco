import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";

const resourceResult = (resource, state) => {
  if (resource === "settings" && ["nonempty-extensions", "nonempty-packages"].includes(state)) return { code: "PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN", exitCode: 1, status: "fatal" };
  return { code: "PROJECT_RESOURCE_PREFLIGHT_FAILED", exitCode: 1, status: "fatal" };
};

function counters(valid) {
  return {
    childSpawn: valid ? 1 : 0,
    cocoPreflightInspection: 1,
    guardLoad: valid ? 1 : 0,
    modelTool: 0,
    networkOperation: 0,
    piImport: valid ? 1 : 0,
    projectEnumeration: valid ? 1 : 0,
    stateOperation: 0,
    trustPrompt: 0,
    trustRead: valid ? 1 : 0,
    userExtensionLoad: 0,
  };
}

function projectRow({ id, resource, result, state }) {
  return { counters: counters(result.code === null), id, resource, result, state };
}

export function matrices(fixtures) {
  const resources = fixtures.projectResources;
  const rows = [projectRow({ id: "000000:valid-baseline", resource: "baseline", state: "valid", result: { code: null, exitCode: 0, status: "healthy" } })];
  let ordinal = 1;
  for (const state of resources.cocoStates) rows.push(projectRow({ id: `${String(ordinal++).padStart(6, "0")}:coco:${state}`, resource: "coco", result: ["absent", "readable-directory"].includes(state) ? { code: null, exitCode: 0, status: "healthy" } : resourceResult("coco", state), state }));
  for (const resource of resources.children) for (const state of resources.treeStates) rows.push(projectRow({ id: `${String(ordinal++).padStart(6, "0")}:${resource}:${state}`, resource, result: ["absent", "empty-directory"].includes(state) ? { code: null, exitCode: 0, status: "healthy" } : resourceResult(resource, state), state }));
  for (const state of resources.settingsStates) rows.push(projectRow({ id: `${String(ordinal++).padStart(6, "0")}:settings:${state}`, resource: "settings", result: ["absent", "valid-no-fields", "valid-empty-arrays"].includes(state) ? { code: null, exitCode: 0, status: "healthy" } : resourceResult("settings", state), state }));
  const cwd = Array.from({ length: fixtures.cwdMatrix.rowCount }, (_, index) => ({ id: String(index).padStart(6, "0"), result: "PROJECT_RESOURCE_PREFLIGHT_FAILED", setup: "fixture" }));
  return { cwd: { rows: cwd, schemaVersion: 1 }, project: { rows, schemaVersion: 1 } };
}

async function writeMatrix(path, value) { const bytes = canonicalJson(value); await writeFile(path, bytes); await writeFile(`${path}.sha256`, `${sha256(bytes)}  ${path.split("/").at(-1)}\n`); }

export async function generatePreflightMatrices({ check = false, root = new URL("..", import.meta.url).pathname } = {}) {
  const absolute = resolve(root); const fixturePath = join(absolute, "resources", "preflight-fixtures.v1.json"); const fixtures = JSON.parse(await readFile(fixturePath, "utf8")); const generated = matrices(fixtures);
  const outputs = [[join(absolute, "resources", "cwd-preflight-matrix.v1.json"), generated.cwd], [join(absolute, "resources", "project-resource-matrix.v1.json"), generated.project]];
  if (check) {
    for (const [path, value] of outputs) {
      const bytes = canonicalJson(value);
      if (await readFile(path, "utf8") !== bytes || await readFile(`${path}.sha256`, "utf8") !== `${sha256(bytes)}  ${path.split("/").at(-1)}\n`) throw new Error("PREFLIGHT_MATRIX_OUT_OF_DATE");
    }
  } else {
    for (const [path, value] of outputs) await writeMatrix(path, value);
  }
  return generated;
}

if (process.argv[1] === new URL(import.meta.url).pathname) await generatePreflightMatrices({ check: process.argv.includes("--check") });
