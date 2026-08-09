import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const expectedVersion = "0.82.1";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentPath = (projectRoot) => join(projectRoot, "node_modules", "@earendil-works", "pi-coding-agent");

const identityReplacements = [
  ["https://pi.dev", "https://coco.local"],
  ["Pi documentation", "Coco documentation"],
  ["inside pi", "inside coco"],
  ["extend Pi", "extend Coco"],
];

const tuiImportAnchor = `import { CombinedAutocompleteProvider, Container, fuzzyFilter, getCapabilities, hyperlink, Markdown, matchesKey, ProcessTerminal, Spacer, setKeybindings, Text, TruncatedText, TUI, visibleWidth, } from "@earendil-works/pi-tui";`;
const patchedTuiImport = `import { CombinedAutocompleteProvider, Container, fuzzyFilter, getCapabilities, hyperlink, Markdown, matchesKey, ProcessTerminal, Spacer, setKeybindings, Text, TruncatedText, TUI, truncateToWidth, visibleWidth, } from "@earendil-works/pi-tui";`;
const expandableTextAnchor = `class ExpandableText extends Text {
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
const responsiveStartupWordmark = `class ResponsiveStartupWordmark {
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
        if (width <= 0) {
            this.cachedWidth = width;
            this.cachedLines = [];
            return this.cachedLines;
        }
        const padding = width >= 3 ? " " : "";
        const contentWidth = width - visibleWidth(padding) * 2;
        const art = [" CCCC  ooo  CCCC  ooo", "C     o   o C     o   o", "C     o   o C     o   o", " CCCC  ooo  CCCC  ooo"];
        const compact = "CoCo";
        const artWidth = Math.max(...art.map((line) => visibleWidth(line)));
        const mark = contentWidth >= artWidth ? art : [compact];
        const lines = mark.map((line) => padding + truncateToWidth(theme.bold(theme.fg("accent", line)), contentWidth, "") + padding);
        const version = this.version ? theme.fg("dim", "  v" + this.version) : "";
        if (version && visibleWidth(mark[mark.length - 1]) + visibleWidth(version) <= contentWidth) {
            lines[lines.length - 1] = padding + truncateToWidth(theme.bold(theme.fg("accent", mark[mark.length - 1])) + version, contentWidth, "") + padding;
        }
        const instructions = this.expanded ? this.instructions : this.compactInstructions;
        if (instructions) {
            lines.push(...instructions.split("\\n").map((line) => padding + truncateToWidth(line, contentWidth, "") + padding));
        }
        this.cachedWidth = width;
        this.cachedLines = lines;
        return lines;
    }
}`;
const patchedExpandableText = `${expandableTextAnchor}
${responsiveStartupWordmark}`;
const headerAnchor = `this.builtInHeader = new ExpandableText(() => \`\${logo}\\n\${compactInstructions}\`, () => \`\${logo}\\n\${expandedInstructions}\`, this.getStartupExpansionState(), 1, 0);`;
const compactOnboardingAnchor = `            const compactOnboarding = theme.fg("dim", \`Press \${keyText("app.tools.expand")} to show full startup help and loaded resources.\`);`;
const onboardingAnchor = `            const onboarding = theme.fg("dim", \`Pi can explain its own features and look up its docs. Ask it how to use or extend Coco.\`);`;
const cleanInstallHeaderAnchor = `this.builtInHeader = new ExpandableText(() => \`\${logo}\\n\${compactInstructions}\\n\${compactOnboarding}\\n\\n\${onboarding}\`, () => \`\${logo}\\n\${expandedInstructions}\\n\\n\${onboarding}\`, this.getStartupExpansionState(), 1, 0);`;
const patchedHeader = `this.builtInHeader = new ResponsiveStartupWordmark(this.getStartupExpansionState(), this.version, compactInstructions, expandedInstructions);`;
const quietHeaderAnchor = `this.builtInHeader = new Text("", 0, 0);`;
const patchedQuietHeader = `this.builtInHeader = new ResponsiveStartupWordmark(false, this.version);`;
const startupExpansionAnchor = `    getStartupExpansionState() {
        return this.options.verbose || this.toolOutputExpanded;
    }`;
const patchedStartupExpansion = `    getStartupExpansionState() {
        return this.options.verbose;
    }`;
const resourceListingAnchor = `        const showListing = options?.force || this.options.verbose || !this.settingsManager.getQuietStartup();`;
const patchedResourceListing = `        const showListing = options?.force || this.options.verbose;`;
const toolBootstrapAnchor = `        const [fdPath] = await Promise.all([ensureTool("fd"), ensureTool("rg")]);`;
const legacySilentToolBootstrap = `        const [fdPath] = await Promise.all([ensureTool("fd", true), ensureTool("rg", true)]);`;
const compactExpansionHintAnchor = `                hint("app.tools.expand", "more"),`;
const scopedModelsAnchor = `        if (this.session.scopedModels.length > 0 && (this.options.verbose || !this.settingsManager.getQuietStartup())) {`;
const patchedScopedModels = `        if (this.session.scopedModels.length > 0 && this.options.verbose) {`;
const changelogAnchor = `        this.changelogMarkdown = this.getChangelogForDisplay();`;
const patchedChangelog = `        this.changelogMarkdown = this.options.verbose ? this.getChangelogForDisplay() : undefined;`;
const headerGuardAnchor = `        // Add header with keybindings from config (unless silenced)
        if (this.options.verbose || !this.settingsManager.getQuietStartup()) {`;
const patchedHeaderGuard = `        // Add header with keybindings from config (unless silenced)
        if (this.options.verbose) {`;
const versionCheckAnchor = `        checkForNewPiVersion(this.version).then((newRelease) => {`;
const patchedVersionCheck = `        if (this.options.verbose) checkForNewPiVersion(this.version).then((newRelease) => {`;
const packageCheckAnchor = `        this.checkForPackageUpdates()`;
const patchedPackageCheck = `        if (this.options.verbose) this.checkForPackageUpdates()`;
const tmuxCheckAnchor = `        this.checkTmuxKeyboardSetup().then((warning) => {`;
const patchedTmuxCheck = `        if (this.options.verbose) this.checkTmuxKeyboardSetup().then((warning) => {`;
const migratedProvidersAnchor = `        if (migratedProviders && migratedProviders.length > 0) {`;
const patchedMigratedProviders = `        if (this.options.verbose && migratedProviders && migratedProviders.length > 0) {`;
const modelFallbackAnchor = `        if (modelFallbackMessage) {`;
const patchedModelFallback = `        if (this.options.verbose && modelFallbackMessage) {`;
const anthropicWarningAnchor = `        if (modelFallbackMessage) {
            this.showWarning(modelFallbackMessage);
        }
        void this.maybeWarnAboutAnthropicSubscriptionAuth();`;
const patchedAnthropicWarning = `        if (this.options.verbose && modelFallbackMessage) {
            this.showWarning(modelFallbackMessage);
        }
        if (this.options.verbose) void this.maybeWarnAboutAnthropicSubscriptionAuth();`;
const systemPromptIdentityAnchor = `You are an expert coding assistant operating inside coco, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.`;
const patchedSystemPromptIdentity = `You are Coco, a general AI assistant with strong coding and terminal capabilities. You help users with general questions and tasks, including reading files, executing commands, editing code, and writing new files.`;
const helpIdentityAnchor = `${"${chalk.bold(APP_NAME)}"} - AI coding assistant with read, bash, edit, write tools`;
const patchedHelpIdentity = `${"${chalk.bold(APP_NAME)}"} - General AI assistant with read, bash, edit, write tools`;
const helpPromptAnchor = `System prompt (default: coding assistant prompt)`;
const patchedHelpPrompt = `System prompt (default: general AI assistant prompt)`;
const firstTimeSetupAnchor = `Welcome to ${"${APP_NAME}"}, the minimal coding agent.`;
const patchedFirstTimeSetup = `Welcome to ${"${APP_NAME}"}, your general AI assistant.`;
const toolsManagerOfflineAnchor = `    if (isOfflineModeEnabled()) {
        if (!silent) {
            console.log(chalk.yellow(\`${"${config.name}"} not found. Offline mode enabled, skipping download.\`));
        }
        return undefined;
    }`;
const legacyPatchedToolsManagerOffline = `    if (isOfflineModeEnabled()) {
        if (!silent) {

        }
        return undefined;
    }`;
const patchedToolsManagerOffline = `    if (isOfflineModeEnabled()) {
        // Coco keeps optional-tool discovery silent while startup is offline.
        return undefined;
    }`;
const scrollbackAnchor = `                buffer += "\\x1b[2J\\x1b[H\\x1b[3J"; // Clear screen, home, then clear scrollback`;
const patchedScrollback = `                buffer += "\\x1b[2J\\x1b[H"; // Clear screen and home without erasing terminal scrollback`;
const modelRuntimeVisibleAnchor = `    getAvailableSnapshot() {
        return this.snapshot.available;
    }`;
const patchedModelRuntimeVisible = `    getAvailableSnapshot() {
        return this.snapshot.available;
    }
    isCustomProvider(providerId) {
        return this.config.getProvider(providerId) !== undefined && !this.builtins.has(providerId) &&
            !["agnes", "idepub", "achai", "stepfun", "deepseek"].includes(providerId);
    }
    getVisible() {
        return this.snapshot.all.filter((model) => this.snapshot.configuredProviders.has(model.provider) ||
            this.config.getProvider(model.provider)?.models?.some((declared) => declared.id === model.id));
    }
    getVisibleSnapshot() {
        return this.getVisible();
    }`;
const intermediatePatchedModelRuntimeVisible = `    getAvailableSnapshot() {
        return this.snapshot.available;
    }
    isConfiguredProvider(providerId) {
        return this.config.getProvider(providerId) !== undefined;
    }
    getVisible() {
        return this.snapshot.all.filter((model) => this.snapshot.configuredProviders.has(model.provider) ||
            this.config.getProvider(model.provider)?.models?.some((declared) => declared.id === model.id));
    }
    getVisibleSnapshot() {
        return this.getVisible();
    }`;
const legacyPatchedModelRuntimeVisible = intermediatePatchedModelRuntimeVisible.replace(`    isConfiguredProvider(providerId) {
        return this.config.getProvider(providerId) !== undefined;
    }
`, "");
const modelRuntimeDeclarationAnchor = `    getAvailableSnapshot(): readonly Model<Api>[];`;
const patchedModelRuntimeDeclaration = `    getAvailableSnapshot(): readonly Model<Api>[];
    isCustomProvider(providerId: string): boolean;
    getVisible(): readonly Model<Api>[];
    getVisibleSnapshot(): readonly Model<Api>[];`;
const intermediatePatchedModelRuntimeDeclaration = `    getAvailableSnapshot(): readonly Model<Api>[];
    isConfiguredProvider(providerId: string): boolean;
    getVisible(): readonly Model<Api>[];
    getVisibleSnapshot(): readonly Model<Api>[];`;
const legacyPatchedModelRuntimeDeclaration = intermediatePatchedModelRuntimeDeclaration.replace(`    isConfiguredProvider(providerId: string): boolean;
`, "");
const listModelsVisibleAnchor = `    const models = [...(await modelRuntime.getAvailable())];`;
const patchedListModelsVisible = `    const models = [...modelRuntime.getVisible()];`;
const listModelsRowsAnchor = `        images: m.input.includes("image") ? "yes" : "no",
    }));`;
const patchedListModelsRows = `        images: m.input.includes("image") ? "yes" : "no",
        status: modelRuntime.hasConfiguredAuth(m.provider) ? "ready" : "login-required",
    }));`;
const listModelsHeadersAnchor = `        images: "images",
    };`;
const patchedListModelsHeaders = `        images: "images",
        status: "status",
    };`;
const listModelsWidthsAnchor = `        images: Math.max(headers.images.length, ...rows.map((r) => r.images.length)),
    };`;
const patchedListModelsWidths = `        images: Math.max(headers.images.length, ...rows.map((r) => r.images.length)),
        status: Math.max(headers.status.length, ...rows.map((r) => r.status.length)),
    };`;
const listModelsHeaderLineAnchor = `        headers.images.padEnd(widths.images),
    ].join("  ");`;
const patchedListModelsHeaderLine = `        headers.images.padEnd(widths.images),
        headers.status.padEnd(widths.status),
    ].join("  ");`;
const listModelsLineAnchor = `            row.images.padEnd(widths.images),
        ].join("  ");`;
const patchedListModelsLine = `            row.images.padEnd(widths.images),
            row.status.padEnd(widths.status),
        ].join("  ");`;
const selectorVisibleAnchor = `        const models = this.modelRuntime.getAvailableSnapshot().map((model) => ({
            provider: model.provider,
            id: model.id,
            model,
        }));`;
const patchedSelectorVisible = `        const models = this.modelRuntime.getVisibleSnapshot().map((model) => ({
            provider: model.provider,
            id: model.id,
            loginRequired: !this.modelRuntime.hasConfiguredAuth(model.provider),
            model,
        }));`;
const selectorLoginMarkerAnchor = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                line = \`${"${prefix + theme.fg(\"accent\", modelText)}"} ${"${providerBadge}"}${"${checkmark}"}\`;`;
const patchedSelectorLoginMarker = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                const loginRequired = item.loginRequired ? theme.fg("warning", " login-required") : "";
                line = \`${"${prefix + theme.fg(\"accent\", modelText)}"} ${"${providerBadge}"}${"${checkmark}"}${"${loginRequired}"}\`;`;
const selectorLoginMarkerElseAnchor = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                line = \`${"${modelText}"} ${"${providerBadge}"}${"${checkmark}"}\`;`;
const patchedSelectorLoginMarkerElse = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                const loginRequired = item.loginRequired ? theme.fg("warning", " login-required") : "";
                line = \`${"${modelText}"} ${"${providerBadge}"}${"${checkmark}"}${"${loginRequired}"}\`;`;
const selectorHandleSelectAnchor = `    handleSelect(model) {
        this.close();
        // Save as new default
        this.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
        this.onSelectCallback(model);
    }`;
const patchedSelectorHandleSelect = `    handleSelect(model) {
        this.close();
        const loginRequired = !this.modelRuntime.hasConfiguredAuth(model.provider);
        if (!loginRequired)
            this.settingsManager.setDefaultModelAndProvider(model.provider, model.id);
        this.onSelectCallback(model, loginRequired);
    }`;
const selectorDeclarationAnchor = `    constructor(tui: TUI, currentModel: Model<any> | undefined, settingsManager: SettingsManager, modelRuntime: ModelRuntime, scopedModels: ReadonlyArray<ScopedModelItem>, onSelect: (model: Model<any>) => void, onCancel: () => void, initialSearchInput?: string);`;
const patchedSelectorDeclaration = `    constructor(tui: TUI, currentModel: Model<any> | undefined, settingsManager: SettingsManager, modelRuntime: ModelRuntime, scopedModels: ReadonlyArray<ScopedModelItem>, onSelect: (model: Model<any>, loginRequired: boolean) => void, onCancel: () => void, initialSearchInput?: string);`;
const interactiveModelSelectorAnchor = `            const selector = new ModelSelectorComponent(this.ui, this.session.model, this.settingsManager, this.session.modelRuntime, this.session.scopedModels, async (model) => {
                try {`;
const patchedInteractiveModelSelector = `            const selector = new ModelSelectorComponent(this.ui, this.session.model, this.settingsManager, this.session.modelRuntime, this.session.scopedModels, async (model, loginRequired) => {
                if (loginRequired) {
                    done();
                    await this.handleLoginCommand(model.provider);
                    return;
                }
                try {`;
const loginCompletionOptionAnchor = `        byId.set(provider.id, {
            id: provider.id,
            name: provider.name,
            authTypes: [provider.authType],
        });`;
const patchedLoginCompletionOption = `        byId.set(provider.id, {
            id: provider.id,
            name: provider.name,
            authTypes: [provider.authType],
            custom: provider.custom,
        });`;
const loginCompletionSortAnchor = `    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));`;
const patchedLoginCompletionSort = `    return Array.from(byId.values()).sort((a, b) => Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`;
const loginOptionsAnchor = `    getLoginProviderOptions(authType) {
        const options = [];
        for (const provider of this.session.modelRuntime.getProviders()) {`;
const patchedLoginOptions = `    getLoginProviderOptions(authType) {
        const options = [];
        for (const provider of this.session.modelRuntime.getProviders()) {
            const custom = this.session.modelRuntime.isCustomProvider(provider.id);`;
const intermediatePatchedLoginOptions = `    getLoginProviderOptions(authType) {
        const options = [];
        for (const provider of this.session.modelRuntime.getProviders()) {
            const custom = this.session.modelRuntime.isConfiguredProvider(provider.id);`;
const loginOauthOptionAnchor = `                    authType: "oauth",
                    method: provider.auth.oauth,
                    status,`;
const patchedLoginOauthOption = `                    authType: "oauth",
                    custom,
                    method: provider.auth.oauth,
                    status,`;
const loginApiKeyOptionAnchor = `                    authType: "api_key",
                    method: provider.auth.apiKey,
                    status,`;
const patchedLoginApiKeyOption = `                    authType: "api_key",
                    custom,
                    method: provider.auth.apiKey,
                    status,`;
const loginOptionsSortAnchor = `        return options.sort((a, b) => a.name.localeCompare(b.name));`;
const patchedLoginOptionsSort = `        return options.sort((a, b) => Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`;

function patchError(code) {
  return new Error(code);
}

function count(source, anchor) {
  return source.split(anchor).length - 1;
}

function replaceExact(source, anchor, replacement) {
  if (!replacement) {
    const matches = count(source, anchor);
    if (matches === 1) {
      return source.replace(anchor, replacement);
    }
    if (matches > 1) {
      throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
    }
    return source;
  }
  const replacements = count(source, replacement);
  const matches = count(source, anchor);
  if (replacements > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  if (replacements === 1) {
    if (matches > 1) {
      throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
    }
    return source;
  }
  if (matches === 1) {
    return source.replace(anchor, replacement);
  }
  if (matches > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
}

function replaceUpgrade(source, anchor, legacy, replacement) {
  if (count(source, replacement) === 1) return source;
  for (const candidate of Array.isArray(legacy) ? legacy : [legacy]) if (count(source, candidate) === 1) return source.replace(candidate, replacement);
  return replaceExact(source, anchor, replacement);
}

function replaceOwnedResponsiveStartupWordmark(source) {
  const matches = count(source, expandableTextAnchor);
  if (matches > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  if (matches === 0) {
    throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
  }
  const anchorEnd = source.indexOf(expandableTextAnchor) + expandableTextAnchor.length;
  const suffix = source.slice(anchorEnd);
  const currentBlock = `\n${responsiveStartupWordmark}`;
  const declarations = count(source, "class ResponsiveStartupWordmark {");
  if (declarations > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  if (declarations === 1 && suffix.startsWith(currentBlock)) {
    return source;
  }
  if (declarations === 1) {
    throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
  }
  return source.slice(0, anchorEnd) + currentBlock + suffix;
}

function replaceOfflineToolNotice(source) {
  const variants = [toolsManagerOfflineAnchor, legacyPatchedToolsManagerOffline, patchedToolsManagerOffline];
  const counts = variants.map((variant) => count(source, variant));
  const matches = counts.reduce((total, value) => total + value, 0);
  if (matches > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  if (counts[2] === 1) {
    return source;
  }
  if (matches === 0) {
    throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
  }
  return source.replace(counts[0] === 1 ? toolsManagerOfflineAnchor : legacyPatchedToolsManagerOffline, patchedToolsManagerOffline);
}

function replaceOwnedHeader(source) {
  const variants = [headerAnchor, cleanInstallHeaderAnchor, patchedHeader];
  const counts = variants.map((variant) => count(source, variant));
  const matches = counts.reduce((total, value) => total + value, 0);
  if (matches > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  if (counts[2] === 1) {
    return source;
  }
  if (matches === 0) {
    throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
  }
  return source.replace(counts[0] === 1 ? headerAnchor : cleanInstallHeaderAnchor, patchedHeader);
}

function removeOwnedOnboardingDeclarations(source) {
  const compactMatches = count(source, compactOnboardingAnchor);
  const onboardingMatches = count(source, onboardingAnchor);
  if (compactMatches > 1 || onboardingMatches > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  if (compactMatches === 0 && onboardingMatches === 0) {
    return source;
  }
  if (compactMatches !== 1 || onboardingMatches !== 1) {
    throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
  }
  return source.replace(`${compactOnboardingAnchor}\n${onboardingAnchor}\n`, "");
}

function normalizeToolBootstrap(source) {
  const variants = [toolBootstrapAnchor, legacySilentToolBootstrap];
  const counts = variants.map((variant) => count(source, variant));
  if (counts[0] + counts[1] !== 1) {
    throw patchError(counts[0] + counts[1] > 1 ? "COCO_PATCH_DUPLICATE_ANCHOR" : "COCO_PATCH_UNKNOWN_ANCHOR");
  }
  return counts[0] === 1 ? source : source.replace(legacySilentToolBootstrap, toolBootstrapAnchor);
}

function applyIdentityReplacements(source) {
  return identityReplacements.reduce((patched, [from, to]) => patched.replaceAll(from, to), source);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function ensureVersion(path) {
  const { version } = await readJson(path);
  if (version !== expectedVersion) {
    throw patchError("COCO_PATCH_VERSION_MISMATCH");
  }
}

export async function applyCocoIdentityPatch({ root: projectRoot = root } = {}) {
  const agent = agentPath(projectRoot);
  const tui = join(agent, "node_modules", "@earendil-works", "pi-tui");
  await Promise.all([ensureVersion(join(agent, "package.json")), ensureVersion(join(tui, "package.json"))]);
  const targets = [
    "dist/cli/args.js",
    "dist/cli/list-models.js",
    "dist/core/model-runtime.js",
    "dist/core/model-runtime.d.ts",
    "dist/modes/interactive/components/model-selector.js",
    "dist/modes/interactive/components/model-selector.d.ts",
    "dist/core/system-prompt.js",
    "dist/modes/interactive/interactive-mode.js",
    "dist/utils/version-check.js",
    "dist/modes/interactive/components/first-time-setup.js",
    "dist/utils/tools-manager.js",
  ].map((path) => join(agent, path));
  const tuiPath = join(tui, "dist/tui.js");
  const originals = await Promise.all([...targets, tuiPath].map((path) => readFile(path, "utf8")));
  const patched = originals.slice(0, -1).map(applyIdentityReplacements);
  patched[7] = replaceExact(patched[7], tuiImportAnchor, patchedTuiImport);
  patched[7] = replaceOwnedResponsiveStartupWordmark(patched[7]);
  patched[1] = replaceExact(patched[1], listModelsVisibleAnchor, patchedListModelsVisible);
  patched[1] = replaceExact(patched[1], listModelsRowsAnchor, patchedListModelsRows);
  patched[1] = replaceExact(patched[1], listModelsHeadersAnchor, patchedListModelsHeaders);
  patched[1] = replaceExact(patched[1], listModelsWidthsAnchor, patchedListModelsWidths);
  patched[1] = replaceExact(patched[1], listModelsHeaderLineAnchor, patchedListModelsHeaderLine);
  patched[1] = replaceExact(patched[1], listModelsLineAnchor, patchedListModelsLine);
  patched[2] = replaceUpgrade(patched[2], modelRuntimeVisibleAnchor, [legacyPatchedModelRuntimeVisible, intermediatePatchedModelRuntimeVisible], patchedModelRuntimeVisible);
  patched[3] = replaceUpgrade(patched[3], modelRuntimeDeclarationAnchor, [legacyPatchedModelRuntimeDeclaration, intermediatePatchedModelRuntimeDeclaration], patchedModelRuntimeDeclaration);
  patched[4] = replaceExact(patched[4], selectorVisibleAnchor, patchedSelectorVisible);
  patched[4] = replaceExact(patched[4], selectorLoginMarkerAnchor, patchedSelectorLoginMarker);
  patched[4] = replaceExact(patched[4], selectorLoginMarkerElseAnchor, patchedSelectorLoginMarkerElse);
  patched[4] = replaceExact(patched[4], selectorHandleSelectAnchor, patchedSelectorHandleSelect);
  patched[5] = replaceExact(patched[5], selectorDeclarationAnchor, patchedSelectorDeclaration);
  patched[7] = replaceOwnedHeader(patched[7]);
  patched[7] = removeOwnedOnboardingDeclarations(patched[7]);
  patched[7] = replaceExact(patched[7], quietHeaderAnchor, patchedQuietHeader);
  patched[7] = replaceExact(patched[7], startupExpansionAnchor, patchedStartupExpansion);
  patched[7] = replaceExact(patched[7], resourceListingAnchor, patchedResourceListing);
  patched[7] = normalizeToolBootstrap(patched[7]);
  patched[7] = replaceExact(patched[7], compactExpansionHintAnchor, "");
  patched[7] = replaceExact(patched[7], scopedModelsAnchor, patchedScopedModels);
  patched[7] = replaceExact(patched[7], changelogAnchor, patchedChangelog);
  patched[7] = replaceExact(patched[7], headerGuardAnchor, patchedHeaderGuard);
  patched[7] = replaceExact(patched[7], versionCheckAnchor, patchedVersionCheck);
  patched[7] = replaceExact(patched[7], packageCheckAnchor, patchedPackageCheck);
  patched[7] = replaceExact(patched[7], tmuxCheckAnchor, patchedTmuxCheck);
  patched[7] = replaceExact(patched[7], migratedProvidersAnchor, patchedMigratedProviders);
  patched[7] = replaceExact(patched[7], anthropicWarningAnchor, patchedAnthropicWarning);
  patched[7] = replaceExact(patched[7], interactiveModelSelectorAnchor, patchedInteractiveModelSelector);
  patched[7] = replaceExact(patched[7], loginCompletionOptionAnchor, patchedLoginCompletionOption);
  patched[7] = replaceExact(patched[7], loginCompletionSortAnchor, patchedLoginCompletionSort);
  patched[7] = replaceUpgrade(patched[7], loginOptionsAnchor, intermediatePatchedLoginOptions, patchedLoginOptions);
  patched[7] = replaceExact(patched[7], loginOauthOptionAnchor, patchedLoginOauthOption);
  patched[7] = replaceExact(patched[7], loginApiKeyOptionAnchor, patchedLoginApiKeyOption);
  patched[7] = replaceExact(patched[7], loginOptionsSortAnchor, patchedLoginOptionsSort);
  if (!patched[7].endsWith("\n")) patched[7] += "\n";
  patched[0] = replaceExact(patched[0], helpIdentityAnchor, patchedHelpIdentity);
  patched[0] = replaceExact(patched[0], helpPromptAnchor, patchedHelpPrompt);
  patched[6] = replaceExact(patched[6], systemPromptIdentityAnchor, patchedSystemPromptIdentity);
  patched[9] = replaceExact(patched[9], firstTimeSetupAnchor, patchedFirstTimeSetup);
  patched[10] = replaceOfflineToolNotice(patched[10]);
  patched.push(replaceExact(originals.at(-1), scrollbackAnchor, patchedScrollback));
  await Promise.all(patched.map((source, index) => source === originals[index] ? undefined : writeFile([...targets, tuiPath][index], source, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await applyCocoIdentityPatch();
}
