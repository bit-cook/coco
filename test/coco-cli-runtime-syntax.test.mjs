import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const runtime = (...parts) => join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", ...parts);

const localizedFiles = [
  "modes/interactive/interactive-mode.js",
  "modes/interactive/components/assistant-message.js",
  "modes/interactive/components/bordered-loader.js",
  "modes/interactive/components/config-selector.js",
  "modes/interactive/components/extension-editor.js",
  "modes/interactive/components/extension-input.js",
  "modes/interactive/components/first-time-setup.js",
  "modes/interactive/components/keybinding-hints.js",
  "modes/interactive/components/login-dialog.js",
  "modes/interactive/components/model-selector.js",
  "modes/interactive/components/oauth-selector.js",
  "modes/interactive/components/scoped-models-selector.js",
  "modes/interactive/components/session-selector.js",
  "modes/interactive/components/settings-selector.js",
  "modes/interactive/components/show-images-selector.js",
  "modes/interactive/components/status-indicator.js",
  "modes/interactive/components/trust-selector.js",
  "modes/interactive/components/tree-selector.js",
  "modes/interactive/components/user-message-selector.js",
  "extensions/llama/ui.js",
  "extensions/llama/index.js",
  "extensions/llama/provider.js",
];

test("localized runtime patches stay syntactically valid without nested uiText wraps", async () => {
  for (const relative of localizedFiles) {
    const source = await readFile(runtime(relative), "utf8");
    assertNoNestedWraps(source, relative);
    execFileSync(process.execPath, ["--check", runtime(relative)]);
  }
});

function assertNoNestedWraps(source, label) {
  if (source.includes("uiText(uiText(")) throw new Error(`nested uiText wrap in ${label}`);
}
