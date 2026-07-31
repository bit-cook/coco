import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { verifyBaseline } from "../scripts/verify-protected-baseline.mjs";
import { validateAuthorizationTable } from "../scripts/verify-baseline-authorization.mjs";
import { verifyPartialManifest } from "../scripts/verify-final-verifier-manifest.mjs";

test("Given the installed protected baseline, when its canonical bytes and sidecar are verified, then it approves", async () => {
  const result = await verifyBaseline({
    baselinePath: fileURLToPath(new URL("../scripts/protected-baseline.json", import.meta.url)),
  });
  assert.equal(result.status, "approved");
});

test("Given a tampered protected baseline, when its sidecar is verified, then it rejects", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "coco-task-1-baseline-"));
  try {
    const baseline = await readFile(new URL("../scripts/protected-baseline.json", import.meta.url));
    await writeFile(join(fixture, "protected-baseline.json"), Buffer.concat([baseline, Buffer.from(" ")]));
    await writeFile(join(fixture, "protected-baseline.json.sha256"), "0".repeat(64) + "  protected-baseline.json\n");
    const result = await verifyBaseline({ baselinePath: join(fixture, "protected-baseline.json") });
    assert.equal(result.status, "rejected");
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});

test("Given the Task-1 authorization table, when its grammar is validated, then every lifecycle rule is accepted", async () => {
  const result = await validateAuthorizationTable(fileURLToPath(new URL("../resources/baseline-authorization.v1.json", import.meta.url)));
  assert.equal(result.status, "approved");
});

test("Given the partial verifier manifest, when producer bytes match, then it approves", async () => {
  const result = await verifyPartialManifest(fileURLToPath(new URL("../scripts/final-verifier-manifest.partial.v1.json", import.meta.url)));
  assert.equal(result.status, "approved");
});
