import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("current plan, strategy, and historical research remain public, distinct, responsive, and evidence-scoped", async () => {
  const [english, chinese, plan, roadmap, legacy, landscape] = await Promise.all([
    readFile(new URL("site/index.html", root), "utf8"),
    readFile(new URL("site/zh-CN.html", root), "utf8"),
    readFile(new URL("site/plan.html", root), "utf8"),
    readFile(new URL("site/roadmap.html", root), "utf8"),
    readFile(new URL("site/roadmap-legacy.html", root), "utf8"),
    readFile(new URL("site/landscape.html", root), "utf8"),
  ]);

  for (const [page, links] of [[english, ["Current plan", "Historical strategy", "Legacy roadmap", "Legacy research"]], [chinese, ["当前计划", "历史战略", "旧版路线图", "旧竞品研究"]]]) {
    assert.match(page, /href="plan\.html"/);
    assert.match(page, /href="roadmap\.html"/);
    assert.match(page, /href="roadmap-legacy\.html"/);
    assert.match(page, /href="landscape\.html"/);
    for (const label of links) assert.match(page, new RegExp(label));
  }

  assert.match(plan, /rel="canonical" href="https:\/\/bit-cook\.github\.io\/coco\/plan\.html"/);
  assert.match(plan, /CoCo v0\.6\.3/);
  assert.match(plan, /Release baseline: v0\.6\.3 \/ next: CFG-001/);
  for (const release of ["v0.6.3", "v0.7.0"]) assert.match(plan, new RegExp(release));
  for (const concept of ["Private projection ledger", "Projection variants", "小批次，短交接", "EVID-001", "compacted"]) assert.match(plan, new RegExp(concept));
  for (const evidence of ["619/619", "39/39", "9个资产完整"]) assert.match(plan, new RegExp(evidence.replace("/", "\\/")));
  assert.match(plan, /#f7fbff/i);
  assert.match(plan, /@media\(max-width:/);
  assert.match(plan, /prefers-reduced-motion/);
  assert.equal(/<script\b/i.test(plan), false);
  assert.equal(/https?:\/\/[^"']+\.(?:js|css|woff2?|png|jpe?g|gif)/i.test(plan), false);

  assert.match(roadmap, /rel="canonical" href="https:\/\/bit-cook\.github\.io\/coco\/roadmap\.html"/);
  assert.match(roadmap, /CoCo v0\.5\.2/);
  assert.match(roadmap, /Superseded historical snapshot/);
  assert.match(roadmap, /href="plan\.html"/);
  assert.match(roadmap, /Xiaomi MiMo-Code/);
  assert.match(roadmap, /源码产品层 \+ 选择性上游 Fork \+ 持续缩小兼容 Patch/);
  for (const milestone of ["M0", "M1", "M2", "M3", "M4", "M5", "M6"]) assert.match(roadmap, new RegExp(`>${milestone}<`));
  for (const concept of ["stable-key i18n", "Provider 生命周期", "Memory & Context", "Controlled Workflows", "Isolation & Distribution", "Upstream lag"]) assert.match(roadmap, new RegExp(concept, "i"));
  assert.match(roadmap, /href="roadmap-legacy\.html"/);
  assert.match(roadmap, /href="landscape\.html"/);

  assert.match(legacy, /rel="canonical" href="https:\/\/bit-cook\.github\.io\/coco\/roadmap-legacy\.html"/);
  assert.match(legacy, /Historical snapshot · CoCo v0\.2\.1/);
  assert.match(legacy, /历史归档/);
  for (const release of ["v0.3", "v0.4", "v0.5", "v0.6", "v0.7"]) assert.match(legacy, new RegExp(`>${release}<`));
  for (const boundary of ["isolated-required", "host-explicit", "禁止自动降级", "paired", "置信区间"]) assert.match(legacy, new RegExp(boundary, "i"));
  assert.match(legacy, /href="roadmap\.html"/);
  assert.match(legacy, /href="landscape\.html"/);

  assert.match(landscape, /CoCo/);
  for (const page of [roadmap, legacy]) {
    assert.match(page, /#fff(?:af2|df8)/i);
    assert.match(page, /@media\(max-width:/);
    assert.match(page, /prefers-reduced-motion/);
    assert.equal(/<script\b/i.test(page), false);
    assert.equal(/https?:\/\/[^"']+\.(?:js|css|woff2?|png|jpe?g|gif)/i.test(page), false);
  }
});
