# ADR-006: Frame-Safe Localization Cache

```text
Status: proposed for 0.7.2
Date: 2026-08-24
Work items: post-0.7.1 maintenance (runtime performance)
```

## Context

The TUI resolves every visible localized string through `uiText()`, and a
single render frame localizes dozens of strings (status bar, keybinding
hints, menus, selector titles). The locale resolver read
`language.json` with `readFileSync` and parsed it on **every call**: about
30–80 µs of blocking, main-thread disk IO per string, or roughly 0.29 ms of
synchronous IO per render frame at forty strings. During token streaming the
render loop runs continuously, so this IO sat directly on the frame budget
and compounded with upstream render work.

A simulated realistic load (3,000 frames × 40 localized calls) measured
875 ms of pure resolver time for the old implementation.

## Decision

`uiLocale()` keeps a single-entry, self-invalidating cache: every call issues
one `statSync` and reuses the cached locale while `(path, size, mtimeMs)` is
unchanged; a metadata change re-reads and re-parses the file once. A missing
file falls back to the environment locale on each call (one failed stat,
no caching of the negative result), so a first `/language` write is picked
up immediately.

## Security Consequences

None. The cache holds only the locale string and the stat signature of the
user's own selection file; it cannot bypass integrity verification, and the
`/language` command's persistence semantics are unchanged (the selection
file remains the single source of truth, re-read on any metadata change).

## Operational Consequences

Measured: 100,000 `uiLocale()` calls in 480 ms (4.8 µs per call), and the
simulated frame load dropped from 0.29 ms to 0.10 ms of blocking IO per
frame (2.9×). Locale switches via `/language` remain immediate because the
write updates `mtimeMs`.

## Alternatives Rejected

- TTL cache: a `/language` switch could render with a stale locale for up to
  one TTL window.
- Event-based invalidation: couples the language service to the UI layer and
  misses external edits to `language.json`.
- Caching fully translated strings: invalidated by every user language-pack
  reload and grows unbounded with dynamic inputs.

## Tests

- test/coco-language.test.mjs — language service suite 6/6, including built-in English/Chinese switching, persistence, and malformed-pack fallback.
- Simulated frame load benchmark recorded in the journal: 3,000 frames × 40 calls, resolver blocking IO 0.29 ms to 0.10 ms per frame; 100k uiLocale calls in 480 ms.
