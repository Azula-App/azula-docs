## 1. Mode tracking

- [ ] 1.1 Track enabled state for `?1000`, `?1002`, `?1003`, `?1006` from the
      existing (currently ignored) DEC private mode parsing.

## 2. Event encoding

- [ ] 2.1 Encode click events per X10/normal (`?1000`) semantics.
- [ ] 2.2 Encode button-event tracking (`?1002`).
- [ ] 2.3 Encode any-event (motion) tracking (`?1003`).
- [ ] 2.4 Encode SGR extended coordinates (`?1006`) when combined with the
      above.

## 3. Input wiring

- [ ] 3.1 Wire click/drag/wheel input events into the encoder when a mouse
      mode is active.
- [ ] 3.2 Ensure the existing alt-screen swipe→arrows scroll mapping still
      works when no mouse mode is active.

## 4. Tests

- [ ] 4.1 Unit tests for each mode's encoded byte sequence.
- [ ] 4.2 Manual/e2e check against a real mouse-reporting TUI (e.g. claude's
      TUI) confirming clicks/wheel now register.
