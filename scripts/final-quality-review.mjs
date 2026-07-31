import { readFile } from "node:fs/promises";

export async function reviewAudit(auditPath) {
  const audit = JSON.parse(await readFile(auditPath, "utf8"));
  const advisories = Object.values(audit.advisories ?? {});
  const blocked = advisories.some((advisory) => ["moderate", "high", "critical"].includes(advisory.severity));
  return { schemaVersion: 1, status: blocked ? "rejected" : "approved", violations: blocked ? ["PRODUCTION_AUDIT_FINDING"] : [] };
}
