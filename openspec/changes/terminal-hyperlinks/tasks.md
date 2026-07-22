## 1. Emulator — link identity

- [ ] 1.1 Raise the `oscBuf` 256-char cap to a bounded larger value (a few KB)
      and drop overlong payloads instead of dispatching them truncated.
- [ ] 1.2 Parse OSC 8 in `dispatchOsc`: `8;params;URI` opens a link,
      `8;;` closes it. Reject any scheme other than `http`/`https`.
- [ ] 1.3 Add a `link: IntArray` to `Row` (0 = none) alongside `cp`/`fg`/`bg`/
      `flags`, plus a per-emulator id→URI table. Carry it through `setCell`,
      `Row.resize`, scroll, and scrollback push exactly like `flags`.
- [ ] 1.4 Expose the resolved URI for a cell on `TermFrame` so the UI can
      hit-test without reaching into emulator internals.

## 2. Bare-URL detection

- [ ] 2.1 Implement `http(s)://` run detection over a row's text, memoized per
      row version. Pure function in `terminal-api` — no Compose types.
- [ ] 2.2 Decide and pin trailing-punctuation boundaries (`)`, `.`, `,`, `]`).
      Err toward under-matching; see design.md.
- [ ] 2.3 Join wrapped rows before scanning, so a URL split across a narrow
      viewport still resolves (see design.md, Open Questions — settle this
      before building 3.x).

## 3. UI — rendering and tap

- [ ] 3.1 Style link cells in `GridRow` (underline + accent), suppressed while
      `mouseTrackingMode != OFF`.
- [ ] 3.2 Hit-test a tap to a link inside the existing `tapMod` handler; fall
      through to the current clear-selection / reclaim-focus behavior on a miss.
- [ ] 3.3 Confirmation sheet showing the full target, with open + cancel (and
      "copy link" if 2.x settles that way), wired to `LocalUriHandler`.
- [ ] 3.4 Verify the long-press word-selection gesture and the mouse-reporting
      gesture are both unaffected.

## 4. Tests

- [ ] 4.1 Emulator unit tests: OSC 8 open/close, link identity across a wrap, a
      resize reflow, and a push into scrollback; non-HTTP scheme rejected;
      overlong OSC payload discarded.
- [ ] 4.2 Bare-URL detection vectors, including the trailing-punctuation
      boundaries from 2.2 and a wrapped URL.
- [ ] 4.3 A test that a link is inert while a mouse-tracking mode is active.
- [ ] 4.4 On-device check: tap a link in claude's output on a phone, confirm
      the sheet shows the right target and the browser opens. Anchor any Compose
      UI test matcher to a test tag or ancestor, never a bare text match — see
      `specs/testing/design.md`, "Known flakes".
