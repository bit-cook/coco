import { lstat, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { canonicalJson, sha256 } from "./canonical-json.mjs";

export async function manifestEntry(root, path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("FINAL_VERIFIER_PRODUCER_INVALID");
  return { path: relative(root, path), sha256: sha256(await readFile(path)) };
}

export async function writePartialManifest({ files, outputPath, root }) {
  const entries = await Promise.all(files.map((file) => manifestEntry(root, resolve(root, file))));
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const payload = { producers: entries, schemaVersion: 1 };
  await writeFile(outputPath, canonicalJson(payload), { encoding: "utf8", flag: "wx", mode: 0o644 });
  return payload;
}
