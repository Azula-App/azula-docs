## ADDED Requirements

### Requirement: Settings dialogs SHALL have Compose UI test coverage

`Settings.kt` (personas, avatar upload, recovery-phrase reveal/restore dialogs) SHALL be covered by the JVM Compose UI test suite described in `openspec/specs/testing/design.md`, not left to state-layer tests alone — it is security-adjacent UI.

#### Scenario: Recovery-phrase dialogs are exercised by the Compose suite

- **WHEN** the JVM Compose UI test suite (`mock-support/test@jvm/`) runs
- **THEN** it drives the personas dialog, the avatar-upload dialog, and both
  the recovery-phrase reveal and restore dialogs through `Settings.kt`, not
  just the underlying state layer

### Requirement: iOS and Android Maestro suites SHALL have connect-flow parity

The iOS Maestro suite SHALL cover the same connect-flow happy path that the Android suite covers. Which file carries it is an implementation detail: the requirement is parity of coverage per platform, not a matching filename. Both platforms SHALL drive it through the shared `e2e/subflows/connect-peer.yaml` rather than duplicating the steps, so the two cannot drift apart.

#### Scenario: Each platform's Maestro suite exercises the connect flow

- **WHEN** the Maestro suite for either platform runs
- **THEN** the connect flow is exercised via `subflows/connect-peer.yaml` —
  on Android from `e2e/android.yaml`, and on iOS from `e2e/ios-media.yaml`,
  which needs a live chat anyway (`e2e/ios.yaml` stays a launch/terminal smoke
  and deliberately does not duplicate it)
