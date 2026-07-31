# Coco Terminal UI Design Contract

This document binds all Coco interactive-TUI fixes and extensions. Coco uses the
existing pi-tui component model: components render width-bounded ANSI lines,
receive theme semantics, and invalidate cached themed output on a theme change.

## 1. Product Intent And Layout

- Coco is a quiet, compact terminal coding agent, not a transcript viewer.
- Startup opens directly to the editor with only the essential header, editor,
  and footer chrome. It does not print a banner, help panel, recent activity, or
  explanatory transcript into the terminal.
- Detailed help and collapsed tool output are disclosure, not startup content.
  `Ctrl+O` expands or collapses tool output; its hint belongs in contextual help,
  not in a persistent startup transcript.
- The conceptual screen regions are fixed: header at the top, transcript in the
  flow above the editor, and editor plus footer at the bottom. Re-rendering must
  preserve that composition without treating saved terminal history as a region.

## 2. Color Foundations

All theme values are canonical Solarized. Implementations may use these values
only through named theme variables and semantic pi theme tokens.

| Token | Value | Role |
|---|---|---|
| `base03` | `#002b36` | darkest dark background |
| `base02` | `#073642` | dark raised/background surface |
| `base01` | `#586e75` | dark emphasis / muted border |
| `base00` | `#657b83` | dark muted text |
| `base0` | `#839496` | dark primary text |
| `base1` | `#93a1a1` | light muted text |
| `base2` | `#eee8d5` | light raised/background surface |
| `base3` | `#fdf6e3` | light page background |
| `yellow` | `#b58900` | warning / heading |
| `orange` | `#cb4b16` | pending / attention |
| `red` | `#dc322f` | error / removal |
| `magenta` | `#d33682` | high-thinking level |
| `violet` | `#6c71c4` | custom label / extra-high thinking |
| `blue` | `#268bd2` | accent / link / low-thinking level |
| `cyan` | `#2aa198` | selected / medium-thinking level |
| `green` | `#859900` | success / addition |

Dark uses `base03` as its field, `base02` for raised surfaces, `base0` for text,
`base01`/`base00` for muted hierarchy. Light uses `base3` as its field, `base2`
for raised surfaces, `base00` for text, and `base01`/`base1` for muted hierarchy.

## 3. Semantic Theme Mapping

| Semantic token | Dark | Light |
|---|---|---|
| `text`, `toolTitle` | `base0` | `base00` |
| `muted`, `thinkingText`, `toolOutput` | `base01` | `base01` |
| `dim` | `base00` | `base1` |
| `accent`, `borderAccent`, `mdCode`, `mdListBullet` | `cyan` | `cyan` |
| `border`, `mdLink`, `syntaxKeyword` | `blue` | `blue` |
| `borderMuted`, `mdQuoteBorder`, `mdHr` | `base01` | `base1` |
| `success`, `toolDiffAdded`, `syntaxString` | `green` | `green` |
| `bashMode` | `orange` | `orange` |
| `warning`, `mdHeading`, `syntaxFunction` | `yellow` | `yellow` |
| `error`, `toolDiffRemoved` | `red` | `red` |
| `customMessageLabel`, `thinkingXhigh` | `violet` | `violet` |
| `syntaxNumber`, `thinkingHigh` | `magenta` | `magenta` |
| `syntaxType`, `syntaxVariable` | `blue` | `blue` |
| `syntaxComment`, `syntaxPunctuation`, `syntaxOperator` | `base01` | `base01` |
| `mdLinkUrl`, `mdQuote`, `toolDiffContext` | `base00` | `base1` |
| `thinkingOff`, `thinkingMinimal` | `base00` | `base1` |
| `thinkingLow`, `thinkingMedium` | `blue`, `cyan` | `blue`, `cyan` |
| `thinkingMax` | `red` | `red` |

