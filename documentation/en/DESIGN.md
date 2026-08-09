# CoCo Terminal UI Design Contract

This document binds all CoCo interactive-TUI fixes and extensions. CoCo uses the
existing pi-tui component model: components render width-bounded ANSI lines,
receive theme semantics, and invalidate cached themed output on a theme change.

## 1. Product Intent And Layout

- CoCo is a quiet, compact general AI assistant with strong coding and terminal
  capabilities, not a transcript viewer.
- Startup opens directly to the editor with a compact Responsive Startup
  Wordmark, editor, and footer chrome. It does not print onboarding, help,
  recent activity, or explanatory transcript into the terminal unless verbose.
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
  height, and fallback behavior. CoCo sets no web font, custom font size, or
  graphical type scale.
- Use normal terminal text for content, ANSI bold only for labels that improve
  scanability, and semantic foreground color for hierarchy. Do not use color as
  the sole carrier of state.
- Preserve the component system's compact one-cell horizontal padding and
  width-bounded line rendering. Truncate or wrap with ANSI-safe helpers; no line
  may exceed the supplied terminal width.

## 5. Component Contracts

- **Responsive Startup Wordmark:** the header's named identity primitive. It is
  static, ASCII-only, original to CoCo, and has at most four rows. It must not
  reproduce another product's letterforms, compact mark, or composition.
  `render(width)` selects a four-row original CoCo wordmark only when the
  supplied render width includes its one-cell component padding; otherwise it
  selects the single-line `CoCo` fallback. At zero width it renders no rows; at
  other tiny widths it uses ANSI-safe `truncateToWidth` and omits padding that
  does not fit, so no rendered row exceeds `width`. The primary mark uses
  `theme.bold(theme.fg("accent", ...))`; a dim version label is included only
  when it fits. The primitive uses no startup I/O, timers, or animation,
  rebuilds themed output on `invalidate()`, and implements `setExpanded()` so
  extension-header replacement/restoration and `Ctrl+O` contracts remain
  intact. Default startup renders this wordmark only; verbose startup renders
  the same wordmark plus existing compact or expanded instructions. Accent is
  `cyan` and the optional version is `dim`.
- **Transcript and terminal scrollback:** conversation and tool output render
  in normal terminal flow. The terminal emulator owns scrollback, selection,
  copy behavior, and history navigation. CoCo creates no mouse-reporting mode,
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
  emulator retains native scrollback, and CoCo avoids mouse protocol/reporting
  and any internal transcript viewport that would capture ordinary scrolling.
- Support truecolor where available and pi-tui's terminal color fallback where
  it is not. Never assume a specific terminal font, cell size, cursor shape, or
  hardware cursor visibility.

## 8. Accepted Debt And Delivery Boundaries

- CoCo depends on upstream Bun/pi-tui generated artifacts. Targeted fixes may
  patch or wrap the shipped artifacts, but regeneration and upstream source
  ownership are outside this contract until a maintained source pipeline exists.
- Native terminal scrollback is intentionally delegated to the terminal emulator.
  CoCo cannot normalize scrollback capacity, retention, selection behavior, or
  terminal-specific redraw quirks; it must only avoid defeating them.
- No web-only design primitives, mouse-driven transcript controls, graphical
  scrollbars, or custom font assumptions belong in this TUI contract.

---

# CoCo Web Site Design Contract Extension

This extension governs the static GitHub Pages install site only. It preserves
the TUI's quiet Solarized terminal character while adapting it for a responsive,
keyboard-first document surface. It does not alter the TUI contract above.

## W1. Site Intent And Composition

- The page is an installation document first and a marketing surface second:
  identity, install command, defaults, compatibility, and source link must be
  visible without scrolling on a typical desktop viewport.
- The hero is one dimensional terminal window, not a collection of SaaS cards.
  Low-contrast Solarized field depth and an offset shadow establish atmosphere;
  content remains sparse and functional.
- The layout has one centered reading column, a terminal hero, an information
  strip, and an uninstall disclosure. No testimonials, pricing, decorative
  illustrations, or feature-card grid is permitted.

## W2. Web Tokens

Colors, spacing, typography, and reusable form values in site CSS must use named
custom properties. Raw canonical Solarized values may appear only in root token
definitions; one-off responsive geometry may remain local to its media rule.

| Token group | Tokens | Contract |
|---|---|---|
| Color | `--color-base03`, `--color-base02`, `--color-base01`, `--color-base00`, `--color-base0`, `--color-base1`, `--color-base3`, `--color-cyan`, `--color-blue`, `--color-green`, `--color-yellow`, `--color-red` | Canonical Solarized values from section 2. |
| Semantic color | `--page-bg`, `--surface`, `--surface-raised`, `--text`, `--muted`, `--line`, `--accent`, `--link`, `--success`, `--warning`, `--danger` | Site code consumes semantic aliases, not palette values. |
| Space | `--space-1` through `--space-10` | Four-pixel baseline: 0.25rem, 0.5rem, 0.75rem, 1rem, 1.5rem, 2rem, 3rem, 4rem, 6rem, 8rem. |
| Type | `--font-mono`, `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`, `--leading-tight`, `--leading-normal` | Inherited system monospace stack; a restrained, fluid scale using `clamp()` only in token definitions. |
| Form | `--radius-sm`, `--radius-md`, `--border-width`, `--shadow-terminal`, `--shadow-atmosphere`, `--duration-fast`, `--duration-base`, `--focus-ring` | Square-leaning terminal geometry, layered depth, and short opacity/transform-only transitions. |

## W3. Site Components And States

- **Masthead:** compact wordmark and external repository link. The link has an
  explicit accessible name and is never icon-only.
- **Terminal hero:** a labelled `section` containing a title bar, output, and
  command row. The install command is selectable text; the adjacent copy button
  remains usable with keyboard or pointer.
- **Copy button:** idle label is `Copy`; after a successful copy it becomes
  `Copied` and exposes the state with a non-color label. Failure uses `Copy
  failed`; each result is also announced through a polite live region. Focus,
  hover, active, and disabled states must be visually distinct.
- **Specification strip:** semantic definition list, with model, thinking mode,
  and platform compatibility. It is a bordered continuation of the terminal
  grammar, not a card grid.
- **Uninstall disclosure:** a native `details` element. It exposes its summary
  via keyboard and provides a second copy action for the uninstall command.

## W4. Responsive, Motion, And Accessibility Constraints

- Desktop uses a subtly offset terminal frame; narrow layouts remove only the
  offset depth and retain every command and control. The layout is readable at
  375px, two-column metadata begins at 768px, and the masthead/hero comfortably
  occupy the centered frame at 1280px.
- All interactive elements have a high-contrast `:focus-visible` ring using
  `--focus-ring`; keyboard focus is never removed. Color is supplementary to
  text labels and borders for state.
- Use semantic landmarks, one `h1`, visible text for every command, meaningful
  button labels, and a polite `aria-live` status. Copy behavior is progressive:
  commands remain readable and selectable without JavaScript.
- Motion is limited to button feedback using opacity and transform.
  `prefers-reduced-motion: reduce` disables transition and animation.
- No external fonts, images, analytics, dependencies, or network assets are
  permitted. The page must remain complete with JavaScript unavailable.
