import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("development roadmap is public, evidence-scoped, and responsive", async () => {
  const [english, chinese, roadmap] = await Promise.all([
    readFile(new URL("site/index.html", root), "utf8"),
    readFile(new URL("site/zh-CN.html", root), "utf8"),
    readFile(new URL("site/roadmap.html", root), "utf8"),
  ]);

  assert.match(english, /href="roadmap\.html">Roadmap</);
  assert.match(chinese, /href="roadmap\.html">开发规划</);
  assert.match(roadmap, /<html lang="zh-CN">/);
  assert.match(roadmap, /rel="canonical" href="https:\/\/bit-cook\.github\.io\/coco\/roadmap\.html"/);
  assert.match(roadmap, /href="favicon\.svg"/);
  for (const section of ["baseline", "decisions", "roadmap", "metrics", "sources"]) {
    assert.match(roadmap, new RegExp(`id="${section}"`));
  }
  for (const release of ["v0.3", "v0.4", "v0.5", "v0.6", "v0.7"]) {
    assert.match(roadmap, new RegExp(`>${release}<`));
  }
  for (const boundary of ["isolated-required", "host-explicit", "禁止自动降级", "paired", "置信区间"]) {
    assert.match(roadmap, new RegExp(boundary, "i"));
  }
  assert.match(roadmap, /外部 A\/B 证据用于界定问题和候选方案/);
  assert.match(roadmap, /CoCo 发布阈值只由冻结的 CoCo 基线实验与安全测试决定/);
  assert.match(roadmap, /@media \(max-width: 540px\)/);
  assert.match(roadmap, /prefers-reduced-motion/);
  assert.equal(/<script\b/i.test(roadmap), false);
  assert.equal(/https?:\/\/[^"']+\.(?:js|css|woff2?|png|jpe?g|gif)/i.test(roadmap), false);
});
