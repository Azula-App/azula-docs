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
DECSC/DECRC, device queries (DA `CSI c`, DSR `CSI 6n`), tab stops, and
scrollback (5000-row cap, primary screen only — `SCROLLBACK_CAP`).

- **`Row`** — parallel `IntArray`/`LongArray`/`IntArray` for code point/fg/bg/
  flags, plus a `gen` counter so the renderer can skip unchanged rows.
  `ATTR_WIDE_LEAD`/`ATTR_WIDE_TRAIL` mark double-width glyphs (CJK/emoji, see
  `charWidth`).
- **`ScreenBuffer`** (private) — one screen's lines + cursor + scroll region +
  saved-cursor slot; the emulator holds two (`primary`, `alt`) plus an `active`
  pointer swapped by `switchScreen`.
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

## Prediction (`PredictionEngine`)

A simplified, conservative take on mosh's predictive echo (implements
`TerminalPredictor`, held by `TerminalEmulator.predictor`). On `onInput`,
printable chars, backspace, and left/right arrows are drawn immediately as
dim+underlined overlay cells (`PredictedCell`, merged into
`TermFrame.predictions` — the real grid is never touched); Enter, Tab, Ctrl-*,
up/down, Home/End flush and pause prediction until server output resyncs it.
Predictions are **disabled on the alternate screen** (TUIs echo
unpredictably). `onServerOutput` reconciles: any non-SGR escape (cursor move,
erase, alt-screen, OSC) flushes everything; otherwise each pending glyph is
confirmed on a matching real cell, the set flushes on a mismatch, and a glyph
is dropped after `timeoutMs` (1000ms default) if never echoed. Wrong guesses
can't corrupt the screen — worst case a glyph flashes then snaps to truth.

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
   `onPreviewKeyEvent` Box calls `keyEventToBytes`. Mobile:
   `MobileRawTerminalInput`'s hidden `BasicTextField` uses a one-char sentinel to
   detect inserts/deletes (a multi-char delta routes as a paste); a hardware
   keyboard's non-printables still flow through `keyEventToBytes(includePrintable
   = false)`.
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
6. **Grid → Compose.** `TerminalView` reads `emu.frame` (the subscription point)
   and renders `AltScreen` (fixed grid) or `PrimaryScreen` (a `LazyColumn` of
   scrollback + grid, auto-stuck to bottom unless scrolled up). `buildRow`
   coalesces same-style runs into `AnnotatedString` spans for SGR attrs, the
   block cursor, and predicted glyphs.
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
  queries, RIS reset, resize, and the full `PredictionEngine` matrix (confirm,
  mismatch flush, alt-screen suppression, Enter flush, disruptive-output flush,
  timeout flush).
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
