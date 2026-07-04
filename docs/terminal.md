# The terminal — a VT-100/xterm emulator over iroh

A remote-shell ("SSH-like") feature: `azula-cli` spawns a real PTY shell and
streams its output to the app over iroh; the app runs a from-scratch terminal
emulator to turn that byte stream into a rendered grid, with speculative local
echo so typing feels instant despite the round trip.

## Where it lives

- **`azula-app/terminal-api/src/dev/azula/terminal/`** — the pure engine, no
  app/platform deps beyond `core` + Compose runtime/ui: `TerminalEmulator.kt`
  (parser + grid + `Row`/`TermFrame`), `PredictionEngine.kt` (speculative local
  echo), `KeyBytes.kt` (`TermSeq` + `keyEventToBytes`), `TerminalSession.kt` (the
  interface the UI depends on). Tests: `terminal-api/test/TerminalEmulatorTest.kt`.
- **`azula-app/terminal-real/src/dev/azula/ui/`** — Compose UI: `Terminal.kt`
  (`TerminalView`, grid rendering), `RawTerminalInput.kt` (`expect`/actual
  keystroke capture), `TerminalKeysBar.kt` (Esc/Tab/Ctrl/arrow accessory row).
- **`azula-cli/src/term.rs`** — the server: PTY-per-stream bridge on ALPN
  `azula/term/0`.
- **`azula-app/network-api/.../Protocol.kt`** (`Frame` sealed class) and
  **`azula-cli/src/proto.rs`** (mirrored Rust `Frame` enum) — the shared wire
  types (`Input`, `Resize`, `Term`).
- Wired in via **`shared/src/dev/azula/state/AzulaState.kt`** (implements
  `TerminalSession`) and **`ConnectService.kt`** (dials, dispatches `Frame.Term`).

## The emulator (`TerminalEmulator`)

A VT-100/xterm state machine covering enough to run vi/top/htop/less/nano:
cursor addressing, the alternate screen (`?1047`/`?1049`), scroll regions
(DECSTBM), insert/delete char/line, full SGR (attrs + ANSI16/xterm256/truecolor
fg+bg, `;`- and `:`-separated forms), DEC special graphics (box drawing),
DECSC/DECRC, device queries (DA `CSI c`, DSR `CSI 6n`), an OSC 11 background-
color reply (see below), tab stops, and scrollback (5000-row cap, primary
screen only — `SCROLLBACK_CAP`).

- **`Row`** — parallel `IntArray`/`LongArray`/`IntArray` for code point/fg/bg/
  flags, plus a `gen` counter so the renderer can skip unchanged rows.
  `ATTR_WIDE_LEAD`/`ATTR_WIDE_TRAIL` mark double-width glyphs (CJK/emoji, see
  `charWidth` below); zero-width glyphs (combining marks, variation selectors)
  consume no cell at all.
- **`ScreenBuffer`** (private) — one screen's lines + cursor + scroll region +
  saved-cursor slot; the emulator holds two (`primary`, `alt`) plus an `active`
  pointer swapped by `switchScreen`.
- **CSI `u` is overloaded** — bare `CSI u` is the classic ANSI.SYS-style
  restore-cursor (paired with `s`/save), but `CSI < u` / `CSI > Ps u` /
  `CSI = Ps ; Pu u` / `CSI ? u` (marker-prefixed) are the Kitty keyboard
  protocol (pop/push/set/query keyboard flags) — same final byte, unrelated
  meaning. `csiDispatch` only calls `restoreCursor()` when there's no marker;
  the Kitty forms are parsed and ignored (protocol not modeled). Dispatching
  all of them to `restoreCursor()` was a real bug: claude's CLI sends `CSI < u`
  once right after painting the trust-confirmation dialog, which snapped the
  cursor back to wherever `DECSC` last saved (often row 0) — corrupting the
  row anchor for every subsequent relative-cursor redraw and making
  arrow-key-driven menu redraws land option text near the top of the screen
  instead of at the menu rows.
- **`TermFrame`** — the immutable render snapshot (cols/rows, scrollback, grid,
  cursor, altScreen, prediction overlays). `TerminalEmulator.frame` is a
  `mutableStateOf<TermFrame>` — the **only** Compose-observable state; the
  parser mutates the live grid directly, then `publish()` rebuilds/republishes
  `frame` once per `feed()`/`resize()`/`clear()` so the UI never sees a
  mid-mutation grid.
