# Testing strategy

How azula is tested, layer by layer, and which tool owns which layer. The
rule of thumb: **behavioral depth accumulates in fast in-process suites;
platform smoke flows stay thin.** Don't duplicate a scenario across layers.

## The pyramid (azula-app)

| Layer | Tool / location | What it owns |
|---|---|---|
| Logic | common unit tests — `mock-support/test/` (state layer, 26+), `network-api/test/` (protocol), `persistence-real/test@jvm/`, `core/test/`, `a2ui/test/`, `terminal-api/test/` | services, wire protocol, persistence, emulator — every platform target runs these |
| Shared UI behavior | **Compose Multiplatform UI tests on JVM** — `mock-support/test@jvm/DesktopAppE2eTest.kt` | navigation, connect flow, chat round-trip, attach menu, media bubbles/states, fullscreen viewer — driven through the real `DesktopApp` over `FakeTransport`/`InMemoryBlobStore` via the `testAzulaState` harness, semantics/testTag addressed. Deps: `$compose.uiTest` **plus** `$compose.desktop.currentOs` in `test-dependencies@jvm` (the latter supplies the Skiko native runtime `runComposeUiTest` needs) |
| Platform integration | **Maestro** — `azula-app/e2e/*.yaml` against the `-mock` apps | the real app binary on a real emulator/simulator: packaging, system UI, platform glue |

## Why both Compose UI tests AND Maestro

They see different worlds, proven concretely during the media feature
(2026-07): two real iOS bugs — `UIApplication.keyWindow` nil on scene-based
apps, and the PHPicker being torn down with Compose's transient popup-host
view controller — were **invisible to the Compose semantics tree**. A Compose
UI test clicks "Photo", the tree looks healthy, and the test passes while the
real picker never appears on screen. Only launching the built app and driving
the actual screen (Maestro, `e2e/ios-media.yaml`) caught them.

Conversely, Maestro is slow, text/point-addressed, and timing-flaky —
`waitForAnimationToEnd` dances, coordinate taps into out-of-process sheets.
It must not become the place where behavioral coverage grows.

Because the whole UI lives in `shared/`, one JVM-hosted Compose UI test run
exercises the same composables all three platforms render. Re-running the
identical suite on Android (emulator + instrumentation) or iOS (the least
mature ui-test target, hosted outside the real `ComposeUIViewController`
entry) mostly re-tests common code at much higher cost — that's why the
Compose suite runs on JVM only, and mobile platforms get thin Maestro smoke
instead.

## What belongs where

Adding a test? Pick the **lowest** layer that can catch the failure:

- Service/protocol/persistence logic → common unit test (`mock-support/test/`
  via the `testAzulaState`/`PeerPipe` harness — see `TestSupport.kt` for the
  conventions, including the "never `advanceUntilIdle`" pollRtt gotcha).
- Anything expressible as "user clicks X, sees Y" in shared Compose UI →
  the JVM Compose suite. Native OS dialogs can't be driven in-process (AWT
  file dialog, PHPicker) — inject at the picker-callback seam instead.
- Only for: does the packaged app launch, does platform glue (pickers,
  players, notifications, deep links) actually appear on screen → a Maestro
  flow, kept to one happy path per concern.

## Running

- Everything for a module: `./kotlin check -m <module>` (from `azula-app/`;
  needs network for the Amper toolchain). The JVM Compose UI suite runs as
  part of `./kotlin check -m mock-support`.
- Maestro Android: build/install `android-app-mock`, `maestro test
  e2e/android.yaml`.
- Maestro iOS: `./kotlin build -m ios-app-mock -p iosSimulatorArm64`, install
  on a booted simulator (`xcrun simctl install <udid> <app>`), seed the photo
  library for the media flow (`xcrun simctl addmedia <udid> <img>.png`), then
  `maestro --device <udid> test e2e/ios-media.yaml`. Pin `--device` — Maestro
  otherwise grabs any connected physical iPhone.
- Screenshots land in `e2e/screenshots/` (gitignored).

## Other repos

- `azula-cli` — `cargo test --workspace` (in-process iroh integration tests:
  real endpoints, PTY bridges, bridge relay) + `cargo clippy --workspace
  --all-targets` enforced via `[workspace.lints]`.
- `azula-site` — `npm run typecheck && npm test` (vitest: pure helpers + the
  Worker's `fetch` driven directly), enforced by GitHub Actions on push/PR.
- `iroh-kmp` — `cargo check`/`cargo test` for the crate; consumers are
  exercised through azula-app's suites.

The project's Claude hooks (`.claude/` in the parent directory, per-machine;
mirrored for compatible agents as `.agents -> .claude`) auto-run the fast suites
on edit and queue `./kotlin check` per touched module at end of turn.

## Known flakes (headless test harness)

Two known-flaky conditions surface when running the `mock-support` gate
(`./kotlin check -m mock-support`) in a headless/CI-like environment.
**Neither is a code failure** — treat the gate as green on build success +
`0 tests failed`; only new `[ FAILED ]` test lines or compile errors are real.
A durable fix for both is tracked as the `stabilize-headless-test-flakes`
change.

- **iOS simulator instability.** The `IOS_SIMULATOR_ARM64` test target
  intermittently makes the process exit non-zero *after* all native tests
  report `[ PASSED ]` — seen as both `exit code 149` (simulator teardown,
  SIGTTOU-class) and `Simulator boot timeout` (the sim never boots). Gets
  worse when two builds hit the simulator at once (e.g. a background verify
  plus the Stop-hook's queued check). The native unit tests themselves pass;
  it's the sim runner/teardown.
- **`DesktopAppE2eTest` Compose-UI timing flakes.** Cases like
  `clickingTheTerminalRowInTheSharedListOpensItsChat` and
  `inboundOfferAutoDownloadsToComplete` throw `ComposeTimeoutException` (a
  5000 ms `waitUntil`) under load and pass on a clean re-run. Timing-sensitive,
  not logic bugs. Re-confirmed 2026-07-10: these two still flake, now on
  20–30 s waits, and they do so **on a pristine baseline worktree** (1 failure
  in 5 runs with no changes applied) — so when they fail while you're
  reviewing a diff, check the baseline before assuming your change caused it.
  The failure signature to look for is a bare `ComposeTimeoutException`; a
  *different* signature (e.g. "Expected exactly '1' node but found '2'") is a
  real bug, not this flake.

Durable fixes would be: gate/serialize the iOS-sim test run (or make the
wrapper tolerate a post-`PASSED` non-zero sim exit), and raise/soften the E2E
`waitUntil` timeouts or reduce their load sensitivity.
