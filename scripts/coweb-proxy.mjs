import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";

const DEFAULT_UPSTREAM_PORT = 30141;
const DEFAULT_PROXY_PORT = 30142;
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

function hostname(value) {
  try {
    const parsed = new URL(`http://${value}`);
    return parsed.pathname === "/" && !parsed.search && !parsed.hash ? parsed.hostname.toLowerCase() : null;
  } catch { return null; }
}

export function normalizePublicHost(value) {
  return typeof value === "string" && value.trim() === value ? hostname(value) : null;
}

export function isTrustedRequest(host, origin, expectedHost) {
  const normalized = normalizePublicHost(expectedHost);
  if (!normalized || hostname(host) !== normalized) return false;
  if (!origin) return true;
  try { return new URL(origin).hostname.toLowerCase() === normalized; } catch { return false; }
}

export function publicAuthorization(value, username, password) {
  if (!password) return false;
  const expected = Buffer.from(`${username}:${password}`);
  const supplied = typeof value === "string" && value.startsWith("Basic ") ? Buffer.from(value.slice(6), "base64") : Buffer.alloc(0);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function upstreamHeaders(headers, port, password, username = "coco") {
  const rewritten = { host: `127.0.0.1:${port}` };
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (HOP_BY_HOP.has(normalized) || ["authorization", "host", "origin", "sec-fetch-site", "x-forwarded-host", "x-forwarded-proto"].includes(normalized)) continue;
    rewritten[normalized] = value;
  }
  if (headers.origin) rewritten.origin = `http://127.0.0.1:${port}`;
  if (password) rewritten.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  return rewritten;
}

export function createCowebProxy({ expectedHost, password, proxyPort = DEFAULT_PROXY_PORT, upstreamPort = DEFAULT_UPSTREAM_PORT, username = "coco", upstreamUsername = "coco" }) {
  const host = normalizePublicHost(expectedHost);
  if (!host) throw new Error("COWEB_PUBLIC_HOST_INVALID");
  if (!password) throw new Error("COWEB_PUBLIC_PASSWORD_REQUIRED");
  const server = http.createServer((request, response) => {
    if (!isTrustedRequest(request.headers.host, request.headers.origin, host)) {
      response.writeHead(403, { "content-type": "application/json", "x-content-type-options": "nosniff" });
      response.end('{"error":"COWEB_UNTRUSTED_PROXY_REQUEST"}');
      return;
    }
    if (!publicAuthorization(request.headers.authorization, username, password)) {
      response.writeHead(401, { "content-type": "application/json", "www-authenticate": 'Basic realm="Co Web"', "x-content-type-options": "nosniff" });
      response.end('{"error":"COWEB_UNAUTHORIZED"}');
      return;
    }
    const upstream = http.request({ host: "127.0.0.1", port: upstreamPort, path: request.url, method: request.method, headers: upstreamHeaders(request.headers, upstreamPort, password, upstreamUsername) }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      if (String(upstreamResponse.headers["content-type"] ?? "").includes("text/event-stream")) response.write(`:${" ".repeat(2048)}\n\n`);
      upstreamResponse.pipe(response);
    });
    const abort = () => upstream.destroy();
    request.once("aborted", abort);
    response.once("close", abort);
    upstream.once("error", () => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" });
      response.end('{"error":"COWEB_UPSTREAM_UNAVAILABLE"}');
    });
    request.pipe(upstream);
  });
  server.cowebProxyPort = proxyPort;
  return server;
}

export function listenCowebProxy(server, port = server.cowebProxyPort ?? DEFAULT_PROXY_PORT) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen(server);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const password = process.env.COWEB_PUBLIC_PASSWORD;
  const server = createCowebProxy({ expectedHost: process.env.COWEB_PUBLIC_HOST, password, proxyPort: Number(process.env.COWEB_PROXY_PORT || DEFAULT_PROXY_PORT), upstreamPort: Number(process.env.COWEB_UPSTREAM_PORT || DEFAULT_UPSTREAM_PORT) });
  await listenCowebProxy(server);
  process.stdout.write(`coweb proxy: http://127.0.0.1:${server.cowebProxyPort}\n`);
}
