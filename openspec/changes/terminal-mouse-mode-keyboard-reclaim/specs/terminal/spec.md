## ADDED Requirements

### Requirement: Keyboard Focus Is Always Reclaimable On Mobile

The mobile terminal SHALL provide a way to reclaim keyboard focus and re-summon
the soft keyboard in every state the terminal can be in, including while a
mouse-tracking mode (`?1000`, `?1002`, `?1003`) is active. That affordance SHALL
NOT consume pointer input over the terminal grid, so that single-finger taps on
the grid continue to be reported to the remote program unchanged.

#### Scenario: The keyboard is dismissed while a TUI owns the pointer

- **WHEN** the remote program has enabled a mouse-tracking mode and the user
  dismisses the soft keyboard
- **THEN** an affordance outside the terminal grid re-summons the keyboard and
  restores input focus, without the user having to leave or switch the
  conversation

#### Scenario: Reclaiming focus does not disturb mouse reporting

- **WHEN** the user reclaims keyboard focus while a mouse-tracking mode is
  active, and then taps the grid
- **THEN** that tap is reported to the remote program as a mouse event exactly
  as it would have been before, and typing goes to the remote program as input

#### Scenario: No mouse mode active

- **WHEN** no mouse-tracking mode is active
- **THEN** tapping the terminal grid continues to reclaim keyboard focus as it
  does today, and the affordance remains available as an equivalent route
