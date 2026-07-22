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
- **THEN** it SHALL run as part of `./kotlin check -m mock-support` on JVM, and
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
- **THEN** `./kotlin check -m <module>` SHALL run that module's unit tests, and
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

