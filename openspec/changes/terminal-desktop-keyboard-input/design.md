## Context

`keyEventToBytes` (`KeyBytes.kt`) is the single key-translation function for
every platform. It switches on `ev.key` for the named keys (arrows, Enter, Tab,
Esc, Backspace, Delete, Home/End, PageUp/Down), then falls back to
`ev.utf16CodePoint` for everything else:

```kotlin
val cp = ev.utf16CodePoint
if (ev.isCtrlPressed) {
    val c = cp.toChar()
    if (c.isLetter()) return ((c.lowercaseChar().code) and 0x1f).toChar().toString()
    return when (c) { '[' -> …; '\\' -> …; ']' -> …; ' ', '@' -> …; else -> null }
}
if (includePrintable && cp >= 0x20 && cp != 0x7f) return codePointToString(cp)
```

The desktop actual (`RawTerminalInput.jvm.kt`) is a focusable Box with
`onPreviewKeyEvent` calling straight into this — no IME, no text field, so
whatever this function returns is exactly what reaches the PTY. Mobile goes
through the smart-input diff with `includePrintable = false`.

`utf16CodePoint` maps to AWT's `keyChar`, which for a Ctrl-chord is the control
character itself rather than the base letter. That makes both branches above
fail: `''.isLetter()` is false, and `''` matches none of the
punctuation cases.

## Goals / Non-Goals

**Goals:**

- `Ctrl-C` (and every other Ctrl-chord the spec names) reaches the PTY.
- Option/Alt chords behave as Meta, not as character composition.
- No accessory key row where there's a hardware keyboard.
- Regression coverage that would have caught a broken `Ctrl-C`.

**Non-Goals:**

- The Kitty keyboard protocol, or `modifyOtherKeys`. The emulator already
  parses and ignores the Kitty forms; nothing here starts modelling them.
- Shift-modified reporting, function keys F1-F12, or keypad application mode.
- Re-encoding what the mobile smart-input path already supplies.
- A user-facing setting for Option-as-Meta vs. Option-as-compose. Terminals
  commonly offer one; not worth it until someone wants the compose behavior.

## Decisions

**Derive Ctrl-chords from `ev.key`, not the code point.** `Key.A`…`Key.Z` are
stable across platforms and unaffected by what the OS composed. Map to `1`…`26`,
and handle `Key.LeftBracket`/`Backslash`/`RightBracket`/`Spacebar` for the
specials the spec names. Alternative considered: accept an already-control code
point (`cp in 0x01..0x1a`) and pass it through — rejected as the primary
mechanism because it encodes an AWT-specific quirk into shared multiplatform
code and silently does nothing on a platform that reports the base letter
instead. Keeping a pass-through as a *fallback* is cheap insurance, though, and
costs one branch.

**Alt is a prefix, not a lookup.** `Option-f` sends `ESC` then whatever the key
would otherwise have produced. This composes correctly with the existing named
keys too (`Alt-Left` → `ESC` + the arrow sequence), which is what readline and
every TUI expect. Implement it as a wrapper around the existing result rather
than a parallel table, so the two can't drift.

The ordering matters: Ctrl is checked first and Alt wraps it, so `Ctrl-Alt-C`
becomes `ESC` + `0x03`, matching xterm.

**Suppress the composed character when Alt is held.** This is the actual bug
being fixed — on macOS the OS has *already* composed `ƒ` by the time the event
arrives, so the printable branch must not run for an Alt chord, or the glyph
gets sent alongside (or instead of) the Meta sequence.

**Gate the key row on `platformHasSoftKeyboard` alone.** The current expression
already branches on it and then hardcodes `true` for desktop; flipping that to
`false` is the whole change. The row exists because a soft keyboard has no esc,
tab, or arrows — that rationale simply doesn't apply to a hardware keyboard.

**Test through real `KeyEvent`s in `mock-support/test@jvm`.** A `KeyEvent`
wraps a platform type and can't be constructed in a common test, which is
exactly why this function's Ctrl handling was never covered and why a broken
`Ctrl-C` shipped. The JVM suite is already the shared-UI test home per
`specs/testing/design.md`, so the vectors go there — building an
`java.awt.event.KeyEvent` and wrapping it — rather than adding a new
platform-test target.

## Risks / Trade-offs

- **The AWT-keyChar diagnosis is inferred from the code, not yet measured.** If
  `utf16CodePoint` actually reports the base letter on this toolchain, the real
  cause is elsewhere (event never reaching `onPreviewKeyEvent`, focus, or the
  OS intercepting the chord) → the `KeyEvent` test is written first and its
  assertion pins whatever the true value is; the fix follows the measurement.
- **Alt-as-Meta breaks character composition for anyone who wants `Option-e e`
  → `é` in a terminal** → that's the standard trade every terminal makes, and
  the Non-Goals record that a setting can follow if anyone asks.
- **Changing shared `keyEventToBytes` affects Android/iOS** → mobile goes
  through the smart-input diff with `includePrintable = false`, so the printable
  branch this touches is already inert there; the Ctrl path is a pure fix on
  every platform.
- **Removing the key row removes the only Paste affordance on desktop** →
  desktop has Cmd-V through the system, but confirm paste still works before
  calling this done, since the row's Paste key routes through
  `terminalPaste` (bracketed-paste aware) rather than raw keystrokes.

## Open Questions

- Should `Ctrl-Alt-<key>` and `Alt-<arrow>` be pinned by test vectors in this
  change, or is `Ctrl` + plain `Alt-<letter>` enough to start?
- Does removing the row on desktop leave the terminal's bottom edge visually
  unfinished? It currently doubles as chrome separating the grid from the window
  edge.
