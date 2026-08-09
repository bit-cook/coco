import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("competitive landscape report is public, sourced, responsive, and linked from the homepage", async () => {
  const [homepage, report, styles] = await Promise.all([
    readFile(new URL("site/index.html", root), "utf8"),
    readFile(new URL("site/landscape.html", root), "utf8"),
    readFile(new URL("site/landscape.css", root), "utf8"),
  ]);

  assert.match(homepage, /href="landscape\.html">Product report/);
  assert.match(report, /<html lang="zh-CN">/);
  assert.match(report, /https:\/\/bit-cook\.github\.io\/coco\/landscape\.html/);
  for (const product of ["CoCo", "Codex", "Claude Code", "Gemini", "Copilot", "Cursor", "Aider", "Pi Agent", "OpenClaw"]) {
    assert.match(report, new RegExp(`>${product}<`));
  }
  for (const section of ["verdict", "matrix", "gaps", "roadmap", "sources"]) {
    assert.match(report, new RegExp(`id="${section}"`));
  }
  for (const source of [
    "developers.openai.com/codex/",
    "code.claude.com/docs/",
    "geminicli.com/docs/",
    "docs.github.com/en/copilot/",
    "cursor.com/cloud",
    "aider.chat/docs/",
    "github.com/earendil-works/pi/",
    "docs.openclaw.ai/",
  ]) {
    assert.match(report, new RegExp(source.replaceAll(".", "\\.")));
  }
  assert.match(styles, /--paper:\s*#fffdf8/);
  assert.match(styles, /overflow-x:\s*auto/);
  assert.match(styles, /@media \(max-width:\s*42rem\)/);
  assert.equal(/<script\b/i.test(report), false);
  assert.equal(/https?:\/\/[^"']+\.(?:js|css|woff2?)/i.test(report), false);
});
