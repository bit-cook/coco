import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyCocoIdentityPatch } from "../scripts/apply-coco-identity-patch.mjs";

const identitySource = "Pi documentation https://pi.dev inside pi extend Pi";
const systemPromptSource = `let prompt = \`You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:\n\`;`;
const helpSource = "console.log(`${chalk.bold(APP_NAME)} - AI coding assistant with read, bash, edit, write tools\n\n${chalk.bold(\"Usage:\")}\n  --system-prompt <text>         System prompt (default: coding assistant prompt)`);";
const firstTimeSetupSource = `this.addChild(new Text(theme.fg("accent", theme.bold(\`Welcome to \${APP_NAME}, the minimal coding agent.\`)), 1, 0));`;
const expandableTextSource = `class ExpandableText extends Text {
    getCollapsedText;
    getExpandedText;
    constructor(getCollapsedText, getExpandedText, expanded = false, paddingX = 0, paddingY = 0) {
        super(expanded ? getExpandedText() : getCollapsedText(), paddingX, paddingY);
        this.getCollapsedText = getCollapsedText;
        this.getExpandedText = getExpandedText;
    }
    setExpanded(expanded) {
        this.setText(expanded ? this.getExpandedText() : this.getCollapsedText());
    }
}`;
const headerSource = `            this.builtInHeader = new ExpandableText(() => \`\${logo}\\n\${compactInstructions}\`, () => \`\${logo}\\n\${expandedInstructions}\`, this.getStartupExpansionState(), 1, 0);`;
const cleanInstallOnboardingSource = `            const compactOnboarding = theme.fg("dim", \`Press \${keyText("app.tools.expand")} to show full startup help and loaded resources.\`);
            const onboarding = theme.fg("dim", \`Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.\`);`;
const cleanInstallHeaderSource = `            this.builtInHeader = new ExpandableText(() => \`\${logo}\\n\${compactInstructions}\\n\${compactOnboarding}\\n\\n\${onboarding}\`, () => \`\${logo}\\n\${expandedInstructions}\\n\\n\${onboarding}\`, this.getStartupExpansionState(), 1, 0);`;
const quietHeaderSource = `else {
    this.builtInHeader = new Text("", 0, 0);
    }`;
const responsiveWordmarkSource = `class ResponsiveStartupWordmark {
    render(width) {
        return [truncateToWidth(theme.bold(theme.fg("accent", "CoCo")), width, "")];
    }
    invalidate() {
    }
    setExpanded(expanded) {
    }
}`;
const olderResponsiveWordmarkSource = `class ResponsiveStartupWordmark {
    expanded;
    version;
    compactInstructions;
    instructions;
    cachedWidth;
    cachedLines;
    constructor(expanded, version = "", compactInstructions = "", instructions = "") {
        this.expanded = expanded;
        this.version = version;
        this.compactInstructions = compactInstructions;
        this.instructions = instructions;
    }
    setExpanded(expanded) {
        this.expanded = expanded;
        this.invalidate();
    }
    invalidate() {
        this.cachedWidth = undefined;
        this.cachedLines = undefined;
    }
    render(width) {
        if (this.cachedLines && this.cachedWidth === width) {
            return this.cachedLines;
        }
        const contentWidth = Math.max(0, width - 2);
        const compact = "CoCo";
        const lines = [" " + truncateToWidth(theme.bold(theme.fg("accent", compact)), contentWidth, "") + " "];
        this.cachedWidth = width;
        this.cachedLines = lines;
        return lines;
    }
}`;
const startupExpansionSource = `    getStartupExpansionState() {
        return this.options.verbose || this.toolOutputExpanded;
    }`;
const resourceListingSource = `        const showListing = options?.force || this.options.verbose || !this.settingsManager.getQuietStartup();`;
const toolBootstrapSource = `        const [fdPath] = await Promise.all([ensureTool("fd", true), ensureTool("rg", true)]);`;
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
const interactiveModelSelectionSource = `    currentTheme: this.settingsManager.getThemeSetting() || "dark",
    showModelSelector(initialSearchInput) {
        this.showSelector((done) => {
            const selector = new ModelSelectorComponent(this.ui, this.session.model, this.settingsManager, this.session.modelRuntime, this.session.scopedModels, async (model) => {
                try {
                    await this.session.setModel(model);
                    this.footer.invalidate();
                    done();
                }
                catch (error) {
                    done();
                    this.showError(error instanceof Error ? error.message : String(error));
                }
            }, () => {
                done();
            }, initialSearchInput);
            return { component: selector, focus: selector };
        });
    }
    async handleLoginCommand(providerRef) {
        await this.session.modelRuntime.getAvailable();
    }`;
