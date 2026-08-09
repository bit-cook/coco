import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runControlServer } from "../scripts/control-service.mjs";
import { statePaths } from "../scripts/state-paths.mjs";

const root = new URL("..", import.meta.url).pathname;

test("control plane authenticates task projections", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "coco-control-"));
  const controller = new AbortController();
  const running = runControlServer({ agentDir, host: "127.0.0.1", port: 0, root, signal: controller.signal });
  let state;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { state = JSON.parse(await readFile(statePaths(agentDir).control)); break; } catch { await new Promise((done) => setTimeout(done, 10)); }
    }
    assert.ok(state);
    const base = `http://127.0.0.1:${state.port}`;
    assert.equal((await fetch(`${base}/v1/tasks`)).status, 401);
    const response = await fetch(`${base}/v1/tasks`, { headers: { authorization: `Bearer ${state.token}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { tasks: [] });
    assert.equal((await fetch(base)).status, 200);
    controller.abort();
    await running;
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
