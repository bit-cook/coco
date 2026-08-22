import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import cocoGoal from "../resources/coco-goal.mjs";
import { createLanguageService } from "../resources/coco-language.mjs";
import { dispatchCoco } from "../scripts/coco-dispatcher.mjs";

globalThis[Symbol.for("coco.language.service")] = createLanguageService({ agentDir: join(new URL(".", import.meta.url).pathname, ".nonexistent-language-state") });

function createHarness({ entries = [], hasUI = true } = {}) {
  const commands = new Map();
  const events = new Map();
  const appended = [];
  const messages = [];
  const ui = { notifications: [], statuses: [], widgets: [] };
  const context = {
    hasUI,
    sessionManager: { getBranch: () => entries },
    ui: {
      notify: (message, level) => ui.notifications.push({ level, message }),
      setStatus: (id, value) => ui.statuses.push({ id, value }),
      setWidget: (id, value) => ui.widgets.push({ id, value }),
    },
  };
  const api = {
    appendEntry: (customType, data) => appended.push({ customType, data }),
    on: (name, handler) => events.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    registerTool: (tool) => { api.tool = tool; },
    sendMessage: (message, options) => messages.push({ message, options }),
  };
  cocoGoal(api);
  return { api, appended, commands, context, events, messages, ui };
}

function state(entry) {
  return entry.data;
}

test("goal commands persist state and send plan and continue messages", async () => {
  const harness = createHarness();
  const goal = harness.commands.get("goal");
  assert.ok(goal);
  assert.equal(harness.api.tool.name, "goal");

  await goal.handler("set Ship the release", harness.context);
  assert.deepEqual(state(harness.appended.at(-1)), {
    goal: "Ship the release", revision: 1, schemaVersion: 1, status: "active", steps: [],
  });
  assert.deepEqual(harness.ui.statuses.at(-1), { id: "coco-goal", value: "goal active 0/0" });
  assert.match(harness.ui.widgets.at(-1).value[0], /Goal \[active\]/);

  await goal.handler("status", harness.context);
  assert.match(harness.ui.notifications.at(-1).message, /Goal \[active\] 0\/0: Ship the release/);

  await goal.handler("done 1.5", harness.context);
  assert.deepEqual(harness.ui.notifications.at(-1), { level: "error", message: "GOAL_COMMAND_INVALID" });
  assert.equal(state(harness.appended.at(-1)).goal, "Ship the release");

  await goal.handler("plan", harness.context);
  assert.equal(harness.messages.at(-1).message.customType, "coco-goal-plan-request");
  assert.equal(harness.messages.at(-1).options.triggerTurn, true);

  await goal.handler("pause", harness.context);
  assert.equal(state(harness.appended.at(-1)).status, "paused");
  await goal.handler("resume", harness.context);
  assert.equal(state(harness.appended.at(-1)).status, "active");
  await goal.handler("continue", harness.context);
  assert.equal(state(harness.appended.at(-1)).status, "active");
  assert.equal(harness.messages.at(-1).message.customType, "coco-goal-continue");
  await goal.handler("complete", harness.context);
  assert.equal(state(harness.appended.at(-1)).status, "completed");

  await goal.handler("clear", harness.context);
  assert.deepEqual(state(harness.appended.at(-1)), {
    goal: null, revision: 6, schemaVersion: 1, status: "paused", steps: [],
  });
});

test("goal tool records steps and completes verified steps", async () => {
  const harness = createHarness();
  await harness.commands.get("goal").handler("Ship the release", harness.context);
  const planned = await harness.api.tool.execute("call", {
    action: "set_steps",
    steps: ["Implement", { status: "active", text: "Verify" }],
  }, undefined, undefined, harness.context);
  assert.equal(planned.isError, undefined, planned.content[0].text);
  assert.equal(planned.details.steps.length, 2);
  assert.equal(planned.details.steps[1].status, "active");

  const completed = await harness.api.tool.execute("call", { action: "complete_step", id: 1 }, undefined, undefined, harness.context);
  assert.equal(completed.details.steps[0].status, "done");
});

