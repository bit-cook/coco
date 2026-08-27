import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const install = "curl -fsSL https://bit-cook.github.io/coco/install.sh | bash";
const uninstall = "curl -fsSL https://github.com/bit-cook/coco/releases/download/v0.8.0/uninstall.sh | bash";

test("bilingual homepage keeps the install-first static site contract", async () => {
  const [english, chinese, styles] = await Promise.all([
    readFile(new URL("site/index.html", root), "utf8"),
    readFile(new URL("site/zh-CN.html", root), "utf8"),
    readFile(new URL("site/styles.css", root), "utf8"),
  ]);

  for (const [page, lang, canonical] of [
    [english, "en", "https://bit-cook.github.io/coco/"],
    [chinese, "zh-CN", "https://bit-cook.github.io/coco/zh-CN.html"],
  ]) {
    assert.match(page, new RegExp(`<html lang="${lang}">`));
    assert.match(page, new RegExp(`<link rel="canonical" href="${canonical}"`));
    assert.match(page, /<meta name="theme-color" content="#fffdf8"/);
    assert.match(page, /hreflang="en" href="https:\/\/bit-cook\.github\.io\/coco\/"/);
    assert.match(page, /hreflang="zh-CN" href="https:\/\/bit-cook\.github\.io\/coco\/zh-CN\.html"/);
    assert.match(page, /hreflang="x-default" href="https:\/\/bit-cook\.github\.io\/coco\/"/);
    assert.match(page, new RegExp(install.replaceAll("|", "\\|")));
    assert.match(page, new RegExp(uninstall.replaceAll("|", "\\|")));
    assert.match(page, /data-copy-target="install-command"/);
    assert.match(page, /data-copy-target="uninstall-command"/);
    assert.match(page, /id="copy-status" class="sr-only" aria-live="polite"/);
    assert.match(page, /href="landscape\.html">[^<]+</);
    assert.match(page, /href="roadmap\.html">[^<]+</);
    assert.match(page, /href="plan\.html">[^<]+</);
    assert.match(page, /href="research(?:-zh-CN)?\.html">[^<]+</);
    assert.match(page, /BACKUP_AND_RESTORE\.md/);
    assert.match(page, /class="plan-link" href="plan\.html"/);
    for (const evidence of ["0.8.0", "676\/676", "39\/39", "9\/9"]) assert.match(page, new RegExp(evidence));
    assert.doesNotMatch(page, /next candidate[^.]*retaining runtime integrity/i);
    assert.match(page, /href="https:\/\/github\.com\/bit-cook\/coco"/);
    assert.match(page, /href="styles\.css"/);
    assert.match(page, /src="app\.js" defer/);
    assert.match(page, /data-copy-success="[^"]+" data-copy-error="[^"]+" data-copy-error-help="[^"]+"/);
    assert.equal(/https?:\/\/[^"']+\.(?:css|js|woff2?|png|jpe?g|gif)/i.test(page), false);
  }

  assert.match(english, /<a href="index\.html" aria-current="page">EN</);
  assert.match(english, /<a href="zh-CN\.html" lang="zh-CN">中文</);
  assert.match(chinese, /<a href="index\.html" lang="en">EN</);
  assert.match(chinese, /<a href="zh-CN\.html" aria-current="page">中文</);
  for (const label of ["CoCo Agent | 通用 AI 助手", "具备出色编程和终端能力的通用 AI 助手", "CoCo Agent 首页", "CoCo 安装终端", "CoCo 使用体验", "跳至安装命令", "当前计划", "Agent 研究", "历史战略", "旧版路线图", "旧竞品研究", "恢复手册", "查看源码", "复制安装命令", "复制卸载命令", "显示卸载命令", "模型配置", "无需配置", "首次启动", "打开即用", "发布版安装器", "需要移除 CoCo？", "为终端而构建。"]) {
    assert.match(chinese, new RegExp(label));
  }
  for (const page of [english, chinese]) assert.equal(page.includes("agnes/agnes-2.5-flash"), false);
  assert.match(english, /no model setup/i);
  assert.match(chinese, /不需要配置模型/);
  for (const message of ["已复制", "复制失败", "请选择命令文本并手动复制。"]) assert.match(chinese, new RegExp(message));

  for (const [token, value] of Object.entries({ paper: "#fffdf8", ink: "#17202a", muted: "#667085", surface: "#ffffff", line: "#dce3e8", orange: "#ff6b35", "orange-soft": "#fff0e8", mint: "#dff7ec", "mint-strong": "#147d64", blue: "#2563eb", "blue-soft": "#e9f0ff", yellow: "#ffe272" })) {
    assert.match(styles, new RegExp(`--${token}:\\s*${value}`));
  }
  for (const token of ["--terminal-bg", "--terminal-slate", "--terminal-text", "--terminal-border", "--terminal-success"]) assert.match(styles, new RegExp(`${token}:`));
  assert.match(styles, /\.copy-button[^}]*background: var\(--orange\); color: var\(--ink\)/);
  for (const selector of ["release-note", "performance-grid", "engineering", "priority-list", "plan-link"]) assert.match(styles, new RegExp(`\\.${selector}`));
  assert.match(styles, /--focus-ring:[^;]*var\(--blue\)/);
  assert.match(styles, /@media \(max-width: 29rem\)/);
  assert.match(styles, /\.command-block \{ align-items: stretch; flex-direction: column; \}/);
  assert.match(styles, /\.copy-button \{ width: 100%; \}/);
  assert.equal(/@import|https?:\/\//i.test(styles), false);
});
