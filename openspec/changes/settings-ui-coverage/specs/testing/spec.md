## ADDED Requirements

### Requirement: Settings dialogs SHALL have Compose UI test coverage

`Settings.kt` (personas, avatar upload, recovery-phrase reveal/restore dialogs) SHALL be covered by the JVM Compose UI test suite described in `openspec/specs/testing/design.md`, not left to state-layer tests alone — it is security-adjacent UI.

#### Scenario: Recovery-phrase dialogs are exercised by the Compose suite

- **WHEN** the JVM Compose UI test suite (`mock-support/test@jvm/`) runs
- **THEN** it drives the personas dialog, the avatar-upload dialog, and both
  the recovery-phrase reveal and restore dialogs through `Settings.kt`, not
  just the underlying state layer

### Requirement: iOS and Android Maestro connect flows SHALL have parity

`e2e/ios.yaml` SHALL cover the same connect-flow happy path that `e2e/android.yaml` already covers.

#### Scenario: iOS Maestro suite exercises the connect flow

- **WHEN** `e2e/ios.yaml` runs
- **THEN** it exercises the connect flow, matching the coverage already
  present in `e2e/android.yaml`
