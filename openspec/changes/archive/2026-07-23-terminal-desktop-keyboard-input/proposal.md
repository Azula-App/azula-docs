## Why

Three problems found driving a real mouse-reporting TUI from the desktop app,
all in the hardware-keyboard path:

1. **Ctrl-combinations don't reach the PTY.** `Ctrl-C` cannot interrupt a
   running program. This is a **conformance bug**, not a gap: the Key Encoding
   requirement already says Ctrl-combinations SHALL be sent "via bit-masking of
   the lowercased letter (plus the `Ctrl-[`, `\`, `]`, and Space specials)".
   `keyEventToBytes` reads `ev.utf16CodePoint` and tests `c.isLetter()`, but on
   AWT/Skiko a Ctrl-chord's code point is already the control character
   (`Ctrl-C` → ``), so `isLetter()` is false, the `when` falls through to
   `else -> null`, and nothing is sent. The same failure hits `Ctrl-[`/`\`/`]`,
   whose code points arrive as `0x1b`/`0x1c`/`0x1d` rather than the punctuation.
2. **Option/Alt injects composed characters.** There is no Alt handling at all,
   so `Option-f` falls through to the printable branch and sends `ƒ` into the
   shell instead of the `ESC f` (Meta) a terminal expects. Every Option chord on
   macOS drops a stray glyph into the PTY.
3. **The accessory key row is dead weight on desktop.** `showKeys` is
   `if (platformHasSoftKeyboard) rememberImeVisible() else true` — always-on for
   desktop by construction. With a hardware keyboard, esc/tab/paste/arrows are
   real keys, and the row costs vertical space the grid could use.

## What Changes

- Derive Ctrl-chords from `ev.key` rather than the composed code point, so
  `Ctrl-C` reaches the PTY as `0x03` on every platform. Restores the behavior
  the spec already requires.
- Send Alt/Option chords as ESC-prefixed (Meta) sequences — `Option-f` → `ESC f`
  — instead of the composed character.
- Hide the accessory key row on platforms with no soft keyboard.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `terminal`: extends the Key Encoding requirement with Alt/Meta handling, and
  adds a requirement that the accessory key row is soft-keyboard-only. The Ctrl
  fix needs no requirement change — it is already required and simply doesn't
  work.

## Impact

- `terminal-api/src/dev/azula/terminal/KeyBytes.kt` — `keyEventToBytes`, shared
  by every platform. The Ctrl and Alt changes affect mobile too; both are
  correct terminal behavior generally, not desktop special-casing.
- `shared/src/dev/azula/ui/Chat.kt` — the `showKeys` gate.
- **Test coverage gap this exposes.** `keyEventToBytes` has no test that
  constructs a real `KeyEvent`, which is why a broken `Ctrl-C` shipped. A
  `KeyEvent` can't be built in a common test (it wraps a platform type), so
  coverage has to live in `mock-support/test@jvm` — see
  `specs/testing/design.md` for why the JVM suite is the shared-UI test home.
