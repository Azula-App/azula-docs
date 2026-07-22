## ADDED Requirements

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
