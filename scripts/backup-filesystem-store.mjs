import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

import { BackupStoreError, assertBackupStore, backupStoreFailure, backupStoreId } from "./backup-store-contract.mjs";

const COMPLETE = ".coco-backup-complete";
const CONTENT = "content";

function fail(code) {
  backupStoreFailure(code);
}

async function info(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function regularDirectory(value) {
  return value?.isDirectory() && !value.isSymbolicLink();
}

function regularFile(value) {
  return value?.isFile() && !value.isSymbolicLink();
}

function request(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((field) => !fields.includes(field))) fail("BACKUP_STORE_REQUEST_INVALID");
  return value;
}

async function validateTree(root, code) {
  const rootInfo = await info(root);
  if (!regularDirectory(rootInfo)) fail(code);
  const directories = [], files = [];
  async function visit(directory, relativeDirectory = "") {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      fail(code);
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
      const path = join(directory, entry.name);
      const entryInfo = await info(path);
      if (regularDirectory(entryInfo)) {
        directories.push(relativePath);
        await visit(path, relativePath);
      }
      else if (regularFile(entryInfo)) files.push(relativePath);
      else fail(code);
    }
  }
  await visit(root);
  return { directories, files };
}

async function copyTree(source, destination, tree, code) {
  await mkdir(destination, { recursive: false });
  const directories = new Set([...tree.directories, ...tree.files.map((path) => dirname(path)).filter((path) => path !== ".")]);
  for (const directory of [...directories].sort((left, right) => left.length - right.length || left.localeCompare(right))) {
    await mkdir(join(destination, directory), { recursive: true });
  }
  for (const relativePath of tree.files) {
    const sourcePath = join(source, relativePath);
    let destinationHandle, sourceHandle;
    try {
      sourceHandle = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!(await sourceHandle.stat()).isFile()) fail(code);
      destinationHandle = await open(join(destination, relativePath), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      await pipeline(
        sourceHandle.createReadStream(),
        destinationHandle.createWriteStream(),
      );
      sourceHandle = undefined;
      destinationHandle = undefined;
    } catch (error) {
      if (error instanceof BackupStoreError) throw error;
      fail(code);
    } finally {
      await Promise.allSettled([sourceHandle?.close(), destinationHandle?.close()]);
    }
  }
}

async function completedObject(path) {
  const objectInfo = await info(path);
  if (!objectInfo) return null;
  if (!regularDirectory(objectInfo)) fail("BACKUP_STORE_OBJECT_INVALID");
  const markerInfo = await info(join(path, COMPLETE));
  if (!markerInfo) return false;
  const entries = await readdir(path).catch(() => fail("BACKUP_STORE_OBJECT_INVALID"));
  if (entries.length !== 2 || !entries.includes(COMPLETE) || !entries.includes(CONTENT)
    || !regularFile(markerInfo) || !regularDirectory(await info(join(path, CONTENT)))) fail("BACKUP_STORE_OBJECT_INVALID");
  return true;
}

function operationError(error, fallback) {
  if (error instanceof BackupStoreError) return error;
  return new BackupStoreError(fallback);
}

export function createFilesystemBackupStore(options = {}) {
  const keys = Object.keys(options);
  if (keys.length !== 1 || !keys.includes("root") || typeof options.root !== "string" || !options.root) {
    fail("BACKUP_STORE_CONFIG_INVALID");
  }
  const root = resolve(options.root);

  async function checkedRoot() {
    const rootInfo = await info(root);
    if (!regularDirectory(rootInfo)) fail("BACKUP_STORE_UNAVAILABLE");
  }

  return assertBackupStore(Object.freeze({
    async publish(input = {}) {
      const { id, sourceDir } = request(input, ["id", "sourceDir"]);
      const objectId = backupStoreId(id);
      if (typeof sourceDir !== "string" || !sourceDir) fail("BACKUP_STORE_SOURCE_INVALID");
      const source = resolve(sourceDir), target = join(root, objectId);
      try {
        await checkedRoot();
        const tree = await validateTree(source, "BACKUP_STORE_SOURCE_INVALID");
        try {
          await mkdir(target, { recursive: false });
        } catch (error) {
          if (error?.code === "EEXIST") fail("BACKUP_STORE_EXISTS");
          throw error;
        }
        try {
          await copyTree(source, join(target, CONTENT), tree, "BACKUP_STORE_SOURCE_INVALID");
          const marker = await open(join(target, COMPLETE), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
          await marker.close();
        } catch (error) {
          await rm(target, { force: true, recursive: true }).catch(() => {});
          throw error;
        }
        return { id: objectId };
      } catch (error) {
        throw operationError(error, "BACKUP_STORE_PUBLISH_FAILED");
      }
    },

    async fetch(input = {}) {
      const { id, destinationDir } = request(input, ["id", "destinationDir"]);
      const objectId = backupStoreId(id);
      if (typeof destinationDir !== "string" || !destinationDir) fail("BACKUP_STORE_DESTINATION_INVALID");
      const destination = resolve(destinationDir), target = join(root, objectId);
      let staging;
      try {
        await checkedRoot();
        if (await info(destination)) fail("BACKUP_STORE_DESTINATION_EXISTS");
        const complete = await completedObject(target);
        if (!complete) fail("BACKUP_STORE_NOT_FOUND");
        const content = join(target, CONTENT);
        const tree = await validateTree(content, "BACKUP_STORE_OBJECT_INVALID");
        try {
          staging = await mkdtemp(join(dirname(destination), `.${basename(destination)}.coco-fetch-`));
        } catch (error) {
          if (error?.code === "ENOENT" || error?.code === "ENOTDIR") fail("BACKUP_STORE_DESTINATION_INVALID");
          throw error;
        }
        try {
          await rm(staging, { recursive: true, force: true });
          await copyTree(content, staging, tree, "BACKUP_STORE_OBJECT_INVALID");
          if (await info(destination)) fail("BACKUP_STORE_DESTINATION_EXISTS");
          await rename(staging, destination);
          staging = undefined;
        } catch (error) {
          await rm(staging, { force: true, recursive: true }).catch(() => {});
          throw error;
        }
        return { destinationDir: destination, id: objectId };
      } catch (error) {
        throw operationError(error, "BACKUP_STORE_FETCH_FAILED");
      }
    },

    async list(input) {
      if (input !== undefined) fail("BACKUP_STORE_REQUEST_INVALID");
      try {
        await checkedRoot();
        const ids = [];
        for (const entry of await readdir(root, { withFileTypes: true })) {
          if (entry.name.startsWith(".")) continue;
          let id;
          try { id = backupStoreId(entry.name); } catch { fail("BACKUP_STORE_OBJECT_INVALID"); }
          if (await completedObject(join(root, id))) ids.push(id);
        }
        return ids.sort();
      } catch (error) {
        throw operationError(error, "BACKUP_STORE_LIST_FAILED");
      }
    },

    async remove(input = {}) {
      const { id } = request(input, ["id"]);
      const objectId = backupStoreId(id), target = join(root, objectId);
      try {
        await checkedRoot();
        const complete = await completedObject(target);
        if (!complete) fail("BACKUP_STORE_NOT_FOUND");
        await rm(target, { recursive: true, force: false });
        return { id: objectId, removed: true };
      } catch (error) {
        throw operationError(error, "BACKUP_STORE_REMOVE_FAILED");
      }
    },
  }));
}

export const createBackupFilesystemStore = createFilesystemBackupStore;
