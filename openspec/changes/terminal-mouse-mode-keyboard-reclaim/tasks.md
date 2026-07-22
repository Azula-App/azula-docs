## 1. Affordance

- [ ] 1.1 Settle the label and toggle-vs-summon question from design.md's Open
      Questions before building.
- [ ] 1.2 Add the keycap to `TerminalKeysBar`, bumping the existing
      `reclaimFocusSignal` rather than introducing a second focus path.
- [ ] 1.3 Hoist `reclaimFocusSignal` far enough that the keys bar can bump it
      (it currently lives inside `LiveTerminalView`; check where the bar is
      composed relative to it).

## 2. Non-regression

- [ ] 2.1 Confirm the keycap consumes no pointer input over the grid, and that
      `AltScreen`'s mouse-reporting gesture is untouched.
- [ ] 2.2 Confirm `tapMod`'s existing behavior is unchanged when
      `mouseTrackingMode == OFF` (tap clears selection, else reclaims focus).
- [ ] 2.3 Desktop is unaffected — the jvm `RawTerminalInput` actual ignores
      `reclaimFocusSignal` and re-focuses itself.

## 3. Tests

- [ ] 3.1 UI test that the keycap is present and bumps focus-reclaim. Anchor
      matchers to a test tag or an ancestor, never a bare text match — see
      `specs/testing/design.md`, "Known flakes".
- [ ] 3.2 On-device check on a phone, with a real mouse-reporting TUI: dismiss
      the keyboard, tap the keycap, type, and confirm the text reaches the PTY —
      the full cycle, not just that the keyboard animates in. Then tap the grid
      and confirm the mouse report still fires.
