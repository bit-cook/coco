import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const locales = ["en", "zh-CN"];

async function documentation(locale, name) {
  return await readFile(join(root, "documentation", locale, "docs", name), "utf8");
}

test("CoCo operational documentation is locale-paired and records the native CLI contract", async () => {
  const pages = Object.fromEntries(await Promise.all(locales.flatMap((locale) => [
    documentation(locale, "coco-cli.md").then((page) => [`${locale}-cli`, page]),
    documentation(locale, "coco-security.md").then((page) => [`${locale}-security`, page]),
  ])));

  for (const [locale, page] of Object.entries(pages)) {
    assert.match(page, /^# CoCo(?: CLI| 安全| Security)$/m, `${locale} has a CoCo-native title`);
    assert.match(page, /takes precedence|以.*为准/, `${locale} defines CoCo documentation precedence`);
  }

  const { "en-cli": englishCli, "zh-CN-cli": chineseCli, "en-security": englishSecurity, "zh-CN-security": chineseSecurity } = pages;
  for (const page of [englishCli, chineseCli]) {
    for (const command of [
      "curl -fsSL https://bit-cook.github.io/coco/install.sh | bash",
      "COCO_VERSION=0.7.1 bash install.sh",
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
    for (const command of [
      "/goal [status]",
      "/goal <description>",
      "/goal set <description>",
      "/goal plan",
      "/goal pause",
      "/goal resume",
      "/goal done <step>",
      "/goal active <step>",
      "/goal block <step>",
      "/goal reopen <step>",
      "/goal continue",
      "/goal complete",
      "/goal clear",
    ]) assert.ok(page.includes(command), command);
    assert.match(page, /set_steps.*activate_step.*block_step.*reopen_step.*complete_step.*complete/s);
    assert.match(page, /current session branch|当前会话分支/);
    assert.match(page, /compaction|上下文压缩/);
    assert.match(page, /current user instruction|当前用户指令/);
    assert.match(page, /safety policy|安全策略/);
    for (const command of ["/loop", "/loop list", "/loop cancel <id>"]) assert.ok(page.includes(command), command);
    assert.match(page, /5m/);
    assert.match(page, /every 2 hours/);
    assert.match(page, /saved session|已保存会话/);
    assert.match(page, /loops\.json/);
    assert.match(page, /seven days|七天/);
    assert.match(page, /unambiguous.*ID prefix|无歧义.*ID 前缀/s);
    assert.match(page, /without catch-up|不补跑/);
  }

  for (const page of [englishSecurity, chineseSecurity]) {
    assert.match(page, /global-only/);
    assert.match(page, /does not load project-local|不会加载项目本地/);
    assert.match(page, /best-effort.*not a sandbox|尽力而为.*不是沙箱/s);
    assert.match(page, /container.*VM|容器.*VM/s);
    assert.match(page, /\/goal/);
    assert.match(page, /current user instruction.*priority|当前用户指令优先/);
    assert.match(page, /does not override CoCo safety policy|不会覆盖 CoCo 安全策略/);
  }

  const [englishManual, chineseManual] = await Promise.all([
    documentation("en", "manual.md"),
    documentation("zh-CN", "manual.md"),
  ]);
  assert.match(englishManual, /^# CoCo User Manual$/m);
  assert.match(chineseManual, /^# CoCo 用户手册$/m);
  for (const page of [englishManual, chineseManual]) {
    for (const command of [
      "coco manage auth set",
      "coco manage models sync",
      "coco doctor",
      "coco core status",
      "/goal plan",
      "coco --mode json",
      "coco --mode rpc",
      "/language zh-CN",
      "/language list",
    ]) assert.ok(page.includes(command), command);
    assert.match(page, /--api-key.*(?:rejected|拒绝)/s);
    assert.match(page, /coco update.*(?:rejected|拒绝)/s);
    assert.match(page, /global-only/);
    assert.match(page, /languages\/<locale>\.json/);
    assert.match(page, /schemaVersion/);
    assert.match(page, /not a sandbox|不是沙箱/);
    assert.ok(page.includes("coco-cli.md"));
    assert.ok(page.includes("coco-security.md"));
    for (const command of ["/loop", "/loop list", "/loop cancel <id>"]) assert.ok(page.includes(command), command);
    assert.match(page, /5m/);
    assert.match(page, /loops\.json/);
    assert.match(page, /seven days|七天/);
    assert.match(page, /unambiguous.*ID prefix|无歧义.*ID 前缀/s);
    assert.match(page, /loop_wakeup/);
  }

  for (const locale of locales) {
    const navigation = JSON.parse(await readFile(join(root, "documentation", locale, "docs.json"), "utf8"));
    const paths = navigation.navigation[0].items.map((item) => item.path);
    assert.equal(paths.includes("manual.md"), true, `${locale} links CoCo manual`);
    assert.equal(paths.includes("coco-cli.md"), true, `${locale} links CoCo CLI`);
    assert.equal(paths.includes("coco-security.md"), true, `${locale} links CoCo security`);
    const development = navigation.navigation.find(({ title }) => title === (locale === "en" ? "Development" : "开发"));
    assert.equal(development.items.some(({ path }) => path === "development-review-plan.md"), true, `${locale} links engineering review`);
  }

  const [englishReview, chineseReview] = await Promise.all([documentation("en", "development-review-plan.md"), documentation("zh-CN", "development-review-plan.md")]);
  for (const review of [englishReview, chineseReview]) {
    for (const evidence of ["0.6.1", "b88190b", "472/472", "37/37", "2.18", "9.37", "0.6.2", "0.7.0", "0.8.0"]) assert.ok(review.includes(evidence), evidence);
    assert.match(review, /draft-first/);
    assert.match(review, /dispatchPending/);
    assert.match(review, /EXECUTION_OUTCOME_IN_DOUBT/);
    assert.match(review, /cgroup v2/);
  }
});
