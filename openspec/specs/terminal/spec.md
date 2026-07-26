# Terminal Specification

## Purpose
Defines the observable behavior of azula's from-scratch VT-100/xterm
terminal emulator and its surrounding UI: grid/escape-sequence handling,
glyph-width accounting, speculative local echo, key encoding, terminal
identity announcement, and mobile smart input — so that real-world TUIs
(vi, top, htop, less, nano, and AI coding-agent CLIs) render and respond
correctly over a round-trip network connection.
## Requirements
### Requirement: VT-100/Xterm State Machine Coverage
The emulator SHALL implement a VT-100/xterm-compatible state machine
sufficient to run vi, top, htop, less, and nano, including cursor
addressing, alternate-screen switching (`?1047`/`?1049`), scroll regions
(DECSTBM), insert/delete character and line, full SGR (attributes plus
ANSI16/xterm256/truecolor foreground and background), DEC special graphics
(box drawing), save/restore cursor (DECSC/DECRC), and device queries (DA,
DSR). The parser SHALL persist its state across chunked reads so that an
escape sequence split across two input chunks resumes and parses correctly.

#### Scenario: Alternate screen toggling
- **WHEN** the host program requests the alternate screen (`CSI ?1049h`)
- **THEN** the emulator SHALL switch to a separate screen buffer
- **AND** the primary screen's content and cursor position SHALL be
  preserved for restoration when the alternate screen is exited

#### Scenario: Escape sequence split across reads
- **WHEN** an escape, CSI, or OSC sequence is split across two separate
  input chunks delivered to the parser
- **THEN** the parser SHALL resume parsing the sequence correctly on the
  second chunk rather than resetting or misinterpreting it

### Requirement: CSI u Marker Disambiguation
A bare `CSI u` (no numeric/character marker) SHALL be dispatched as the
classic restore-cursor operation. Marker-prefixed forms (`CSI < u`,
`CSI > Ps u`, `CSI = Ps ; Pu u`, `CSI ? u`) SHALL be recognized as Kitty
keyboard-protocol sequences and SHALL NOT trigger restore-cursor.

#### Scenario: Kitty protocol query does not move the cursor anchor
- **WHEN** a marker-prefixed `CSI u` form (e.g. `CSI < u`) is received
- **THEN** the emulator SHALL NOT invoke restore-cursor
- **AND** the row anchor used by subsequent relative-cursor redraws SHALL
  remain unaffected

### Requirement: Glyph Width Accounting
The emulator SHALL classify each code point as occupying zero, one, or two
display columns, and SHALL reserve grid cells accordingly: zero-width code
points SHALL consume no cell, and two-column glyphs SHALL occupy a
lead cell plus a paired trailing spacer cell. This classification SHALL
match real-terminal behavior (as verified against tmux / system `wcwidth`)
for glyph ranges that TUIs emit as status/spinner/prompt characters, so
that the emulator's column accounting never desyncs from what the host
program assumes it advanced.

#### Scenario: Single-width symbol/dingbat glyphs
- **WHEN** a glyph from the Misc Symbols & Dingbats (`0x2600–27BF`) or
  Geometric Shapes (`0x25A0–25FF`) ranges — including `❯` — is printed
- **THEN** the cursor SHALL advance by exactly one column, not two

#### Scenario: Zero-width combining marks and variation selectors
- **WHEN** a combining mark, variation selector (including VS16), or ZWJ is
  printed
- **THEN** it SHALL consume no grid cell
- **AND** it SHALL NOT overwrite the preceding cell's glyph

### Requirement: OSC 11 Background Color Reply
The emulator SHALL reply to an OSC 11 background-color query, whether
BEL- or ST-terminated, with the app's background color encoded as
`rgb:RRRR/GGGG/BBBB`, terminated to match the query's terminator
convention.

#### Scenario: Host queries background color to pick a theme
- **WHEN** the host sends an OSC 11 query (`CSI ] 11 ; ? BEL` or `… ST`)
- **THEN** the emulator SHALL reply with the background-color response
  before the host's query would time out

### Requirement: Speculative Local Echo (Prediction)
On local keyboard input, the engine SHALL render printable characters,
backspace, and left/right arrow immediately as overlay "predicted" cells
distinct from the authoritative grid. Enter, Tab, Ctrl-combinations,
Up/Down, Home, and End SHALL flush and pause prediction. Predictions SHALL
be reconciled against server output: a non-SGR escape (cursor move, erase,
alt-screen switch, OSC) SHALL flush all pending predictions; a matching
echoed glyph SHALL confirm and clear its prediction; a mismatch SHALL flush
the pending set; and a prediction unconfirmed after a timeout SHALL be
dropped. An incorrect prediction SHALL NOT corrupt the authoritative grid.

