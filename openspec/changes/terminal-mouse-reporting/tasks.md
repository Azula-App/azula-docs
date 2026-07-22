Items marked "(already shipped)" landed out-of-band in azula-app `de16ee3`, not
in this pass — verified against the code before building on them. See the status
note in `proposal.md`.

## 1. Mode tracking

- [x] 1.1 Track enabled state for `?1000`, `?1002`, `?1003`, `?1006` from the
      existing (currently ignored) DEC private mode parsing. *(already shipped:
      `TerminalEmulator.mouseTrackingMode` / `mouseSgrEncoding`, reset on RIS)*

## 2. Event encoding

- [x] 2.1 Encode click events per X10/normal (`?1000`) semantics. *(already
      shipped: `encodeMouseReport`)*
- [x] 2.2 Encode button-event tracking (`?1002`).
- [x] 2.3 Encode any-event (motion) tracking (`?1003`). Encoded identically to
      `?1002`; the button-less hover motion `?1003` adds on top is not
      reportable from the gestures available — recorded as a known gap in
      `specs/terminal/design.md`.
- [x] 2.4 Encode SGR extended coordinates (`?1006`) when combined with the
      above. *(already shipped)*

## 3. Input wiring

- [x] 3.1 Wire click/drag/wheel input events into the encoder when a mouse
      mode is active. Press/release + wheel were already shipped; this pass
      added drag motion (one report per grid cell crossed, `?1002`/`?1003`
      only), moved the release onto the drag's final cell instead of the press
      cell, and guaranteed a release even on a cancelled gesture.
- [x] 3.2 Ensure the existing alt-screen swipe→arrows scroll mapping still
      works when no mouse mode is active. *(gated on `mouseTrackingMode == OFF`;
      `./check -m terminal-real` and `-m shared` pass)*

## 4. Tests

- [x] 4.1 Unit tests for each mode's encoded byte sequence. Added the X10 motion
      vector, `reportsDragMotion` per mode, and `mouseCellAt` mapping/clamping
      alongside the existing SGR + X10 + mode-tracking tests.
      `./check -m terminal-api` → 102 passed.
- [ ] 4.2 Manual/e2e check against a real mouse-reporting TUI (e.g. claude's
      TUI) confirming clicks/wheel now register. **Handed back — needs a real
      device driving a real mouse-reporting TUI; not something the agent can
      verify.** Worth checking specifically: a click lands on the cell under the
      finger, a drag selects/scrolls in the TUI (not just the press point), and
      a desktop wheel notch scrolls the TUI rather than sending arrow keys.
