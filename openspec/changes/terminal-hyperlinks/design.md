## Context

The emulator's parser (`TerminalEmulator.kt`) has an `OSC` state that buffers
into `oscBuf` until BEL or ST, then `dispatchOsc` matches exactly one payload
(`11;?`) and drops the rest. `oscBuf` stops appending past **256 chars** — a
silent truncation that's harmless for a color query and wrong for a URI.

A screen cell is four parallel arrays in `Row`: `cp: IntArray` (code point),
`fg`/`bg: LongArray`, `flags: IntArray` (the `ATTR_*` bitmask — bits 0-8 used,
so 9+ are free). There is no per-cell "which link is this" slot, and no place to
hang a URI string.

On the UI side, `GridRow` renders a row's cells with `drawText`, `tapMod` on the
outer Box handles a plain tap (clear selection, else bump `reclaimFocusSignal`),
and long-press starts a word selection. When `mouseTrackingMode != OFF`, `tapMod`
is disabled entirely and `AltScreen`'s mouse-reporting gesture owns every tap.
Nothing in azula-app opens a URL today — no `UriHandler`, no `ACTION_VIEW`.

Terminal output crosses an iroh stream from a remote machine. Whatever is on
screen — including any URI in an OSC 8 payload — is attacker-controllable if
that machine is compromised, and OSC 8 specifically lets the *displayed text*
differ from the *target*, which is the classic phishing shape.

## Goals / Non-Goals

**Goals:**

- OSC 8 hyperlinks parsed and carried per cell, including across a line wrap
  and into scrollback.
- Bare `http(s)://` runs in rendered text treated as links — the case that
  actually occurs in practice.
- A link is visually distinguishable before it's tapped, and tappable on
  mobile without going through selection.
- The user sees the real target before anything opens.

**Non-Goals:**

- Non-HTTP schemes (`mailto:`, `file:`, `ssh:`). HTTP(S) only; anything else
  stays inert text.
- Link interaction while a mouse-tracking mode is active — the TUI owns taps
  then, and stealing them would break the clickable elements that mouse
  reporting exists to support.
- Hover affordances / tooltips (no hover on mobile; desktop can follow later).
- Rewriting selection or copy to be link-aware.

## Decisions

**Per-cell link id + a side table, not a URI per cell.** Add a fifth parallel
array to `Row` (`link: IntArray`, 0 = none) holding an id into a per-emulator
table of URIs. A URI string per cell would balloon an 80×24 grid plus 5000 rows
of scrollback; an int per cell costs the same as `flags`. Alternative considered:
a free `flags` bit meaning "linked" plus a lookup by screen position — rejected
because it can't survive scrollback eviction or a resize reflow, and can't
distinguish two adjacent different links.

**Bare-URL detection at render time, not parse time.** Scan a row for URL runs
when it's rendered/hit-tested rather than mutating cells during `feed`. Parse-time
detection would have to cope with a URL arriving one byte at a time across
`feed` calls and being overwritten in place by a redraw — the emulator's hot
path, and the exact class of bug the split-escape tests exist for. Render-time
scanning is idempotent and costs nothing on rows that never get tapped if the
scan is memoized per row version. Trade-off: a URL split across a wrapped line
needs the renderer to join wrapped rows before scanning; OSC 8 links get this
for free since identity is per cell.

**Confirmation sheet, not a silent open.** A tap opens a sheet showing the full
target (scheme and host emphasized) with open/cancel, rather than handing the
URI straight to `LocalUriHandler`. This is the whole reason this needs a spec:
the content is remote-controlled, and OSC 8 lets link text lie about its
destination. For a bare URL the text *is* the target, so the sheet is
confirmation; for OSC 8 it is the only place the user learns where they're
actually going. Alternative considered: silent open for bare URLs, sheet only
for OSC 8 — rejected as an inconsistent rule that's hard to reason about and
gives an attacker a reason to prefer one encoding.

**Links are inert while mouse tracking is on.** No hit-testing, no link
styling change, no tap interception. `mouseTrackingMode != OFF` already means
"the program owns the pointer"; a link tap that swallowed a TUI click would be
a regression in the more important interaction.

**Raise the `oscBuf` cap to a bounded larger value** (a few KB) rather than
removing it. The cap is a memory guard against a malformed stream that never
sends a terminator; it just needs to clear a realistic URI. Truncated payloads
must be dropped, not dispatched half-parsed.

## Risks / Trade-offs

- **Phishing via OSC 8 text/target mismatch** → the confirmation sheet shows
  the real target, and non-HTTP schemes never become links at all.
- **A resize reflow or scrollback eviction desyncs link ids from the side
  table** → ids are allocated per emulator and never reused within a session;
  a stale id resolves to nothing and renders as plain text rather than as the
  wrong link. `Row.resize` must carry the `link` array like it carries `flags`.
- **Bare-URL scanning on every row of a 5000-row scrollback** → memoize per row
  version and scan only on hit-test/render of visible rows, never eagerly over
  scrollback.
- **Greedy URL boundaries** (trailing `)`, `.`, `,` swallowed into the target)
  → pin boundary behavior with test vectors; err toward under-matching, since a
  short link is recoverable by selection and a wrong one is not.
- **A tap that lands on a link but was meant to reclaim focus** → keep the
  focus-reclaim bump as the fallback when the tap doesn't hit a link, so the
  existing behavior is unchanged everywhere except on link cells.

## Open Questions

- Does bare-URL detection need to join wrapped rows in v1, or is
  "links that fit on one row" acceptable to start? Wrapped URLs are common in a
  narrow phone viewport, which argues for doing it up front.
- Should the confirmation sheet offer "copy link" alongside "open"? Cheap, and
  it covers the case where the user wants the URL on the desktop instead.
- Desktop hover styling and a real cursor change: same change or a follow-up?
