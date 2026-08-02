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

const headerAnchor = `            const compactOnboarding = theme.fg("dim", \`Press \${keyText("app.tools.expand")} to show full startup help and loaded resources.\`);
            const onboarding = theme.fg("dim", \`Pi can explain its own features and look up its docs. Ask it how to use or extend Coco.\`);
            this.builtInHeader = new ExpandableText(() => \`\${logo}\\n\${compactInstructions}\\n\${compactOnboarding}\\n\\n\${onboarding}\`, () => \`\${logo}\\n\${expandedInstructions}\\n\\n\${onboarding}\`, this.getStartupExpansionState(), 1, 0);`;
const patchedHeader = `            this.builtInHeader = new ExpandableText(() => \`\${logo}\\n\${compactInstructions}\`, () => \`\${logo}\\n\${expandedInstructions}\`, this.getStartupExpansionState(), 1, 0);`;
const startupExpansionAnchor = `    getStartupExpansionState() {
        return this.options.verbose || this.toolOutputExpanded;
    }`;
const patchedStartupExpansion = `    getStartupExpansionState() {
        return this.options.verbose;
    }`;
const resourceListingAnchor = `        const showListing = options?.force || this.options.verbose || !this.settingsManager.getQuietStartup();`;
const patchedResourceListing = `        const showListing = options?.force || this.options.verbose;`;
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
const scrollbackAnchor = `                buffer += "\\x1b[2J\\x1b[H\\x1b[3J"; // Clear screen, home, then clear scrollback`;
const patchedScrollback = `                buffer += "\\x1b[2J\\x1b[H"; // Clear screen and home without erasing terminal scrollback`;
const modelRuntimeVisibleAnchor = `    getAvailableSnapshot() {
        return this.snapshot.available;
    }`;
const patchedModelRuntimeVisible = `    getAvailableSnapshot() {
        return this.snapshot.available;
    }
    getVisible() {
        return this.snapshot.all.filter((model) => this.snapshot.configuredProviders.has(model.provider) ||
            this.config.getProvider(model.provider)?.models?.some((declared) => declared.id === model.id));
    }
    getVisibleSnapshot() {
        return this.getVisible();
    }`;
const modelRuntimeDeclarationAnchor = `    getAvailableSnapshot(): readonly Model<Api>[];`;
const patchedModelRuntimeDeclaration = `    getAvailableSnapshot(): readonly Model<Api>[];
    getVisible(): readonly Model<Api>[];
    getVisibleSnapshot(): readonly Model<Api>[];`;
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
  ].map((path) => join(agent, path));
  const tuiPath = join(tui, "dist/tui.js");
  const originals = await Promise.all([...targets, tuiPath].map((path) => readFile(path, "utf8")));
  const patched = originals.slice(0, -1).map(applyIdentityReplacements);
  patched[1] = replaceExact(patched[1], listModelsVisibleAnchor, patchedListModelsVisible);
  patched[1] = replaceExact(patched[1], listModelsRowsAnchor, patchedListModelsRows);
  patched[1] = replaceExact(patched[1], listModelsHeadersAnchor, patchedListModelsHeaders);
  patched[1] = replaceExact(patched[1], listModelsWidthsAnchor, patchedListModelsWidths);
  patched[1] = replaceExact(patched[1], listModelsHeaderLineAnchor, patchedListModelsHeaderLine);
  patched[1] = replaceExact(patched[1], listModelsLineAnchor, patchedListModelsLine);
  patched[2] = replaceExact(patched[2], modelRuntimeVisibleAnchor, patchedModelRuntimeVisible);
  patched[3] = replaceExact(patched[3], modelRuntimeDeclarationAnchor, patchedModelRuntimeDeclaration);
  patched[4] = replaceExact(patched[4], selectorVisibleAnchor, patchedSelectorVisible);
  patched[4] = replaceExact(patched[4], selectorLoginMarkerAnchor, patchedSelectorLoginMarker);
  patched[4] = replaceExact(patched[4], selectorLoginMarkerElseAnchor, patchedSelectorLoginMarkerElse);
  patched[4] = replaceExact(patched[4], selectorHandleSelectAnchor, patchedSelectorHandleSelect);
  patched[5] = replaceExact(patched[5], selectorDeclarationAnchor, patchedSelectorDeclaration);
  patched[7] = replaceExact(patched[7], headerAnchor, patchedHeader);
  patched[7] = replaceExact(patched[7], startupExpansionAnchor, patchedStartupExpansion);
  patched[7] = replaceExact(patched[7], resourceListingAnchor, patchedResourceListing);
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
  patched.push(replaceExact(originals.at(-1), scrollbackAnchor, patchedScrollback));
  await Promise.all(patched.map((source, index) => source === originals[index] ? undefined : writeFile([...targets, tuiPath][index], source, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await applyCocoIdentityPatch();
}
