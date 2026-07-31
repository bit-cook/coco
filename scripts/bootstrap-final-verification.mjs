import { access, lstat, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { canonicalJson } from "./canonical-json.mjs";

const PLAN_SHA = "03966a1e794e6f766d381d429ac6a5a4197e349b0a9e80c7a34d60cbdfc7c9d6";
const EXPECTED = ["status: review-approved", `plan_sha256: ${PLAN_SHA}`, "review_round_id: 5d084cdd-c96f-43a4-b3b6-32a8378da93a"];
const LANES = { momus: "ea5aa9c3-6d04-487e-9f8d-3b03b787aae6", independent: "76078c2b-abe4-4450-9639-f1a0deba9976" };
function receiptValid(text) { const lines = text.split("\n"); return text.startsWith("---\n") && EXPECTED.every((line) => lines.filter((candidate) => candidate === line).length === 1) && Object.entries(LANES).every(([lane, launch]) => { const start = lines.indexOf(`  ${lane}:`); const end = lines.findIndex((line, index) => index > start && /^  [A-Za-z_]+:$/.test(line)); const section = lines.slice(start + 1, end < 0 ? lines.length : end); return start >= 0 && [`    status: approved`, `    launch_id: ${launch}`, "    result: OKAY"].every((line) => section.filter((candidate) => candidate === line).length === 1) && section.filter((line) => /^    session: ses_[^\s]+$/.test(line)).length === 1; }); }
export async function bootstrapFinalVerification(options) {
  const [plan, receipt] = await Promise.all([readFile(options.plan), readFile(options.receipt, "utf8")]); if (createHash("sha256").update(plan).digest("hex") !== PLAN_SHA || !receiptValid(receipt)) throw new Error("FINAL_BOOTSTRAP_BINDING_INVALID");
  const finalPath = resolve("scripts/final-verifier-manifest.v1.json"); const manifestPath = await access(finalPath).then(() => finalPath, () => resolve("scripts/final-verifier-manifest.partial.v1.json")); const stat = await lstat(manifestPath); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("FINAL_MANIFEST_INVALID"); const bytes = await readFile(manifestPath); const payload = { attemptDir: "/root/.omo/evidence", finalManifestSha256: createHash("sha256").update(bytes).digest("hex"), planSha256: PLAN_SHA, reviewRound: "5d084cdd-c96f-43a4-b3b6-32a8378da93a", schemaVersion: 1 }; await writeFile(options.out, canonicalJson(payload), { encoding: "utf8", flag: "wx", mode: 0o600 }); return payload;
}
export { receiptValid };
if (process.argv[1] === new URL(import.meta.url).pathname) { const args = process.argv.slice(2); const value = (flag) => args[args.indexOf(flag) + 1]; await bootstrapFinalVerification({ out: value("--out"), plan: value("--plan"), receipt: value("--review-receipt") }); }
