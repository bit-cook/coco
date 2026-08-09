import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("CoCo brand assets are self-contained, accessible, and integrated in public surfaces", async () => {
  const [logo, favicon, homepage, landscape, readme, homepageCss, landscapeCss] = await Promise.all([
    readFile(new URL("site/logo.svg", root), "utf8"),
    readFile(new URL("site/favicon.svg", root), "utf8"),
    readFile(new URL("site/index.html", root), "utf8"),
    readFile(new URL("site/landscape.html", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
    readFile(new URL("site/styles.css", root), "utf8"),
    readFile(new URL("site/landscape.css", root), "utf8"),
  ]);

  for (const [name, svg] of [["logo", logo], ["favicon", favicon]]) {
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /viewBox="0 0 64 64"/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title\b/);
    assert.doesNotMatch(svg, /<script\b|<image\b|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i, `${name} must be self-contained`);
  }
  assert.match(logo, /id="coco-mark"/);
  assert.doesNotMatch(logo, /<rect\b/);
  assert.match(logo, /<path fill="#ff6b35" fill-rule="evenodd"/);
  assert.match(logo, /<path fill="#00ffff"/);
  assert.doesNotMatch(logo, /currentColor/);
  assert.doesNotMatch(favicon, /<rect\b/);
  assert.match(favicon, /<path fill="#ff6b35" fill-rule="evenodd"/);
  assert.match(favicon, /<path fill="#00ffff"/);
  assert.match(homepage, /<svg class="brand-mark"[^>]*aria-hidden="true"[^>]*><use href="logo\.svg#coco-mark"/);
  assert.match(landscape, /<svg class="brand-mark"[^>]*aria-hidden="true"[^>]*><use href="logo\.svg#coco-mark"/);
  assert.match(readme, /<img src="site\/logo\.svg" alt="CoCo Agent"/);
  assert.doesNotMatch(readme, /^## Brand assets$/m);
  assert.doesNotMatch(readme, /The full name is \*\*CoCo Agent\*\*; use \*\*CoCo\*\* as the short name\./);
  assert.match(homepageCss, /\.brand-lockup/);
  assert.match(landscapeCss, /\.brand-mark/);
});
