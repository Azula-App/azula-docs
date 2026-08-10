## 1. Pixel + Gboard (device)

Run 2026-08-09 on the physical **Pixel 10a** (`stallion`, 1080x2424 @420dpi,
Android with Gboard `com.google.android.inputmethod.latin` as default IME),
against **`app.azula.mock`** — the mock app deliberately, because its
`FakeTerminalStream` echoes keystrokes the way a real PTY does (including
`\b \b` for DEL), so what the wire received is visible on screen. Using the
mock also keeps the real `app.azula` install untouched, which matters: it
holds the one-shot pre-multi-device migration fixture.

**Caveat on all of these:** touches were synthesised via `adb input
tap/motionevent`, not a human finger. Gboard itself is real and its gesture /
suggestion / correction machinery genuinely ran — that is the part under test,
and the app's `InputDiff` translation of it is what these confirm. Anything
described as "feel" is explicitly *not* settled by this run.

- [x] 1.1 Swipe typing. — A multi-point gesture tracing t→h→e inserted the
      whole word `the` in one go, and the strip switched to gesture
      alternatives (`The / three / Three`). The swiped word arrives as a single
      homogeneous insert, which is what the design intends.
- [x] 1.2 Suggestion strip. — Present and live over the terminal buffer: after
      typing `teh` it offered `teh | the | tech`, i.e. suggestions computed from
      the visible line, not a stale field. Tapping a suggestion inserts
      correctly (see 1.3).
- [x] 1.3 Autocorrect fix-ups. — Tapping the `the` suggestion while the buffer
      held `teh` produced exactly `the ` on the wire: the longest-common-prefix
      diff emitted the backspace run + `he` suffix and the echo came back
      clean. Also confirmed the documented buffer reset — Enter started a fresh
      line and the next word was diffed from empty.
      **Worth knowing:** Gboard did *not* auto-apply the correction on space —
      `teh ` stayed `teh `. That is Gboard's own confidence/settings call, not
      azula's: the app can only translate a fix-up the IME actually performs.
      If auto-apply-on-space is wanted, it's a Gboard setting, not a code fix.
- [~] 1.4 Selection gesture feel. — *Mechanism* verified, *feel* not.
      Long-press then drag produced a cell-grid highlight that tracked the
      press and release columns accurately (` interrupted media fet`), and the
      `Copy | Cancel` bar appeared and dismissed correctly. Whether the
      long-press delay and drag inertia feel right needs a thumb.
- [ ] 1.5 Alt-screen scroll direction (matches `less`). — **Not done.** The
      mock shell never enters the alt screen, and it can't be coaxed there:
      `adb shell input text` does not decode escapes, so feeding
      `ESC [ ? 1 0 4 9 h` through the echo path just inserts literal
      characters. This one needs a real `azula terminal` session running a
      real alt-screen program (`less`/`vi`) against a mobile client.

## 2. iOS (device)

- [ ] 2.1 Repeat 1.1–1.5 on a real iOS device (previously only the
      iOS-simulator path was targeted).

## 3. Other keyboards (best-effort)

Blocked on availability rather than on effort: `ime list -s` on the Pixel
shows only Gboard and Google's voice IME. Samsung's keyboard ships with
Samsung hardware (none here), and SwiftKey / a CJK IME would each need
installing from Play and enabling in Settings — a device-owner decision, not
something to do unasked. Leaving these open rather than scoping them out,
since the Smart/Raw toggle (§4.2) is the standing mitigation either way.

- [ ] 3.1 Samsung keyboard pass, or explicitly scope out with a note.
- [ ] 3.2 SwiftKey pass, or explicitly scope out with a note.
- [ ] 3.3 At least one CJK IME pass, or explicitly scope out with a note.

## 4. Follow-up

- [x] 4.1 File bugs for anything that doesn't behave well. — Nothing to file
      from §1: swipe typing, the suggestion strip, the fix-up diff and the
      selection grid all behaved. The one surprise (Gboard not auto-applying
      `teh`→`the` on space) is the IME's own call and not an azula defect —
      see 1.3. The one real bug found in this session was on the *iOS* side
      and came out of `recovery-phrase-credential-fill`'s field, not the
      terminal — fixed there, not filed separately.
- [x] 4.2 Confirm the Smart/Raw input toggle remains a working escape hatch
      for any unresolved issue. — Settings → TERMINAL → "Smart input", on by
      default, described as "turn off if your keyboard misbehaves". Toggling
      it off visibly changes the IME contract — the suggestion strip
      disappears and Gboard falls back to its plain layout with a number row —
      and keystrokes still reach the terminal, i.e. the legacy one-key-per-event
      path is intact and reachable. Toggled back on afterwards; the device was
      left as found.
