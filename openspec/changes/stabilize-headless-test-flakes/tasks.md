## 1. iOS simulator stabilization

- [ ] 1.1 Gate/serialize iOS-simulator test runs so two builds never hit the
      simulator concurrently (e.g. a background verify plus a queued
      Stop-hook check).
- [ ] 1.2 Make the test wrapper tolerate a post-`PASSED` non-zero simulator
      exit (`exit code 149` / `Simulator boot timeout`) instead of treating it
      as a failure.
- [ ] 1.3 Confirm native `IOS_SIMULATOR_ARM64` tests still fail loudly on a
      real regression (don't over-suppress).

## 2. DesktopAppE2eTest timing

- [ ] 2.1 Raise or soften the `waitUntil` timeout for
      `clickingTheTerminalRowInTheSharedListOpensItsChat`.
- [ ] 2.2 Raise or soften the `waitUntil` timeout for
      `inboundOfferAutoDownloadsToComplete`.
- [ ] 2.3 Investigate reducing these tests' load sensitivity more generally
      (not just raising timeouts).

## 3. Verify

- [ ] 3.1 Re-run `./kotlin check -m mock-support` repeatedly (matching the
      baseline methodology in `openspec/specs/testing/design.md`'s Known
      flakes section) to confirm the flake rate drops.
- [ ] 3.2 Update the "Known flakes" section in
      `openspec/specs/testing/design.md` once fixed.
