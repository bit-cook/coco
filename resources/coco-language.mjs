import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE = Symbol.for("coco.language.service");
const LOCALE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
const MAX_PACK_BYTES = 1024 * 1024;
const MAX_MESSAGES = 256;
const BUILTIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "languages");
const ENGLISH_MESSAGES = JSON.parse(readFileSync(join(BUILTIN_DIR, "en.json"), "utf8")).messages;
const REQUIRED_KEYS = new Set(Object.keys(ENGLISH_MESSAGES));

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function safeLocale(value) { return typeof value === "string" && LOCALE.test(value); }
function placeholders(value) { return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]).sort().join(","); }
function validatePack(value, expectedLocale, { partial = false } = {}) {
  if (!object(value) || value.schemaVersion !== 1 || value.locale !== expectedLocale || !safeLocale(value.locale) || typeof value.name !== "string" || value.name.trim() === "" || value.name.length > 80 || !object(value.messages)) return false;
  const entries = Object.entries(value.messages);
  if (entries.length > MAX_MESSAGES || entries.some(([key, message]) => !REQUIRED_KEYS.has(key) || typeof message !== "string" || message.length > 4000 || /[\0\x1b]/.test(message) || placeholders(message) !== placeholders(ENGLISH_MESSAGES[key]))) return false;
  return partial || REQUIRED_KEYS.size === entries.length;
}
function readPack(path, locale, options) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_PACK_BYTES) return null;
    const value = JSON.parse(readFileSync(path, "utf8"));
    return validatePack(value, locale, options) ? value : null;
  } catch { return null; }
}
function agentDirectory(environment = process.env) {
  return environment.COCO_CODING_AGENT_DIR || join(environment.HOME || homedir(), ".coco", "agent");
}
function format(message, values = {}) {
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, key) => key in values ? String(values[key]) : match);
}
function atomicJson(path, value) {
  mkdirSync(dirname(path), { mode: 0o700, recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value)}\n`); } finally { closeSync(descriptor); }
  renameSync(temporary, path);
}

export function createLanguageService({ agentDir = agentDirectory() } = {}) {
  const languageDir = join(agentDir, "languages");
  const selectionPath = join(agentDir, "language.json");
  const english = readPack(join(BUILTIN_DIR, "en.json"), "en") ?? { locale: "en", name: "English", messages: {} };
  function available() {
    const packs = new Map([["en", english]]);
    const chinese = readPack(join(BUILTIN_DIR, "zh-CN.json"), "zh-CN");
    if (chinese) packs.set("zh-CN", chinese);
    try {
      for (const filename of readdirSync(languageDir).sort()) {
        if (!filename.endsWith(".json")) continue;
        const locale = filename.slice(0, -5);
        if (!safeLocale(locale) || packs.has(locale)) continue;
        const pack = readPack(join(languageDir, filename), locale, { partial: true });
        if (pack) packs.set(locale, { ...pack, messages: { ...english.messages, ...pack.messages } });
      }
    } catch {}
    return packs;
  }
  function savedLocale() {
    try {
      const value = JSON.parse(readFileSync(selectionPath, "utf8"));
      return object(value) && value.schemaVersion === 1 && safeLocale(value.locale) ? value.locale : "en";
    } catch { return "en"; }
  }
  let locale = savedLocale();
  let packs = available();
  if (!packs.has(locale)) locale = "en";
  function refresh() { packs = available(); if (!packs.has(locale)) locale = "en"; }
  return {
    get locale() { return locale; },
    available() { refresh(); return [...packs.values()].map((pack) => ({ locale: pack.locale, name: pack.name })); },
    pack() { refresh(); return packs.get(locale) ?? english; },
    select(next) {
      refresh();
      if (!safeLocale(next) || !packs.has(next)) return false;
      locale = next;
      atomicJson(selectionPath, { locale, schemaVersion: 1 });
      return true;
    },
    t(key, values) { const pack = packs.get(locale) ?? english; return format(pack.messages[key] ?? english.messages[key] ?? key, values); },
  };
}

export function cocoLanguageService() {
  return globalThis[SERVICE] ??= createLanguageService();
}

export function translate(key, values) { return cocoLanguageService().t(key, values); }

export default function cocoLanguage(pi) {
  const service = cocoLanguageService();
  pi.registerCommand("language", {
    description: service.t("language.commandDescription"),
    handler: async (argument, ctx) => {
      const input = String(argument ?? "").trim();
      if (input === "status") {
        const pack = service.pack();
        ctx.ui.notify(service.t("language.current", pack), "info");
        return;
      }
      if (input === "list") {
        ctx.ui.notify(service.t("language.list", { locales: service.available().map((pack) => `${pack.locale} (${pack.name})`).join(", ") }), "info");
        return;
      }
      let locale = input;
      if (locale === "" && ctx.hasUI) {
        const options = service.available();
        const choice = await ctx.ui.select(service.t("language.selectTitle"), options.map((pack) => `${pack.locale} - ${pack.name}`));
        locale = choice?.split(" - ", 1)[0] ?? "";
      }
      if (locale === "") {
        ctx.ui.notify(service.t("language.uiScope"), "info");
        return;
      }
      if (!service.select(locale)) {
        ctx.ui.notify(service.t("language.invalid", { locale }), "error");
        return;
      }
      const pack = service.pack();
      ctx.ui.notify(service.t("language.saved", pack), "info");
    },
  });
  pi.on("before_agent_start", async (event) => ({ systemPrompt: `${event.systemPrompt}\n\n<user_language>\n${service.t("agent.responseInstruction")}\n</user_language>` }));
}
