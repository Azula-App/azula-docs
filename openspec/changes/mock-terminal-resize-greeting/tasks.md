## 1. Fix the ordering

- [ ] 1.1 Decide between "delay greeting until after first `Resize`" and
      "feed a resize first" (pick whichever is simpler against
      `FakeTerminalStream`'s current structure).
- [ ] 1.2 Implement the fix.

## 2. Verify

- [ ] 2.1 Confirm width-sensitive replayed mock content lays out correctly at
      the window's actual column count, not the default 80.
- [ ] 2.2 Check existing mock-harness tests/fixtures for accidental
      dependence on the old (buggy) timing and update as needed.
