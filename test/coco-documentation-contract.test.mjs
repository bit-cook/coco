import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const locales = ["en", "zh-CN"];

async function documentation(locale, name) {
  return await readFile(join(root, "documentation", locale, "docs", name), "utf8");
}

test("Coco operational documentation is locale-paired and records the native CLI contract", async () => {
  const pages = Object.fromEntries(await Promise.all(locales.flatMap((locale) => [
    documentation(locale, "coco-cli.md").then((page) => [`${locale}-cli`, page]),
    documentation(locale, "coco-security.md").then((page) => [`${locale}-security`, page]),
  ])));

  for (const [locale, page] of Object.entries(pages)) {
    assert.match(page, /^# Coco(?: CLI| 安全| Security)$/m, `${locale} has a Coco-native title`);
    assert.match(page, /takes precedence|以.*为准/, `${locale} defines Coco documentation precedence`);
  }

  const { "en-cli": englishCli, "zh-CN-cli": chineseCli, "en-security": englishSecurity, "zh-CN-security": chineseSecurity } = pages;
  for (const page of [englishCli, chineseCli]) {
    for (const command of [
      "curl -fsSL https://aithernexus.github.io/coco/install.sh | bash",
      "COCO_VERSION=0.1.8 bash install.sh",
      "PI_OFFLINE=0 coco",
      "coco manage auth set idepub",
      "coco manage auth set idepub --stdin",
      "coco manage auth status",
      "coco manage auth remove idepub",
    ]) assert.ok(page.includes(command), command);
    assert.match(page, /agnes.*idepub.*achai.*stepfun.*deepseek/s);
    assert.match(page, /--api-key.*rejected|--api-key.*拒绝/s);
    assert.match(page, /PI_OFFLINE=1/);
    assert.match(page, /coco update.*(?:not available|不可用)/);
  }

  for (const page of [englishSecurity, chineseSecurity]) {
    assert.match(page, /global-only/);
    assert.match(page, /does not load project-local|不会加载项目本地/);
    assert.match(page, /best-effort.*not a sandbox|尽力而为.*不是沙箱/s);
    assert.match(page, /container.*VM|容器.*VM/s);
  }

  for (const locale of locales) {
    const navigation = JSON.parse(await readFile(join(root, "documentation", locale, "docs.json"), "utf8"));
    const paths = navigation.navigation[0].items.map((item) => item.path);
    assert.equal(paths.includes("coco-cli.md"), true, `${locale} links Coco CLI`);
    assert.equal(paths.includes("coco-security.md"), true, `${locale} links Coco security`);
  }
});
