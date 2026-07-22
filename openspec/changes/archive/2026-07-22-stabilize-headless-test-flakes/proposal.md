## Why

Two known-flaky conditions surface when running the `mock-support` gate
(`./kotlin check -m mock-support`) in a headless/CI-like environment. Neither
is a code failure — see "Known flakes (headless test harness)" in
`openspec/specs/testing/design.md` for the full signatures and how to tell a
flake from a real failure. This change is the durable-fix half: making the
flakes stop happening instead of just documenting how to recognize them.

## What Changes

- Gate/serialize the iOS-simulator test run (or make the wrapper tolerate a
  post-`PASSED` non-zero simulator exit), addressing the `IOS_SIMULATOR_ARM64`
  instability (`exit code 149` / `Simulator boot timeout` after all native
  tests report `[ PASSED ]`, worse when two builds hit the simulator at once).
- Raise or soften the `DesktopAppE2eTest` Compose-UI `waitUntil` timeouts (or
  otherwise reduce their load sensitivity), addressing the
  `ComposeTimeoutException` flakes seen in
  `clickingTheTerminalRowInTheSharedListOpensItsChat` and
  `inboundOfferAutoDownloadsToComplete`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — this is test-infrastructure stabilization, not a product requirement
change; see `openspec/specs/testing/design.md` for the testing-strategy
capability this touches)

## Impact

- iOS-simulator test-run wrapper/gating (`./kotlin check -m mock-support`
  path for `IOS_SIMULATOR_ARM64`).
- `mock-support/test@jvm/DesktopAppE2eTest.kt` — `waitUntil` timeouts on
  `clickingTheTerminalRowInTheSharedListOpensItsChat` and
  `inboundOfferAutoDownloadsToComplete`.
- `openspec/specs/testing/design.md` — "Known flakes (headless test harness)"
  section documents the symptoms this change fixes; update it once fixed.
