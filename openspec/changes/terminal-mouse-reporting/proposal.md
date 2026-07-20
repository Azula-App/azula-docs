## Why

The smart-input / selection / scrollback / persistent-sessions terminal work
shipped (see `openspec/specs/terminal/design.md`). Mouse reporting
(`?1000`/`?1002`/`?1003`/`?1006`) is still parsed-and-ignored: claude's
click/wheel interactions inside its TUI do nothing. This was deferred from the
rendering fix; the alt-screen swipe→arrows mapping covers scrolling only, not
click/drag/wheel reporting to the remote program.

## What Changes

- Implement mouse reporting for `?1000` (X10/normal click tracking), `?1002`
  (button-event tracking), `?1003` (any-event tracking), and `?1006` (SGR
  extended coordinates) in the terminal emulator, so click/wheel interactions
  are actually sent to the remote program (e.g. claude's TUI) instead of being
  silently parsed-and-dropped.
- Wire click/drag/wheel input events into the mouse-report encoder when one of
  these modes is active.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `terminal`: mouse-reporting escape sequences (`?1000`/`?1002`/`?1003`/
  `?1006`) go from parsed-and-ignored to actually reporting click/drag/wheel
  events to the remote program.

## Impact

- Terminal emulator escape-sequence handling (`TerminalEmulator`, see
  `openspec/specs/terminal/design.md`).
- Input event plumbing that currently only handles the alt-screen
  swipe→arrows scrolling mapping.
