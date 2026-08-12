import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const usage = () => { const error = new Error("UPSTREAM_DASHBOARD_USAGE"); error.code = "UPSTREAM_DASHBOARD_USAGE"; throw error; };
function options(argv) { const result = { online: false, asOf: new Date().toISOString().slice(0, 10) }; for (let i = 0; i < argv.length; i++) { if (argv[i] === "--online") result.online = true; else if (argv[i] === "--as-of" && argv[i + 1]) result.asOf = argv[++i]; else usage(); } if (!/^\d{4}-\d{2}-\d{2}$/.test(result.asOf)) usage(); return result; }
const days = (left, right) => Math.floor((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000);
const semver = (value) => { const match = String(value).match(/^v?(\d+)\.(\d+)\.(\d+)$/); return match ? match.slice(1).map(Number) : null; };
const compare = (left, right) => { const a = semver(left), b = semver(right); if (!a || !b) return null; for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

async function onlineLatest(baseline) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.github.com/repos/${baseline.upstream.owner}/${baseline.upstream.repository}/releases?per_page=100&page=1`, { headers: { accept: "application/vnd.github+json", "user-agent": "coco-upstream-dashboard" }, redirect: "error", signal: controller.signal });
    if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
    const text = await response.text(); if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error("UPSTREAM_BODY_TOO_LARGE");
    const releases = JSON.parse(text).filter((release) => !release.draft && !release.prerelease && semver(release.tag_name));
    releases.sort((a, b) => compare(b.tag_name, a.tag_name)); return { latest: releases[0] ?? null, releases };
  } finally { clearTimeout(timer); }
}

export async function upstreamDashboard(argv = []) {
  const opts = options(argv); const baseline = JSON.parse(await readFile(join(root, "resources/upstream-baseline.v1.json"), "utf8"));
  const report = { asOf: opts.asOf, baseline: { ageDays: days(baseline.package.releaseDate, opts.asOf), integrity: baseline.package.integrity, releaseDate: baseline.package.releaseDate, sourceCommitKnown: baseline.source.commitSha !== null, version: baseline.package.version }, lag: { calendarDays: null, commitsBehind: null, releaseCount: null, reason: "online-query-disabled" }, mode: opts.online ? "online" : "offline", schemaVersion: 1, status: "unknown", upstream: { latestStableVersion: null, publishedAt: null, queryAttempted: opts.online, queryStatus: opts.online ? "pending" : "disabled" } };
  if (!opts.online) return report;
  const { latest, releases } = await onlineLatest(baseline); report.upstream.queryStatus = "ok";
  if (!latest) { report.lag.reason = "no-stable-release"; return report; }
  report.upstream.latestStableVersion = latest.tag_name.replace(/^v/, ""); report.upstream.publishedAt = latest.published_at;
  const relation = compare(report.upstream.latestStableVersion, baseline.package.version); report.status = relation === 0 ? "current" : relation > 0 ? "behind" : "ahead";
  report.lag.releaseCount = releases.filter((release) => compare(release.tag_name, baseline.package.version) > 0).length;
  report.lag.calendarDays = days(baseline.package.releaseDate, latest.published_at.slice(0, 10)); report.lag.reason = baseline.source.commitSha ? null : "source-commit-not-recorded"; return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) upstreamDashboard(process.argv.slice(2)).then((report) => console.log(JSON.stringify(report))).catch((error) => { console.error(error.code ?? error.message); process.exitCode = error.code === "UPSTREAM_DASHBOARD_USAGE" ? 64 : 2; });
