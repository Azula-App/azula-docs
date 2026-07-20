## Why

The smart-input / selection / scrollback / persistent-sessions terminal work
shipped (see `openspec/specs/terminal/design.md`). `FakeTerminalStream` dumps
its greeting at the emulator's default 80 cols before the window's resize
lands (resize doesn't reflow), which corrupts any width-sensitive replayed
content in mock-harness testing — this has already bitten one investigation.

## What Changes

- Make `FakeTerminalStream` delay its greeting until after the first
  `Resize` event, or alternatively feed a resize first, so width-sensitive
  mock content isn't laid out at the wrong column count.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — this is a test-harness fix, not a product requirement change)

## Impact

- `FakeTerminalStream` (mock terminal harness, `mock-support`).
- Any existing mock-harness tests/fixtures relying on the current
  (pre-resize) greeting timing should be checked for accidental dependence on
  the bug.
