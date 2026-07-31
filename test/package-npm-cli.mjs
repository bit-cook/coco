import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

function exactNpmVersion(value, source) {
  assert.match(value, /^\d+\.\d+\.\d+$/, `${source} must be an exact npm version`);
  return value;
}

export function assertNpmPinParity(packageJson, packageLock, installed) {
  const devDependency = exactNpmVersion(packageJson.devDependencies?.npm, "package.json devDependencies.npm");
  const packageManager = packageJson.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/)?.[1];
  assert.ok(packageManager, "package.json packageManager must be npm@<exact-version>");
  const lockRoot = exactNpmVersion(packageLock.packages?.[""]?.devDependencies?.npm, "package-lock root devDependencies.npm");
  const lockPackage = exactNpmVersion(packageLock.packages?.["node_modules/npm"]?.version, "package-lock node_modules/npm version");
  const installedVersion = exactNpmVersion(installed.version, "installed node_modules/npm version");
  assert.equal(packageManager, devDependency, "packageManager must match npm dev dependency");
  assert.equal(lockRoot, devDependency, "package-lock root npm pin must match package.json");
  assert.equal(lockPackage, devDependency, "package-lock npm package must match package.json");
  assert.equal(installedVersion, devDependency, "installed npm package must match package.json");
}

export async function packageNpmCli(root) {
  const [packageJson, packageLock, installed] = await Promise.all([
    readFile(join(root, "package.json"), "utf8").then(JSON.parse),
    readFile(join(root, "package-lock.json"), "utf8").then(JSON.parse),
    readFile(join(root, "node_modules", "npm", "package.json"), "utf8").then(JSON.parse),
  ]);
  assertNpmPinParity(packageJson, packageLock, installed);
  const cli = join(root, "node_modules", "npm", "bin", "npm-cli.js");
  await access(cli);
  return cli;
}
