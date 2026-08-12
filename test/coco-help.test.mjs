import assert from "node:assert/strict";
import test from "node:test";

import { COCO_VERSION, CORE_VERSION } from "../scripts/coco-runtime-identity.mjs";
import { dispatchCoco } from "../scripts/coco-dispatcher.mjs";

const root = new URL("..", import.meta.url).pathname;

async function nativeHelp(argv) {
  let stdout = "";
  const write = process.stdout.write;
  process.stdout.write = (chunk) => { stdout += chunk; return true; };
  try {
    const result = await dispatchCoco({ argv, root });
    return { result, stdout };
  } finally {
    process.stdout.write = write;
  }
}

test("CoCo help forms are native and document the active native grammar", async () => {
  for (const argv of [["--help"], ["-h"], ["help"]]) {
    const { result, stdout } = await nativeHelp(argv);
    assert.deepEqual(result, { exitCode: 0, kind: "native" });
    assert.match(stdout, new RegExp(`^CoCo ${COCO_VERSION.replaceAll(".", "\\.")}$`, "m"));
    assert.match(stdout, /coco manage auth set <provider> \[--stdin\] \[--json\]/);
    assert.match(stdout, /coco manage models sync \[--provider <provider>\] \[--allow-empty\] \[--yes\] \[--json\]/);
    assert.match(stdout, /coco manage providers status \[provider\] \[--json\]/);
    assert.match(stdout, /coco manage migrate \[--dry-run\] \[--json\] \[--yes\]/);
    assert.match(stdout, /coco doctor \[--json\] \[--connectivity\]/);
    assert.match(stdout, /coco core <status\|check> \[--json\]/);
    assert.match(stdout, /\/goal \[status\]\s+Show goal and step progress/);
    assert.match(stdout, /\/goal <description>\s+Set a persistent goal for this session branch/);
    assert.match(stdout, /\/goal set <description>\s+Explicitly set a new goal/);
    assert.match(stdout, /\/goal plan\s+Ask the agent to create and store a plan/);
    assert.match(stdout, /\/goal pause\|resume\s+Pause or resume goal context/);
    assert.match(stdout, /\/goal done <step>\s+Mark a verified step complete/);
    assert.match(stdout, /\/goal active\|block\|reopen <step>\s+Change the state of a planned step/);
    assert.match(stdout, /\/goal continue\s+Resume and ask the agent to continue/);
    assert.match(stdout, /\/goal complete\|clear\s+Complete or remove the goal/);
    assert.match(stdout, /\/language <locale>\s+Switch language and persist the selection/);
    assert.match(stdout, /idepub, achai, agnes, deepseek, stepfun/);
    assert.match(stdout, new RegExp(`bundled Pi ${CORE_VERSION.replaceAll(".", "\\.")}`));
  }
});

test("CoCo help states credential, offline, resource, security, and update policy without upstream API-key flags", async () => {
  const { stdout } = await nativeHelp(["--help"]);
  assert.match(stdout, /Do not put credentials on the\n  command line\./);
  assert.match(stdout, /auth status.*never a value/);
  assert.match(stdout, /CoCo starts offline unless PI_OFFLINE is explicitly set\./);
  assert.match(stdout, /Packaged resources are\n  integrity-checked; executable project resources are not trusted\./);
  assert.match(stdout, /best-effort and are not a sandbox/);
  assert.match(stdout, /"coco update"\n  is prohibited/);
  assert.doesNotMatch(stdout, /--api-key(?:=|\s|\[|<)/i);
});
