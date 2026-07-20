## ADDED Requirements

### Requirement: Mobile smart-input IME behavior SHALL be verified on real devices

Swipe typing, the suggestion strip, autocorrect fix-ups, selection gesture feel, and the alt-screen scroll direction (see `openspec/specs/terminal/design.md`, "Smart input — the IME buffer (mobile)") SHALL be confirmed by hands on a real phone across the keyboards azula users are likely to use, not just unit tests and builds.

#### Scenario: Pixel + Gboard pass

- **WHEN** a tester exercises swipe typing, the suggestion strip, autocorrect
  fix-ups, selection gestures, and alt-screen scroll direction on a real
  Pixel device with Gboard
- **THEN** each behaves correctly, or a follow-up bug is filed and the
  Smart/Raw input toggle is confirmed as a working escape hatch

#### Scenario: iOS device pass

- **WHEN** the same pass is run on a real iOS device (not just the
  iOS simulator)
- **THEN** the same behaviors are confirmed, closing the
  simulator-only gap
