import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyCocoIdentityPatch } from "../scripts/apply-coco-identity-patch.mjs";

const identitySource = "Pi documentation https://pi.dev inside pi extend Pi";
const headerSource = `            const compactOnboarding = theme.fg("dim", \`Press \${keyText("app.tools.expand")} to show full startup help and loaded resources.\`);
            const onboarding = theme.fg("dim", \`Pi can explain its own features and look up its docs. Ask it how to use or extend Coco.\`);
            this.builtInHeader = new ExpandableText(() => \`\${logo}\\n\${compactInstructions}\\n\${compactOnboarding}\\n\\n\${onboarding}\`, () => \`\${logo}\\n\${expandedInstructions}\\n\\n\${onboarding}\`, this.getStartupExpansionState(), 1, 0);`;
const quietHeaderSource = `else {
    this.builtInHeader = new Text("", 0, 0);
}`;
const startupExpansionSource = `    getStartupExpansionState() {
        return this.options.verbose || this.toolOutputExpanded;
    }`;
const resourceListingSource = `        const showListing = options?.force || this.options.verbose || !this.settingsManager.getQuietStartup();`;
const compactExpansionHintSource = `                hint("app.tools.expand", "more"),`;
const startupPolicySource = `        if (this.session.scopedModels.length > 0 && (this.options.verbose || !this.settingsManager.getQuietStartup())) {
        }
        this.changelogMarkdown = this.getChangelogForDisplay();
        // Add header with keybindings from config (unless silenced)
        if (this.options.verbose || !this.settingsManager.getQuietStartup()) {
        }
        checkForNewPiVersion(this.version).then((newRelease) => {
        });
        this.checkForPackageUpdates()
        this.checkTmuxKeyboardSetup().then((warning) => {
        });
        if (migratedProviders && migratedProviders.length > 0) {
        }
        if (modelFallbackMessage) {
            this.showWarning(modelFallbackMessage);
        }
        void this.maybeWarnAboutAnthropicSubscriptionAuth();`;
const tuiSource = `const fullRender = (clear) => {
    if (clear) {
                buffer += "\\x1b[2J\\x1b[H\\x1b[3J"; // Clear screen, home, then clear scrollback
    }
};`;

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "coco-identity-patch-"));
  const agent = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
  const tui = join(agent, "node_modules", "@earendil-works", "pi-tui");
  await mkdir(join(agent, "dist", "cli"), { recursive: true });
  await mkdir(join(agent, "dist", "core"), { recursive: true });
  await mkdir(join(agent, "dist", "modes", "interactive"), { recursive: true });
  await mkdir(join(agent, "dist", "utils"), { recursive: true });
  await mkdir(join(tui, "dist"), { recursive: true });
  await writeFile(join(agent, "package.json"), JSON.stringify({ version: "0.82.1" }));
  await writeFile(join(tui, "package.json"), JSON.stringify({ version: "0.82.1" }));
  for (const path of ["dist/cli/args.js", "dist/core/system-prompt.js", "dist/utils/version-check.js"]) {
    await writeFile(join(agent, path), identitySource);
  }
  await writeFile(join(agent, "dist/modes/interactive/interactive-mode.js"), `${identitySource}\n${headerSource}\n${quietHeaderSource}\n${startupExpansionSource}\n${resourceListingSource}\n${compactExpansionHintSource}\n${startupPolicySource}`);
  await writeFile(join(tui, "dist/tui.js"), tuiSource);
  return root;
}

async function readPatched(root, path) {
  return readFile(join(root, "node_modules", "@earendil-works", "pi-coding-agent", path), "utf8");
}

test("Given supported upstream artifacts, when patched, then the identity, compact header, and preserved-scrollback contracts are applied", async () => {
  const root = await createFixture();
  try {
    await applyCocoIdentityPatch({ root });
    const interactive = await readPatched(root, "dist/modes/interactive/interactive-mode.js");
    const tui = await readPatched(root, "node_modules/@earendil-works/pi-tui/dist/tui.js");
    assert.match(interactive, /\(\) => `\$\{logo\}\\n\$\{compactInstructions\}`/);
    assert.match(interactive, /\(\) => `\$\{logo\}\\n\$\{expandedInstructions\}`/);
    assert.doesNotMatch(interactive, /compactOnboarding|const onboarding/);
    assert.match(interactive, /new Text\("", 0, 0\)/);
    assert.match(interactive, /getStartupExpansionState\(\) \{\s*return this\.options\.verbose;\s*\}/);
    assert.match(interactive, /const showListing = options\?\.force \|\| this\.options\.verbose;/);
    assert.doesNotMatch(interactive, /hint\("app\.tools\.expand", "more"\)/);
    assert.match(interactive, /if \(this\.session\.scopedModels\.length > 0 && this\.options\.verbose\)/);
    assert.match(interactive, /this\.changelogMarkdown = this\.options\.verbose \? this\.getChangelogForDisplay\(\) : undefined/);
    assert.match(interactive, /if \(this\.options\.verbose\) checkForNewPiVersion/);
    assert.match(interactive, /if \(this\.options\.verbose\) this\.checkTmuxKeyboardSetup/);
    assert.match(interactive, /if \(this\.options\.verbose && migratedProviders/);
    assert.match(interactive, /if \(this\.options\.verbose && modelFallbackMessage\)/);
    assert.match(interactive, /if \(this\.options\.verbose\) void this\.maybeWarnAboutAnthropicSubscriptionAuth/);
    assert.match(tui, /"\\x1b\[2J\\x1b\[H"/);
    assert.doesNotMatch(tui, /\\x1b\[3J/);
    assert.doesNotMatch(interactive, /https:\/\/pi\.dev|Pi documentation|inside pi|extend Pi/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given supported upstream artifacts, when patched twice, then the second application is a no-op", async () => {
  const root = await createFixture();
  try {
    await applyCocoIdentityPatch({ root });
    const once = await readPatched(root, "dist/modes/interactive/interactive-mode.js");
    await applyCocoIdentityPatch({ root });
    assert.equal(await readPatched(root, "dist/modes/interactive/interactive-mode.js"), once);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given an invalid target after valid targets, when preflight fails, then no file is written", async () => {
  const root = await createFixture();
  try {
    const tui = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "node_modules", "@earendil-works", "pi-tui", "dist", "tui.js");
    const interactive = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "modes", "interactive", "interactive-mode.js");
    const original = await readFile(interactive, "utf8");
    await writeFile(tui, "const fullRender = () => {};\n");
    await assert.rejects(applyCocoIdentityPatch({ root }), { message: /COCO_PATCH_UNKNOWN_ANCHOR/ });
    assert.equal(await readFile(interactive, "utf8"), original);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given an unsupported installed version or duplicate anchor, when patched, then it fails closed", async () => {
  const root = await createFixture();
  try {
    const agent = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
    await writeFile(join(agent, "package.json"), JSON.stringify({ version: "0.82.2" }));
    await assert.rejects(applyCocoIdentityPatch({ root }), { message: /COCO_PATCH_VERSION_MISMATCH/ });
    await writeFile(join(agent, "package.json"), JSON.stringify({ version: "0.82.1" }));
    const interactive = join(agent, "dist", "modes", "interactive", "interactive-mode.js");
    await writeFile(interactive, `${await readFile(interactive, "utf8")}\n${headerSource}`);
    await assert.rejects(applyCocoIdentityPatch({ root }), { message: /COCO_PATCH_DUPLICATE_ANCHOR/ });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
