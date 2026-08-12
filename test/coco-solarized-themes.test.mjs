import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const themeDirectory = join(root, "dist", "modes", "interactive", "theme");
const canonicalPalette = {
  base03: "#002b36",
  base02: "#073642",
  base01: "#586e75",
  base00: "#657b83",
  base0: "#839496",
  base1: "#93a1a1",
  base2: "#eee8d5",
  base3: "#fdf6e3",
  yellow: "#b58900",
  orange: "#cb4b16",
  red: "#dc322f",
  magenta: "#d33682",
  violet: "#6c71c4",
  blue: "#268bd2",
  cyan: "#2aa198",
  green: "#859900",
};
const backgrounds = ["selectedBg", "userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"];
const requiredColorKeys = [
  "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText",
  ...backgrounds,
  "userMessageText", "customMessageText", "customMessageLabel", "toolTitle", "toolOutput", "mdHeading", "mdLink", "mdLinkUrl", "mdCode",
  "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet", "toolDiffAdded", "toolDiffRemoved", "toolDiffContext",
  "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
  "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "thinkingMax", "bashMode",
];

async function readTheme(name) {
  return JSON.parse(await readFile(join(themeDirectory, `${name}.json`), "utf8"));
}

test("Given the built-in themes, when parsed, then they preserve their names and every required color key", async () => {
  const [dark, light] = await Promise.all([readTheme("dark"), readTheme("light")]);

  assert.equal(dark.name, "dark");
  assert.equal(light.name, "light");
  for (const theme of [dark, light]) {
    for (const key of requiredColorKeys) {
      assert.ok(key in theme.colors, `${theme.name} must define ${key}`);
    }
  }
});

test("Given the built-in themes, when resolved from their variables, then every color is canonical Solarized", async () => {
  const [dark, light] = await Promise.all([readTheme("dark"), readTheme("light")]);

  for (const theme of [dark, light]) {
    assert.deepEqual(theme.vars, canonicalPalette);
    for (const value of Object.values(theme.colors)) {
      assert.ok(value in canonicalPalette, `${theme.name} color ${value} must be a canonical variable`);
    }
    for (const value of Object.values(theme.export)) {
      assert.ok(value in canonicalPalette, `${theme.name} export ${value} must be a canonical variable`);
    }
  }
});

test("Given the Solarized design contract, when built-in theme semantics are read, then they use the required foreground and neutral surface mappings", async () => {
  const [dark, light] = await Promise.all([readTheme("dark"), readTheme("light")]);
  const mappings = {
    dark: {
      text: "base0", toolTitle: "base0", muted: "base01", thinkingText: "base01", toolOutput: "base01", dim: "base00",
      accent: "cyan", borderAccent: "cyan", mdCode: "cyan", mdListBullet: "cyan", border: "blue", mdLink: "blue", syntaxKeyword: "blue",
      borderMuted: "base01", mdQuoteBorder: "base01", mdHr: "base01", success: "green", toolDiffAdded: "green", syntaxString: "green",
      bashMode: "orange", warning: "yellow", mdHeading: "yellow", syntaxFunction: "yellow", error: "red", toolDiffRemoved: "red",
      customMessageLabel: "violet", thinkingXhigh: "violet", syntaxNumber: "magenta", thinkingHigh: "magenta", syntaxType: "blue", syntaxVariable: "blue",
      syntaxComment: "base01", syntaxPunctuation: "base01", syntaxOperator: "base01", mdLinkUrl: "base00", mdQuote: "base00", toolDiffContext: "base00",
      thinkingOff: "base00", thinkingMinimal: "base00", thinkingLow: "blue", thinkingMedium: "cyan",
    },
    light: {
      text: "base00", toolTitle: "base00", muted: "base01", thinkingText: "base01", toolOutput: "base01", dim: "base1",
      accent: "cyan", borderAccent: "cyan", mdCode: "cyan", mdListBullet: "cyan", border: "blue", mdLink: "blue", syntaxKeyword: "blue",
      borderMuted: "base1", mdQuoteBorder: "base1", mdHr: "base1", success: "green", toolDiffAdded: "green", syntaxString: "green",
      bashMode: "orange", warning: "yellow", mdHeading: "yellow", syntaxFunction: "yellow", error: "red", toolDiffRemoved: "red",
      customMessageLabel: "violet", thinkingXhigh: "violet", syntaxNumber: "magenta", thinkingHigh: "magenta", syntaxType: "blue", syntaxVariable: "blue",
      syntaxComment: "base01", syntaxPunctuation: "base01", syntaxOperator: "base01", mdLinkUrl: "base1", mdQuote: "base1", toolDiffContext: "base1",
      thinkingOff: "base1", thinkingMinimal: "base1", thinkingLow: "blue", thinkingMedium: "cyan",
    },
  };

  for (const theme of [dark, light]) {
    assert.deepEqual(Object.fromEntries(Object.keys(mappings[theme.name]).map((key) => [key, theme.colors[key]])), mappings[theme.name]);
    const neutralSurface = theme.name === "dark" ? "base02" : "base2";
    for (const key of backgrounds) {
      assert.equal(theme.colors[key], neutralSurface, `${theme.name} ${key} must be neutral`);
    }
    assert.deepEqual(theme.export, {
      pageBg: theme.name === "dark" ? "base03" : "base3",
      cardBg: neutralSurface,
      infoBg: neutralSurface,
    });
  }
});

test("Given the footer design contract, when its source is inspected, then it applies no ANSI background color", async () => {
  const footer = await readFile(join(root, "dist", "modes", "interactive", "components", "footer.js"), "utf8");

  assert.doesNotMatch(footer, /theme\.bg\s*\(/);
});

test("CoCo's default theme uses a vivid orange accent system", async () => {
  const theme = await readTheme("coco-orange");
  assert.equal(theme.name, "coco-orange");
  assert.equal(theme.colors.accent, "orangeBright");
  assert.equal(theme.colors.borderAccent, "orangeBright");
  assert.equal(theme.colors.bashMode, "orangeBright");
  assert.equal(theme.vars.orangeBright, "#ffb15c");
});

test("CoCo registers the orange theme as a runtime built-in", async () => {
  const source = await readFile(join(root, "dist", "modes", "interactive", "theme", "theme.js"), "utf8");
  assert.match(source, /"coco-orange": JSON\.parse\(fs\.readFileSync\(orangePath/);
});
