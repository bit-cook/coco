import http from "node:http";
import { fileURLToPath } from "node:url";

const upstreamPort = Number(process.env.COWEB_UPSTREAM_PORT || 30141);
const proxyPort = Number(process.env.COWEB_PROXY_PORT || 30142);
const publicHost = process.env.COWEB_PUBLIC_HOST?.trim().toLowerCase();

function hostname(value) {
  try { return new URL(`http://${value}`).hostname.toLowerCase(); } catch { return null; }
}

export function isTrustedRequest(host, origin, expectedHost) {
  if (!expectedHost || hostname(host) !== expectedHost) return false;
  if (!origin) return true;
  try { return new URL(origin).hostname.toLowerCase() === expectedHost; } catch { return false; }
}

export function upstreamHeaders(headers, port) {
  const rewritten = { ...headers, host: `127.0.0.1:${port}` };
  if (rewritten.origin) rewritten.origin = `http://127.0.0.1:${port}`;
  delete rewritten["sec-fetch-site"];
  delete rewritten["x-forwarded-host"];
  delete rewritten["x-forwarded-proto"];
  return rewritten;
}

export function createCowebProxy(expectedHost = publicHost, port = proxyPort) {
  if (!expectedHost) throw new Error("COWEB_PUBLIC_HOST_REQUIRED");
  const server = http.createServer((request, response) => {
  if (!isTrustedRequest(request.headers.host, request.headers.origin, expectedHost)) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end('{"error":"COWEB_UNTRUSTED_PROXY_REQUEST"}');
    return;
  }
  const upstream = http.request({ host: "127.0.0.1", port: upstreamPort, path: request.url, method: request.method, headers: upstreamHeaders(request.headers, upstreamPort) }, (upstreamResponse) => {
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
