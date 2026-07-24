## MODIFIED Requirements

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

## ADDED Requirements

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
