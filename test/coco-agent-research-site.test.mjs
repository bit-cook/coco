import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("Prime Agent and DeepSeek Harness research is public, bilingual, sourced, and responsive", async () => {
  const [homepage, chineseHome, plan, english, chinese, styles] = await Promise.all([
    readFile(new URL("site/index.html", root), "utf8"),
    readFile(new URL("site/zh-CN.html", root), "utf8"),
    readFile(new URL("site/plan.html", root), "utf8"),
    readFile(new URL("site/research.html", root), "utf8"),
    readFile(new URL("site/research-zh-CN.html", root), "utf8"),
    readFile(new URL("site/research.css", root), "utf8"),
  ]);

  assert.match(homepage, /href="research\.html">Agent research/);
  assert.match(chineseHome, /href="research-zh-CN\.html">Agent 研究/);
  assert.match(plan, /href="research-zh-CN\.html">Agent 研究/);

  for (const [page, lang, canonical, alternate] of [
    [english, "en", "research.html", "research-zh-CN.html"],
    [chinese, "zh-CN", "research-zh-CN.html", "research.html"],
  ]) {
    assert.match(page, new RegExp(`<html lang="${lang}">`));
    assert.match(page, new RegExp(`canonical" href="https://bit-cook.github.io/coco/${canonical}`));
    assert.match(page, new RegExp(`href="${alternate}"`));
    assert.match(page, /Prime Agent/);
    assert.match(page, /DeepSeek Harness/);
    assert.match(page, /849c92114b0b4372fa272281b87cdbe8f7c9ed8d/);
    assert.match(page, /99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/);
    assert.match(page, /MIT/);
    for (const work of ["REC-001", "EVID-001", "EVID-002", "TOOL-001", "CFG-001", "ORCH-001"]) assert.match(page, new RegExp(work));
    assert.match(page, /external-agent-research\.md/);
    assert.match(page, /prime-agent-deepseek-harness-snapshot\.md/);
    assert.match(page, /PrimeIntellect-ai\/prime-agent\/tree\/849c921/);
    assert.match(page, /deepseek-ai\/deepseek-harness\/tree\/99f6f02/);
    assert.match(page, /research\.css/);
  }

  assert.match(english, /Adopt contracts, not frameworks/);
  assert.match(english, /Reject or defer/);
  assert.match(chinese, /采用契约，不导入框架/);
  assert.match(chinese, /拒绝或暂缓/);
  assert.match(styles, /\.mechanisms\{display:grid/);
  assert.match(styles, /\.matrix\{display:grid/);
  assert.match(styles, /@media\(max-width:48rem\)/);
  assert.equal(/@import/i.test(styles), false);
});
