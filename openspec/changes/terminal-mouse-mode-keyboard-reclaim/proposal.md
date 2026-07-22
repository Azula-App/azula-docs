## Why

On mobile, the soft keyboard can only be re-summoned by a tap on the terminal's
outer Box, which bumps `reclaimFocusSignal` — the invisible `BasicTextField`
behind the grid provably never receives real touches itself (an on-device
finding recorded in `Terminal.kt`). That tap handler is disabled whenever a
mouse-tracking mode is active, because the remote program owns the pointer then.

The result: once a TUI turns mouse tracking on — which claude's TUI does — a
user who dismisses the keyboard has no way to bring it back. Every tap becomes
a mouse report. The only escapes are switching conversations or leaving and
re-entering the screen, neither of which is discoverable. This predates the
drag-motion work in `terminal-mouse-reporting`; it arrived with the original
press/release wiring and was never caught because that change's on-device task
was never run.

## What Changes

- Give mobile a way to reclaim keyboard focus that does not consume a tap on
  the grid, so it coexists with a TUI that owns the pointer.
- Keep every single-finger tap on the grid going to the mouse-report path
  unchanged — the clickable-element behavior that mouse reporting exists for
  must not regress.

The mechanism is deliberately left to design.md; the leading candidate is a
keycap in the existing `TerminalKeysBar` (alongside esc/tab/paste), which is
always visible and has no gesture overlap with the grid at all.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `terminal`: adds a requirement that keyboard focus remains reclaimable on
  mobile while a mouse-tracking mode is active — currently unreachable, and not
  covered by any existing requirement.

## Impact

- `Terminal.kt` — `tapMod` / `reclaimFocusSignal` plumbing, and whatever
  affordance design.md settles on.
- `TerminalKeysBar.kt` — likely gains a keycap.
- `RawTerminalInput` — the mobile focus path (`LaunchedEffect(reclaimFocusSignal)`)
  is the thing being triggered; the expect/actual split stays as is (the jvm
  actual re-focuses itself and ignores the signal, so this is mobile-only).
- No emulator or wire-format change.