test("goal session restoration provides context and turn markers persist completion", async () => {
  const saved = {
    goal: "Ship the release", revision: 4, schemaVersion: 1, status: "active",
    steps: [{ id: 1, status: "done", text: "Implement" }, { id: 2, status: "active", text: "Verify" }],
  };
  const harness = createHarness({ entries: [{ type: "custom", customType: "coco-goal-v1", data: saved }] });
  await harness.events.get("session_start")({}, harness.context);
  const context = await harness.events.get("before_agent_start")({}, harness.context);
  assert.match(context.message.content, /\[COCO GOAL ACTIVE\]/);
  assert.match(context.message.content, /2\. \[active\] Verify/);

  await harness.events.get("turn_end")({ message: {
    role: "assistant",
    content: [{ type: "text", text: "Verified [GOAL-DONE:2]" }],
  } }, harness.context);
  assert.equal(state(harness.appended.at(-1)).status, "completed");
  assert.equal(state(harness.appended.at(-1)).steps[1].status, "done");

  const restored = createHarness({ entries: [harness.appended.at(-1)] });
  await restored.events.get("session_start")({}, restored.context);
  let restoredContext = await restored.events.get("before_agent_start")({}, restored.context);
  assert.equal(restoredContext, undefined);
  await restored.events.get("session_tree")({}, restored.context);
  restoredContext = await restored.events.get("before_agent_start")({}, restored.context);
  assert.equal(restoredContext, undefined);
});

test("goal extension avoids status and widget updates in non-UI contexts", async () => {
  const harness = createHarness({ hasUI: false });
  await harness.commands.get("goal").handler("non-UI goal", harness.context);
  await harness.api.tool.execute("call", { action: "set_steps", steps: ["Work"] }, undefined, undefined, harness.context);
  await harness.events.get("session_shutdown")({}, { hasUI: false });
  assert.deepEqual(harness.ui.statuses, []);
  assert.deepEqual(harness.ui.widgets, []);
  assert.equal(harness.ui.notifications.length, 1);
});

test("dispatcher installs CoCo native extensions ahead of Pi arguments and keeps native help out of Pi", async () => {
  const originalArgv = process.argv.slice();
  const originalWrite = process.stdout.write;
  let stdout = "";
  process.stdout.write = (chunk) => { stdout += chunk; return true; };
  try {
    process.argv = ["node", "coco"];
    const forwarded = await dispatchCoco({ argv: ["--model", "test-model"], root: "/root/coco" });
    assert.deepEqual(forwarded, {
      bashFence: join("/root/coco", "resources", "coco-bash-fence.mjs"),
      generations: join("/root/coco", "resources", "coco-provider-generation.mjs"),
      goal: join("/root/coco", "resources", "coco-goal.mjs"),
      guard: join("/root/coco", "resources", "coco-guard.mjs"),
      kind: "forward",
      language: join("/root/coco", "resources", "coco-language.mjs"),
      loop: join("/root/coco", "resources", "coco-loop.mjs"),
      mcp: join("/root/coco", "resources", "coco-mcp.mjs"),
      subagents: join("/root/coco", "examples", "extensions", "subagent", "index.ts"),
    });
    assert.deepEqual(process.argv.slice(2), [
      "-e", join("/root/coco", "resources", "coco-language.mjs"),
      "-e", join("/root/coco", "resources", "coco-guard.mjs"),
      "-e", join("/root/coco", "resources", "coco-bash-fence.mjs"),
      "-e", join("/root/coco", "resources", "coco-goal.mjs"),
      "-e", join("/root/coco", "resources", "coco-loop.mjs"),
      "-e", join("/root/coco", "resources", "coco-provider-generation.mjs"),
      "-e", join("/root/coco", "resources", "coco-mcp.mjs"),
      "-e", join("/root/coco", "examples", "extensions", "subagent", "index.ts"),
      "--model", "test-model",
    ]);

    process.argv = ["node", "coco", "unchanged"];
    const native = await dispatchCoco({ argv: ["--help"], root: "/root/coco" });
    assert.deepEqual(native, { exitCode: 0, kind: "native" });
    assert.deepEqual(process.argv, ["node", "coco", "unchanged"]);
    assert.match(stdout, /Interactive goals:/);
  } finally {
    process.argv = originalArgv;
    process.stdout.write = originalWrite;
  }
});
