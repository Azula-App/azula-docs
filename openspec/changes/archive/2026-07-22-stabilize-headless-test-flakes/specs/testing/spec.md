## ADDED Requirements

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
