## 0. Diagnose first

- [x] 0.1 Measure a baseline before changing anything. 6 sequential runs:
      1 failure (17%). Two of the six were contended by a stray concurrent
      check and took **1110 s and 1012 s against ~30 s uncontended** — the
      single most useful number this change produced.
- [x] 0.2 Establish what concurrency actually does, since the proposal only
      said the flakes "get worse". Two concurrent `./kotlin check` runs
      produce three unrelated-looking failures from one cause:
      a CoreSimulator collision (`code=405: Unable to boot device in current
      state: Booted`), the ~36× slowdown above, and Amper's
      `Internal error: java.io.IOException: Resource deadlock avoided`.
      That reframed the change: serialization is the primary fix, and the
      timeout bumps in section 2 are palliative.

## 1. iOS simulator stabilization

- [x] 1.1 Gate/serialize iOS-simulator test runs so two builds never hit the
      simulator concurrently. Added `azula-app/check`: an exclusive
      mkdir-based lock (bash 3.2-safe — macOS has no `flock(1)`) that passes
      everything else through to `./kotlin check`, with stale-lock reclaim via
      the holder's pid. `.claude/hooks/run-queued-kotlin-checks.sh` now calls
      it, and `project.md` documents it as the way to run checks so manual and
      agent runs are covered too — a hook-only lock would have missed the
      "background verify" half of the documented collision.
      **Note:** the `./kotlin` wrapper itself was deliberately not touched —
      it is vendored, checksum-pinned JetBrains bootstrap code.
- [x] 1.2 Tolerate a post-`PASSED` non-zero simulator exit. `check`'s
      classifier suppresses exactly one shape: non-zero exit + at least one
      success marker + zero failure markers + a known simulator signature
      (`exit code 149`, `Simulator boot timeout`, or a CoreSimulator boot
      error). `KOTLIN_CHECK_STRICT=1` disables it.
- [x] 1.3 Confirm tests still fail loudly on a real regression. The classifier
      is extracted behind `./check --classify <log> <code>` and covered by
      `azula-app/test/check-classify-test.sh` — 12 cases, all passing,
      including "a compile error is never suppressed". The key safety property
      is that suppression requires *positive evidence tests ran and passed*,
      so a build that compiled nothing can never be suppressed. This was then
      confirmed accidentally on a live run: a compile error I introduced
      produced 84 passing native tests and exit 1, and `check` correctly
      propagated the failure.

## 2. DesktopAppE2eTest timing

- [x] 2.1 `clickingTheTerminalRowInTheSharedListOpensItsChat` — **timeout
      deliberately left at 20 s/30 s, not raised.** The design doc records
      that these were already raised once (5 s → 20–30 s) and kept flaking, so
      a third increase is cargo-culting. The load they are sensitive to is
      what 1.1 now prevents. Recorded in design.md so the next person doesn't
      reflexively raise it again.
- [x] 2.2 `inboundOfferAutoDownloadsToComplete` — same decision, same
      reasoning.
- [x] 2.3 Reduce load sensitivity more generally. Found and fixed a distinct
      failure class that had been *mistaken* for a timing flake: a matcher
      that is unique only when the harness wins a race.
      `SettingsE2eTest.deletingAPersonaRemovesItFromState` matched a bare
      `hasText("⋮")`, which also matches the sidebar conversation
      `FakeTransport.incoming()` emits on a 300 ms delay — one node on an idle
      machine, two under load, failing with "Expected exactly '1' node but
      found '2'". Fixed by anchoring to `hasAnyAncestor(persona-row-…)`, and
      the test now *waits for* the ambiguous state so it exercises the hard
      case every run instead of racing it. Generalized as a requirement in the
      delta spec, since the anti-pattern is not specific to this test.

## 3. Verify

- [x] 3.1 Re-run repeatedly, matching the baseline methodology. **A/B on the
      documented trigger** (two concurrent checks): unlocked → one run exits
      non-zero (Amper deadlock), 53 s wall; through `./check` → both pass,
      45 s wall. Serializing is not just safer, it is *faster*, because
      contention wastes more than the parallelism buys. **Sequential:** 9
      post-fix runs, 0 failures, versus 1 failure in 6 on the baseline.
- [x] 3.2 Update the "Known flakes" section in
      `openspec/specs/testing/design.md` — rewritten around the single root
      cause, with the measured numbers, the "don't raise the timeout again"
      note, and the matcher-ambiguity class documented.

## 4. Honest limits

- [x] 4.1 The `ComposeTimeoutException` flake this change set out to fix
      **never reproduced** — 0 occurrences across 15 runs (6 baseline + 9
      post-fix) and 4 concurrent runs. So it is not demonstrated fixed, only
      un-reproduced with its documented trigger removed. Left in design.md
      with that caveat rather than declared solved.
