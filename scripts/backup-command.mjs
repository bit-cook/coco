import { fileURLToPath } from "node:url";

import { pruneBackups, restoreDrill, rotateBackup, verifyBackup } from "./backup-rotation.mjs";
import { assertBackupStore } from "./backup-store-contract.mjs";
import { createFilesystemBackupStore } from "./backup-filesystem-store.mjs";

const OPERATIONS = new Set(["create", "verify", "restore-drill", "prune", "store-publish", "store-fetch", "store-list", "store-remove"]);

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function key(value, name) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value !== "string" || !value) throw failure(`${name.toUpperCase()}_KEY_REQUIRED`);
  try {
    const bytes = /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0
      ? Buffer.from(value, "hex")
      : Buffer.from(value, "base64");
    if (!bytes.length) throw new Error();
    return bytes;
  } catch {
    throw failure(`${name.toUpperCase()}_KEY_INVALID`);
  }
}

function inputKey(input, name, env) {
  return key(input[`${name}Key`] ?? env[`COCO_BACKUP_${name.toUpperCase()}_KEY`], name);
}

function required(input, name) {
  if (typeof input[name] !== "string" || !input[name].trim()) throw failure(`${name.toUpperCase()}_REQUIRED`);
  return input[name];
}

function normalizedError(error) {
  if (error?.code === "BACKUP_USAGE" || error?.code?.endsWith("_REQUIRED") || error?.code?.endsWith("_INVALID")) return error;
  if (error?.code === "ENOENT" || error?.name === "SyntaxError") return failure("BACKUP_INVALID");
  return failure("BACKUP_OPERATION_FAILED", error?.message ?? "backup operation failed");
}

export async function backupCommand(input, environment = process.env, dependencies = {}) {
  const request = input ?? {};
  try {
    const operation = request.operation ?? request.action;
    if (!OPERATIONS.has(operation)) throw failure("BACKUP_USAGE");
    let result;
    if (operation.startsWith("store-")) {
      const store = assertBackupStore(dependencies.store);
      if (operation === "store-publish") result = await store.publish({ id: required(request, "id"), sourceDir: required(request, "sourceDir") });
      else if (operation === "store-fetch") result = await store.fetch({ id: required(request, "id"), destinationDir: required(request, "destinationDir") });
      else if (operation === "store-list") result = { ids: await store.list() };
      else result = await store.remove({ id: required(request, "id") });
    } else if (operation === "create") {
      result = await rotateBackup({
        sourceDir: required(request, "sourceDir"), offsiteDir: required(request, "offsiteDir"),
        authKey: inputKey(request, "auth", environment), stateKey: inputKey(request, "state", environment),
        operationalState: request.operationalState ?? {}, now: request.now ? new Date(request.now) : new Date(),
        retentionDays: request.retentionDays ?? 30,
      });
    } else if (operation === "verify") {
      result = { manifest: await verifyBackup({ backupDir: required(request, "backupDir"), authKey: inputKey(request, "auth", environment) }) };
    } else if (operation === "restore-drill") {
      result = await restoreDrill({
        backupDir: required(request, "backupDir"), destinationDir: required(request, "destinationDir"),
        authKey: inputKey(request, "auth", environment), stateKey: inputKey(request, "state", environment),
        expectedPaths: request.expectedPaths ?? [],
      });
    } else {
      await pruneBackups({ offsiteDir: required(request, "offsiteDir"), now: request.now ? new Date(request.now) : new Date(), retentionDays: request.retentionDays });
      result = { pruned: true };
    }
    return { ok: true, operation, result };
  } catch (error) {
    const normalized = normalizedError(error);
    return { ok: false, operation: request.operation ?? request.action ?? null, error: { code: normalized.code, message: normalized.message } };
  }
}

function argumentsToRequest(argv) {
  const [operation, ...args] = argv;
  const request = { operation };
  for (let index = 0; index < args.length; index += 1) {
    const match = /^--([a-z-]+)$/.exec(args[index]);
    if (!match || args[index + 1] === undefined) throw failure("BACKUP_USAGE");
    const name = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = args[++index];
    request[name] = ["expectedPaths", "operationalState"].includes(name) ? JSON.parse(value) : name === "retentionDays" ? Number(value) : value;
  }
  return request;
}

export async function main(argv = process.argv.slice(2), environment = process.env, output = process.stdout) {
  const request = argumentsToRequest(argv);
  const dependencies = request.storeRoot ? { store: createFilesystemBackupStore({ root: request.storeRoot }) } : {};
  delete request.storeRoot;
  const result = await backupCommand(request, environment, dependencies);
  output.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((code) => { process.exitCode = code; });
