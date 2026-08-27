# COWEB-002: Native Co Web With Preserved Desktop UI

## Status

completed (2026-08-27)

## Goal

Replace Co Web's runtime `@lyhue1991/pi-web@latest` installation and Next.js
server with a CoCo-native loopback service. Preserve the existing Co Web
desktop client visual surface and ordinary chat/session workflow, then add
responsive behavior only for narrow mobile viewports.

## Constraints

- No runtime npm installation, external frontend project process, or `@latest`
  resolution.
- Use CoCo's bundled `@earendil-works/pi-coding-agent` session services.
- Bundle a pinned, license-attributed snapshot of the existing Co Web browser
  client as package data. The native service owns all API, session, auth, and
  SSE behavior.
- Desktop styles and interaction remain unchanged at widths above the frozen
  client's existing mobile breakpoint. Mobile overrides apply only at
  `max-width: 640px`.
- Public Basic Auth username is `coco`; no credential is committed.
- Preserve loopback-only binding. Public forwarding remains an external,
  explicitly configured transport.

## Scope

- `coweb/**`
- `scripts/coweb.mjs`
- `scripts/coweb-native-service.mjs`
- `scripts/coweb-proxy.mjs`
- `scripts/coco-dispatcher.mjs`
- `scripts/vendor-coweb-static.mjs`
- `scripts/runtime-integrity.mjs`
- `package.json`
- `test/coweb-command.test.mjs`
- `test/coweb-native-service.test.mjs`
- `test/coweb-proxy.test.mjs`
- `documentation/en/docs/coco-cli.md`
- `documentation/zh-CN/docs/coco-cli.md`
- `scripts/package-asset-map.v1.json`
- `resources/runtime-integrity-manifest.v1.json`
- `resources/runtime-integrity-manifest.v1.json.sha256`
- `development/GENERATED_ASSETS.md`
- `.opencode/memory/DEVELOPMENT_JOURNAL.md`

## Acceptance Criteria

1. `coco coweb` launches a CoCo-owned Node service without invoking npm,
   `@lyhue1991/pi-web`, or a Next.js process.
2. The packaged client snapshot has no runtime network dependency and carries
   its upstream version, source revision, and MIT attribution.
3. The normal desktop shell, session list, session open/create, model/thinking
   selection, prompt flow, agent SSE events, and file list/preview work against
   native API endpoints.
4. The public proxy accepts `coco:<password>` and translates internally only
   where legacy compatibility is still required; native direct serving also
   accepts `coco:<password>`.
5. At desktop widths the frozen client CSS/layout is unchanged. At widths
   `<=640px`, the responsive override prevents horizontal overflow, makes
   navigation/panels reachable, and keeps the composer above the safe area.
6. Focused unit/integration tests cover static serving, auth, traversal
   rejection, core API/SSE paths, desktop asset markers, and mobile override
   markers. Runtime/package artifacts are regenerated after source freeze.

## Risks

- The frozen client is a Next App Router build and requires a compatibility
  surface for its existing `/api/*` requests.
- Full parity for privileged Pi Web features is out of scope for this item;
  unsupported routes must fail explicitly rather than silently use an external
  runtime.
- Adding packaged client assets changes package inventory and runtime integrity
  evidence.

## Evidence

Bound to worktree `be2d1e8` + uncommitted COWEB-002 batch (2026-08-27):

- `node --test test/coweb-command.test.mjs test/coweb-proxy.test.mjs test/coweb-native-service.test.mjs` — 7/7 pass (dispatch/handshake args, frozen desktop asset + narrow mobile override markers, native static serving + coco auth, model/session/workspace routes without external runtime, SSE proxy handshake, exact public-host trust with upstream auth rewrite).
- `npm run typecheck:coweb` — pass (`node --check` on all four coweb scripts).
- `git diff --check` — clean.
- Real prompt/SSE E2E on isolated loopback instance (port 30145): session create → SSE `connected` → agent events → `prompt_done`/`agent_end` with reply text.
- Chrome headless CDP: 1440px desktop unchanged; 390px and 640px no horizontal overflow with mobile overrides; 641px desktop layout intact.
- Generated artifacts regenerated and governed: `scripts/package-asset-map.v1.json` (1473 entries), `resources/runtime-integrity-manifest.v1.json` (21665 entries) + `.sha256`.

Evidence becomes stale if any scoped file changes after this point; re-run the
focused gates before commit.
