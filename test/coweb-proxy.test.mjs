import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const module = await import(join(root, "scripts", "coweb-proxy.mjs")).catch(() => null);

test("coweb proxy trusts only its exact public host and rewrites upstream origin", async () => {
  const { isTrustedRequest, upstreamHeaders } = module ?? await import(join(root, "scripts", "coweb-proxy.mjs"));
  assert.equal(isTrustedRequest("web.example", "https://web.example", "web.example"), true);
  assert.equal(isTrustedRequest("evil.example", "https://evil.example", "web.example"), false);
  assert.equal(isTrustedRequest("web.example", "https://evil.example", "web.example"), false);
  const headers = upstreamHeaders({ host: "web.example", origin: "https://web.example", "sec-fetch-site": "same-origin", "x-forwarded-host": "web.example" }, 30141);
  assert.equal(headers.host, "127.0.0.1:30141");
  assert.equal(headers.origin, "http://127.0.0.1:30141");
  assert.ok(!("sec-fetch-site" in headers));
  assert.ok(!("x-forwarded-host" in headers));
});
