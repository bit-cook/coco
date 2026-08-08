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

test("Coco help forms are native and document the active native grammar", async () => {
  for (const argv of [["--help"], ["-h"], ["help"]]) {
    const { result, stdout } = await nativeHelp(argv);
    assert.deepEqual(result, { exitCode: 0, kind: "native" });
    assert.match(stdout, new RegExp(`^Coco ${COCO_VERSION.replaceAll(".", "\\.")}$`, "m"));
    assert.match(stdout, /coco manage auth set <provider> \[--stdin\] \[--json\]/);
    assert.match(stdout, /coco manage models sync \[--provider <provider>\] \[--allow-empty\] \[--yes\] \[--json\]/);
    assert.match(stdout, /coco manage migrate \[--dry-run\] \[--json\] \[--yes\]/);
    assert.match(stdout, /coco doctor \[--json\] \[--connectivity\]/);
    assert.match(stdout, /coco core <status\|check> \[--json\]/);
    assert.match(stdout, /idepub, achai, agnes, deepseek, stepfun/);
    assert.match(stdout, new RegExp(`bundled Pi ${CORE_VERSION.replaceAll(".", "\\.")}`));
  }
});

test("Coco help states credential, offline, resource, security, and update policy without upstream API-key flags", async () => {
  const { stdout } = await nativeHelp(["--help"]);
  assert.match(stdout, /Do not put credentials on the\n  command line\./);
  assert.match(stdout, /auth status.*never a value/);
  assert.match(stdout, /Coco starts offline unless PI_OFFLINE is explicitly set\./);
  assert.match(stdout, /Packaged resources are\n  integrity-checked; executable project resources are not trusted\./);
  assert.match(stdout, /best-effort and are not a sandbox/);
  assert.match(stdout, /"coco update"\n  is prohibited/);
  assert.doesNotMatch(stdout, /--api-key(?:=|\s|\[|<)/i);
});
