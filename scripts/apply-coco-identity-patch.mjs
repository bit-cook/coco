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

function patchError(code) {
  return new Error(code);
}

function count(source, anchor) {
  return source.split(anchor).length - 1;
}

function replaceExact(source, anchor, replacement) {
  const matches = count(source, anchor);
  if (matches === 1) {
    return source.replace(anchor, replacement);
  }
  if (matches > 1) {
    throw patchError("COCO_PATCH_DUPLICATE_ANCHOR");
  }
  if (source.includes(replacement)) {
    return source;
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
    "dist/core/system-prompt.js",
    "dist/modes/interactive/interactive-mode.js",
    "dist/utils/version-check.js",
  ].map((path) => join(agent, path));
  const tuiPath = join(tui, "dist/tui.js");
  const originals = await Promise.all([...targets, tuiPath].map((path) => readFile(path, "utf8")));
  const patched = originals.slice(0, -1).map(applyIdentityReplacements);
  patched[2] = replaceExact(patched[2], headerAnchor, patchedHeader);
  patched[2] = replaceExact(patched[2], startupExpansionAnchor, patchedStartupExpansion);
  patched[2] = replaceExact(patched[2], resourceListingAnchor, patchedResourceListing);
  patched[2] = replaceExact(patched[2], compactExpansionHintAnchor, "");
  patched[2] = replaceExact(patched[2], scopedModelsAnchor, patchedScopedModels);
  patched[2] = replaceExact(patched[2], changelogAnchor, patchedChangelog);
  patched[2] = replaceExact(patched[2], headerGuardAnchor, patchedHeaderGuard);
  patched[2] = replaceExact(patched[2], versionCheckAnchor, patchedVersionCheck);
  patched[2] = replaceExact(patched[2], packageCheckAnchor, patchedPackageCheck);
  patched[2] = replaceExact(patched[2], tmuxCheckAnchor, patchedTmuxCheck);
  patched[2] = replaceExact(patched[2], migratedProvidersAnchor, patchedMigratedProviders);
  patched[2] = replaceExact(patched[2], anthropicWarningAnchor, patchedAnthropicWarning);
  patched.push(replaceExact(originals.at(-1), scrollbackAnchor, patchedScrollback));
  await Promise.all(patched.map((source, index) => source === originals[index] ? undefined : writeFile([...targets, tuiPath][index], source, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await applyCocoIdentityPatch();
}