const interactiveLoginSource = `function getLoginProviderCompletionOptions(providerOptions) {
    const byId = new Map();
    for (const provider of providerOptions) {
        const existing = byId.get(provider.id);
        if (existing) continue;
        byId.set(provider.id, {
            id: provider.id,
            name: provider.name,
            authTypes: [provider.authType],
            custom: provider.custom,
        });
    }
    return Array.from(byId.values()).sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
    getLoginProviderOptions(authType) {
        const options = [];
        for (const provider of this.session.modelRuntime.getProviders()) {
            const custom = this.session.modelRuntime.isCustomProvider(provider.id);
            const authStatus = this.session.modelRuntime.getProviderAuthStatus(provider.id);
            const status = authStatus.configured ? { type: "api_key", source: authStatus.source } : undefined;
            if ((!authType || authType === "oauth") && provider.auth.oauth) {
                options.push({
                    id: provider.id,
                    name: provider.name,
                    authType: "oauth",
                    custom,
                    method: provider.auth.oauth,
                    status,
                });
            }
            if ((!authType || authType === "api_key") && provider.auth.apiKey) {
                options.push({
                    id: provider.id,
                    name: provider.name,
                    authType: "api_key",
                    custom,
                    method: provider.auth.apiKey,
                    status,
                });
            }
        }
        return options.sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    }
    async startCustomProviderLogin(authType) {
        const input = await this.showExtensionInput("Custom / 自定义", "Provider ID");
        const providerRef = input?.trim().toLowerCase();
        if (!providerRef) {
            return;
        }
        const providerOption = this.getLoginProviderOptions(authType).find((provider) => provider.custom &&
            (provider.id.toLowerCase() === providerRef || provider.name.toLowerCase() === providerRef));
        if (!providerOption) {
            this.showError(\`Custom provider "\${input.trim()}" is not configured for this authentication method. Add it to models.json or an extension first.\`);
            return;
        }
        await this.startProviderLogin(providerOption);
    }
    showLoginProviderSelector(authType, initialSearchInput) {
        const providerOptions = this.getLoginProviderOptions(authType);
        if (providerOptions.length === 0) return;
        this.showSelector((done) => {
            const selector = new OAuthSelectorComponent("login", providerOptions, async (providerId, selectedAuthType) => {
                done();
                const providerOption = providerOptions.find((provider) => provider.id === providerId && provider.authType === selectedAuthType);
                if (!providerOption) {
                    return;
                }
                await this.startProviderLogin(providerOption);
            }, () => done(), initialSearchInput);
            return { component: selector, focus: selector };
        });
    }
    async showOAuthSelector(mode) {
    }`;
const repositoryRoot = new URL("..", import.meta.url).pathname;
const patchTargets = [
  "dist/cli/args.js",
  "dist/cli/list-models.js",
  "dist/core/model-runtime.js",
  "dist/core/model-runtime.d.ts",
  "dist/modes/interactive/components/model-selector.js",
  "dist/modes/interactive/components/model-selector.d.ts",
  "dist/core/system-prompt.js",
  "dist/modes/interactive/components/first-time-setup.js",
  "dist/modes/interactive/interactive-mode.js",
  "dist/utils/tools-manager.js",
  "dist/utils/version-check.js",
  "node_modules/@earendil-works/pi-tui/dist/tui.js",
];

