# Testing Specification

## Purpose
Defines which tool/layer owns which kind of test coverage across azula, so
behavioral coverage accumulates in fast in-process suites and platform-level
checks stay thin, with no scenario duplicated across layers.
## Requirements
### Requirement: Layered ownership of coverage
Each kind of behavior SHALL be covered by exactly one layer: common unit
tests own service/protocol/persistence logic, JVM-hosted Compose
Multiplatform UI tests own shared UI behavior, and Maestro owns platform
integration/packaging.

#### Scenario: Adding a test for service/protocol/persistence logic
- **WHEN** a change affects services, wire protocol, or persistence
- **THEN** the test SHALL be added as a common unit test (e.g.
  `mock-support/test/`, `network-api/test/`, `persistence-real/test@jvm/`)
  rather than a UI or Maestro test

#### Scenario: Adding a test for "user clicks X, sees Y" in shared UI
- **WHEN** a behavior is expressible entirely through the shared Compose UI and
  its semantics tree
- **THEN** the test SHALL be added to the JVM Compose Multiplatform UI suite
  (`mock-support/test@jvm/DesktopAppE2eTest.kt`) rather than duplicated in
  Maestro

#### Scenario: Verifying platform glue actually appears on screen
- **WHEN** the question is whether the packaged app launches or platform glue
  (pickers, players, notifications, deep links) appears on the real device/
  emulator screen
- **THEN** the test SHALL be a Maestro flow, kept to one happy path per concern,
  and SHALL NOT be where behavioral coverage accumulates

### Requirement: No duplication of a scenario across layers
A given behavioral scenario SHALL be covered by exactly one layer, chosen as
the lowest layer capable of catching the failure.

#### Scenario: Choosing where a new test belongs
- **WHEN** a contributor is deciding where to add a test for a new behavior
- **THEN** they SHALL pick the lowest layer that can catch the failure (unit →
  Compose UI test → Maestro), and SHALL NOT add the same scenario at a higher
  layer once a lower layer already covers it

### Requirement: Compose UI suite runs on JVM only
The shared Compose Multiplatform UI test suite SHALL run on the JVM target
only, not re-run per mobile platform, since the same composables render
identically across all three platforms.

#### Scenario: A shared-UI test is added
- **WHEN** a new Compose UI test is added under `mock-support/test@jvm/`
- **THEN** it SHALL run as part of `./check -m mock-support` on JVM, and
  SHALL NOT be re-implemented as an Android-instrumented or iOS UI-test target

### Requirement: Native OS surfaces require Maestro, not in-process injection
A Maestro flow against the real packaged app SHALL verify any behavior that depends on a native OS dialog or system surface (e.g. AWT file dialog, PHPicker, system permission prompts), because the in-process Compose semantics tree cannot observe those surfaces.

#### Scenario: A picker-related regression is invisible to Compose UI tests
- **WHEN** a bug only manifests in a native picker or window surface (e.g. iOS
  `PHPicker` torn down by Compose's transient popup host, or
  `UIApplication.keyWindow` being nil)
- **THEN** the corresponding coverage SHALL live in a Maestro flow (e.g.
  `e2e/ios-media.yaml`) that launches the actual built app, not in the Compose
  UI suite where the semantics tree would report success despite the on-screen
  failure

### Requirement: Maestro flows stay thin
Maestro SHALL be limited to platform-level smoke coverage — one happy path per
concern — and SHALL NOT become the primary location for behavioral depth.

#### Scenario: A Maestro flow is proposed for detailed business-logic coverage
- **WHEN** a proposed Maestro flow would assert on business-logic branches
  already expressible in a unit test or the shared Compose UI suite
- **THEN** that coverage SHALL instead be added at the lower layer, and the
  Maestro flow SHALL be limited to confirming the packaged app launches and the
  platform glue appears

### Requirement: Per-repo default coverage commands
Each repo SHALL define one default command that runs its owned coverage and be
runnable in CI on push/PR.

#### Scenario: Running azula-app coverage
- **WHEN** verifying a module in `azula-app`
- **THEN** `./check -m <module>` SHALL run that module's unit tests, and
  for `mock-support` SHALL additionally run the JVM Compose UI suite

#### Scenario: Running azula-cli coverage
- **WHEN** verifying `azula-cli`
- **THEN** `cargo test --workspace` (in-process iroh integration tests) and
  `cargo clippy --workspace --all-targets` SHALL both be run, the latter
  enforced via `[workspace.lints]`

