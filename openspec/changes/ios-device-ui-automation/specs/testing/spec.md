## ADDED Requirements

### Requirement: iOS device UI automation SHALL be available for device verification

A "(device)" verification task on iOS SHALL be satisfiable by an automated XCUITest run against a physical iPhone, not only by a human tapping through it. The harness SHALL drive the `-mock` app, so the gestures act on the seeded fixtures rather than on whatever state the device happens to hold.

#### Scenario: Gesture pass on a physical device

- **WHEN** the UI test suite runs against a physical iPhone via
  `xcodebuild test -destination 'id=<udid>'`
- **THEN** pinch-zoom, pan-while-zoomed, double-tap-to-zoom and
  swipe-between-images are exercised against the seeded image, and each
  asserts on the resulting view state rather than merely completing

#### Scenario: Terminal IME pass on a physical device

- **WHEN** the suite types into the terminal through the on-screen keyboard
- **THEN** the echoed line is asserted, mirroring the Pixel/Gboard pass so the
  two platforms' results are directly comparable

### Requirement: The mock app SHALL be installable on a physical iOS device

`ios-app-mock` SHALL carry a reverse-DNS bundle identifier that can be provisioned for device installation. Its fixtures are the only seeded media and terminal state available to a device pass, so an un-installable mock makes those passes unreachable regardless of what automation exists.

#### Scenario: Mock installs on a device

- **WHEN** `ios-app-mock` is built and installed to a paired physical device
- **THEN** it provisions, installs and launches, and shows the same seeded
  conversations it shows on the simulator