async function createFixture({ tuiLayout = "nested" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "coco-identity-patch-"));
  const agent = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
  const tui = tuiLayout === "hoisted" ? join(root, "node_modules", "@earendil-works", "pi-tui") : join(agent, "node_modules", "@earendil-works", "pi-tui");
  await mkdir(join(agent, "dist", "cli"), { recursive: true });
  await mkdir(join(agent, "dist", "core"), { recursive: true });
  await mkdir(join(agent, "dist", "modes", "interactive", "components"), { recursive: true });
  await mkdir(join(agent, "dist", "modes", "interactive"), { recursive: true });
  await mkdir(join(agent, "dist", "utils"), { recursive: true });
  await mkdir(join(tui, "dist", "components"), { recursive: true });
  await writeFile(join(agent, "package.json"), JSON.stringify({ version: "0.82.1" }));
  await writeFile(join(tui, "package.json"), JSON.stringify({ version: "0.82.1" }));
  await writeFile(join(agent, "dist/cli/args.js"), `${identitySource}\n${helpSource}`);
  await writeFile(join(agent, "dist/core/system-prompt.js"), `${identitySource}\n${systemPromptSource}`);
  await writeFile(join(agent, "dist/utils/version-check.js"), identitySource);
  await writeFile(join(agent, "dist/modes/interactive/components/first-time-setup.js"), firstTimeSetupSource);
  await writeFile(join(agent, "dist/utils/tools-manager.js"), await readFile(join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/utils/tools-manager.js"), "utf8"));
  await writeFile(join(agent, "dist/modes/interactive/interactive-mode.js"), `import { CombinedAutocompleteProvider, Container, fuzzyFilter, getCapabilities, hyperlink, Markdown, matchesKey, ProcessTerminal, Spacer, setKeybindings, Text, TruncatedText, TUI, visibleWidth, } from "@earendil-works/pi-tui";\nimport { checkForNewPiVersion } from "../../utils/version-check.js";\n${expandableTextSource}\n${identitySource}\n${headerSource}\n${quietHeaderSource}\n${startupExpansionSource}\n${resourceListingSource}\n${toolBootstrapSource}\n${compactExpansionHintSource}\n${startupPolicySource}`);
  await writeFile(join(agent, "dist/core/model-runtime.js"), await readFile(join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js"), "utf8"));
  await writeFile(join(agent, "dist/core/model-runtime.d.ts"), await readFile(join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.d.ts"), "utf8"));
  await writeFile(join(agent, "dist/cli/list-models.js"), await readFile(join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/cli/list-models.js"), "utf8"));
  await writeFile(join(agent, "dist/modes/interactive/components/model-selector.js"), await readFile(join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/model-selector.js"), "utf8"));
  await writeFile(join(agent, "dist/modes/interactive/components/model-selector.d.ts"), await readFile(join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/model-selector.d.ts"), "utf8"));
  await writeFile(join(agent, "dist/modes/interactive/components/extension-input.js"), `import { Input } from "@earendil-works/pi-tui";\nclass ExtensionInput {\n    constructor(opts) {\n        this.input = new Input();\n        this.addChild(this.input);\n    }\n}`);
  await writeFile(join(agent, "dist/modes/interactive/interactive-mode.js"), `${await readFile(join(agent, "dist/modes/interactive/interactive-mode.js"), "utf8")}\n${interactiveModelSelectionSource}\n${interactiveLoginSource}`);
  await writeFile(join(tui, "dist/tui.js"), tuiSource);
  await writeFile(join(tui, "dist/components/input.js"), 'const prompt = "> ";\n');
  await writeFile(join(tui, "dist/components/settings-list.js"), 'const valueText = this.theme.value(truncateToWidth(item.currentValue, valueMaxWidth, ""), isSelected);\nconst help = "  Enter/Space to change · Esc to cancel";\n');
  return root;
}

async function readPatched(root, path) {
  return readFile(join(root, "node_modules", "@earendil-works", "pi-coding-agent", path), "utf8");
}

function visibleWidth(line) {
  return line.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncateToWidth(line, width) {
  const visible = visibleWidth(line);
  return visible <= width ? line : line.replace(/\x1b\[[0-9;]*m/g, "").slice(0, width);
}

function wordmarkFrom(interactive) {
  const match = interactive.match(/class ResponsiveStartupWordmark \{[\s\S]*?\n\}/);
  assert.ok(match);
  const theme = {
    bold: (text) => `\x1b[1m${text}\x1b[0m`,
    fg: (_token, text) => `\x1b[36m${text}\x1b[0m`,
  };
  return new Function("theme", "truncateToWidth", "visibleWidth", `${match[0]}\nreturn ResponsiveStartupWordmark;`)(theme, truncateToWidth, visibleWidth);
}

test("Given supported upstream artifacts, when patched, then the identity, compact header, and preserved-scrollback contracts are applied", async () => {
  const root = await createFixture();
  try {
    await applyCocoIdentityPatch({ root });
    const interactive = await readPatched(root, "dist/modes/interactive/interactive-mode.js");
    const bundledInteractive = await readPatched(root, "dist/modes/interactive/interactive-mode.js");
    const args = await readPatched(root, "dist/cli/args.js");
    const systemPrompt = await readPatched(root, "dist/core/system-prompt.js");
    const firstTimeSetup = await readPatched(root, "dist/modes/interactive/components/first-time-setup.js");
    const toolsManager = await readPatched(root, "dist/utils/tools-manager.js");
    const extensionInput = await readPatched(root, "dist/modes/interactive/components/extension-input.js");
    const tui = await readPatched(root, "node_modules/@earendil-works/pi-tui/dist/tui.js");
    assert.match(interactive, /new ResponsiveStartupWordmark\(this\.getStartupExpansionState\(\), this\.version, compactInstructions, expandedInstructions\)/);
    assert.match(interactive, /class ResponsiveStartupWordmark/);
    assert.match(interactive, /render\(width\)/);
    assert.match(interactive, /truncateToWidth/);
    assert.match(interactive, /theme\.bold\(theme\.fg\("accent"/);
    assert.match(interactive, /theme\.fg\("dim"/);
    assert.match(interactive, /currentTheme: this\.settingsManager\.getThemeSetting\(\) \|\| "coco-orange-light\/coco-orange"/);
    assert.match(bundledInteractive, /currentTheme: this\.settingsManager\.getThemeSetting\(\) \|\| "coco-orange-light\/coco-orange"/);
    assert.match(interactive, /Number\(Boolean\(b\.custom\)\) - Number\(Boolean\(a\.custom\)\)/);
    assert.match(interactive, /if \(authType === "api_key"\) \{\s*providerOptions\.unshift\(\{\s*id: "__coco_custom_provider__",\s*name: uiText\("Custom \/ 自定义"\)/);
    assert.match(interactive, /if \(providerId === "__coco_custom_provider__"\) \{\s*await this\.startCustomProviderLogin\(\);/);
    assert.equal((interactive.match(/async startCustomProviderLogin\(/g) ?? []).length, 1);
    assert.equal((interactive.match(/providerOptions\.unshift\(/g) ?? []).length, 1);
    assert.equal((interactive.match(/name: uiText\("Custom \/ 自定义"\)/g) ?? []).length, 1);
    assert.match(interactive, /Custom provider Base URL \/ 自定义提供商地址/);
    assert.match(interactive, /fetchCustomProviderModels/);
    assert.match(interactive, /saveCustomProvider/);
    assert.match(interactive, /Select a model \/ 选择模型/);
    assert.match(interactive, /await this\.session\.modelRuntime\.refresh\(\{ allowNetwork: false \}\);/);
    assert.match(interactive, /await this\.session\.modelRuntime\.setRuntimeApiKey\(configured\.providerId, key, \{ allowNetwork: false \}\);/);
    assert.match(interactive, /this\.session\.modelRuntime\.getModel\(configured\.providerId, configured\.modelId\)/);
    assert.match(interactive, /await this\.session\.setModel\(selectedModel\);/);
    assert.match(extensionInput, /opts\?\.secret/);
    assert.match(extensionInput, /"\*"\.repeat\(value\.length\)/);
    assert.match(interactive, /invalidate\(\)/);
    assert.match(interactive, /setExpanded\(expanded\)/);
    assert.match(interactive, /new ResponsiveStartupWordmark\(false/);
    assert.match(interactive, /getStartupExpansionState\(\) \{\s*return this\.options\.verbose;\s*\}/);
    assert.match(interactive, /const showListing = options\?\.force \|\| this\.options\.verbose;/);
    assert.match(interactive, /ensureTool\("fd"\), ensureTool\("rg"\)/);
    assert.doesNotMatch(interactive, /ensureTool\("fd", true\)|ensureTool\("rg", true\)/);
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
    assert.match(systemPrompt, /general AI assistant/);
    assert.match(systemPrompt, /reading files, executing commands, editing code, and writing new files/);
    assert.match(args, /General AI assistant with read, bash, edit, write tools/);
    assert.match(args, /default: general AI assistant prompt/);
    assert.match(firstTimeSetup, /uiText\("Welcome to \{app\}, your general AI assistant\."/);
    assert.doesNotMatch(toolsManager, /Offline mode enabled, skipping download/);
    assert.match(toolsManager, /not found\. Downloading/);
    assert.match(toolsManager, /Failed to download/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given a clean npm install header, when patched, then the responsive wordmark replaces the upstream onboarding header", async () => {
  const root = await createFixture();
  try {
    const interactivePath = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "modes", "interactive", "interactive-mode.js");
    const interactive = await readFile(interactivePath, "utf8");
    await writeFile(interactivePath, interactive.replace(headerSource, `${cleanInstallOnboardingSource}\n${cleanInstallHeaderSource}`));
    await applyCocoIdentityPatch({ root });
    const patched = await readFile(interactivePath, "utf8");
    assert.match(patched, /new ResponsiveStartupWordmark\(this\.getStartupExpansionState\(\), this\.version, compactInstructions, expandedInstructions\)/);
    assert.doesNotMatch(patched, /const compactOnboarding|const onboarding/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given the patched startup wordmark, when rendered at responsive widths, then each row is bounded and the compact fallback is intentional", async () => {
  const root = await createFixture();
  try {
    await applyCocoIdentityPatch({ root });
    const ResponsiveStartupWordmark = wordmarkFrom(await readPatched(root, "dist/modes/interactive/interactive-mode.js"));

     const wideArtThreshold = 40;
    const wide = new ResponsiveStartupWordmark(false, "0.82.1").render(80);
     assert.equal(wide.length, 6);
     assert.match(wide.join("\n"), /██████╗/);
    assert.match(wide.join("\n"), /v0\.82\.1/);
    assert.ok(wide.every((line) => visibleWidth(line) <= 80));

    const beforeWide = new ResponsiveStartupWordmark(false).render(wideArtThreshold - 1);
    assert.equal(beforeWide.length, 1);
    assert.match(beforeWide[0], /CoCo/);

    const atWide = new ResponsiveStartupWordmark(false).render(wideArtThreshold);
     assert.equal(atWide.length, 6);
     assert.match(atWide.join("\n"), /██████╗/);

    const narrow = new ResponsiveStartupWordmark(false).render(20);
    assert.equal(narrow.length, 1);
    assert.match(narrow[0], /CoCo/);
    assert.ok(narrow.every((line) => visibleWidth(line) <= 20));

    assert.deepEqual(new ResponsiveStartupWordmark(false).render(0), []);
    for (const width of [1, 2, 3]) {
      const tiny = new ResponsiveStartupWordmark(false).render(width);
      assert.ok(tiny.every((line) => visibleWidth(line) <= width));
    }

    const versionWithoutRoom = new ResponsiveStartupWordmark(false, "0.82.1").render(6);
    assert.doesNotMatch(versionWithoutRoom.join("\n"), /v0\.82\.1/);
    const versionWithRoom = new ResponsiveStartupWordmark(false, "0.82.1").render(80);
    assert.match(versionWithRoom.join("\n"), /v0\.82\.1/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given the patched startup wordmark, when startup state changes, then quiet startup stays mark-only and cached instructions recompute", async () => {
  const root = await createFixture();
  try {
    await applyCocoIdentityPatch({ root });
    const ResponsiveStartupWordmark = wordmarkFrom(await readPatched(root, "dist/modes/interactive/interactive-mode.js"));

    const quiet = new ResponsiveStartupWordmark(false, "0.82.1");
     assert.equal(quiet.render(80).length, 6);

    const wordmark = new ResponsiveStartupWordmark(false, "", "compact", "expanded\ninstructions");
    const compact = wordmark.render(40);
    assert.match(compact.join("\n"), /compact/);
    assert.doesNotMatch(compact.join("\n"), /expanded/);

    wordmark.setExpanded(true);
    const expanded = wordmark.render(40);
    assert.match(expanded.join("\n"), /expanded/);
    assert.match(expanded.join("\n"), /instructions/);
    assert.doesNotMatch(expanded.join("\n"), /compact/);

    wordmark.invalidate();
    assert.notStrictEqual(wordmark.render(40), expanded);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given supported upstream artifacts, when patched twice, then the second application is a no-op", async () => {
  const root = await createFixture();
  try {
    await applyCocoIdentityPatch({ root });
    const once = await Promise.all(patchTargets.map((path) => readPatched(root, path)));
    await applyCocoIdentityPatch({ root });
    assert.deepEqual(await Promise.all(patchTargets.map((path) => readPatched(root, path))), once);
    assert.equal((await readPatched(root, "dist/core/model-runtime.js")).match(/^    getVisible\(\) \{/gm)?.length, 1);
    assert.equal((await readPatched(root, "dist/core/model-runtime.js")).match(/^    getVisibleSnapshot\(\) \{/gm)?.length, 1);
    assert.equal((await readPatched(root, "dist/core/model-runtime.d.ts")).match(/getVisible\(\): readonly Model<Api>\[\];/g)?.length, 1);
    assert.equal((await readPatched(root, "dist/core/model-runtime.d.ts")).match(/getVisibleSnapshot\(\): readonly Model<Api>\[\];/g)?.length, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given nested or hoisted pi-tui, when patched, then the selected layout receives valid project-relative imports", async () => {
  for (const tuiLayout of ["nested", "hoisted"]) {
    const root = await createFixture({ tuiLayout });
    try {
      const agent = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
      const tui = tuiLayout === "hoisted" ? join(root, "node_modules", "@earendil-works", "pi-tui") : join(agent, "node_modules", "@earendil-works", "pi-tui");
      await applyCocoIdentityPatch({ root });
      assert.match(await readFile(join(tui, "dist/tui.js"), "utf8"), /\\x1b\[2J\\x1b\[H/);
      assert.match(await readFile(join(tui, "dist/components/input.js"), "utf8"), /const prompt = "› ";/);
      const settings = await readFile(join(tui, "dist/components/settings-list.js"), "utf8");
      const expected = tuiLayout === "hoisted" ? "../../../../../resources/coco-ui-language.mjs" : "../../../../../../../../resources/coco-ui-language.mjs";
      assert.match(settings, new RegExp(expected.replaceAll(".", "\\.")));
      assert.match(settings, /uiValue\(item\.currentValue\)/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("Given an older or duplicated CoCo wordmark block, when patched, then it fails closed", async () => {
  const root = await createFixture();
  try {
    const interactivePath = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "modes", "interactive", "interactive-mode.js");
    await applyCocoIdentityPatch({ root });
    const current = await readFile(interactivePath, "utf8");
    const currentWordmark = current.match(/class ResponsiveStartupWordmark \{[\s\S]*?\n\}/)?.[0];
    assert.ok(currentWordmark);

    await writeFile(interactivePath, current.replace(currentWordmark, olderResponsiveWordmarkSource));
    await assert.rejects(applyCocoIdentityPatch({ root }), { message: /COCO_PATCH_UNKNOWN_ANCHOR/ });

    await writeFile(interactivePath, current.replace(currentWordmark, `${currentWordmark}\n${currentWordmark}`));
    await assert.rejects(applyCocoIdentityPatch({ root }), { message: /COCO_PATCH_DUPLICATE_ANCHOR/ });

    await writeFile(interactivePath, current.replace(currentWordmark, `${currentWordmark}\nconst wordmarkSeparator = true;\n${currentWordmark}`));
    await assert.rejects(applyCocoIdentityPatch({ root }), { message: /COCO_PATCH_DUPLICATE_ANCHOR/ });

    await writeFile(interactivePath, `${currentWordmark}\n${current}`);
    await assert.rejects(applyCocoIdentityPatch({ root }), { message: /COCO_PATCH_DUPLICATE_ANCHOR/ });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Given supported model artifacts, when patched, then declared models are visible while authentication remains required for selection", async () => {
  const root = await createFixture();
  try {
    await applyCocoIdentityPatch({ root });
    const runtime = await readPatched(root, "dist/core/model-runtime.js");
    const declaration = await readPatched(root, "dist/core/model-runtime.d.ts");
    const list = await readPatched(root, "dist/cli/list-models.js");
    const selector = await readPatched(root, "dist/modes/interactive/components/model-selector.js");
    const interactive = await readPatched(root, "dist/modes/interactive/interactive-mode.js");
    assert.match(runtime, /getVisible\(\)/);
    assert.match(runtime, /isCustomProvider\(providerId\)/);
    assert.match(declaration, /isCustomProvider\(providerId: string\): boolean/);
    assert.match(runtime, /this\.config\.getProvider\(model\.provider\)\?\.models\?\.some/);
    assert.match(declaration, /getVisible\(\): readonly Model<Api>\[\]/);
    assert.match(list, /modelRuntime\.getVisible\(\)/);
    assert.match(list, /login-required/);
    assert.match(selector, /getVisibleSnapshot\(\)/);
    assert.match(selector, /coco-model-panel-renderer\.mjs/);
    assert.match(selector, /const loginRequired = !this\.modelRuntime\.hasConfiguredAuth\(model\.provider\);/);
    assert.match(selector, /modelPanelMessageKeyFromLoginRequired\(item\.loginRequired\)/);
    assert.match(selector, /translate\(loginMessageKey\)/);
    assert.doesNotMatch(selector, /uiText\("login-required"\)/);
    for (const key of ["modelPanel.title", "modelPanel.authenticationHint", "modelPanel.noMatches", "modelPanel.modelName"]) assert.match(selector, new RegExp(`translate\\(\\"${key.replaceAll(".", "\\.")}\\"`));
    for (const display of ["uiText(\"Models\")", "uiText(\"Only showing models", "uiText(\"No matching models\")", "uiText(`Model Name:"]) assert.equal(selector.includes(display), false);
    for (const key of ["modelPanel.refresh.running", "modelPanel.refresh.success", "modelPanel.refresh.timeout", "modelPanel.refresh.providerError", "modelPanel.refresh.multipleErrors"]) assert.match(selector, new RegExp(key.replaceAll(".", "\\.")));
    for (const key of ["modelPanel.scope.label", "modelPanel.scope.all", "modelPanel.scope.scoped", "modelPanel.scope.action"]) assert.match(selector, new RegExp(key.replaceAll(".", "\\.")));
    assert.match(selector, /onSelectCallback\(model, loginRequired\)/);
    assert.match(interactive, /if \(loginRequired\) \{\s*done\(\);\s*await this\.handleLoginCommand\(model\.provider\);/);
    assert.match(interactive, /const custom = this\.session\.modelRuntime\.isCustomProvider\(provider\.id\);/);
    assert.equal(interactive.match(/const custom = this\.session\.modelRuntime\.isCustomProvider\(provider\.id\);/g)?.length, 1);
    assert.doesNotMatch(interactive, /const custom = this\.session\.modelRuntime\.isConfiguredProvider\(provider\.id\);/);
    assert.match(interactive, /Number\(Boolean\(b\.custom\)\) - Number\(Boolean\(a\.custom\)\)/);
    assert.match(interactive, /name: uiText\("Custom \/ 自定义"\)/);
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

test("Given the offline tool notice anchor drifts, when patch preflight runs, then it fails without partial writes", async () => {
  const root = await createFixture();
  try {
    const agent = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
    const tools = join(agent, "dist", "utils", "tools-manager.js");
    const interactive = join(agent, "dist", "modes", "interactive", "interactive-mode.js");
    const originalInteractive = await readFile(interactive, "utf8");
    const originalTools = await readFile(tools, "utf8");
    const driftedTools = originalTools
      .replace("        if (!silent) {\n\n        }", "        if (!silent) {\n            console.log(\"offline notice drifted\");\n        }")
      .replace("        // Coco keeps optional-tool discovery silent while startup is offline.", "        console.log(\"offline notice drifted\");")
      .replace("        // CoCo keeps optional-tool discovery silent while startup is offline.", "        console.log(\"offline notice drifted\");");
    assert.notEqual(driftedTools, originalTools);
    await writeFile(tools, driftedTools);
    await assert.rejects(applyCocoIdentityPatch({ root }), { message: /COCO_PATCH_UNKNOWN_ANCHOR/ });
    assert.equal(await readFile(interactive, "utf8"), originalInteractive);
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
