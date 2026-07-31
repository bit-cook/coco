import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runEgressAllowlist } from "../scripts/run-egress-allowlist.mjs";
import { hasWritableCgroupV2 } from "./task-1-cgroup-capability.mjs";

const STAGES = ["available", "create", "join", "kill", "empty", "remove"];
const testWithWritableCgroup = (await hasWritableCgroupV2()) ? test : test.skip;

for (const stage of STAGES) {
  const cgroupTest = stage === "available" ? test : testWithWritableCgroup;
  cgroupTest(`Given injected cgroup ${stage} failure, when egress runs, then it returns typed inconclusive without launching marker`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), `coco-cgroup-${stage}-`));
    const marker = join(fixture, "marker");
    const evidence = join(fixture, "evidence.jsonl");
    try {
      const failure = async (...args) => { const operation = args.at(-1); if (["kill", "empty", "remove"].includes(stage)) await operation(...args.slice(0, -1)); throw new Error(stage); };
      const result = await runEgressAllowlist({ allow: [], command: [process.execPath, "-e", `require('fs').writeFileSync(${JSON.stringify(marker)},'ran')`], containment: { [stage]: failure }, denyAll: true, evidence });
      assert.equal(result.status, "inconclusive");
      const expected = stage === "available" ? "CGROUP_UNAVAILABLE" : stage === "empty" ? "CGROUP_EMPTY_CHECK_FAILED" : `CGROUP_${stage.toUpperCase()}_FAILED`;
      assert.match(await readFile(evidence, "utf8"), new RegExp(`"reason":"${expected}"`));
      if (["available", "create", "join"].includes(stage)) await assert.rejects(readFile(marker));
    } finally { await rm(fixture, { force: true, recursive: true }); }
  });
}