`selectedBg`, `userMessageBg`, `customMessageBg`, `toolPendingBg`,
`toolSuccessBg`, and `toolErrorBg` use `base02` in dark and `base2` in light.
The existing component API requires these neutral background tokens; foreground,
title, and border color continue to express tool state.

## 4. Typography And Density

- Typography is the terminal's inherited monospace font, size, weight, line
  height, and fallback behavior. Coco sets no web font, custom font size, or
  graphical type scale.
- Use normal terminal text for content, ANSI bold only for labels that improve
  scanability, and semantic foreground color for hierarchy. Do not use color as
  the sole carrier of state.
- Preserve the component system's compact one-cell horizontal padding and
  width-bounded line rendering. Truncate or wrap with ANSI-safe helpers; no line
  may exceed the supplied terminal width.

## 5. Component Contracts

- **Header:** a single compact identity/status line. It may show the active
  model or session context, but never an onboarding banner. Accent is `cyan`;
  secondary detail is `muted` or `dim`.
- **Transcript and terminal scrollback:** conversation and tool output render
  in normal terminal flow. The terminal emulator owns scrollback, selection,
  copy behavior, and history navigation. Coco creates no mouse-reporting mode,
  in-app transcript viewport, scrollbar, or alternate scrollback model.
- **Editor border:** the editor remains a stable bottom region. Use
  `borderMuted` when idle, `borderAccent` for focus/selection, the configured
  thinking semantic for thinking level, and `bashMode` for `!` mode. Its border
  communicates mode without competing with input text.
- **Footer:** fixed beneath the editor conceptually, compact, and
  foreground-only. Footer metadata uses `dim` foreground text with semantic
  `warning` or `error` only for meaningful context thresholds. It must not set a
  green, opaque, or otherwise colored background.
- **Messages and tools:** user/custom messages use the semantic message tokens;
  assistant text inherits `text`. Tool title, output, diff, pending, success,
  and error surfaces use their semantic tokens. Tool details start collapsed;
  `Ctrl+O` is the expansion control. Do not emit hidden startup tool transcript.

## 6. Rendering, Input, And Motion

- A full redraw may clear the visible viewport, but must never erase or rewrite
  lines already saved by the terminal emulator's scrollback.
- Rendered ANSI lines reset their style independently. Components that cache
  themed strings rebuild them on `invalidate()` after a theme change.
- Keyboard is the only required interaction surface. Do not enable mouse
  reporting to implement transcript navigation or a viewport. Preserve normal
  terminal selection and wheel/keyboard scrollback behavior.
- This is a terminal UI: no decorative animation, timed visual effects, or
  nonessential motion. Streaming and status changes may update content only.

## 7. Accessibility And Compatibility

- Maintain high contrast using Solarized's intended dark (`base0` on `base03`)
  and light (`base00` on `base3`) pairs. Do not use `green` as footer/default
  text, and do not rely on hue alone for warning, error, success, selection, or
  thinking state.
- Every interactive action must remain discoverable by keyboard and preserve
  terminal and IME cursor behavior. Key hints must be plain text and concise.
- Netcatty is a first-class terminal constraint: startup stays quiet, the
  emulator retains native scrollback, and Coco avoids mouse protocol/reporting
  and any internal transcript viewport that would capture ordinary scrolling.
- Support truecolor where available and pi-tui's terminal color fallback where
  it is not. Never assume a specific terminal font, cell size, cursor shape, or
  hardware cursor visibility.

## 8. Accepted Debt And Delivery Boundaries

- Coco depends on upstream Bun/pi-tui generated artifacts. Targeted fixes may
  patch or wrap the shipped artifacts, but regeneration and upstream source
  ownership are outside this contract until a maintained source pipeline exists.
- Native terminal scrollback is intentionally delegated to the terminal emulator.
  Coco cannot normalize scrollback capacity, retention, selection behavior, or
  terminal-specific redraw quirks; it must only avoid defeating them.
- No web-only design primitives, mouse-driven transcript controls, graphical
  scrollbars, or custom font assumptions belong in this TUI contract.
