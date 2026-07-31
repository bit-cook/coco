import { readFile } from "node:fs/promises";

import { canonicalJson } from "./canonical-json.mjs";

function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function printFinalEnv(path) {
  const text = await readFile(path, "utf8");
  const parsed = JSON.parse(text);
  if (text !== canonicalJson(parsed) || parsed.schemaVersion !== 1 || typeof parsed.attemptDir !== "string" || typeof parsed.finalManifestSha256 !== "string" || typeof parsed.planSha256 !== "string" || typeof parsed.reviewRound !== "string") throw new Error("FINAL_ENV_INVALID");
  return `export ATTEMPT_DIR=${quote(parsed.attemptDir)}\nexport FINAL_MANIFEST_SHA256=${quote(parsed.finalManifestSha256)}\nexport PLAN_SHA256=${quote(parsed.planSha256)}\nexport REVIEW_ROUND=${quote(parsed.reviewRound)}\n`;
}

if (process.argv[1] === new URL(import.meta.url).pathname) printFinalEnv(process.argv[2]).then((value) => process.stdout.write(value));
