## ADDED Requirements

### Requirement: The headless mock-support gate SHALL run without known-flake false failures

`./kotlin check -m mock-support` in a headless/CI-like environment SHALL NOT
report failure due to the two known-flaky conditions described in
`openspec/specs/testing/design.md` ("Known flakes (headless test harness)"):
`IOS_SIMULATOR_ARM64` post-`PASSED` non-zero exits, and `DesktopAppE2eTest`
`waitUntil` timeouts under load.

#### Scenario: iOS simulator teardown no longer fails the gate

- **WHEN** the `IOS_SIMULATOR_ARM64` target's native tests all report
  `[ PASSED ]`
- **THEN** a subsequent non-zero process exit during simulator teardown does
  not fail the overall gate

#### Scenario: DesktopAppE2eTest passes reliably under load

- **WHEN** `clickingTheTerminalRowInTheSharedListOpensItsChat` and
  `inboundOfferAutoDownloadsToComplete` run under the same load conditions
  that previously produced `ComposeTimeoutException` on a pristine baseline
- **THEN** they pass reliably (softened/raised `waitUntil` timeouts or
  reduced load sensitivity), and a bare `ComposeTimeoutException` is no
  longer an expected outcome
