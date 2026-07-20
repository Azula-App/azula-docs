## ADDED Requirements

### Requirement: The terminal SHALL support mouse-reporting escape sequences

The terminal emulator SHALL report click, drag, and wheel events to the
remote program when the program has enabled `?1000` (X10/normal click
tracking), `?1002` (button-event tracking), `?1003` (any-event tracking), or
`?1006` (SGR extended coordinates), instead of parsing and discarding them.

#### Scenario: A remote TUI enables button-event tracking

- **WHEN** the remote program emits `CSI ?1002h` (and optionally `?1006h` for
  SGR coordinates) and the user then clicks or drags inside the terminal
  view
- **THEN** the terminal encodes and sends the corresponding mouse-report
  escape sequence to the remote program

#### Scenario: No mouse mode is enabled

- **WHEN** no mouse-reporting mode has been enabled by the remote program
- **THEN** click/drag/wheel input continues to use the existing alt-screen
  swipe→arrows scrolling mapping, unaffected by this requirement
