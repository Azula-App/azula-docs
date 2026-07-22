## Why

URLs in terminal output are inert text today. `dispatchOsc` replies only to
OSC 11 — OSC 8 (the hyperlink escape) is swallowed with every other OSC — and
nothing linkifies bare `https://…` runs, so there is no `UriHandler` or
URL-opening path anywhere in the app. On desktop a user can at least select and
copy a URL; on mobile, selection is a long-press-then-drag through a
proportionally tiny grid, which makes "open the link claude just printed" the
kind of thing people give up on.

## What Changes

- Parse **OSC 8** (`OSC 8 ; params ; URI ST` … `OSC 8 ; ; ST`) and carry link
  identity per cell, so a program that emits real hyperlinks gets them.
- Detect **bare URLs** in rendered rows (`https://`, `http://`) and treat them
  as links too. This is the case that actually matters today — almost nothing
  in a normal shell session emits OSC 8, but claude's TUI and ordinary command
  output print bare URLs constantly.
- Make a link **tappable**, opening it through the platform browser, with the
  full target shown before anything opens.
- Render links distinguishably (underline + accent) so a user can tell what is
  tappable before tapping.
- Raise the 256-char `oscBuf` cap, which currently truncates any OSC payload
  longer than that — fine for OSC 11, not for a URI.

Explicitly **not** in scope: `mailto:`/`file:` and other non-HTTP schemes, and
link tapping while a mouse-tracking mode is active (the TUI owns taps then —
see `specs/terminal/design.md`, "Mouse reporting").

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `terminal`: adds hyperlink parsing (OSC 8), bare-URL detection, link
  rendering, and a tap-to-open interaction with an explicit confirmation step —
  all of which are new normative behavior for the terminal capability.

## Impact

- `TerminalEmulator` — OSC dispatch (OSC 8 state, `oscBuf` cap), and per-cell
  link identity alongside the existing `cp`/`fg`/`bg`/`flags` parallel arrays
  in `Row`.
- `Terminal.kt` — link styling in `GridRow`, and link hit-testing inside the
  existing `tapMod` tap handler, which today only clears a selection or bumps
  `reclaimFocusSignal`. Must not disturb the selection long-press or the
  mouse-reporting gesture that replaces `tapMod` when a mouse mode is on.
- New platform plumbing to open a URL (Compose's `LocalUriHandler` covers
  Android/iOS/desktop); nothing in the app opens URLs today.
- **Security-relevant**: terminal output arrives from a remote machine over
  iroh. A tappable link is remote-controlled content, so the target has to be
  visible and confirmed before it opens — this is the main reason the change
  needs a spec rather than being a rendering tweak.
