import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const expectedVersion = "0.82.1";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentPath = (projectRoot) => join(projectRoot, "node_modules", "@earendil-works", "pi-coding-agent");

const identityReplacements = [
  ["https://pi.dev", "https://coco.local"],
  ["Pi documentation", "CoCo documentation"],
  ["Coco documentation", "CoCo documentation"],
  ["inside pi", "inside coco"],
  ["extend Pi", "extend CoCo"],
  ["extend Coco", "extend CoCo"],
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
        const mark = contentWidth >= 64 && contentWidth >= artWidth ? art : [compact];
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
const onboardingAnchor = `            const onboarding = theme.fg("dim", \`Pi can explain its own features and look up its docs. Ask it how to use or extend CoCo.\`);`;
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
const legacyPatchedSystemPromptIdentity = `You are Coco, a general AI assistant with strong coding and terminal capabilities. You help users with general questions and tasks, including reading files, executing commands, editing code, and writing new files.`;
const patchedSystemPromptIdentity = `You are CoCo Agent, a general AI assistant with strong coding and terminal capabilities. You help users with general questions and tasks, including reading files, executing commands, editing code, and writing new files.`;
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
const legacyBrandedToolsManagerOffline = `    if (isOfflineModeEnabled()) {
        // Coco keeps optional-tool discovery silent while startup is offline.
        return undefined;
    }`;
const patchedToolsManagerOffline = `    if (isOfflineModeEnabled()) {
        // CoCo keeps optional-tool discovery silent while startup is offline.
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
const intermediatePatchedSelectorLoginMarker = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                const loginRequired = item.loginRequired ? theme.fg("warning", \` ${"${uiText(\"login-required\")}"}\`) : "";
                line = \`${"${prefix + theme.fg(\"accent\", modelText)}"} ${"${providerBadge}"}${"${checkmark}"}${"${loginRequired}"}\`;`;
const patchedSelectorLoginMarker = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                const loginMessageKey = modelPanelMessageKeyFromLoginRequired(item.loginRequired);
                const loginRequired = loginMessageKey === null ? "" : theme.fg("warning", \` ${"${translate(loginMessageKey)}"}\`);
                line = \`${"${prefix + theme.fg(\"accent\", modelText)}"} ${"${providerBadge}"}${"${checkmark}"}${"${loginRequired}"}\`;`;
const selectorLoginMarkerElseAnchor = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                line = \`${"${modelText}"} ${"${providerBadge}"}${"${checkmark}"}\`;`;
const intermediatePatchedSelectorLoginMarkerElse = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                const loginRequired = item.loginRequired ? theme.fg("warning", \` ${"${uiText(\"login-required\")}"}\`) : "";
                line = \`${"${modelText}"} ${"${providerBadge}"}${"${checkmark}"}${"${loginRequired}"}\`;`;
const patchedSelectorLoginMarkerElse = `                const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
                const loginMessageKey = modelPanelMessageKeyFromLoginRequired(item.loginRequired);
                const loginRequired = loginMessageKey === null ? "" : theme.fg("warning", \` ${"${translate(loginMessageKey)}"}\`);
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
const patchedLoginCompletionSort = `    return Array.from(byId.values()).sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`;
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
const patchedLoginOptionsSort = `        return options.sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`;
const loginOptionsDirectSortAnchor = `        return options.sort((a, b) => a.name.localeCompare(b.name));`;
const patchedLoginOptionsDirectSort = `        return options.sort((a, b) => Number(this.session.modelRuntime.isCustomProvider(b.id)) - Number(this.session.modelRuntime.isCustomProvider(a.id)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`;
const loginProviderSelectorAnchor = `    showLoginProviderSelector(authType, initialSearchInput) {
        const providerOptions = this.getLoginProviderOptions(authType);`;
const patchedLoginProviderSelector = `    async startCustomProviderLogin(authType) {
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
        if (authType === "api_key") {
            providerOptions.unshift({
                id: "__coco_custom_provider__",
                name: "Custom / 自定义",
                authType,
                custom: true,
            });
        }`;
const loginProviderSelectionAnchor = `                const providerOption = providerOptions.find((provider) => provider.id === providerId && provider.authType === selectedAuthType);
                if (!providerOption) {`;
const patchedLoginProviderSelection = `                if (providerId === "__coco_custom_provider__") {
                    await this.startCustomProviderLogin(selectedAuthType);
                    return;
                }
                const providerOption = providerOptions.find((provider) => provider.id === providerId && provider.authType === selectedAuthType);
                if (!providerOption) {`;
const customProviderImportAnchor = `import { checkForNewPiVersion } from "../../utils/version-check.js";`;
const patchedCustomProviderImport = `${customProviderImportAnchor}
import { fetchCustomProviderModels, saveCustomProvider } from "../../../../../../scripts/custom-provider-setup.mjs";`;
const legacyCustomProviderLogin = `    async startCustomProviderLogin(authType) {
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
    }`;
const patchedCustomProviderLogin = `    async startCustomProviderLogin() {
        const baseUrl = await this.showExtensionInput("Custom provider Base URL / 自定义提供商地址", "https://api.example.com/v1");
        if (!baseUrl?.trim()) return;
        const key = await this.showExtensionInput("API key / 密钥 (input is hidden / 输入已隐藏)", "sk-...", { secret: true });
        if (!key) return;
        try {
            this.showStatus(uiText("Querying available models / 正在查询可用模型..."));
            const models = await fetchCustomProviderModels({ baseUrl, key });
             const modelId = await this.showExtensionSelector(uiText("Select a model / 选择模型"), models);
             if (!modelId) return;
             const configured = await saveCustomProvider({ agentDir: getAgentDir(), baseUrl, key, modelId });
             await this.session.modelRuntime.refresh({ allowNetwork: false });
             await this.session.modelRuntime.setRuntimeApiKey(configured.providerId, key, { allowNetwork: false });
             const selectedModel = this.session.modelRuntime.getModel(configured.providerId, configured.modelId);
             if (!selectedModel) throw new Error(\`Configured model \${configured.providerId}/\${configured.modelId} was not loaded.\`);
             await this.session.setModel(selectedModel);
             this.footer.invalidate();
             this.ui.requestRender();
             this.showStatus(\`Configured \${configured.providerId}/\${configured.modelId}\`);
        }
        catch (error) {
            this.showError(error instanceof Error ? error.message : String(error));
        }
    }`;
const patchedLoginProviderFlow = `${patchedCustomProviderLogin}
    showLoginProviderSelector(authType, initialSearchInput) {
        const providerOptions = this.getLoginProviderOptions(authType);
        if (authType === "api_key") {
            providerOptions.unshift({
                id: "__coco_custom_provider__",
                name: uiText("Custom / 自定义"),
                authType,
                custom: true,
            });
        }
        if (providerOptions.length === 0) {
            const message = authType === "oauth"
                ? uiText("No subscription providers available.")
                : authType === "api_key"
                    ? uiText("No API key providers available.")
                    : "No login providers available.";
            this.showStatus(message);
            return;
        }
        this.showSelector((done) => {
            const selector = new OAuthSelectorComponent("login", providerOptions, async (providerId, selectedAuthType) => {
                done();
                if (providerId === "__coco_custom_provider__") {
                    await this.startCustomProviderLogin();
                    return;
                }
                const providerOption = providerOptions.find((provider) => provider.id === providerId && provider.authType === selectedAuthType);
                if (!providerOption) return;
                await this.startProviderLogin(providerOption);
            }, () => {
                done();
                if (authType) this.showLoginAuthTypeSelector();
                else this.ui.requestRender();
            }, initialSearchInput);
            return { component: selector, focus: selector };
        });
    }`;
const defaultThemeAnchor = `currentTheme: this.settingsManager.getThemeSetting() || "dark",`;
const patchedDefaultTheme = `currentTheme: this.settingsManager.getThemeSetting() || "coco-orange-light/coco-orange",`;
const builtinThemesAnchor = `        BUILTIN_THEMES = {
            dark: JSON.parse(fs.readFileSync(darkPath, "utf-8")),
            light: JSON.parse(fs.readFileSync(lightPath, "utf-8")),
        };`;
const patchedBuiltinThemes = `        const orangePath = path.join(themesDir, "coco-orange.json");
        const orangeLightPath = path.join(themesDir, "coco-orange-light.json");
        BUILTIN_THEMES = {
            "coco-orange": JSON.parse(fs.readFileSync(orangePath, "utf-8")),
            "coco-orange-light": JSON.parse(fs.readFileSync(orangeLightPath, "utf-8")),
            dark: JSON.parse(fs.readFileSync(darkPath, "utf-8")),
            light: JSON.parse(fs.readFileSync(lightPath, "utf-8")),
        };`;
const previousPatchedBuiltinThemes = `        const orangePath = path.join(themesDir, "coco-orange.json");
        BUILTIN_THEMES = {
            "coco-orange": JSON.parse(fs.readFileSync(orangePath, "utf-8")),
            dark: JSON.parse(fs.readFileSync(darkPath, "utf-8")),
            light: JSON.parse(fs.readFileSync(lightPath, "utf-8")),
        };`;
const extensionInputAnchor = `        this.input = new Input();
        this.addChild(this.input);`;
const uiLanguageImports = new Map([
  ["interactive-mode.js", `import { uiText } from "../../../../../../resources/coco-ui-language.mjs";`],
  ["components/oauth-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/model-selector.js", `import { modelPanelMessageKeyFromLoginRequired } from "../../../../../../../resources/coco-model-panel-renderer.mjs";\nimport { translate } from "../../../../../../../resources/coco-language.mjs";\nimport { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/login-dialog.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/theme-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/thinking-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/extension-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/keybinding-hints.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/settings-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/scoped-models-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/status-indicator.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/bash-execution.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/first-time-setup.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/assistant-message.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/user-message.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/show-images-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/extension-editor.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/extension-input.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/bordered-loader.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/footer.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/session-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/user-message-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/tree-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/trust-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
  ["components/config-selector.js", `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`],
]);

function migrateModelPanelKeys(source) {
  return source
    .replace('`  ${uiText("Models")}`', '`  ${translate("modelPanel.title")}`')
    .replace('uiText("Only showing models from configured providers. Use /login to add providers.")', 'translate("modelPanel.authenticationHint", { marker: translate("modelPanel.status.loginRequired") })')
    .replace('uiText("No matching models")', 'translate("modelPanel.noMatches")')
    .replace('uiText(`Model Name: ${selected.model.name}`)', 'translate("modelPanel.modelName", { name: selected.model.name })');
}
const intermediateExtensionInput = `        this.input = new Input();
        if (opts?.secret) {
            const render = this.input.render.bind(this.input);
            this.input.render = (width) => {
                const value = this.input.getValue();
                this.input.setValue("*".repeat(value.length));
                const lines = render(width);
                this.input.setValue(value);
                return lines;
            };
        }
        this.addChild(this.input);`;
const patchedExtensionInput = `        this.input = new Input();
        if (opts?.secret) {
            const render = this.input.render.bind(this.input);
            this.input.render = (width) => {
                const value = this.input.getValue();
                try {
                    this.input.setValue("*".repeat(value.length));
                    return render(width);
                }
                finally {
                    this.input.setValue(value);
                }
            };
        }
        this.addChild(this.input);`;

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

function replaceCustomProviderLogin(source) {
  if (source.includes(patchedLoginProviderFlow)) return source;
  const selectorStart = "    showLoginProviderSelector(authType, initialSearchInput) {";
  const nextMethod = "    async showOAuthSelector(mode) {";
  const customStart = "    async startCustomProviderLogin(";
  const selectorIndex = source.indexOf(selectorStart);
  const nextIndex = source.indexOf(nextMethod, selectorIndex);
  if (selectorIndex < 0 || nextIndex < 0) throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
  const customIndex = source.indexOf(customStart);
  const startIndex = customIndex >= 0 && customIndex < selectorIndex ? customIndex : selectorIndex;
  return source.slice(0, startIndex) + patchedLoginProviderFlow + "\n" + source.slice(nextIndex);
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
  const variants = [toolsManagerOfflineAnchor, legacyPatchedToolsManagerOffline, legacyBrandedToolsManagerOffline, patchedToolsManagerOffline];
  const counts = variants.map((variant) => count(source, variant));
  const matches = counts.reduce((total, value) => total + value, 0);
  if (matches > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  if (counts[3] === 1) {
    return source;
  }
  if (matches === 0) {
    throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
  }
  const previous = counts[0] === 1 ? toolsManagerOfflineAnchor : counts[1] === 1 ? legacyPatchedToolsManagerOffline : legacyBrandedToolsManagerOffline;
  return source.replace(previous, patchedToolsManagerOffline);
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

async function ensureVersion(path, supportedVersion = expectedVersion) {
  const { version } = await readJson(path);
  if (version !== supportedVersion) {
    throw patchError("COCO_PATCH_VERSION_MISMATCH");
  }
}

async function patchRuntimeDefaultTheme(projectRoot) {
  for (const path of [join(projectRoot, "dist", "modes", "interactive", "interactive-mode.js"), join(agentPath(projectRoot), "dist", "modes", "interactive", "interactive-mode.js")]) {
    let source;
    try { source = await readFile(path, "utf8"); }
    catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    const anchor = `currentTheme: this.settingsManager.getThemeSetting() || "dark",`;
    const previous = `currentTheme: this.settingsManager.getThemeSetting() || "coco-orange",`;
    const replacement = `currentTheme: this.settingsManager.getThemeSetting() || "coco-orange-light/coco-orange",`;
    if (source.includes(replacement)) continue;
    if (!source.includes(anchor) && !source.includes(previous)) throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
    await writeFile(path, source.replace(source.includes(anchor) ? anchor : previous, replacement), "utf8");
  }
}

async function patchBuiltinThemeRegistry(projectRoot) {
  const bundledThemeDir = join(agentPath(projectRoot), "dist", "modes", "interactive", "theme");
  const orangeTheme = join(projectRoot, "dist", "modes", "interactive", "theme", "coco-orange.json");
  const orangeLightTheme = join(projectRoot, "dist", "modes", "interactive", "theme", "coco-orange-light.json");
  const bundledOrangeTheme = join(bundledThemeDir, "coco-orange.json");
  const bundledOrangeLightTheme = join(bundledThemeDir, "coco-orange-light.json");
  try { await copyFile(orangeTheme, bundledOrangeTheme); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  try { await copyFile(orangeLightTheme, bundledOrangeLightTheme); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  for (const path of [join(projectRoot, "dist", "modes", "interactive", "theme", "theme.js"), join(bundledThemeDir, "theme.js")]) {
    let source;
    try { source = await readFile(path, "utf8"); }
    catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    if (source.includes('"coco-orange-light": JSON.parse(fs.readFileSync(orangeLightPath')) continue;
    const anchor = source.includes(previousPatchedBuiltinThemes) ? previousPatchedBuiltinThemes : builtinThemesAnchor;
    if (!source.includes(anchor)) throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
    await writeFile(path, source.replace(anchor, patchedBuiltinThemes), "utf8");
  }
}

async function patchSecretExtensionInput(projectRoot) {
  const path = join(agentPath(projectRoot), "dist", "modes", "interactive", "components", "extension-input.js");
  let source = await readFile(path, "utf8");
  source = replaceUpgrade(source, extensionInputAnchor, intermediateExtensionInput, patchedExtensionInput);
  await writeFile(path, source, "utf8");
}

async function patchUiLanguage(projectRoot) {
  const root = join(agentPath(projectRoot), "dist", "modes", "interactive");
  for (const [relative, importLine] of uiLanguageImports) {
    const path = join(root, relative);
    let source;
    try { source = await readFile(path, "utf8"); }
    catch (error) { if (error?.code === "ENOENT" && relative !== "interactive-mode.js") continue; throw error; }
    if (source.includes(importLine)) { if (relative === "components/model-selector.js") { const migrated = migrateModelPanelKeys(source); if (migrated !== source) await writeFile(path, migrated, "utf8"); } continue; }
    const previousModelImport = `import { uiText } from "../../../../../../../resources/coco-ui-language.mjs";`;
    if (relative === "components/model-selector.js" && source.includes(previousModelImport)) { await writeFile(path, migrateModelPanelKeys(source.replace(previousModelImport, importLine)), "utf8"); continue; }
    source = `${importLine}\n${source}`;
    source = source
      .replaceAll('"Sign in with an account"', 'uiText("Login with subscription")')
      .replaceAll('"Sign in with an API key"', 'uiText("Use API key")')
      .replaceAll('"Select authentication method:"', 'uiText("Select authentication method:")')
      .replaceAll('`Select authentication method for ${providerOptions[0].name}:`', 'uiText(`Select authentication method for ${providerOptions[0].name}:`)')
      .replaceAll('"Select provider to configure:"', 'uiText("Select provider to configure:")')
      .replaceAll('"Select provider to logout:"', 'uiText("Select provider to logout:")')
      .replaceAll('"No providers available"', 'uiText("No providers available")')
      .replaceAll('"No providers logged in. Use /login first."', 'uiText("No providers logged in. Use /login first.")')
      .replaceAll('"No matching providers"', 'uiText("No matching providers")')
      .replaceAll('"subscription"', 'uiText("subscription")')
      .replaceAll('"API key"', 'uiText("API key")')
      .replaceAll('`Login to ${providerName}`', 'uiText(`Login to ${providerName}`)')
      .replaceAll('"Only showing models from configured providers. Use /login to add providers."', 'uiText("Only showing models from configured providers. Use /login to add providers.")')
      .replaceAll('"Refreshing model catalogs…"', 'uiText("Refreshing model catalogs…")')
      .replaceAll('"Model catalogs refreshed."', 'uiText("Model catalogs refreshed.")')
      .replaceAll('"  No matching models"', '`  ${uiText("No matching models")}`')
      .replaceAll('`  Model Name: ${selected.model.name}`', '`  ${uiText(`Model Name: ${selected.model.name}`)}`')
      .replaceAll('description: name === currentTheme ? "(current)" : undefined', 'description: name === currentTheme ? `(${uiText("Current")})` : undefined')
      .replaceAll('description: LEVEL_DESCRIPTIONS[level]', 'description: uiText(LEVEL_DESCRIPTIONS[level])')
      .replaceAll('rawKeyHint("↑↓", "navigate")', 'rawKeyHint("↑↓", uiText("navigate"))')
      .replaceAll('keyHint("tui.select.confirm", "select")', 'keyHint("tui.select.confirm", uiText("select"))')
      .replaceAll('keyHint("tui.select.cancel", "cancel")', 'keyHint("tui.select.cancel", uiText("cancel"))');
    if (relative === "components/keybinding-hints.js") {
      source = source
        .replace('` ${description}`', '` ${uiText(description)}`');
    }
    if (relative === "components/settings-selector.js") {
      source = source
        .replace('const SETTINGS_SUBMENU_SELECT_LIST_LAYOUT = {', 'function localizeItems(items) { return items.map((item) => ({ ...item, label: uiText(item.label), description: item.description ? uiText(item.description) : item.description })); }\nconst SETTINGS_SUBMENU_SELECT_LIST_LAYOUT = {')
        .replaceAll('new SettingsList(items,', 'new SettingsList(localizeItems(items),')
        .replace('// Add borders\n        this.addChild(new DynamicBorder());', '// Add borders\n        this.addChild(new DynamicBorder());\n        this.addChild(new Text(theme.bold(theme.fg("accent", `  ${uiText("Settings")}`)), 0, 0));')
        .replace('this.selectList = new SelectList(options,', 'this.selectList = new SelectList(localizeItems(options),')
        .replace('theme.bold(theme.fg("accent", title))', 'theme.bold(theme.fg("accent", uiText(title)))')
        .replace('theme.fg("muted", description)', 'theme.fg("muted", uiText(description))')
        .replace('theme.fg("dim", "  Enter to select · Esc to go back")', 'theme.fg("dim", `  ${uiText("Enter to select · Esc to go back")}`)')
        .replace('theme.bold(theme.fg("accent", "Automatic Theme"))', 'theme.bold(theme.fg("accent", uiText("Automatic Theme")))')
        .replace('theme.fg("muted", "Choose themes for terminal light and dark appearance.")', 'theme.fg("muted", uiText("Choose themes for terminal light and dark appearance."))')
        .replace('theme.fg("muted", "Light/dark detection requires terminal support.")', 'theme.fg("muted", uiText("Light/dark detection requires terminal support."))')
        .replace('description: THINKING_DESCRIPTIONS[level]', 'description: uiText(THINKING_DESCRIPTIONS[level])');
    }
    if (relative === "components/scoped-models-selector.js") {
      source = source
        .replace('theme.bold("Model Configuration")', 'theme.bold(uiText("Model Configuration"))')
        .replace('`Session-only. ${keyText("app.models.save")} to save to settings.`', 'uiText("Session-only. {key} to save to settings.", { key: keyText("app.models.save") })')
        .replace('"all enabled"', 'uiText("all enabled")')
        .replace('`${enabledCount}/${this.allIds.length} enabled${unavailableCount ? ` · ${unavailableCount} unavailable` : ""}`', '`${enabledCount}/${this.allIds.length} ${uiText("enabled")}${unavailableCount ? ` · ${unavailableCount} ${uiText("unavailable")}` : ""}`')
        .replace('`${keyText("tui.select.confirm")} toggle`', '`${keyText("tui.select.confirm")} ${uiText("toggle")}`')
        .replace('`${keyText("app.models.enableAll")} all`', '`${keyText("app.models.enableAll")} ${uiText("all")}`')
        .replace('`${keyText("app.models.clearAll")} clear`', '`${keyText("app.models.clearAll")} ${uiText("clear")}`')
        .replace('`${keyText("app.models.toggleProvider")} provider`', '`${keyText("app.models.toggleProvider")} ${uiText("provider")}`')
        .replace('`${keyText("app.models.reorderUp")}/${keyText("app.models.reorderDown")} reorder`', '`${keyText("app.models.reorderUp")}/${keyText("app.models.reorderDown")} ${uiText("reorder")}`')
        .replace('`${keyText("app.models.save")} save`', '`${keyText("app.models.save")} ${uiText("save")}`')
        .replace('"(unsaved)"', '`(${uiText("unsaved")})`')
        .replace('"  No matching models"', '`  ${uiText("No matching models")}`')
        .replace('" [unavailable]"', '` [${uiText("unavailable")}]`')
        .replace('`${selected.model ? `Model Name: ${selected.model.name}` : "Model unavailable"}`', '`${selected.model ? uiText(`Model Name: ${selected.model.name}`) : uiText("Model unavailable")}`');
    }
    if (relative === "components/status-indicator.js") {
      source = source
        .replace('`Retrying (${attempt}/${maxAttempts}) in ${seconds}s... (${keyText("app.interrupt")} to cancel)`', 'uiText("Retrying ({attempt}/{max}) in {seconds}s... ({key} to cancel)", { attempt, max: maxAttempts, seconds, key: keyText("app.interrupt") })')
        .replace('`(${keyText("app.interrupt")} to cancel)`', '`(${keyText("app.interrupt")} ${uiText("to cancel")})`')
        .replace('`Compacting context... ${cancelHint}`', '`${uiText("Compacting context...")} ${cancelHint}`')
        .replace('`${reason === "overflow" ? "Context overflow detected, " : ""}Auto-compacting... ${cancelHint}`', '`${reason === "overflow" ? `${uiText("Context overflow detected,")} ` : ""}${uiText("Auto-compacting...")} ${cancelHint}`')
        .replace('`Summarizing branch... (${keyText("app.interrupt")} to cancel)`', '`${uiText("Summarizing branch...")} (${keyText("app.interrupt")} ${uiText("to cancel")})`');
    }
    if (relative === "components/bash-execution.js") {
      source = source
        .replace('`Running... (${keyText("tui.select.cancel")} to cancel)`', '`${uiText("Running...")} (${keyText("tui.select.cancel")} ${uiText("to cancel")})`')
        .replace('keyHint("app.tools.expand", "to collapse")', 'keyHint("app.tools.expand", uiText("to collapse"))')
        .replace('keyHint("app.tools.expand", "to expand")', 'keyHint("app.tools.expand", uiText("to expand"))')
        .replace('`... ${hiddenLineCount} more lines (`', 'uiText("... {count} more lines (", { count: hiddenLineCount })')
        .replace('"(cancelled)"', '`(${uiText("cancelled")})`')
        .replace('`(exit ${this.exitCode})`', '`(${uiText("exit")} ${this.exitCode})`')
        .replace('`Output truncated. Full output: ${this.fullOutputPath}`', 'uiText("Output truncated. Full output: {path}", { path: this.fullOutputPath })');
    }
    if (relative === "components/first-time-setup.js") {
      source = source
        .replace('THEME_OPTIONS.map((option) => option.label)', 'THEME_OPTIONS.map((option) => uiText(option.label))')
        .replace('ANALYTICS_OPTIONS.map((option) => option.label)', 'ANALYTICS_OPTIONS.map((option) => uiText(option.label))')
        .replace('theme.bold(`Welcome to ${APP_NAME}, your general AI assistant.`)', 'theme.bold(uiText("Welcome to {app}, your general AI assistant.", { app: APP_NAME }))')
        .replace('theme.fg("text", "Pick a theme.")', 'theme.fg("text", uiText("Pick a theme."))')
        .replace('theme.fg("muted", `Detected system appearance: ${this.options.detectedTheme}`)', 'theme.fg("muted", uiText(`Detected system appearance: ${this.options.detectedTheme}`))')
        .replace('theme.fg("text", "Opt-in to anonymous usage data sharing?")', 'theme.fg("text", uiText("Opt-in to anonymous usage data sharing?"))')
        .replace('rawKeyHint("↑↓", "navigate")', 'rawKeyHint("↑↓", uiText("navigate"))')
        .replace('this.step === "theme" ? "continue" : "finish"', 'uiText(this.step === "theme" ? "continue" : "finish")')
        .replace('keyHint("tui.select.cancel", "skip setup")', 'keyHint("tui.select.cancel", uiText("skip setup"))');
    }
    if (relative === "components/assistant-message.js") {
      source = source
        .replace('hiddenThinkingLabel = "Thinking..."', 'hiddenThinkingLabel = uiText("Thinking...")')
        .replace('this.contentContainer.addChild(new Spacer(1));\n        }\n        // Render content in order', 'this.contentContainer.addChild(new Spacer(1));\n            this.contentContainer.addChild(new Text(theme.bold(theme.fg("accent", `◇ ${uiText("CoCo")}`)), this.outputPad, 0));\n        }\n        // Render content in order')
        .replace('"Operation aborted"', 'uiText("Operation aborted")')
        .replace('"Unknown error"', 'uiText("Unknown error")');
    }
    if (relative === "components/user-message.js") {
      source = source
        .replace('import { Box, Container, Markdown }', 'import { Box, Container, Markdown, Text }')
        .replace('const contentBox = new Box(this.outputPad, 1, (content) => theme.bg("userMessageBg", content));', 'const contentBox = new Box(this.outputPad, 1, (content) => theme.bg("userMessageBg", content));\n        contentBox.addChild(new Text(theme.bold(theme.fg("accent", `◆ ${uiText("You")}`)), 0, 0));');
    }
    if (relative === "components/show-images-selector.js") {
      source = source
        .replace('{ value: "yes", label: "Yes", description: "Show images inline in terminal" }', '{ value: "yes", label: uiText("Yes"), description: uiText("Show images inline in terminal") }')
        .replace('{ value: "no", label: "No", description: "Show text placeholder instead" }', '{ value: "no", label: uiText("No"), description: uiText("Show text placeholder instead") }');
    }
    if (["components/extension-editor.js", "components/extension-input.js", "components/bordered-loader.js"].includes(relative)) {
      for (const label of ["submit", "newline", "cancel", "external editor"]) source = source.replaceAll(`"${label}"`, `uiText("${label}")`);
    }
    if (relative === "interactive-mode.js") {
      source = source
        .replace('description: command.description,', 'description: uiText(command.description),')
        .replace('new Text(theme.bold(theme.fg("accent", "What\'s New"))', 'new Text(theme.bold(theme.fg("accent", uiText("What\'s New")))')
        .replace('const text = new Text(theme.fg("dim", message), 1, 0);', 'const text = new Text(theme.fg("dim", uiText(message)), 1, 0);')
        .replace('`Error: ${errorMessage}`', '`${uiText("Error:")} ${uiText(errorMessage)}`')
        .replace('`Warning: ${warningMessage}`', '`${uiText("Warning:")} ${uiText(warningMessage)}`')
        .replaceAll('theme.fg("warning", "Update Available")', 'theme.fg("warning", uiText("Update Available"))')
        .replaceAll('theme.fg("warning", "Package Updates Available")', 'theme.fg("warning", uiText("Package Updates Available"))')
        .replaceAll('theme.fg("muted", "Packages:")', 'theme.fg("muted", uiText("Packages:"))')
        .replaceAll('theme.fg("accent", "Keyboard Shortcuts")', 'theme.fg("accent", uiText("Keyboard Shortcuts"))')
        .replaceAll('this.showStatus("Forked to new session")', 'this.showStatus(uiText("Forked to new session"))')
        .replaceAll('this.showStatus("Navigated to selected point")', 'this.showStatus(uiText("Navigated to selected point"))')
        .replaceAll('this.showWarning("A bash command is already running. Press Esc to cancel it first.")', 'this.showWarning(uiText("A bash command is already running. Press Esc to cancel it first."))');
    }
    if (relative === "components/footer.js") {
      source = source
        .replace('const modelName = state.model?.id || "no-model";', 'const modelName = state.model?.id || uiText("No model selected.");');
    }
    if (relative === "components/session-selector.js") {
      for (const label of ["now", "Resume Session (Current Folder)", "Resume Session (All)", "Threaded", "Recent", "Fuzzy", "Sort:", "All", "Named", "Name:", "Current Folder", "Delete session?", "No sessions found", "Session moved to trash", "Session deleted", "Rename Session"]) {
        source = source.replaceAll(`"${label}"`, `uiText("${label}")`);
      }
      source = source
        .replace('theme.fg("muted", "Sort: ")', 'theme.fg("muted", `${uiText("Sort:")} `)')
        .replace('theme.fg("muted", "Name: ")', 'theme.fg("muted", `${uiText("Name:")} `)')
        .replaceAll('"○ Current Folder | "', '`${"○ " + uiText("Current Folder") + " | "}`')
        .replaceAll('"◉ Current Folder"', '`${"◉ " + uiText("Current Folder")}`')
        .replaceAll('" | ○ All"', '`${" | ○ " + uiText("All")}`')
        .replaceAll('"◉ All"', '`${"◉ " + uiText("All")}`')
        .replace('`Delete session? ${keyHint("tui.select.confirm", "confirm")}', '`${uiText("Delete session?")} ${keyHint("tui.select.confirm", uiText("confirm"))}')
        .replace('theme.fg("muted", \'re:<pattern> regex · "phrase" exact\')', 'theme.fg("muted", `re:<pattern> regex · "phrase" exact`)')
        .replace('"No sessions in current folder. Press Tab to view all."', 'uiText("No sessions in current folder. Press Tab to view all.")')
        .replace('emptyMessage = "  No sessions found";', 'emptyMessage = `  ${uiText("No sessions found")}`;')
        .replace('emptyMessage = "  No sessions in current folder. Press Tab to view all.";', 'emptyMessage = `  ${uiText("No sessions in current folder. Press Tab to view all.")}`;')
        .replace('`Loading ${this.progress.loaded}/${this.progress.total}`', '`${uiText("Loading")} ${this.progress.loaded}/${this.progress.total}`')
        .replace('`Failed to delete: ${errorMessage}`', 'uiText("Failed to delete: {error}", { error: errorMessage })')
        .replace('`Failed to load sessions: ${message}`', 'uiText("Failed to load sessions: {error}", { error: message })');
    }
    if (relative === "components/user-message-selector.js") {
      for (const label of ["No user messages found", "Fork from Message", "Select a user message to copy the active path up to that point into a new session"]) source = source.replaceAll(`"${label}"`, `uiText("${label}")`);
      source = source.replace('`Message ${currentPosition} of ${this.entries.length}`', 'uiText("Message {position} of {total}", { position: currentPosition, total: this.entries.length })');
    }
    if (relative === "components/tree-selector.js") {
      for (const label of ["No entries found", "Session Tree", "save", "cancel"]) source = source.replaceAll(`"${label}"`, `uiText("${label}")`);
      source = source
        .replaceAll('theme.fg("muted", "Type to search:")', 'theme.fg("muted", uiText("Type to search:"))')
        .replace('return labelFirst ? `${label} ${text}` : `${text} ${label}`;', 'const localizedLabel = uiText(label); return labelFirst ? `${localizedLabel} ${text}` : `${text} ${localizedLabel}`;')
        .replace('theme.fg("muted", "Label (empty to remove):")', 'theme.fg("muted", uiText("Label (empty to remove):"))')
        .replace('theme.fg("muted", "  No entries found")', 'theme.fg("muted", `  ${uiText("No entries found")}`)')
        .replace('theme.bold("  Session Tree")', 'theme.bold(`  ${uiText("Session Tree")}`)')
        .replaceAll('uiText(uiText("cancel"))', 'uiText("cancel")');
    }
    if (relative === "components/model-selector.js") {
      source = migrateModelPanelKeys(source)
        .replace('// Add hint about model filtering', 'this.addChild(new Text(theme.bold(theme.fg("accent", `  ${translate("modelPanel.title")}`)), 0, 0));\n        // Add hint about model filtering')
        .replace('new Text(theme.fg("warning", hintText), 0, 0)', 'new Text(theme.fg("muted", hintText), 2, 0)')
        .replaceAll('theme.fg("accent", "all")', 'theme.fg("accent", uiText("all"))')
        .replaceAll('theme.fg("muted", "all")', 'theme.fg("muted", uiText("all"))')
        .replaceAll('theme.fg("accent", "scoped")', 'theme.fg("accent", uiText("scoped"))')
        .replaceAll('theme.fg("muted", "scoped")', 'theme.fg("muted", uiText("scoped"))')
        .replace('theme.fg("muted", "Scope: ")', 'theme.fg("muted", `${uiText("Scope:")} `)')
        .replace('keyHint("tui.input.tab", "scope")', 'keyHint("tui.input.tab", uiText("scope"))')
        .replaceAll('theme.fg("warning", " login-required")', 'theme.fg("warning", ` ${uiText("login-required")}`)')
        .replace('this.errorMessage = "Model refresh timed out; showing cached models.";', 'this.errorMessage = uiText("Model refresh timed out; showing cached models.");')
        .replace('this.errorMessage = `Could not refresh ${result.errors.keys().next().value}; showing cached models.`;', 'this.errorMessage = uiText(`Could not refresh ${result.errors.keys().next().value}; showing cached models.`);')
        .replace('this.errorMessage = `Could not refresh ${result.errors.size} model catalogs; showing cached models.`;', 'this.errorMessage = uiText(`Could not refresh ${result.errors.size} model catalogs; showing cached models.`);');
    }
    if (relative === "components/trust-selector.js") {
      for (const label of ["none", "trusted", "untrusted", "Project trust", "Saved decision:", "Current session:", "navigate", "save", "cancel"]) source = source.replaceAll(`"${label}"`, `uiText("${label}")`);
    }
    if (relative === "components/config-selector.js") {
      for (const label of ["Extensions", "Skills", "Prompts", "Themes", "User", "Project", "User settings", "Project settings", "Project Local Resources", "Global Resources", "No resources found", "switch mode", "toggle", "close"]) source = source.replaceAll(`"${label}"`, `uiText("${label}")`);
    }
    await writeFile(path, source, "utf8");
  }
}

async function patchAutocompleteSourceLabels(projectRoot) {
  const path = join(agentPath(projectRoot), "dist", "modes", "interactive", "interactive-mode.js");
  const importLine = `import { uiText } from "../../../../../../resources/coco-ui-language.mjs";`;
  let source = await readFile(path, "utf8");
  if (source.includes('return sourceInfo.scope === "user" ? uiText("User")')) return;
  const oldMethod = `    getAutocompleteSourceTag(sourceInfo) {
        if (!sourceInfo) {
            return undefined;
        }
        const scopePrefix = sourceInfo.scope === "user" ? "u" : sourceInfo.scope === "project" ? "p" : "t";
        const source = sourceInfo.source.trim();
        if (source === "auto" || source === "local" || source === "cli") {
            return scopePrefix;
        }
        if (source.startsWith("npm:")) {
            return \`${"${scopePrefix}:${source}"}\`;
        }
        const gitSource = parseGitUrl(source);
        if (gitSource) {
            const ref = gitSource.ref ? \`@\${gitSource.ref}\` : "";
            return \`${"${scopePrefix}:git:${gitSource.host}/${gitSource.path}${ref}"}\`;
        }
        return scopePrefix;
    }
    prefixAutocompleteDescription(description, sourceInfo) {
        const sourceTag = this.getAutocompleteSourceTag(sourceInfo);
        if (!sourceTag) {
            return description;
        }
        return description ? \`[\${sourceTag}] \${description}\` : \`[\${sourceTag}]\`;
    }`;
  const newMethod = `    getAutocompleteSourceTag(sourceInfo) {
        if (!sourceInfo) return undefined;
        const source = sourceInfo.source.trim();
        if (source.startsWith("npm:")) return \`npm:\${source.slice(4)}\`;
        const gitSource = parseGitUrl(source);
        if (gitSource) {
            const ref = gitSource.ref ? \`@\${gitSource.ref}\` : "";
            return \`Git:\${gitSource.host}/\${gitSource.path}\${ref}\`;
        }
        return sourceInfo.scope === "user" ? uiText("User") : sourceInfo.scope === "project" ? uiText("Project") : uiText("CoCo");
    }
    prefixAutocompleteDescription(description, sourceInfo) {
        const sourceTag = this.getAutocompleteSourceTag(sourceInfo);
        if (!sourceTag) return description;
        return description ? \`${"${sourceTag}"} · \${description}\` : sourceTag;
    }`;
  const start = source.indexOf("    getAutocompleteSourceTag(sourceInfo) {");
  const end = source.indexOf("    getBuiltInCommandConflictDiagnostics(extensionRunner) {", start);
  if (start < 0 || end < 0) return;
  const patched = source.slice(0, start) + newMethod + "\n" + source.slice(end);
  await writeFile(path, source.includes(importLine) ? patched : `${importLine}\n${patched}`, "utf8");
}

async function patchSettingsValueDisplay(projectRoot) {
  const path = join(agentPath(projectRoot), "node_modules", "@earendil-works", "pi-tui", "dist", "components", "settings-list.js");
  const importLine = `import { uiValue } from "../../../../../../../../resources/coco-ui-language.mjs";`;
  let source;
  try { source = await readFile(path, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return; throw error; }
  if (source.includes(importLine)) return;
  source = `${importLine}\n${source}`.replace(
    "const valueText = this.theme.value(truncateToWidth(item.currentValue, valueMaxWidth, \"\"), isSelected);",
    "const valueText = this.theme.value(truncateToWidth(uiValue(item.currentValue), valueMaxWidth, \"\"), isSelected);",
  );
  source = source
    .replace('"  Type to search · Enter/Space to change · Esc to cancel"', '`  ${uiValue("Type to search · Enter/Space to change · Esc to cancel")}`')
    .replace('"  Enter/Space to change · Esc to cancel"', '`  ${uiValue("Enter/Space to change · Esc to cancel")}`');
  await writeFile(path, source, "utf8");
}

async function patchTuiVisualSystem(projectRoot) {
  const interactiveRoots = [
    join(projectRoot, "dist", "modes", "interactive"),
    join(agentPath(projectRoot), "dist", "modes", "interactive"),
  ];
  for (const interactiveRoot of interactiveRoots) {
    const borderPath = join(interactiveRoot, "components", "dynamic-border.js");
    let border;
    try { border = await readFile(borderPath, "utf8"); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    if (!border.includes('const inset = width >= 12 ? 2 : 0;')) {
      border = border.replace(
        '        return [this.color("─".repeat(Math.max(1, width)))];',
        '        const inset = width >= 12 ? 2 : 0;\n        const rule = this.color("─".repeat(Math.max(1, width - inset * 2)));\n        return [`${" ".repeat(inset)}${rule}${" ".repeat(inset)}`];',
      );
      await writeFile(borderPath, border, "utf8");
    }

    const footerPath = join(interactiveRoot, "components", "footer.js");
    let footer;
    try { footer = await readFile(footerPath, "utf8"); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    if (!footer.includes('theme.fg("accent", "◆")')) {
      footer = footer
        .replace('const dimRemainder = theme.fg("dim", remainder);', 'const dimRemainder = theme.fg("muted", remainder);')
        .replace('const pwdLine = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));', 'const pwdLine = truncateToWidth(`${theme.fg("accent", "◆")} ${theme.fg("muted", pwd)}`, width, theme.fg("dim", "..."));');
      await writeFile(footerPath, footer, "utf8");
    }

    const themePath = join(interactiveRoot, "theme", "theme.js");
    let themeSource;
    try { themeSource = await readFile(themePath, "utf8"); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    themeSource = themeSource
      .replace('selectedPrefix: (text) => theme.fg("accent", text),', 'selectedPrefix: (text) => theme.bold(theme.fg("accent", text)),')
      .replace('selectedText: (text) => theme.fg("accent", text),', 'selectedText: (text) => theme.bold(theme.fg("accent", text)),')
      .replace('label: (text, selected) => (selected ? theme.fg("accent", text) : text),', 'label: (text, selected) => (selected ? theme.bold(theme.fg("accent", text)) : text),')
      .replace('value: (text, selected) => (selected ? theme.fg("accent", text) : theme.fg("muted", text)),', 'value: (text, selected) => (selected ? theme.bold(theme.fg("accent", text)) : theme.fg("muted", text)),')
      .replace('cursor: theme.fg("accent", "→ "),', 'cursor: theme.bold(theme.fg("accent", "› ")),');
    await writeFile(themePath, themeSource, "utf8");

    const cursorFiles = ["config-selector.js", "trust-selector.js", "first-time-setup.js", "scoped-models-selector.js", "model-selector.js", "oauth-selector.js", "extension-selector.js"];
    for (const name of cursorFiles) {
      const path = join(interactiveRoot, "components", name);
      let source;
      try { source = await readFile(path, "utf8"); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
      source = source
        .replaceAll('theme.fg("accent", "→ ")', 'theme.bold(theme.fg("accent", "› "))')
        .replaceAll('isSelected ? "> " : "  "', 'isSelected ? theme.bold(theme.fg("accent", "› ")) : "  "');
      await writeFile(path, source, "utf8");
    }
  }
}

async function patchInputPrompt(projectRoot) {
  const path = join(agentPath(projectRoot), "node_modules", "@earendil-works", "pi-tui", "dist", "components", "input.js");
  let source;
  try { source = await readFile(path, "utf8"); } catch (error) { if (error?.code === "ENOENT") return; throw error; }
  if (source.includes('const prompt = "› ";')) return;
  if (!source.includes('const prompt = "> ";')) throw patchError("COCO_PATCH_UNKNOWN_ANCHOR");
  await writeFile(path, source.replace('const prompt = "> ";', 'const prompt = "› ";'), "utf8");
}

export async function applyCocoIdentityPatch({ root: projectRoot = root, supportedVersion = expectedVersion } = {}) {
  const agent = agentPath(projectRoot);
  const tui = join(agent, "node_modules", "@earendil-works", "pi-tui");
  await Promise.all([ensureVersion(join(agent, "package.json"), supportedVersion), ensureVersion(join(tui, "package.json"), supportedVersion)]);
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
  patched[7] = replaceExact(patched[7], customProviderImportAnchor, patchedCustomProviderImport);
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
  patched[4] = replaceUpgrade(patched[4], selectorLoginMarkerAnchor, intermediatePatchedSelectorLoginMarker, patchedSelectorLoginMarker);
  patched[4] = replaceUpgrade(patched[4], selectorLoginMarkerElseAnchor, intermediatePatchedSelectorLoginMarkerElse, patchedSelectorLoginMarkerElse);
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
  patched[7] = replaceUpgrade(patched[7], loginCompletionSortAnchor, [`    return Array.from(byId.values()).sort((a, b) => Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`, `    return Array.from(byId.values()).sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`], patchedLoginCompletionSort);
  patched[7] = replaceUpgrade(patched[7], loginOptionsAnchor, intermediatePatchedLoginOptions, patchedLoginOptions);
  patched[7] = replaceExact(patched[7], loginOauthOptionAnchor, patchedLoginOauthOption);
  patched[7] = replaceExact(patched[7], loginApiKeyOptionAnchor, patchedLoginApiKeyOption);
  patched[7] = replaceUpgrade(patched[7], loginOptionsSortAnchor, [`        return options.sort((a, b) => Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`, `        return options.sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));`, loginOptionsDirectSortAnchor, patchedLoginOptionsDirectSort], patchedLoginOptionsSort);
  patched[7] = replaceUpgrade(patched[7], loginOptionsDirectSortAnchor, patchedLoginOptionsSort, patchedLoginOptionsDirectSort);
  patched[7] = replaceCustomProviderLogin(patched[7]);
  patched[7] = replaceExact(patched[7], defaultThemeAnchor, patchedDefaultTheme);
  if (!patched[7].endsWith("\n")) patched[7] += "\n";
  patched[0] = replaceExact(patched[0], helpIdentityAnchor, patchedHelpIdentity);
  patched[0] = replaceExact(patched[0], helpPromptAnchor, patchedHelpPrompt);
  patched[6] = replaceUpgrade(patched[6], systemPromptIdentityAnchor, legacyPatchedSystemPromptIdentity, patchedSystemPromptIdentity);
  if (!patched[9].includes('uiText("Welcome to {app}, your general AI assistant."')) {
    patched[9] = replaceExact(patched[9], firstTimeSetupAnchor, patchedFirstTimeSetup);
  }
  patched[10] = replaceOfflineToolNotice(patched[10]);
  patched.push(replaceExact(originals.at(-1), scrollbackAnchor, patchedScrollback));
  await Promise.all(patched.map((source, index) => source === originals[index] ? undefined : writeFile([...targets, tuiPath][index], source, "utf8")));
  await patchRuntimeDefaultTheme(projectRoot);
  await patchBuiltinThemeRegistry(projectRoot);
  await patchSecretExtensionInput(projectRoot);
  await patchUiLanguage(projectRoot);
  await patchAutocompleteSourceLabels(projectRoot);
  await patchSettingsValueDisplay(projectRoot);
  await patchTuiVisualSystem(projectRoot);
  await patchInputPrompt(projectRoot);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await applyCocoIdentityPatch();
}
