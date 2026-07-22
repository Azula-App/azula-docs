## 1. Fix the ordering

- [x] 1.1 Decide between "delay greeting until after first `Resize`" and
      "feed a resize first" (pick whichever is simpler against
      `FakeTerminalStream`'s current structure). Chose delaying the greeting:
      `FakeTerminalStream` holds it behind a `greeted` latch tripped by the
      first `Frame.Resize` seen in `sendLine`.
- [x] 1.2 Implement the fix.

## 2. Verify

- [x] 2.1 Confirm width-sensitive replayed mock content lays out correctly at
      the window's actual column count, not the default 80. Covered by
      `FakeTransportTest.terminalStreamHoldsBackTheGreetingUntilTheFirstResize`.
- [x] 2.2 Check existing mock-harness tests/fixtures for accidental
      dependence on the old (buggy) timing and update as needed.