- The parser (`GROUND`/`ESCAPE`/`CSI`/`OSC`/`STRING`) is **persistent across
  `feed()` calls** — an escape split across two `Frame.Term` chunks (real, since
  PTY reads are chunked) resumes correctly (`escapeSequenceSplitAcrossFeeds`).
- `resize(cols, rows)` is top-anchored: preserves overlapping content, clamps
  the cursor, resets tab stops — used both for viewport-size changes and
  server-acked size.

### Glyph width (`charWidth`)

A compact, hand-commented wcwidth-ish table (`TerminalEmulator.kt`, private
companion) — not a full Unicode wcwidth dump, just the ranges real TUIs (claude
included) actually emit:

- **0 columns** (`isZeroWidth`): combining marks (`0x0300–036F` and friends),
  variation selectors incl. VS16 `0xFE0F` (emoji presentation), ZWJ `0x200D`,
  and other zero-width/default-ignorable points (`0x200B`, `0xFEFF`). `printChar`
  drops these outright (no grapheme-clustering onto the previous cell — just
  don't reserve or clobber a column) rather than modeling real combining
  behavior.
- **2 columns**: East-Asian wide/fullwidth + CJK/Hangul/Yi, emoji/symbols
  `0x1F300–1FAFF`, and regional-indicator flag letters `0x1F1E6–1F1FF`.
- **1 column**: everything else, ASCII included — **notably** Misc Symbols &
  Dingbats `0x2600–27BF` (claude's `✻ ✢ ✳ ✓ ➜`-style spinner/status glyphs, and
  critically `❯`, claude's prompt chevron) and the Geometric Shapes block
  `0x25A0–25FF` (`●` bullets). A prior version of this table marked both
  ranges double-width to paper over a *visual* glyph-rendering mismatch, but
  real terminals (verified against tmux, which defers to the system's
  `wcwidth`) advance the cursor only one column for these — the box-drawing
  block `0x2500–257F` was already correctly exempted for the same reason
  (JetBrains Mono renders it natively at 1 cell). Treating them as wide
  desyncs the emulator's column accounting from what claude itself assumes:
  any line claude pads to the full terminal width (e.g. a re-echoed `❯ <cmd>`
  prompt row inside a temporarily narrowed DECSTBM scroll region — the pattern
  used for arrow-key history recall and the slash-command menu) would fill one
  column short on a real terminal but exactly hit the last column here,
  firing deferred autowrap a character early and inserting a phantom row that
  cascades into every subsequent absolute-cursor-addressed line in that
  redraw — this is what made those redraws "render in unexpected places."
  The genuine visual mismatch (fallback-font glyphs rendering wider than one
  cell) is handled by the renderer instead, which never assumes cumulative
  column advance from earlier glyphs (see the "Grid → Compose" section below).

`printChar` (`~653`) reserves columns consistently with this table — `w == 0`
returns before touching the grid at all; `w == 2` sets `ATTR_WIDE_LEAD` on the
glyph's cell and `ATTR_WIDE_TRAIL` (a skipped spacer) on the next — so the
renderer's column math and the emulator's column math can never disagree.

### OSC 11 — background-color query

`dispatchOsc()` answers a `CSI ] 11 ; ? BEL` or `… ST` query (used by TUIs,
claude included, to detect light/dark background) with `ESC]11;rgb:RRRR/GGGG/
BBBB ESC\`, mirroring `AzulaColors.bg1`'s RGB as a plain constant (terminal-api
has no dependency on the `theme` module, so the color is duplicated, not
imported — same pattern as the ANSI16 palette). All other OSC (title `0`/`1`,
cwd `7`) stays swallowed, as before. Answering keeps claude's theme-detection
handshake from timing out instead of guessing/defaulting.

## Prediction (`PredictionEngine`)

A simplified, conservative take on mosh's predictive echo (implements
`TerminalPredictor`, held by `TerminalEmulator.predictor`). On `onInput`,
printable chars, backspace, and left/right arrows are drawn immediately as
dim+underlined overlay cells (`PredictedCell`, merged into
`TermFrame.predictions` — the real grid is never touched); Enter, Tab, Ctrl-*,
up/down, Home/End flush and pause prediction until server output resyncs it.
Homogeneous multi-char strings (all-printables or all-backspaces — what the
smart-input diff emits) are predicted char-by-char; mixed strings still pause.
`onServerOutput` reconciles: any non-SGR escape (cursor move,
erase, alt-screen, OSC) flushes everything; otherwise each pending glyph is
confirmed on a matching real cell, the set flushes on a mismatch, and a glyph
is dropped after `timeoutMs` (1000ms default) if never echoed. Wrong guesses
can't corrupt the screen — worst case a glyph flashes then snaps to truth.

On the **alternate screen** (claude/vi), prediction runs in an extra-cautious
mode instead of being disabled: printables and backspace only (never arrows —
TUIs remap them), only when the server has been quiet for 200 ms
(`altQuietMs` — a repaint storm suppresses prediction entirely), capped at 8
pending overlays, flushed instantly on **any** server output (the TUI's own
echo is the truth), with a 400 ms drop backstop and a flush on every
primary↔alt flip. At a quiescent full-screen prompt (claude waiting for
input — the common case) typing echoes locally instead of waiting a full
round-trip; during redraw bursts the engine predicts nothing.

## Key encoding (`KeyBytes.kt`)

`TermSeq` holds control-sequence constants (arrows in normal and
application-cursor-keys/DECCKM form, `TAB`, `ENTER`, `BACKSPACE` = DEL 0x7f,
`DELETE`, `HOME`/`END`, `PAGE_UP`/`DOWN`, `CTRL_C`). `keyEventToBytes` turns a
Compose `KeyEvent` into PTY bytes (Ctrl-combos via bit-masking the lowercased
letter, plus `Ctrl-[`/`\`/`]`/Space specials). `includePrintable = false` is used
on the mobile soft-keyboard path, where the hidden text field already supplies
printables (see `RawTerminalInput.kt`).

## Data flow

1. **Keystroke → bytes.** Desktop: `RawTerminalInput`'s focusable
   `onPreviewKeyEvent` Box calls `keyEventToBytes`. Mobile: the smart-input
   buffer (see the next section) diffs the hidden `BasicTextField`'s stable
   text into backspace-runs + typed suffixes; a hardware keyboard's
   non-printables still flow through `keyEventToBytes(includePrintable =
   false)`, with hardware Backspace deliberately left unconsumed so it flows
   through the field/diff path instead of double-sending.
2. **App → predictor + wire.** `TerminalSession.terminalRaw` (in `AzulaState.kt`)
   feeds bytes to `termScreen.predictor?.onInput` on `terminalDispatcher` (local
   echo) and sends `Frame.Input(bytes)` over the conversation's `P2pStream` on
   `Alpns.TERM`. `terminalPaste` skips prediction and wraps in
   `ESC[200~ … ESC[201~` if `bracketedPaste` is on. `terminalResize` sends
   `Frame.Resize(cols, rows)` and locally calls `termScreen.resize` (deduped so
   unchanged sizes don't spam the wire).
3. **Wire.** Newline-delimited JSON, one `Frame` per line, tagged on `"type"` —
   Kotlin `Frame` (`classDiscriminator = "type"`) mirrors the Rust `Frame` enum
   in `proto.rs` (`read_frame`/`write_frame`) field-for-field.
4. **Server PTY bridge (`term.rs`).** `TermHandler` accepts on `TERM_ALPN`; each
   bi stream the client opens is an **independent terminal session**, so one
   iroh connection can multiplex many terminals (`term_two_sessions_over_one_
   connection`). Spawns `$SHELL -l` (or `/bin/sh`) via `portable-pty`,
   `TERM=xterm-256color`. Two `spawn_blocking` threads bridge the blocking
   PTY reader/writer to the async iroh stream over `mpsc` channels;
   `drain_valid_utf8` holds back an incomplete trailing UTF-8 sequence across
   4096-byte reads. PTY output becomes `Frame::Term { line }`; incoming
   `Frame::Input`/`Frame::Resize` write the PTY / call `master.resize`.
5. **Server → app → grid.** `ConnectService.applyFrame`'s `Frame.Term` arm calls
   `cs.termScreen.feed(line)` on `terminalDispatcher`; `feed()` parses, calls
   `predictor?.onServerOutput` to reconcile, and publishes a new `TermFrame`.
6. **Grid → Compose — a hard monospace grid.** `TerminalView` reads `emu.frame`
   (the subscription point) and renders `AltScreen` (fixed grid) or
   `PrimaryScreen` (a `LazyColumn` of scrollback + grid, auto-stuck to bottom
   unless scrolled up). Each row is a `Canvas`, not a single flowed `Text`:
   `buildRowSegments` walks the row and, for each cell, resolves fg/bg/attrs
   (`cellAttrs`) and either extends a same-style run of `isMonoSafe` cells
   (plain ASCII/Latin + DEC box-drawing — glyphs JetBrains Mono renders
   natively at exactly `cellW`) or isolates it as its own segment (wide, CJK,
   symbol/emoji, predicted, or the cursor cell). Every segment is pre-measured
   with `TextMeasurer` and painted at `x = startCol * cellW` — **never**
   accumulated from the glyphs before it — so a mis-widthed fallback-font glyph
   can smear at most its own coalesced run, never shift anything in a later run
   or row. The cursor is a filled rect at its column (`2 * cellW` if the
   underlying cell is a wide lead) with the glyph redrawn on top in `TERM_BG`,
   replacing the old span-based cursor overlay. This is what keeps borders
   column-aligned and the cursor on its true cell even when claude's spinner/
   status glyphs (`✻ ● ✓ ➜`) fall back to a non-monospace font.
7. Device queries (DA/DSR) go the other way: `onResponse` is wired in `wireConv`
   to send a `Frame.Input` back on the current stream — server-directed, never
   predicted.

## Terminal identity — host name + pwd

`azula serve` announces the terminal it hosts so the app can label the
conversation. Right after a connection is admitted (post-invite-gate, for known
and invite-verified peers alike) and before any `Frame::Term` output, the
server writes one `Frame::Profile { name, description }` on the send half
(`term.rs`) — **per connection** (only the first bi stream, since the app keys a
conversation by peer node id, so later streams reuse the same row).
Defaults: `name` = the machine hostname (`gethostname`, trailing `.local`
stripped, `"azula"` if empty); `description` = the shell's launch working
directory (`current_dir()` at PTY spawn). Both are overridable with `azula serve
--name <s> --description <s>`. The app needs no terminal-specific code:
`receiveLoop` already routes any inbound `Frame.Profile` to
`FrameDispatcher.applyProfile`, which names the conversation from `name` and
shows `description` as the row's sub-line (the TERMINAL kind and `›_` glyph are
preserved). The pwd is the *launch* directory, sent once — it does not follow
`cd` (live cwd would need OSC 7 shell integration or PTY-cwd polling; not done).

## Mobile view — status, keyboard, and the key row

- **Status dot reflects real connection state.** `statusDotColor(online,
  enabled, kind)` (`ui/Common.kt`) is green only when `online && enabled`,
  muted-gray otherwise (LLM keeps its pink brand dot). Previously the resting
  color for PEER/TERMINAL was the same green as online, so a disconnected
  terminal looked connected. Live latency (`rttMs`, polled for all kinds incl.
  terminals) renders next to it while online. The desktop and mobile lists both
  render through the single `ConversationList` composable (`ui/Sidebar.kt`).
- **The key row follows the soft keyboard.** `TerminalKeysBar` (the
  Esc/Tab/^C/^D/^L/arrow accessory row) shows only while the soft keyboard is
  up: `Chat.kt` gates it on `if (platformHasSoftKeyboard) rememberImeVisible()
  else true`. Mobile hides it when the keyboard is dismissed; desktop (no soft
  keyboard) always shows it for a live terminal. `platformHasSoftKeyboard` is a
  **target** property (expect/actual in `Platform.kt`), not the width-based
  Desktop/Mobile chrome split — a narrow JVM window still has a hardware
  keyboard and no IME.
- **Tap re-summons the keyboard.** A live terminal owns its own focus: `Chat.kt`
  withholds the global tap-to-clear-focus for it, and `MobileRawTerminalInput`
  has a `detectTapGestures { fr.requestFocus(); keyboard?.show() }`, so tapping
  the surface brings the keyboard (and the key row) back after a dismiss.
- **Scroll-to-tail without jitter.** `PrimaryScreen`'s auto-scroll snaps to the
  bottom only when the user isn't actively scrolling AND is already pinned to
  the last row (`!listState.isScrollInProgress && atBottom`), so a new emulator
  frame (or an IME resize) no longer yanks the list mid-drag. Rows use a fixed
  integer-pixel height so IME-driven resizes don't nudge them.

## Smart input — the IME buffer (mobile)

`MobileRawTerminalInput` (`terminal-real/.../RawTerminalInput.kt`) keeps a
**stable text buffer** the soft keyboard composes into: field value =
1-NBSP sentinel + the line typed since the last reset, `TextFieldValue` stored
verbatim (composition/selection intact), `KeyboardType.Text` +
`autoCorrect = true` + no auto-capitalization. This is what enables **swipe
typing, autocorrect, and the suggestion strip** (Android + iOS QuickType) —
and what fixed fast-typing character drops (the old model reset the field to
the sentinel after *every* keystroke, racing the IME).

- Each `onValueChange` is translated by a longest-common-prefix diff
  (`terminal-api/.../InputDiff.kt`, pure + unit-tested) into a backspace-run
  call and a typed-suffix call through `terminalRaw` — two *homogeneous* sends
  so prediction handles each. Handles autocorrect fix-ups (`teh`→`the` = 2
  backspaces + `he`), swiped words, and tapped suggestions.
- An inserted chunk containing `\n`/`\r` or longer than 24 chars is treated as
  a clipboard paste → `terminalPaste` (bracketed-paste semantics) + buffer
  reset. `TerminalKeysBar` also has an explicit Paste key.
- The buffer resets to the sentinel on: Enter, any non-printable key
  (arrows/Tab/Ctrl-*/Esc — the cursor-at-end-of-line assumption dies),
  focus loss / conversation switch, and any **server discontinuity** —
  `TermFrame.discontinuityEpoch`, bumped by `feed()` when the cursor *row*
  moved, the alt screen toggled, or the screen cleared (plain same-row echo
  doesn't bump it).
- **Honest limitation:** suggestions come from the stock keyboard's own
  language model over the visible buffer — it suggests words, not flags or
  paths; shell-aware completion would need a custom keyboard.
- **Fallback:** Settings → "Terminal input: Smart / Raw (legacy)"
  (`terminalSmartInput`, default on) switches back to the old
  one-key-per-event sentinel implementation (`LegacyMobileRawTerminalInput`,
  kept verbatim) — insurance against IME variance (Samsung keyboard,
  SwiftKey, CJK IMEs are untested).

## Selection & copy

Rows are Canvas-drawn, so Compose text selection can't apply; selection is a
cell-grid model instead (`terminal-api/.../TermSelection.kt`):

- **Absolute line addressing.** `TerminalEmulator.totalScrolled` counts rows
  ever pushed to scrollback (monotonic, never decremented on cap eviction);
  scrollback row *i* = `totalScrolled − scrollback.size + i`, grid row *r* =
  `totalScrolled + r`. A selection stays glued to its content while output
  streams past.
- **Gestures** (on the terminal surface): long-press selects the word under
  the finger (haptic); drag-after-long-press extends; plain tap clears (and
  skips the keyboard focus-reclaim for that tap). Highlight is a translucent
  rect over-painted after the glyph segments (never part of the segment
  cache key — no re-measure churn while dragging). A floating **Copy ·
  Cancel** chip appears while a selection is active.
- **Extraction**: `TermFrame.textInSelection` (first/last rows column-clipped
  without splitting wide glyphs), `screenText()`, `allText()`; the header
  overflow menu gains **Copy screen** / **Copy all** for terminal
  conversations. Clipboard via `LocalClipboardManager`.
- **Invalidation**: cleared on alt-screen toggle, `clear()`, conversation
  switch, or when an endpoint is evicted past the 5000-row scrollback cap.

## Scrollback & alt-screen scrolling

- Primary screen: the LazyColumn scrolls the 5000-row scrollback; a **↓
  jump-to-bottom chip** appears when detached from the tail (auto-pin
  behavior unchanged).
- Alternate screen (claude/vi — no scrollback by design): vertical swipe
  (mobile) and mouse wheel (desktop, expect/actual
  `AltScreenWheelScroll`) translate to arrow keys — one arrow per row of
  travel, 3 per wheel notch, rate-capped, honoring DECCKM
  (`applicationCursorKeys`), direction chosen to match `less`. Scroll-arrows
  are suppressed while a selection is active.

## Persistent sessions — attach, detach, replay

`azula serve` keeps a terminal's PTY alive when the app disconnects and
replays buffered output on re-attach (tmux-like). **Opt-in by the client**:
persistence only engages when the app's first term-specific frame is
`term_attach` — old apps get the exact legacy PTY-dies-with-stream behavior.

Wire (newline-JSON frames, mirrored in `proto.rs`/`Protocol.kt`):

```json
{"type":"term_attach","session":null}          // client → server; null/absent = new session
{"type":"term_session","session":"<id>","resumed":false}   // server → client
{"type":"term_exit","session":"<id>","code":0} // shell exited
```

- **Server** (`term.rs`): a process-wide session registry (id → PTY handle +
  256 KiB output ring buffer, newline-boundary eviction), split into
  `session_core` (one task per PTY, feeds the ring + the current attachment,
  survives stream loss) and per-stream attachments. Re-attach: owner-bound
  (only the creating peer's node id may resume; anyone else silently gets a
  fresh session), replies `resumed: true`, replays the ring as ordinary
  `term` frames, then goes live; a `resize` arriving just after resume gets
  the SIGWINCH nudge so full-screen TUIs repaint. Detached sessions are
  reaped after `--session-ttl <minutes>` (default 60; `0` disables
  persistence). Ctrl-C shutdown kills all sessions (parked PTY reader
  threads would otherwise hang runtime teardown).
- **App**: `ConversationState.termSessionId` (persisted in `ConversationDto`)
  is sent in `term_attach` on every (re)wire; `term_session` stores it,
  `term_exit` clears it. Terminals with a live session id are now eligible
  for **auto-reconnect** (the old blanket terminal exclusion is conditional);
  the chat bar distinguishes "disconnected — reconnecting…" (re-attachable)
  from "session ended" + **New shell** (which clears the id so the server
  mints a fresh session).
- **Compat matrix**: old app → new CLI: no `term_attach` ⇒ exact legacy
  behavior, no zombie shells. New app → old CLI: `term_attach` is ignored
  (`Frame::Unknown`), no `term_session` ever arrives ⇒ app behaves exactly
  as before (nothing waits on it). The accept gate (invitations) always runs
  before attach is interpreted.

## Threading — the serial dispatcher (sharp edge)

All `TerminalEmulator` mutation (`feed`/`resize`/`clear`, `predictor.onInput`) is
confined to one dispatcher: `internal val terminalDispatcher =
Dispatchers.Default.limitedParallelism(1)` (`AzulaState.kt:72`). Three
independent triggers touch the same emulator — the background iroh receive
loop, the UI-thread resize callback, and the keystroke path — and none may race
the grid. **Any new mutation call site must use
`scope.launch(terminalDispatcher) { … }`**, not a bare `scope.launch` or direct
call. The UI needs no dispatcher: it only reads the published `frame` snapshot,
safe from any thread since it's immutable once built.

## Tests

- **`terminal-api/test/TerminalEmulatorTest.kt`** — emulator in isolation:
  printing/wrap/CRLF, split-escape resumption, SGR (basic/256/truecolor, both
  separators), cursor addressing/erase/insert-delete, scroll regions,
  scrollback + cap, alt-screen isolation, mode flags, DEC box drawing, device
  queries, RIS reset, resize, glyph width (ASCII/CJK wide; dingbat/
  geometric-shape/box-drawing single-width; VS16 + combining-mark zero-width;
  a LEAD/TRAIL layout assertion; and a regression pinning claude's `❯` prompt
  chevron to single-width inside a DECSTBM-scrolled redraw, the real bug
  behind arrow-key-triggered redraws landing on the wrong row), an OSC 11
  query (both BEL- and ST-terminated) replying with the background color, and
  the full `PredictionEngine` matrix (confirm, mismatch flush, alt-screen
  suppression, Enter flush, disruptive-output flush, timeout flush). Run (all
  targets, not just jvm —
  the emulator is pure Kotlin/Multiplatform): `./kotlin test -m terminal-api`.
- **`azula-cli/src/term.rs`** `#[cfg(test)]` — real in-process iroh integration
  tests: `term_handler_end_to_end` (two local endpoints, `echo <marker>`,
  asserts the marker returns as `Frame::Term` — proves PTY-spawn → bridge →
  iroh-stream → frame end to end) and `term_two_sessions_over_one_connection`
  (two bi streams, one connection, independent PTYs). Run with `cargo test`
  from `azula-cli/`.
- **`azula-app/e2e/android.yaml`** (Maestro, against `android-app-mock`) — drives
  the real terminal UI over `FakeTransport`'s `FakeTerminalStream`
  (`mock-support/src/dev/azula/mock/FakeTransport.kt`), which auto-surfaces one
  inbound TERM conversation and echoes typed lines. Opens the conversation,
  waits for `"mock shell.*"`, types `ls`, asserts the echo — screenshots in
  `e2e/screenshots/android-terminal*.png`.

## Verifying changes

- Engine/prediction: `./kotlin check -m terminal-api` (or `-m shared` for the
  full dependent graph) from `azula-app/`.
- Server bridge: `cargo test` from `azula-cli/` (runs `term::tests::*`).
- UI/end-to-end: run `azula-app/e2e/android.yaml` against `android-app-mock` —
  needs no live peer since `FakeTransport` fakes both network and shell.
