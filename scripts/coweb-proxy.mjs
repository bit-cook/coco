import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";

const upstreamPort = Number(process.env.COWEB_UPSTREAM_PORT || 30141);
const proxyPort = Number(process.env.COWEB_PROXY_PORT || 30142);
const publicHost = process.env.COWEB_PUBLIC_HOST?.trim().toLowerCase();
const publicUsername = process.env.COWEB_PUBLIC_USERNAME || "coco";
const publicPassword = process.env.PI_WEB_PASSWORD;

function hostname(value) {
  try { return new URL(`http://${value}`).hostname.toLowerCase(); } catch { return null; }
}

export function isTrustedRequest(host, origin, expectedHost) {
  if (!expectedHost || hostname(host) !== expectedHost) return false;
  if (!origin) return true;
  try { return new URL(origin).hostname.toLowerCase() === expectedHost; } catch { return false; }
}

export function publicAuthorization(value, username, password) {
  if (!password) return true;
  const expected = Buffer.from(`${username}:${password}`);
  const supplied = typeof value === "string" && value.startsWith("Basic ") ? Buffer.from(value.slice(6), "base64") : Buffer.alloc(0);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function upstreamHeaders(headers, port, password) {
  const rewritten = { ...headers, host: `127.0.0.1:${port}` };
  if (rewritten.origin) rewritten.origin = `http://127.0.0.1:${port}`;
  if (password) rewritten.authorization = `Basic ${Buffer.from(`pi:${password}`).toString("base64")}`;
  delete rewritten["sec-fetch-site"];
  delete rewritten["x-forwarded-host"];
  delete rewritten["x-forwarded-proto"];
  return rewritten;
}

export function createCowebProxy(expectedHost = publicHost, port = proxyPort, username = publicUsername, password = publicPassword) {
  if (!expectedHost) throw new Error("COWEB_PUBLIC_HOST_REQUIRED");
  const server = http.createServer((request, response) => {
   if (!isTrustedRequest(request.headers.host, request.headers.origin, expectedHost)) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end('{"error":"COWEB_UNTRUSTED_PROXY_REQUEST"}');
     return;
   }
   if (!publicAuthorization(request.headers.authorization, username, password)) {
     response.writeHead(401, { "content-type": "application/json", "www-authenticate": 'Basic realm="Co Web"' });
     response.end('{"error":"COWEB_UNAUTHORIZED"}');
     return;
   }
   const upstream = http.request({ host: "127.0.0.1", port: upstreamPort, path: request.url, method: request.method, headers: upstreamHeaders(request.headers, upstreamPort, password) }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    if (String(upstreamResponse.headers["content-type"] ?? "").includes("text/event-stream")) {
      // Quick Tunnels buffer small SSE frames; force an immediate edge flush.
      response.write(`:${" ".repeat(2048)}\n\n`);
    }
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" });
    response.end('{"error":"COWEB_UPSTREAM_UNAVAILABLE"}');
  });
    request.pipe(upstream);
  });
  return server.listen(port, "127.0.0.1");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createCowebProxy();
  process.stdout.write(`coweb proxy: http://127.0.0.1:${proxyPort}\n`);
}