#### Scenario: Predicted character confirmed by server echo
- **WHEN** a predicted printable character is later echoed by the server on
  the matching cell
- **THEN** the predicted overlay SHALL be cleared, leaving the real grid
  cell as the displayed content

#### Scenario: Predicted character never echoed
- **WHEN** a predicted glyph is not echoed by the server within the
  prediction timeout
- **THEN** the prediction SHALL be dropped and the display SHALL revert to
  the authoritative grid content for that cell

#### Scenario: Disruptive server output arrives mid-prediction
- **WHEN** the server sends a non-SGR escape sequence (cursor move, erase,
  alt-screen switch, or OSC) while predictions are pending
- **THEN** all pending predictions SHALL be flushed immediately

### Requirement: Alternate-Screen Prediction Caution
While the alternate screen is active, the engine SHALL predict only
printable characters and backspace (never arrow keys), SHALL only begin
predicting after the server has been quiet for a minimum interval, SHALL
cap the number of concurrently pending predicted overlays, and SHALL flush
all pending predictions on any server output.

#### Scenario: TUI redraw burst suppresses prediction
- **WHEN** the server is actively emitting output on the alternate screen
  (a repaint burst)
- **THEN** no new predictions SHALL be created until the server has been
  quiet for the required interval

### Requirement: Key Encoding
Keyboard input SHALL be translated into the byte sequence the host program
expects: printable characters as their text bytes, arrow keys in either
normal or application-cursor-keys (DECCKM) form depending on the
emulator's current mode, and Ctrl-combinations via bit-masking of the
lowercased letter (plus the `Ctrl-[`, `\`, `]`, and Space specials). On the
mobile smart-input path, printable characters SHALL be excluded from this
translation, since the text field's diff already supplies them.

Ctrl-combinations SHALL be derived from the pressed key rather than from the
composed character the platform reports, so that a platform which reports a
Ctrl-chord as its control character still produces the correct byte.

Alt/Option combinations SHALL be sent as Meta — an `ESC` prefix followed by the
bytes the key would otherwise produce — and the platform's composed character
for that chord SHALL NOT be sent.

A key press that is only a modifier (Shift, Ctrl, Alt, Command/Super, or Caps
Lock) SHALL produce no output, even on a platform that reports a printable code
point for the modifier press itself. A chord holding the Command/Super
(application) modifier SHALL likewise produce no terminal bytes — it is an
application shortcut, not input.

Function keys F1–F12 SHALL be sent as their xterm escape sequences. A key whose
code point falls in a Unicode Private Use Area or is a non-character SHALL NOT be
forwarded as text: platforms encode function, fn, media and similar keys this
way, and forwarding them puts stray glyphs into the shell. Only genuine text
characters SHALL pass through the printable path.

#### Scenario: Application cursor-keys mode is active
- **WHEN** DECCKM is enabled and the user presses an arrow key
- **THEN** the application-mode escape sequence SHALL be sent, not the
  normal-mode sequence

#### Scenario: Ctrl-C interrupts a running program

- **WHEN** the user presses Ctrl-C on a hardware keyboard while a program is
  running in the terminal
- **THEN** byte `0x03` SHALL be sent to the remote program, regardless of what
  character the platform reports for that chord

#### Scenario: Option-f sends Meta, not a composed glyph

- **WHEN** the user presses Option-f (or any Alt chord) on a platform whose OS
  composes that chord into a character such as `ƒ`
- **THEN** `ESC` followed by `f` SHALL be sent, and the composed character SHALL
  NOT be sent

#### Scenario: A bare modifier press sends nothing

- **WHEN** the user presses and releases a modifier key on its own — Shift, or
  Command — on a platform that reports a printable code point for that press
- **THEN** no bytes SHALL be sent to the remote program

#### Scenario: A Command chord is not terminal input

- **WHEN** the user presses a Command/Super combination such as Command-A
- **THEN** no bytes SHALL be sent to the remote program, since Command is the
  application modifier

#### Scenario: A function key sends its escape sequence

- **WHEN** the user presses F1
- **THEN** the F1 escape sequence (`ESC O P`) SHALL be sent, not the private-use
  code point the platform reports for the key

#### Scenario: A private-use or non-character code point is not forwarded

- **WHEN** a key press reports a code point in a Private Use Area or a Unicode
  non-character — as the fn key, right Option, and media keys do on macOS
- **THEN** no bytes SHALL be sent, rather than a stray glyph

### Requirement: Accessory Key Row Is Soft-Keyboard Only

The terminal's accessory key row SHALL be shown only on platforms that use a
soft keyboard. Its purpose is to supply keys a soft keyboard lacks — Esc, Tab,
and the arrows — which a hardware keyboard already provides.

#### Scenario: Desktop shows no accessory row

- **WHEN** a live terminal is open on a platform with no soft keyboard
- **THEN** the accessory key row SHALL NOT be shown, and the space it occupied
  SHALL be available to the terminal grid

#### Scenario: Mobile is unaffected

- **WHEN** a live terminal is open on a platform with a soft keyboard
- **THEN** the accessory key row SHALL continue to follow the soft keyboard's
  visibility, as before

### Requirement: Mouse Event Reporting

The terminal SHALL encode and send click, drag, and wheel events to the remote
program whenever that program has enabled a mouse-tracking mode — `?1000`
(X10/normal), `?1002` (button-event), or `?1003` (any-event) — rather than
parsing those modes and discarding the input. Reports SHALL use `?1006` SGR
extended coordinates when the program has also enabled `?1006`, and the legacy
X10 byte encoding otherwise. Reporting is scoped to the alternate screen and to
the primary (left) button; drag-motion reports SHALL be sent only under `?1002`
and `?1003`, and at most one per grid cell the pointer crosses.

#### Scenario: A remote TUI enables button-event tracking and the user drags

- **WHEN** the remote program emits `CSI ?1002h` and `CSI ?1006h`, and the user
  presses inside the alternate screen, drags across several cells, and lifts
- **THEN** the terminal sends an SGR press report for the cell pressed, one SGR
  motion report for each further cell the pointer enters, and an SGR release
  report for the cell the pointer was over when it lifted

#### Scenario: Click tracking reports no motion

- **WHEN** the remote program has enabled only `?1000` and the user drags
  inside the alternate screen
- **THEN** the terminal sends the press and release reports but no motion
  reports, since `?1000` tracks button transitions only

#### Scenario: A cancelled gesture still releases the button

- **WHEN** a press has been reported and the gesture is cancelled rather than
  completed
- **THEN** the terminal still sends the matching release report, so the remote
  program is not left holding a button down

#### Scenario: No mouse mode is enabled

- **WHEN** no mouse-reporting mode has been enabled by the remote program
- **THEN** click/drag/wheel input continues to use the existing alt-screen
  swipe→arrows scrolling mapping and the selection gestures, unaffected by this
  requirement

### Requirement: Terminal Identity Announcement
The server SHALL send exactly one Profile frame per connection,
immediately after the connection is admitted and before any terminal
output is sent, carrying the host machine's name (its hostname, or a
fallback if empty) and the shell's launch working directory as a
description, both overridable via server startup flags.

#### Scenario: Connecting to a freshly served terminal
- **WHEN** a peer's first bi-directional stream to a served terminal is
  admitted
- **THEN** the server SHALL send a Profile frame with name and description
  before sending any terminal output frame

### Requirement: Mobile Smart-Input Diffing
The mobile IME input path SHALL maintain a stable text buffer that the
soft keyboard composes into, and SHALL translate each buffer change into a
longest-common-prefix diff, sent as a backspace-run followed by a
typed-suffix, so that autocorrect, swipe-typing, and keyboard suggestions
resolve into a correct byte stream without dropping characters. The buffer
SHALL reset on Enter, any non-printable key, focus loss, or a
server-signaled discontinuity (cursor row move, alt-screen toggle, or
screen clear).

#### Scenario: Autocorrect fixup is sent as a minimal diff
- **WHEN** the IME autocorrects "teh" to "the" in the buffer
- **THEN** the change SHALL be sent as a two-character backspace-run
  followed by "he", not as a resend of the full buffer

#### Scenario: Pasted or multiline content is treated as a paste
- **WHEN** an inserted chunk contains a newline or carriage return, or
  exceeds 24 characters
- **THEN** it SHALL be sent using bracketed-paste semantics rather than as
  typed input
- **AND** the input buffer SHALL reset

### Requirement: Selection Uses Absolute Line Addressing
Text selection SHALL be addressed using a monotonically increasing
total-scrolled-rows counter rather than viewport-relative row indices, so
that a selection remains anchored to its content while new output streams
past. A selection SHALL be invalidated on alternate-screen toggle, screen
clear, conversation switch, or eviction of a selected row past the
scrollback cap.

#### Scenario: New output streams in while a selection is active
- **WHEN** output continues to arrive and push rows into scrollback while a
  selection is active
- **THEN** the selection SHALL continue to reference the same absolute rows
  and SHALL remain visually correct

#### Scenario: Alternate-screen toggle clears the selection
- **WHEN** the terminal switches between the primary and alternate screen
  while a selection is active
- **THEN** the selection SHALL be cleared

### Requirement: Terminal settings SHALL persist via a dedicated SettingsStore

Terminal-related settings (starting with `terminalSmartInput`) SHALL persist
through a dedicated `SettingsStore`, not by piggybacking on `ProfileBook` (the
personas blob).

#### Scenario: terminalSmartInput persists independently of personas

- **WHEN** a user toggles `terminalSmartInput` and relaunches the app
- **THEN** the value is written to and read from `SettingsStore`, and the
  `ProfileBook.terminalSmartInput` field no longer drives the UI — it is
  retained only as the migration source (see the upgrade scenario below) and
  is preserved verbatim across persona saves so an older app version installed
  over this one still finds its setting

#### Scenario: Upgrading from a pre-SettingsStore install preserves the setting

- **WHEN** an existing install with `terminalSmartInput` stored in its
  personas blob launches after upgrading past this change
- **THEN** the value is migrated into `SettingsStore` on first launch and the
  user's prior choice is preserved

### Requirement: Run Wrapper With Failure Handoff
`azula run [--handoff on-error|always|never] -- <command…>` SHALL execute the command in a PTY it captures (mirroring output to the real stdout/stderr so CI logs are unchanged) while feeding the persistent-session ring buffer. On the handoff trigger (nonzero exit for `on-error`; startup for `always`), it SHALL keep the session's captured output, spawn `$SHELL` in the same session with the same working directory and environment, and print a connect block (the session's invite URL and QR when no machine key exists; a session identifier plus a relayed attach notification when one does). The process SHALL stay alive until the handoff session ends or a `--hold` timeout (default 60 minutes) expires, then exit with the original command's exit code.

#### Scenario: CI failure hands off with scrollback
- **WHEN** a wrapped CI command exits nonzero with `--handoff on-error`
- **THEN** the job log shows the connect block, and a client that attaches sees the failed command's output followed by a live shell prompt in the same cwd

#### Scenario: Success passes through untouched
- **WHEN** the wrapped command exits zero under `--handoff on-error`
- **THEN** `azula run` exits immediately with code 0 and no connect block is printed

#### Scenario: Exit code is preserved after handoff
- **WHEN** the held session ends (or `--hold` expires) after a failure handoff
- **THEN** `azula run` exits with the wrapped command's original nonzero exit code

### Requirement: Named Detached Terminal Sessions
`azula terminal new [--cmd <command>] [--name <name>]` SHALL spawn a detached background process hosting one persistent terminal session under its own session identity, recording a runtime state file; `azula terminal list` SHALL enumerate such sessions with name, pid, and connection state; `azula terminal kill <name>` SHALL terminate one. Any number of sessions SHALL be able to run concurrently.

#### Scenario: Spin up several remote-controlled programs
- **WHEN** the user runs `azula terminal new --cmd "claude" --name work` and again with `--name experiments`
- **THEN** two detached sessions run concurrently, each attachable from the phone as its own conversation, and `azula terminal list` shows both

### Requirement: CLI Terminal Attach Client
`azula terminal attach <name|url>` SHALL attach the invoking terminal to a hosted session as a raw passthrough client (PTY bytes to the local terminal, local keystrokes back, resize propagation), so a session started elsewhere — a CI handoff or a detached session — can be continued from a shell as well as from the phone.

#### Scenario: Continue a CI session from a laptop shell
- **WHEN** a user runs `azula terminal attach <invite-url>` with the URL from a CI handoff block
- **THEN** their terminal shows the replayed scrollback and a live prompt in the CI environment

### Requirement: Invite-Authorized Session Attach
A hosted session SHALL admit an attach from the session's creating peer or from a client redeeming that session's own invite; `term_attach` from any other peer SHALL receive a fresh session rather than the held one, preserving today's owner-binding for all other cases.

#### Scenario: Invite redemption grants the held session
- **WHEN** a client dials with the session's invite and sends `term_attach` for it
- **THEN** it is attached to the held session with replay, even though it is not the creating peer

#### Scenario: Unrelated peer still gets a fresh session
- **WHEN** a peer without the invite and without owner status sends `term_attach` naming the held session
- **THEN** it silently receives a fresh session, as before this change

