## Why

The smart-input / selection / scrollback / persistent-sessions terminal work
shipped (see `openspec/specs/terminal/design.md`). Swipe typing, the
suggestion strip, autocorrect fix-ups, selection gesture feel, and the
alt-screen scroll *direction* (chosen to match `less`, one constant to flip)
are verified by unit tests and builds but not yet by hands on a phone (the
device was fingerprint-locked at the time). Only Pixel+Gboard and
iOS-simulator paths were targeted; Samsung keyboard, SwiftKey, and CJK IMEs
are untested. The Smart/Raw input setting is the escape hatch if any of these
don't work well.

## What Changes

- Run an on-device IME pass covering: swipe typing, the suggestion strip,
  autocorrect fix-ups, selection gesture feel, and the alt-screen scroll
  direction.
- Expand coverage beyond Pixel+Gboard and iOS-simulator: at minimum note
  results for Samsung keyboard, SwiftKey, and at least one CJK IME, or
  explicitly scope them out if unavailable.
- File follow-up bugs for anything that doesn't behave well; the Smart/Raw
  input toggle remains the user-facing escape hatch in the meantime.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — verification pass; file follow-up changes if it surfaces real bugs)

## Impact

- Terminal smart-input (mobile) — see `openspec/specs/terminal/design.md`
  ("Smart input — the IME buffer (mobile)").
- Selection & copy gesture handling.
- Alt-screen scroll direction constant (matches `less`; one constant to flip
  if the pass concludes it should change).
