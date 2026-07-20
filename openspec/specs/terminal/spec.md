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

#### Scenario: Application cursor-keys mode is active
- **WHEN** DECCKM is enabled and the user presses an arrow key
- **THEN** the application-mode escape sequence SHALL be sent, not the
  normal-mode sequence

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
