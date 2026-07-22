## 1. Measure before fixing

- [x] 1.1 Diagnosis confirmed, and the test approach changed as a result. A
      first attempt built a `java.awt.event.KeyEvent` and passed it to
      `keyEventToBytes`, which threw `ClassCastException`: this Compose
      (1.10.3) wraps an internal `InternalKeyEvent`, not the AWT event, so a
      `KeyEvent` **can't be constructed off-platform at all** — not just
      awkwardly. That's a stronger form of the same root cause and dictated the
      fix: extract the pure decision (`encodeKey(key, codePoint, ctrl, alt, …)`)
      out of `keyEventToBytes`, and test *that* from common code. The vectors in
      `KeyEncodingTest` pass a hostile `codePoint` (0x03 for Ctrl-C, `ƒ` for
      Option-f) to pin that it is ignored.

## 2. Ctrl (conformance fix — already required by the spec)

- [x] 2.1 Ctrl-chords resolve from `key` via a `BASE_CHARS` map, not the
      composed code point.
- [x] 2.2 `Ctrl-[`, `Ctrl-\`, `Ctrl-]`, `Ctrl-Space` (and `Ctrl-@`) handled off
      `key`.
- [x] 2.3 `codePoint` fallback kept for a platform that reports the base letter,
      and for an already-masked control byte on a key not enumerated.

## 3. Alt / Meta

- [x] 3.1 Alt wraps the unmodified result in an `ESC` prefix; named keys compose
      (`Alt-Left` → `ESC` + arrow, DECCKM-aware).
- [x] 3.2 The composed glyph is suppressed: the Alt branch recurses on
      `altBaseCodePoint(key, codePoint)`, which takes the base char from `key`
      and only falls back to `codePoint` when it's plain ASCII — so `Option-f`
      is `ESC f`, not `ESC ƒ`. (This was a real second bug: the first cut
      recursed on the raw code point and the test caught `ESC ƒ`.)
- [x] 3.3 Ordering verified by `ctrlAltCombinesAsEscapeThenControlByte`:
      `Ctrl-Alt-C` → `ESC` + `0x03`.

## 4. Accessory key row

- [x] 4.1 `showKeys = platformHasSoftKeyboard && rememberImeVisible()` in
      `Chat.kt` — the row is gone on desktop.
- [x] 4.2 **Finding, as anticipated: removing the row would have deleted
      desktop's only paste.** The Paste key was the sole caller of
      `terminalPaste` on desktop, and there was no keyboard paste. Added Cmd-V
      (and Ctrl-Shift-V) handling in `RawTerminalInput.jvm.kt`, routed through
      `terminalPaste` so bracketed paste is preserved. Deliberately not plain
      Ctrl-V — a terminal owes that to the program as SYN.
- [ ] 4.3 Bottom-edge look without the row — needs eyes on the running app
      (part of 6.1).

## 5. Tests

- [x] 5.1 `terminal-api/test/KeyEncodingTest.kt` — Ctrl-C (both reported
      shapes), Ctrl-A/-D/-Z, the four specials, Option-f, `Alt-Left`,
      `Ctrl-Alt-C`, and the unhandled-Alt case. In **common** test code, so it
      runs on all three platforms, not just jvm.
- [x] 5.2 `mobileSmartInputExclusionsStillHold` pins that `includePrintable` /
      `includeBackspace = false` still suppress those, and that a Ctrl chord
      still resolves on that path.
- [x] 5.3 `./check -m terminal-api` (113 tests, was 102) and `-m shared` pass;
      `-m mock-support` pending (running).

## 6. Device check — handed back

- [ ] 6.1 On desktop against a real TUI: `Ctrl-C` interrupts, `Option-f`/`-b`
      move by word in a readline prompt rather than printing `ƒ`/`∫`, no
      accessory row is shown, and the grid's bottom edge still looks finished.
      Needs a rebuilt app on the running `azula serve` — handed back.
- [ ] 6.2 On mobile: the accessory row still appears and behaves as before.
