export const BACKUP_STORE_METHODS = Object.freeze(["publish", "fetch", "list", "remove"]);

export class BackupStoreError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "BackupStoreError";
  }
}

export function backupStoreFailure(code) {
  throw new BackupStoreError(code);
}

export function backupStoreId(value) {
  if (typeof value !== "string" || value.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    backupStoreFailure("BACKUP_STORE_ID_INVALID");
  }
  return value;
}

export function assertBackupStore(store) {
  if (store === null || typeof store !== "object"
    || BACKUP_STORE_METHODS.some((method) => typeof store[method] !== "function")) {
    backupStoreFailure("BACKUP_STORE_INVALID");
  }
  return store;
}

export function isBackupStoreError(error) {
  return error instanceof BackupStoreError;
}