#### Scenario: Running azula-site coverage
- **WHEN** verifying `azula-site`
- **THEN** `npm run typecheck && npm test` SHALL run, enforced by GitHub Actions
  on push/PR

### Requirement: iroh-kmp coverage stays at the crate level
`iroh-kmp` SHALL be covered by its own Rust-level tests, and its downstream
KMP consumption SHALL be exercised indirectly through azula-app's suites
rather than duplicated in iroh-kmp itself.

#### Scenario: Verifying the iroh-kmp crate
- **WHEN** changing `iroh-kmp`
- **THEN** `cargo check`/`cargo test` SHALL be the coverage for the crate itself,
  and consumer-facing behavior SHALL be caught by azula-app's existing suites

### Requirement: The mock terminal harness SHALL NOT emit width-sensitive content before the first resize

`FakeTerminalStream` SHALL NOT dump its greeting at the emulator's default 80
columns before the window's actual size is known, so width-sensitive replayed
mock content is not corrupted by a layout it will immediately be resized out
of.

#### Scenario: Mock harness starts in a non-default-width window

- **WHEN** a mock-harness test opens a terminal in a window whose column
  count differs from the emulator default (80)
- **THEN** `FakeTerminalStream`'s greeting is laid out at the window's actual
  column count, either by delaying the greeting until after the first
  `Resize` event or by feeding a resize first

### Requirement: InviteReviewSheet SHALL have Compose UI test coverage

The inbound accept/decline invite-review path SHALL be covered by the shared-UI-behavior JVM Compose suite described in `openspec/specs/testing/design.md`, in addition to the existing service-layer coverage (`StrangerGateTest`, `InviteServiceTest`), driven through a `FakeTransport` capable of emitting an arbitrary inbound connection (not just its fixed one-shot "mockterm" connection).

#### Scenario: Accept and decline are exercised through InviteReviewSheet

- **WHEN** the JVM Compose UI test suite drives an arbitrary inbound stranger
  connection through `FakeTransport` into `InviteReviewSheet`
- **THEN** both the accept path (peer added to contacts, stream wired) and
  the decline path (connection closed and forgotten) are exercised at the UI
  layer

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

### Requirement: The headless mock-support gate SHALL run without known-flake false failures

The project's check entry point `azula-app/check` SHALL NOT report failure due
to the known-flaky conditions described in `openspec/specs/testing/design.md`
("Known flakes (headless test harness)"). It does so by removing the shared
root cause — two builds running concurrently — rather than by tolerating its
symptoms one at a time.

`./kotlin check` remains the raw passthrough and keeps its existing behavior;
the guarantees below belong to `./check`.

#### Scenario: Concurrent checks are serialized rather than allowed to collide

- **WHEN** a second check starts while one is already running (for example the
  Stop hook's queued check racing a manual or background verify)
- **THEN** the second waits for the first to finish instead of running
  alongside it, so neither the CoreSimulator boot collision
  (`Unable to boot device in current state: Booted`), the order-of-magnitude
  slowdown, nor Amper's `Resource deadlock avoided` internal error can occur

#### Scenario: iOS simulator teardown no longer fails the gate

- **WHEN** the `IOS_SIMULATOR_ARM64` target's native tests all report
  `[ PASSED ]`
- **THEN** a subsequent non-zero process exit matching a known simulator
  signature (`exit code 149`, `Simulator boot timeout`, a CoreSimulator boot
  error) does not fail the overall gate

#### Scenario: A real failure is never suppressed

- **WHEN** a run fails for any reason other than that exact shape — a failing
  test, a non-zero JUnit failure count, or a compile error that means no test
  ran at all
- **THEN** the gate still reports failure, with the original exit code

### Requirement: UI-test matchers SHALL be anchored, not merely given longer timeouts

A Compose UI test SHALL identify its target by a matcher that stays unambiguous
regardless of what else has rendered — a test tag, or an ancestor-scoped
matcher — rather than by a bare text match that happens to be unique only when
the harness wins a race. Raising a `waitUntil` timeout SHALL NOT be treated as
the fix for an ambiguity failure, because the two present identically (both
appear only under load) while having different causes.

#### Scenario: A matcher that would become ambiguous under load

- **WHEN** a test targets a widget whose text or glyph also appears on a
  sibling surface that renders asynchronously — for example the `⋮` overflow
  shared by a persona row and the sidebar's delayed seeded conversation
- **THEN** the matcher is scoped so exactly one node matches whether or not the
  asynchronous surface has appeared yet, and the test does not depend on
  arriving before it

